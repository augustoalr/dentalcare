import type { AppointmentStatus } from '@/domain/appointments';
import type { TranslationKey } from '@/i18n';

export type AppointmentBadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning';

export function getAppointmentStatusLabelKey(
  status: AppointmentStatus,
): TranslationKey {
  switch (status) {
    case 'scheduled':
      return 'schedule.statuses.scheduled';
    case 'confirmed':
      return 'schedule.statuses.confirmed';
    case 'in_progress':
      return 'schedule.statuses.in_progress';
    case 'completed':
      return 'schedule.statuses.completed';
    case 'cancelled':
      return 'schedule.statuses.cancelled';
    case 'no_show':
      return 'schedule.statuses.no_show';
  }
}

export function getAppointmentStatusBadgeVariant(
  status: AppointmentStatus,
): AppointmentBadgeVariant {
  switch (status) {
    case 'confirmed':
      return 'primary';
    case 'completed':
      return 'success';
    case 'in_progress':
    case 'no_show':
      return 'warning';
    case 'scheduled':
    case 'cancelled':
      return 'default';
  }
}
