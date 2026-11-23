// Funil de visitantes: agrega os eventos do tipo "funnel" (um por etapa) por visitante.

export const FUNNEL_STEPS = [
    { id: 'visit', label: 'Entrou no site' },
    { id: 'upload', label: 'Enviou a multa' },
    { id: 'analysis', label: 'Viu a análise' },
    { id: 'strategy', label: 'Escolheu a tese' },
    { id: 'data', label: 'Chegou nos dados pessoais' },
    { id: 'checkout', label: 'Chegou no pagamento' },
    { id: 'pay_click', label: 'Clicou em pagar' },
    { id: 'paid', label: 'Pagou' },
    { id: 'generated', label: 'Recurso gerado' },
] as const;

export const FUNNEL_STEP_IDS: Set<string> = new Set(FUNNEL_STEPS.map(s => s.id));
const RANK: Record<string, number> = Object.fromEntries(FUNNEL_STEPS.map((s, i) => [s.id, i]));

export interface FunnelEvent { timestamp: number; data: any }

export function classifySource(d: any): string {
    const src = String(d?.utmSource || '').toLowerCase();
    const med = String(d?.utmMedium || '').toLowerCase();
    if (d?.gclid || (src === 'google' && ['cpc', 'ppc', 'paid'].includes(med))) return 'Google Ads';
    if (src) return `Campanha: ${src}`;
    if (d?.referrer) return `Site: ${String(d.referrer).slice(0, 60)}`;
    return 'Direto';
}

export function buildFunnel(events: FunnelEvent[], sinceTs: number, limit = 300) {
    const byVisitor = new Map<string, any>();
    for (const ev of events) {
        const d = ev.data || {};
        const vid = typeof d.visitorId === 'string' ? d.visitorId : '';
        if (!vid || !FUNNEL_STEP_IDS.has(d.step) || ev.timestamp < sinceTs) continue;
        let v = byVisitor.get(vid);
        if (!v) {
            v = { id: vid, firstSeen: ev.timestamp, lastSeen: ev.timestamp, source: 'Direto', campaign: '', device: '', reached: {}, name: '', email: '', visitedAt: 0, free: false };
            byVisitor.set(vid, v);
        }
        v.firstSeen = Math.min(v.firstSeen, ev.timestamp);
        v.lastSeen = Math.max(v.lastSeen, ev.timestamp);
        if (!v.reached[d.step] || ev.timestamp < v.reached[d.step]) v.reached[d.step] = ev.timestamp;
        if (d.step === 'visit' && (!v.visitedAt || ev.timestamp < v.visitedAt)) {
            v.visitedAt = ev.timestamp; v.source = classifySource(d); v.campaign = String(d.utmCampaign || ''); v.device = String(d.device || '');
        }
        if (d.free === true) v.free = true;
        if (typeof d.name === 'string' && d.name) v.name = d.name;
        if (typeof d.email === 'string' && d.email) v.email = d.email;
    }
    const visitors = [...byVisitor.values()].map(v => {
        let stageIdx = 0;
        for (const id of Object.keys(v.reached)) stageIdx = Math.max(stageIdx, RANK[id]);
        return { ...v, stage: FUNNEL_STEPS[stageIdx].id, stageIndex: stageIdx };
    }).sort((a, b) => b.lastSeen - a.lastSeen);

    // Quem chegou numa etapa posterior também passou pelas anteriores (ex.: restaurou a sessão salva)
    // Geração grátis não passou por cliques/pagamento: só conta nessas etapas se registrou o evento.
    const reachedStep = (v: any, i: number) => {
        if (i === RANK.pay_click || i === RANK.paid) return !!v.reached[FUNNEL_STEPS[i].id] || (v.stageIndex > i && !v.free);
        return v.stageIndex >= i;
    };
    const counts = FUNNEL_STEPS.map((_, i) => visitors.filter(v => reachedStep(v, i)).length);
    const total = counts[0] || 0;
    const steps = FUNNEL_STEPS.map((s, i) => ({
        id: s.id, label: s.label, count: counts[i],
        pctOfVisits: total ? Math.round((counts[i] / total) * 1000) / 10 : 0,
        pctOfPrev: i === 0 ? 100 : counts[i - 1] ? Math.round((counts[i] / counts[i - 1]) * 1000) / 10 : 0,
    }));
    const srcMap = new Map<string, { source: string; visitors: number; paid: number }>();
    for (const v of visitors) {
        const s = srcMap.get(v.source) || { source: v.source, visitors: 0, paid: 0 };
        s.visitors++; if (reachedStep(v, RANK.paid)) s.paid++;
        srcMap.set(v.source, s);
    }
    return {
        since: sinceTs,
        totalVisitors: total,
        paid: counts[RANK.paid],
        conversionRate: total ? Math.round((counts[RANK.paid] / total) * 1000) / 10 : 0,
        steps,
        bySource: [...srcMap.values()].sort((a, b) => b.visitors - a.visitors),
        visitors: visitors.slice(0, limit),
    };
}
