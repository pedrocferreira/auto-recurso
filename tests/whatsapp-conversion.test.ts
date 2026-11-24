import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackWhatsAppClick, trackPurchaseConversion } from '../services/analyticsService';

describe('Conversões do Google Ads', () => {
  const gtag = vi.fn();
  beforeEach(() => {
    gtag.mockClear();
    (globalThis as any).window = { gtag, dataLayer: [] };
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as any);
  });
  afterEach(() => { delete (globalThis as any).window; });

  it('clique no WhatsApp dispara a conversão "Clique WhatsApp"', () => {
    trackWhatsAppClick();
    const call = gtag.mock.calls.find(c => c[0] === 'event' && c[1] === 'conversion');
    expect(call?.[2].send_to).toBe('AW-16970325896/IUnHCNH0xrscEIi_ipw_');
  });

  it('compra usa o rótulo da conversão "Compra", diferente do WhatsApp', () => {
    trackPurchaseConversion({ amount: 39.9, transactionId: 't1' });
    const call = gtag.mock.calls.find(c => c[1] === 'conversion');
    expect(call?.[2].send_to).toBe('AW-16970325896/SIiCCLep1LIaEIi_ipw_');
  });

  it('não quebra sem gtag', () => {
    (globalThis as any).window = {};
    expect(() => trackWhatsAppClick()).not.toThrow();
  });
});
