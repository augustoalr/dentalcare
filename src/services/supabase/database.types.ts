import type { SupportedLocale } from '@/domain/locale';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ClinicRole = 'admin' | 'dentist' | 'receptionist';

export type ClinicRow = {
  id: string;
  name: string;
  currency_code: string;
  currency_symbol: string;
  tax_rate_bps: number;
  tax_label: string;
  timezone: string;
  default_locale: SupportedLocale;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ClinicInsert = {
  id?: string;
  name: string;
  currency_code?: string;
  currency_symbol?: string;
  tax_rate_bps?: number;
  tax_label?: string;
  timezone?: string;
  default_locale?: SupportedLocale;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type ClinicUpdate = {
  name?: string;
  currency_code?: string;
  currency_symbol?: string;
  tax_rate_bps?: number;
  tax_label?: string;
  timezone?: string;
  default_locale?: SupportedLocale;
  updated_at?: string;
  deleted_at?: string | null;
};

export type ProfileRow = {
  id: string;
  clinic_id: string;
  full_name: string;
  role: ClinicRole;
  preferred_locale: SupportedLocale;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProfileInsert = {
  id: string;
  clinic_id: string;
  full_name: string;
  role: ClinicRole;
  preferred_locale?: SupportedLocale;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type ProfileUpdate = {
  full_name?: string;
  role?: ClinicRole;
  preferred_locale?: SupportedLocale;
  is_active?: boolean;
  updated_at?: string;
  deleted_at?: string | null;
};

export type AuditLogRow = {
  id: string;
  clinic_id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata_json: Json;
  created_at: string;
};

export type AuditLogInsert = {
  id?: string;
  clinic_id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata_json?: Json;
  created_at?: string;
};

export type Database = {
  public: {
    Tables: {
      clinics: {
        Row: ClinicRow;
        Insert: ClinicInsert;
        Update: ClinicUpdate;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [
          {
            foreignKeyName: 'profiles_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: AuditLogInsert;
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: 'audit_log_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
