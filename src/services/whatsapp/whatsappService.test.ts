import { describe, expect, it, vi } from 'vitest';
import {
  buildSafeAppointmentReminderPayload,
  buildWaMeReminderUrl,
} from '@/domain/whatsapp';
import {
  createDefaultWhatsAppService,
  WaMeWhatsAppAdapter,
} from './whatsappService';

describe('T-09 WaMeWhatsAppAdapter (IWhatsAppService)', () => {
  const samplePayload = buildSafeAppointmentReminderPayload({
    patientFullName: 'Layla Synthetic Al Mansoor',
    patientPhone: '+971 50 111 2222',
    clinicName: 'Al Noor Synthetic Clinic Dubai',
    startsAtIso: '2026-11-28T06:00:00.000Z',
    timezone: 'Asia/Dubai',
    locale: 'en',
  })!;

  it('opens the exact https://wa.me URL synchronously via urlOpener and reports popupBlocked: false when opened', async () => {
    let calledSynchronously = false;
    const openerSpy = vi.fn().mockImplementation(() => {
      calledSynchronously = true;
      return true;
    });

    const adapter = new WaMeWhatsAppAdapter(openerSpy);
    expect(adapter.adapterName).toBe('wa_me');

    const promise = adapter.sendAppointmentReminder(samplePayload);
    // Must execute BEFORE awaiting so Safari iOS / Chrome mobile preserve the user gesture
    expect(calledSynchronously).toBe(true);

    const result = await promise;
    const expectedUrl = buildWaMeReminderUrl(samplePayload);

    expect(openerSpy).toHaveBeenCalledTimes(1);
    expect(openerSpy).toHaveBeenCalledWith(expectedUrl);
    expect(result.channel).toBe('wa_me');
    expect(result.launchedUrl).toBe(expectedUrl);
    expect(result.popupBlocked).toBe(false);
    expect(Number.isNaN(Date.parse(result.deliveredAtIso))).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('reports popupBlocked: true and returns the safe launchedUrl when the browser blocks popups', async () => {
    const openerSpy = vi.fn().mockReturnValue(false);
    const adapter = new WaMeWhatsAppAdapter(openerSpy);

    const result = await adapter.sendAppointmentReminder(samplePayload);
    const expectedUrl = buildWaMeReminderUrl(samplePayload);

    expect(openerSpy).toHaveBeenCalledWith(expectedUrl);
    expect(result.channel).toBe('wa_me');
    expect(result.launchedUrl).toBe(expectedUrl);
    expect(result.popupBlocked).toBe(true);
  });

  it('creates a WaMeWhatsAppAdapter instance by default', () => {
    const defaultService = createDefaultWhatsAppService();
    expect(defaultService).toBeInstanceOf(WaMeWhatsAppAdapter);
    expect(defaultService.adapterName).toBe('wa_me');
  });
});
