import {
  buildWaMeReminderUrl,
  type WhatsAppReminderPayload,
} from '@/domain/whatsapp';

export interface WhatsAppReminderSendResult {
  readonly channel: 'wa_me' | 'meta_cloud_api';
  readonly launchedUrl: string;
  readonly popupBlocked: boolean;
  readonly deliveredAtIso: string;
}

/**
 * Agnostic WhatsApp reminder contract.
 * MVP uses `WaMeWhatsAppAdapter` (0 USD); future pilot deployments can swap in a
 * Meta Cloud API adapter without modifying any UI component.
 */
export interface IWhatsAppService {
  readonly adapterName: string;
  sendAppointmentReminder(
    payload: WhatsAppReminderPayload,
  ): Promise<WhatsAppReminderSendResult>;
}

export type WhatsAppUrlOpener = (url: string) => boolean;

function defaultBrowserUrlOpener(url: string): boolean {
  if (typeof window === 'undefined' || typeof window.open !== 'function') {
    return false;
  }

  const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
  return openedWindow !== null;
}

/**
 * Zero-cost MVP WhatsApp adapter backed by `https://wa.me/...` deep links.
 * Invokes `urlOpener` synchronously before returning a Promise so mobile
 * browsers (Safari iOS / Chrome mobile) preserve the user gesture.
 */
export class WaMeWhatsAppAdapter implements IWhatsAppService {
  readonly adapterName = 'wa_me';
  private readonly urlOpener: WhatsAppUrlOpener;

  constructor(urlOpener: WhatsAppUrlOpener = defaultBrowserUrlOpener) {
    this.urlOpener = urlOpener;
  }

  sendAppointmentReminder(
    payload: WhatsAppReminderPayload,
  ): Promise<WhatsAppReminderSendResult> {
    const launchedUrl = buildWaMeReminderUrl(payload);
    // Execute immediately on the user-gesture turn (before any async microtask)
    const opened = this.urlOpener(launchedUrl);

    return Promise.resolve(
      Object.freeze({
        channel: 'wa_me',
        launchedUrl,
        popupBlocked: !opened,
        deliveredAtIso: new Date().toISOString(),
      }),
    );
  }
}

export function createDefaultWhatsAppService(): IWhatsAppService {
  return new WaMeWhatsAppAdapter();
}
