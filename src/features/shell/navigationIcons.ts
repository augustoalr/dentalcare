import {
  CalendarDays,
  FileSpreadsheet,
  Receipt,
  Settings,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AppRouteId } from '@/domain/auth';

export const NAVIGATION_ICONS: Record<AppRouteId, LucideIcon> = {
  schedule: CalendarDays,
  patients: Users,
  treatments: Stethoscope,
  quotes: FileSpreadsheet,
  billing: Receipt,
  settings: Settings,
};
