import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool, type PoolClient } from 'pg';

export interface QueryResult<T extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}

export interface ITestDbExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export type DbRole = 'anon' | 'authenticated' | 'service_role';

export interface RoleSessionOptions {
  readonly role: DbRole;
  readonly userId?: string | null;
  readonly commit?: boolean;
}

export interface ITestDbHarness {
  readonly engine: 'postgres' | 'pglite';
  execSql(sql: string): Promise<void>;
  queryAsOwner<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
  runAsRole<T>(
    options: RoleSessionOptions,
    callback: (tx: ITestDbExecutor) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

const SUPABASE_AUTH_STUB_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (bucket_id, name)
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END
$$;

GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role;
`;

function assertSafeRole(role: DbRole): void {
  if (role !== 'anon' && role !== 'authenticated' && role !== 'service_role') {
    throw new Error(`Unsupported test DB role: ${String(role)}`);
  }
}

async function applyRoleSession(
  executor: ITestDbExecutor,
  options: RoleSessionOptions,
): Promise<void> {
  assertSafeRole(options.role);
  await executor.query(`SET LOCAL ROLE ${options.role}`);
  await executor.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [
    options.userId ?? '',
  ]);
}

class PgPoolHarness implements ITestDbHarness {
  readonly engine = 'postgres' as const;
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async execSql(sql: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  }

  async queryAsOwner<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    const result = await this.pool.query<T>(sql, [...params]);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
    };
  }

  async runAsRole<T>(
    options: RoleSessionOptions,
    callback: (tx: ITestDbExecutor) => Promise<T>,
  ): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    const executor: ITestDbExecutor = {
      async query<R extends Record<string, unknown> = Record<string, unknown>>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<QueryResult<R>> {
        const result = await client.query<R>(sql, [...params]);
        return {
          rows: result.rows,
          rowCount: result.rowCount ?? result.rows.length,
        };
      },
    };

    await client.query('BEGIN');
    try {
      await applyRoleSession(executor, options);
      const output = await callback(executor);
      await client.query(options.commit ? 'COMMIT' : 'ROLLBACK');
      return output;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PgliteHarness implements ITestDbHarness {
  readonly engine = 'pglite' as const;
  private readonly db: PGlite;

  constructor(db: PGlite) {
    this.db = db;
  }

  async execSql(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async queryAsOwner<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    const result = await this.db.query<T>(sql, [...params]);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  }

  async runAsRole<T>(
    options: RoleSessionOptions,
    callback: (tx: ITestDbExecutor) => Promise<T>,
  ): Promise<T> {
    const executor: ITestDbExecutor = {
      query: async <R extends Record<string, unknown> = Record<string, unknown>>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<QueryResult<R>> => {
        const result = await this.db.query<R>(sql, [...params]);
        return {
          rows: result.rows,
          rowCount: result.affectedRows ?? result.rows.length,
        };
      },
    };

    await this.db.query('BEGIN');
    try {
      await applyRoleSession(executor, options);
      const output = await callback(executor);
      await this.db.query(options.commit ? 'COMMIT' : 'ROLLBACK');
      return output;
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

export function listMigrationFiles(): readonly string[] {
  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  return Object.freeze(
    readdirSync(migrationsDir)
      .filter((entry) => entry.endsWith('.sql'))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

export function readMigrationSql(filename: string): string {
  const migrationPath = path.resolve(process.cwd(), 'supabase', 'migrations', filename);
  return readFileSync(migrationPath, 'utf8');
}

export async function applyAllMigrations(db: ITestDbHarness): Promise<void> {
  const migrationFiles = listMigrationFiles();
  for (const filename of migrationFiles) {
    await db.execSql(readMigrationSql(filename));
  }
}

export function extractPgErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export async function createTestDbHarness(): Promise<ITestDbHarness> {
  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  const harness: ITestDbHarness = dbUrl
    ? new PgPoolHarness(dbUrl)
    : new PgliteHarness(new PGlite());

  await harness.execSql(SUPABASE_AUTH_STUB_SQL);
  return harness;
}
