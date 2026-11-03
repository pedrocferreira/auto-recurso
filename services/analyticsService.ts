// analyticsService.ts - Redesign for Backend Integration

export interface AnalyticsEvent {
    id?: string;
    type: string;
    data: any;
    timestamp?: number;
}

export const GOOGLE_ADS_CONVERSION_ID = '16970325896';
export const GOOGLE_ADS_CONVERSION_LABEL = 'IUnHCNH0xrscEIi_ipw_';

export interface PurchaseConversionData {
    amount?: number;
    email?: string;
    transactionId?: string;
    ticketPlate?: string;
}

/**
 * Dispara o evento de conversão de compra para Google Ads (gtag) e Google Tag Manager (dataLayer)
 */
export const trackPurchaseConversion = (data: PurchaseConversionData = {}) => {
    const value = data.amount ?? 39.90;
    const transactionId = data.transactionId || `rec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const sendTo = `AW-${GOOGLE_ADS_CONVERSION_ID}/${GOOGLE_ADS_CONVERSION_LABEL}`;

    console.log('🎯 [Google Conversion] Disparando evento de conversão de compra:', { sendTo, value, transactionId });

    // 1. Disparo direto via gtag (Google Ads / Tag Manager gtag.js)
    try {
        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', 'conversion', {
                send_to: sendTo,
                value: value,
                currency: 'BRL',
                transaction_id: transactionId
            });
        }
    } catch (err) {
        console.warn('Erro ao disparar gtag conversion:', err);
    }

    // 2. Disparo no dataLayer para Google Tag Manager (GTM)
    try {
        if (typeof window !== 'undefined') {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                event: 'purchase',
                conversion_id: GOOGLE_ADS_CONVERSION_ID,
                conversion_label: GOOGLE_ADS_CONVERSION_LABEL,
                ecommerce: {
                    transaction_id: transactionId,
                    value: value,
                    currency: 'BRL',
                    items: [
                        {
                            item_name: 'Recurso de Multa de Trânsito',
                            item_category: 'Serviço Jurídico IA',
                            price: value,
                            quantity: 1
                        }
                    ]
                },
                user_email: data.email || '',
                ticket_plate: data.ticketPlate || ''
            });
        }
    } catch (err) {
        console.warn('Erro ao enviar evento purchase para dataLayer:', err);
    }
};

export const logEvent = async (type: string, data: any = {}) => {
    // Forward event to Google tag (gtag.js) if available
    try {
        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', type, data);
        }
    } catch (gtagErr) {
        console.warn('Failed to forward event to gtag:', gtagErr);
    }

    try {
        await fetch('/auto-api/analytics/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, data })
        });
    } catch (error) {
        console.error('Failed to log event to server:', error);
    }
};

const getAuthHeaders = () => {
    const token = localStorage.getItem('adminToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const getPublicSettings = async () => {
    try {
        const response = await fetch('/auto-api/settings/public');
        if (response.ok) {
            return await response.json();
        }
    } catch (err) {
        console.warn('Failed to fetch public settings:', err);
    }
    return {
        isFreeGenerationEnabled: false,
        freeGenerationLimit: 0,
        freeGenerationsUsed: 0
    };
};

export const getAdminData = async () => {
    const response = await fetch('/auto-api/admin/data', {
        headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Unauthorized');
    return await response.json();
};

export const updateAdminSettings = async (settings: any) => {
    const response = await fetch('/auto-api/admin/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify(settings)
    });
    return await response.json();
};

export const clearAllData = async () => {
    await fetch('/auto-api/admin/clear', {
        method: 'POST',
        headers: getAuthHeaders()
    });
};

export const searchResources = async (query: string): Promise<{ success: boolean; message?: string }> => {
    try {
        const response = await fetch('/auto-api/resource/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        return await response.json();
    } catch (error: any) {
        console.error('Failed to recover resource:', error);
        return { success: false, message: 'Erro ao conectar ao servidor. Tente novamente mais tarde.' };
    }
};


