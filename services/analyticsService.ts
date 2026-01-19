export interface AnalyticsEvent {
    id: string;
    timestamp: number;
    type: 'payment_started' | 'payment_completed' | 'payment_failed' | 'resource_generated' | 'generation_error' | 'form_abandoned' | 'email_failed' | 'email_sent';
    data: {
        customerName?: string;
        customerEmail?: string;
        customerCpf?: string;
        customerPhone?: string;
        ticketPlate?: string;
        ticketArticle?: string;
        errorMessage?: string;
        billingId?: string;
        amount?: number;
        isFree?: boolean;
    };
}

export interface AdminSettings {
    isFreeGenerationEnabled: boolean;
    freeGenerationLimit: number;
    freeGenerationsUsed: number;
}

export interface CustomerRecord {
    id: string;
    name: string;
    email: string;
    cpf: string;
    phone: string;
    rg?: string;
    cnh?: string;
    address?: string;
    registeredAt: number;
    lastActivity: number;
    totalResources: number;
    totalPaid: number;
}

export interface ResourceRecord {
    id: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    ticketPlate: string;
    ticketArticle: string;
    ticketLocation?: string;
    ticketDate?: string;
    strategy?: string;
    generatedAt: number;
    documentContent?: string;
}

const STORAGE_KEY = 'analytics_events';
const ABANDONED_CARTS_KEY = 'abandoned_carts';
const CUSTOMERS_KEY = 'customers_registry';
const RESOURCES_KEY = 'resources_registry';
const ADMIN_SETTINGS_KEY = 'admin_settings';

export const logEvent = (type: AnalyticsEvent['type'], data: AnalyticsEvent['data'] = {}) => {
    try {
        const events = getEvents();
        const newEvent: AnalyticsEvent = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            type,
            data
        };
        events.push(newEvent);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));

        // Track abandoned carts separately for recovery
        if (type === 'form_abandoned' || type === 'payment_started') {
            trackAbandonedCart(data);
        }

        // Remove from abandoned if payment completed or resource generated
        if (type === 'payment_completed' || type === 'resource_generated') {
            removeAbandonedCart(data.customerEmail || '');
        }
    } catch (error) {
        console.error('Failed to log analytics event:', error);
    }
};

export const getEvents = (): AnalyticsEvent[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const getEventsByType = (type: AnalyticsEvent['type']): AnalyticsEvent[] => {
    return getEvents().filter(event => event.type === type);
};

export const getEventsByDateRange = (startDate: number, endDate: number): AnalyticsEvent[] => {
    return getEvents().filter(event => event.timestamp >= startDate && event.timestamp <= endDate);
};

export const getStats = () => {
    const events = getEvents();
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    const last7days = now - (7 * 24 * 60 * 60 * 1000);

    const totalResources = events.filter(e => e.type === 'resource_generated').length;
    const totalPayments = events.filter(e => e.type === 'payment_completed').length;
    const totalErrors = events.filter(e => e.type === 'generation_error').length;
    const totalAbandoned = getAbandonedCarts().length;

    const resources24h = events.filter(e => e.type === 'resource_generated' && e.timestamp >= last24h).length;
    const payments24h = events.filter(e => e.type === 'payment_completed' && e.timestamp >= last24h).length;

    const totalRevenue = events
        .filter(e => e.type === 'payment_completed')
        .reduce((sum, e) => sum + (e.data.amount || 24.90), 0);

    const successRate = totalPayments > 0 ? ((totalResources / totalPayments) * 100).toFixed(1) : '0';

    const settings = getAdminSettings();

    return {
        totalResources,
        totalPayments,
        totalErrors,
        totalAbandoned,
        resources24h,
        payments24h,
        totalRevenue,
        successRate,
        freeGenerationsUsed: settings.freeGenerationsUsed,
        freeGenerationLimit: settings.freeGenerationLimit,
        isFreeGenerationEnabled: settings.isFreeGenerationEnabled
    };
};

interface AbandonedCart {
    email: string;
    name: string;
    cpf: string;
    phone: string;
    timestamp: number;
    ticketPlate?: string;
    ticketArticle?: string;
}

const trackAbandonedCart = (data: AnalyticsEvent['data']) => {
    if (!data.customerEmail) return;

    try {
        const carts = getAbandonedCarts();
        const existing = carts.findIndex(c => c.email === data.customerEmail);

        const cart: AbandonedCart = {
            email: data.customerEmail,
            name: data.customerName || '',
            cpf: data.customerCpf || '',
            phone: data.customerPhone || '',
            timestamp: Date.now(),
            ticketPlate: data.ticketPlate,
            ticketArticle: data.ticketArticle
        };

        if (existing >= 0) {
            carts[existing] = cart;
        } else {
            carts.push(cart);
        }

        localStorage.setItem(ABANDONED_CARTS_KEY, JSON.stringify(carts));
    } catch (error) {
        console.error('Failed to track abandoned cart:', error);
    }
};

const removeAbandonedCart = (email: string) => {
    if (!email) return;

    try {
        const carts = getAbandonedCarts();
        const filtered = carts.filter(c => c.email !== email);
        localStorage.setItem(ABANDONED_CARTS_KEY, JSON.stringify(filtered));
    } catch (error) {
        console.error('Failed to remove abandoned cart:', error);
    }
};

export const getAbandonedCarts = (): AbandonedCart[] => {
    try {
        const stored = localStorage.getItem(ABANDONED_CARTS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const clearAllData = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ABANDONED_CARTS_KEY);
    localStorage.removeItem(CUSTOMERS_KEY);
    localStorage.removeItem(RESOURCES_KEY);
    // We don't clear admin settings here to keep the config
};

// Admin Settings Functions
export const getAdminSettings = (): AdminSettings => {
    try {
        const stored = localStorage.getItem(ADMIN_SETTINGS_KEY);
        if (stored) return JSON.parse(stored);
    } catch (error) {
        console.error('Failed to get admin settings:', error);
    }

    // Default settings
    return {
        isFreeGenerationEnabled: false,
        freeGenerationLimit: 10,
        freeGenerationsUsed: 0
    };
};

export const updateAdminSettings = (settings: Partial<AdminSettings>) => {
    try {
        const current = getAdminSettings();
        const updated = { ...current, ...settings };
        localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(updated));
        return updated;
    } catch (error) {
        console.error('Failed to update admin settings:', error);
        return getAdminSettings();
    }
};

export const incrementFreeUsage = () => {
    try {
        const settings = getAdminSettings();
        settings.freeGenerationsUsed++;
        localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error('Failed to increment free usage:', error);
    }
};

// Customer Registry Functions
export const registerCustomer = (data: {
    name: string;
    email: string;
    cpf: string;
    phone: string;
    rg?: string;
    cnh?: string;
    address?: string;
}) => {
    try {
        const customers = getCustomers();
        const existingIndex = customers.findIndex(c => c.email === data.email);

        if (existingIndex >= 0) {
            // Update existing customer
            customers[existingIndex] = {
                ...customers[existingIndex],
                ...data,
                lastActivity: Date.now()
            };
        } else {
            // Create new customer
            const newCustomer: CustomerRecord = {
                id: `cust-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: data.name,
                email: data.email,
                cpf: data.cpf,
                phone: data.phone,
                rg: data.rg,
                cnh: data.cnh,
                address: data.address,
                registeredAt: Date.now(),
                lastActivity: Date.now(),
                totalResources: 0,
                totalPaid: 0
            };
            customers.push(newCustomer);
        }

        localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
    } catch (error) {
        console.error('Failed to register customer:', error);
    }
};

export const getCustomers = (): CustomerRecord[] => {
    try {
        const stored = localStorage.getItem(CUSTOMERS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const updateCustomerStats = (email: string, resourceGenerated: boolean, amountPaid?: number) => {
    try {
        const customers = getCustomers();
        const customer = customers.find(c => c.email === email);

        if (customer) {
            if (resourceGenerated) customer.totalResources++;
            if (amountPaid) customer.totalPaid += amountPaid;
            customer.lastActivity = Date.now();
            localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
        }
    } catch (error) {
        console.error('Failed to update customer stats:', error);
    }
};

// Resource Registry Functions
export const registerResource = (data: {
    customerName: string;
    customerEmail: string;
    customerCpf: string;
    customerPhone: string;
    customerRg?: string;
    customerCnh?: string;
    customerAddress?: string;
    ticketPlate: string;
    ticketArticle: string;
    ticketLocation?: string;
    ticketDate?: string;
    strategy?: string;
    documentContent?: string;
}) => {
    try {
        const resources = getResources();
        const customers = getCustomers();

        // Find or create customer
        let customer = customers.find(c => c.email === data.customerEmail);
        const customerId = customer?.id || `cust-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Register customer if new
        if (!customer) {
            registerCustomer({
                name: data.customerName,
                email: data.customerEmail,
                cpf: data.customerCpf,
                phone: data.customerPhone,
                rg: data.customerRg,
                cnh: data.customerCnh,
                address: data.customerAddress
            });
        }

        const newResource: ResourceRecord = {
            id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            customerId,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            ticketPlate: data.ticketPlate,
            ticketArticle: data.ticketArticle,
            ticketLocation: data.ticketLocation,
            ticketDate: data.ticketDate,
            strategy: data.strategy,
            generatedAt: Date.now(),
            documentContent: data.documentContent
        };

        resources.push(newResource);
        localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources));

        // Update customer stats
        updateCustomerStats(data.customerEmail, true);
    } catch (error) {
        console.error('Failed to register resource:', error);
    }
};

export const getResources = (): ResourceRecord[] => {
    try {
        const stored = localStorage.getItem(RESOURCES_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const getResourcesByCustomer = (customerId: string): ResourceRecord[] => {
    return getResources().filter(r => r.customerId === customerId);
};
