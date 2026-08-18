// analyticsService.ts - Redesign for Backend Integration

export interface AnalyticsEvent {
    id?: string;
    type: string;
    data: any;
    timestamp?: number;
}

export const logEvent = async (type: string, data: any = {}) => {
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

export const registerResource = async (data: any) => {
    try {
        await fetch('/auto-api/admin/register-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error('Failed to register resource to server:', error);
    }
};

const getAuthHeaders = () => {
    const token = localStorage.getItem('adminToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
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
