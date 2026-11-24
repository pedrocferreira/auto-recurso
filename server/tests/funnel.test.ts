import { describe, it, expect } from 'vitest';
import { buildFunnel, classifySource } from '../funnel.js';

const T = 1_700_000_000_000;
const ev = (vid: string, step: string, dt: number, extra: any = {}) => ({ timestamp: T + dt, data: { visitorId: vid, step, ...extra } });

describe('Funil de visitantes', () => {
    it('conta visitantes únicos por etapa e a conversão', () => {
        const events = [
            ev('aaaaaaaa', 'visit', 0, { gclid: 'x', utmCampaign: 'c1', device: 'mobile' }),
            ev('aaaaaaaa', 'upload', 10), ev('aaaaaaaa', 'analysis', 20), ev('aaaaaaaa', 'checkout', 30, { email: 'a@t.com', name: 'Ana' }),
            ev('aaaaaaaa', 'paid', 40), ev('aaaaaaaa', 'generated', 50),
            ev('bbbbbbbb', 'visit', 5, { referrer: 'instagram.com' }), ev('bbbbbbbb', 'upload', 15),
            ev('cccccccc', 'visit', 6),
            ev('cccccccc', 'visit', 7), // repetido não duplica
        ];
        const f = buildFunnel(events, T - 1);
        expect(f.totalVisitors).toBe(3);
        expect(f.steps.find(s => s.id === 'upload')!.count).toBe(2);
        expect(f.steps.find(s => s.id === 'paid')!.count).toBe(1);
        expect(f.conversionRate).toBeCloseTo(33.3, 1);
        const a = f.visitors.find(v => v.id === 'aaaaaaaa')!;
        expect(a.stage).toBe('generated'); expect(a.source).toBe('Google Ads'); expect(a.email).toBe('a@t.com');
        expect(f.bySource.find(s => s.source === 'Google Ads')).toMatchObject({ visitors: 1, paid: 1 });
    });

    it('ignora eventos inválidos e anteriores ao período', () => {
        const f = buildFunnel([ev('aaaaaaaa', 'visit', -100), { timestamp: T, data: { step: 'visit' } }, ev('dddddddd', 'inexistente', 0)], T);
        expect(f.totalVisitors).toBe(0);
    });

    it('classifica a origem', () => {
        expect(classifySource({ utmSource: 'google', utmMedium: 'cpc' })).toBe('Google Ads');
        expect(classifySource({ referrer: 'x.com' })).toBe('Site: x.com');
        expect(classifySource({})).toBe('Direto');
    });
});
