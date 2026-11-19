import { describe, it, expect, beforeEach } from 'vitest';
import { db, addResource, addEvent, purgeExpiredData, claimSale, getResources } from '../db.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const U = `${NOW}-${Math.random().toString(36).slice(2, 7)}`; // ids únicos por execução

beforeEach(() => {
    delete process.env.RESOURCE_RETENTION_DAYS;
    delete process.env.ABANDONED_CART_RETENTION_DAYS;
    delete process.env.EVENT_PII_RETENTION_DAYS;
    delete process.env.SALE_EMAIL_RETENTION_DAYS;
});

describe('Retenção de dados pessoais (LGPD)', () => {
    it('apaga recursos com mais de 90 dias e mantém os recentes', () => {
        addResource({ id: `old-${U}`, generatedAt: NOW - 91 * DAY, customerName: 'Antigo', customerEmail: 'antigo@t.com', customerCpf: '111', documentContent: 'texto' });
        addResource({ id: `new-${U}`, generatedAt: NOW - 89 * DAY, customerName: 'Recente', customerEmail: 'recente@t.com', customerCpf: '222', documentContent: 'texto' });
        const r = purgeExpiredData(NOW);
        const ids = getResources().map((x: any) => x.id);
        expect(r.resources).toBeGreaterThanOrEqual(1);
        expect(ids).not.toContain(`old-${U}`);
        expect(ids).toContain(`new-${U}`);
    });

    it('o prazo dos recursos é configurável por RESOURCE_RETENTION_DAYS', () => {
        addResource({ id: `cfg-${U}`, generatedAt: NOW - 40 * DAY, customerName: 'X', customerEmail: 'x@t.com', documentContent: 't' });
        process.env.RESOURCE_RETENTION_DAYS = '30';
        purgeExpiredData(NOW);
        expect(getResources().map((x: any) => x.id)).not.toContain(`cfg-${U}`);
    });

    it('anonimiza dados pessoais dos eventos antigos, mas mantém o evento (contagem)', () => {
        addEvent({ id: `ev-old-${U}`, type: 'payment_started', timestamp: NOW - 100 * DAY, data: { customerName: 'João', customerEmail: 'j@t.com', customerCpf: '123', customerPhone: '119', ticketArticle: 'Art. 218', amount: 39.9 } });
        addEvent({ id: `ev-new-${U}`, type: 'payment_started', timestamp: NOW - 10 * DAY, data: { customerEmail: 'novo@t.com', amount: 39.9 } });
        purgeExpiredData(NOW);
        const old: any = db.prepare('SELECT type, data FROM events WHERE id = ?').get(`ev-old-${U}`);
        const recent: any = db.prepare('SELECT data FROM events WHERE id = ?').get(`ev-new-${U}`);
        expect(old).toBeTruthy();
        expect(old.type).toBe('payment_started');
        const oldData = JSON.parse(old.data);
        expect(oldData.customerEmail).toBeUndefined();
        expect(oldData.customerCpf).toBeUndefined();
        expect(oldData.customerName).toBeUndefined();
        expect(oldData.customerPhone).toBeUndefined();
        expect(oldData.amount).toBe(39.9);
        expect(oldData.ticketArticle).toBe('Art. 218');
        expect(JSON.parse(recent.data).customerEmail).toBe('novo@t.com');
    });

    it('limpa o e-mail de vendas antigas, mas mantém o id da venda (impede reuso)', () => {
        claimSale(`sale-old-${U}`, 'comprador@t.com');
        db.prepare('UPDATE consumed_sales SET consumed_at = ? WHERE sale_id = ?').run(NOW - 100 * DAY, `sale-old-${U}`);
        claimSale(`sale-new-${U}`, 'recente@t.com');
        purgeExpiredData(NOW);
        const old: any = db.prepare('SELECT email FROM consumed_sales WHERE sale_id = ?').get(`sale-old-${U}`);
        const recent: any = db.prepare('SELECT email FROM consumed_sales WHERE sale_id = ?').get(`sale-new-${U}`);
        expect(old).toBeTruthy();
        expect(old.email).toBe('');
        expect(recent.email).toBe('recente@t.com');
        expect(claimSale(`sale-old-${U}`, 'qualquer@t.com')).toBe(false); // venda continua consumida
    });

    it('apaga carrinhos abandonados com mais de 30 dias', () => {
        db.prepare('INSERT INTO abandoned_carts (id, email, name, phone, plate, created_at, data) VALUES (?,?,?,?,?,?,?)').run(`cart-old-${U}`, 'a@t.com', 'A', '1', 'AAA', NOW - 31 * DAY, '{}');
        db.prepare('INSERT INTO abandoned_carts (id, email, name, phone, plate, created_at, data) VALUES (?,?,?,?,?,?,?)').run(`cart-new-${U}`, 'b@t.com', 'B', '2', 'BBB', NOW - 5 * DAY, '{}');
        purgeExpiredData(NOW);
        expect(db.prepare('SELECT 1 FROM abandoned_carts WHERE id = ?').get(`cart-old-${U}`)).toBeUndefined();
        expect(db.prepare('SELECT 1 FROM abandoned_carts WHERE id = ?').get(`cart-new-${U}`)).toBeTruthy();
    });

    it('rodar duas vezes seguidas não apaga mais nada (idempotente)', () => {
        purgeExpiredData(NOW);
        const second = purgeExpiredData(NOW);
        expect(second).toEqual({ resources: 0, abandonedCarts: 0, eventsAnonymized: 0, saleEmailsCleared: 0 });
    });
});
