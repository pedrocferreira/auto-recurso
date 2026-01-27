// analyticsService.ts - Redesign for Backend Integration

export interface AnalyticsEvent {
    id?: string;
    type: string;
    data: any;
    timestamp?: number;
}

export const logEvent = async (type: string, data: any = {}) => {
    try {
        await fetch('/api/analytics/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, data })
        });
    } catch (error) {
        console.error('Failed to log event to server:', error);
    }
};

export const registerResource = async (data: any) => {
    try {
        await fetch('/api/admin/register-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error('Failed to register resource to server:', error);
    }
};

export const getAdminData = async () => {
    const response = await fetch('/api/admin/data');
    return await response.json();
};

export const updateAdminSettings = async (settings: any) => {
    const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    });
    return await response.json();
};

export const clearAllData = async () => {
    await fetch('/api/admin/clear', { method: 'POST' });
};
