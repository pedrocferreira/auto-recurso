// Rastreamento do funil de visitantes (anônimo por padrão: identificador aleatório no navegador).
// Admin e modo dev não são rastreados, para não poluir as métricas.

const VID_KEY = 'arVisitorId';

export const getVisitorId = (): string => {
    try {
        let id = localStorage.getItem(VID_KEY);
        if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
            id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
            localStorage.setItem(VID_KEY, id);
        }
        return id;
    } catch {
        return `sess${Math.random().toString(36).slice(2, 12)}`;
    }
};

const isExcluded = (): boolean => {
    try {
        return !!localStorage.getItem('adminToken') || window.location.pathname === '/admin' || localStorage.getItem('devMode') === 'true';
    } catch { return false; }
};

export type FunnelStep = 'visit' | 'upload' | 'analysis' | 'strategy' | 'data' | 'checkout' | 'pay_click' | 'paid' | 'generated';

/** Envia uma etapa do funil. Cada etapa é enviada uma vez por sessão do navegador (salvo `force`). */
export const trackFunnel = (step: FunnelStep, extra: Record<string, any> = {}, force = false) => {
    if (isExcluded()) return;
    try {
        const key = `fn_${step}`;
        if (!force && sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
    } catch { /* sessionStorage indisponível: segue */ }
    try {
        fetch('/auto-api/analytics/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({ type: 'funnel', data: { visitorId: getVisitorId(), step, ...extra } }),
        }).catch(() => { /* rastreamento nunca atrapalha o usuário */ });
    } catch { /* ignora */ }
};

/** Primeira etapa: origem do acesso (UTM, clique de anúncio do Google, referência) e aparelho. */
export const trackVisit = () => {
    try {
        const q = new URLSearchParams(window.location.search);
        let referrer = '';
        try { if (document.referrer) { const h = new URL(document.referrer).hostname; if (h && h !== window.location.hostname) referrer = h; } } catch { /* ignora */ }
        trackFunnel('visit', {
            utmSource: q.get('utm_source') || '',
            utmMedium: q.get('utm_medium') || '',
            utmCampaign: q.get('utm_campaign') || '',
            gclid: q.get('gclid') ? true : false,
            referrer,
            device: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        });
    } catch { /* ignora */ }
};
