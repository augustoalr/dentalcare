import type { SupportedLocale } from '@/domain/locale';
import type { AllowedPatientFileMimeType } from '@/domain/patientFiles';
import type { TreatmentCategory } from '@/domain/treatments';

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

export type PatientRow = {
  id: string;
  clinic_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  medical_alerts: string | null;
  general_notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PatientInsert = {
  id?: string;
  clinic_id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  medical_alerts?: string | null;
  general_notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type PatientUpdate = {
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  medical_alerts?: string | null;
  general_notes?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
};

export type PatientFileRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
  appointment_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: AllowedPatientFileMimeType;
  file_size_bytes: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  purged_at: string | null;
};

export type PatientFileInsert = {
  id?: string;
  clinic_id: string;
  patient_id: string;
  appointment_id?: string | null;
  storage_path: string;
  file_name: string;
  mime_type: AllowedPatientFileMimeType;
  file_size_bytes: number;
  uploaded_by: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  purged_at?: string | null;
};

export type PatientFileUpdate = {
  updated_at?: string;
  deleted_at?: string | null;
  purged_at?: string | null;
};

export type TreatmentCatalogRow = {
  id: string;
  clinic_id: string;
  code: string;
  name_en: string;
  name_es: string;
  category: string;
  default_price_cents: number;
  default_duration_min: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TreatmentCatalogInsert = {
  id?: string;
  clinic_id: string;
  code: string;
  name_en: string;
  name_es: string;
  category: TreatmentCategory;
  default_price_cents: number;
  default_duration_min?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type TreatmentCatalogUpdate = {
  code?: string;
  name_en?: string;
  name_es?: string;
  category?: TreatmentCategory;
  default_price_cents?: number;
  default_duration_min?: number;
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
      patients: {
        Row: PatientRow;
        Insert: PatientInsert;
        Update: PatientUpdate;
        Relationships: [
          {
            foreignKeyName: 'patients_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      patient_files: {
        Row: PatientFileRow;
        Insert: PatientFileInsert;
        Update: PatientFileUpdate;
        Relationships: [
          {
            foreignKeyName: 'patient_files_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'patient_files_clinic_patient_fkey';
            columns: ['clinic_id', 'patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['clinic_id', 'id'];
          },
        ];
      };
      treatments_catalog: {
        Row: TreatmentCatalogRow;
        Insert: TreatmentCatalogInsert;
        Update: TreatmentCatalogUpdate;
        Relationships: [
          {
            foreignKeyName: 'treatments_catalog_clinic_id_fkey';
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
