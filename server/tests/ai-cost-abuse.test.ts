// Auditoria de gasto de tokens: quais rotas chamam a IA ANTES do pagamento?
// A IA é mockada e as chamadas são contadas, então nada aqui gasta token de verdade.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

const ai = vi.hoisted(() => ({ calls: 0, fail: false }));

vi.mock('../ai.js', () => ({
    activeAIProvider: () => 'openrouter',
    generateAI: async () => {
        ai.calls++;
        if (ai.fail) throw new Error('falha simulada');
        return 'Texto do recurso gerado';
    },
    generateAIJson: async () => {
        ai.calls++;
        if (ai.fail) throw new Error('falha simulada');
        return { vehiclePlate: 'ABC1D23', strategies: [], fullName: '', cpf: '' };
    },
}));

// Kiwify simulada: por padrão nenhuma venda; o teste pode injetar vendas.
const kiwify = vi.hoisted(() => ({ sales: [] as any[] }));
vi.mock('node-fetch', () => ({
    default: async (url: string) => {
        const body = String(url).includes('oauth/token') ? { access_token: 'tok' } : { data: kiwify.sales };
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    },
}));

import { app } from '../index.js';
import { updateSettings, getSettings } from '../db.js';

const B64 = Buffer.from('conteudo-qualquer').toString('base64');
const appealBody = (extra: any = {}) => ({
    ticketInfo: { vehiclePlate: 'ABC1D23', article: 'Art. 218', violationType: 'Velocidade', authority: 'DETRAN', date: '2026-08-20', location: 'SP' },
    selectedStrategyId: 's1',
    userReason: 'Sem sinalização',
    personalData: { fullName: 'João', cpf: '111.222.333-44', email: 'comprador@teste.com' },
    city: 'SP',
    dateString: '14 de novembro de 2026',
    ...extra,
});
let ipSeq = 0;
const freshIp = () => `203.0.113.${++ipSeq}`;

beforeEach(() => {
    ai.calls = 0;
    ai.fail = false;
    kiwify.sales = [];
    updateSettings({ isFreeGenerationEnabled: false, freeGenerationLimit: 0, freeGenerationsUsed: 0 });
});

describe('Rotas de análise: IA chamada sem pagamento (por desenho, com proteções)', () => {
    it('analyze (foto da multa) chama a IA sem login e sem pagamento', async () => {
        const res = await request(app).post('/auto-api/generate/analyze').send({ base64Image: B64, mimeType: 'image/png' });
        expect(res.status).toBe(200);
        expect(ai.calls).toBe(1);
    });
    it('analyze-cnh (foto da CNH) chama a IA sem login e sem pagamento', async () => {
        const res = await request(app).post('/auto-api/generate/analyze-cnh').send({ base64Image: B64, mimeType: 'image/png' });
        expect(res.status).toBe(200);
        expect(ai.calls).toBe(1);
    });
    it('analyze-text chama a IA sem login e sem pagamento', async () => {
        const res = await request(app).post('/auto-api/generate/analyze-text').send({ vehiclePlate: 'ABC1D23', article: 'Art. 218' });
        expect(res.status).toBe(200);
        expect(ai.calls).toBe(1);
    });
    it('rejeita tipo de arquivo não permitido (zip, html) sem chamar a IA', async () => {
        for (const mimeType of ['application/zip', 'text/html', 'video/mp4']) {
            const res = await request(app).post('/auto-api/generate/analyze').send({ base64Image: B64, mimeType });
            expect(res.status).toBe(400);
        }
        expect(ai.calls).toBe(0);
    });
    it('rejeita arquivo acima de 7MB e arquivo vazio/inválido sem chamar a IA', async () => {
        const big = Buffer.alloc(7.2 * 1024 * 1024, 65).toString('base64'); // ~9,6M chars: passa do Express, estoura o limite de 7MB
        const huge = Buffer.alloc(8 * 1024 * 1024, 65).toString('base64'); // estoura o limite de 10MB do Express (413)
        const r1 = await request(app).post('/auto-api/generate/analyze').send({ base64Image: big, mimeType: 'application/pdf' });
        const r2 = await request(app).post('/auto-api/generate/analyze-cnh').send({ base64Image: '', mimeType: 'image/png' });
        const r3 = await request(app).post('/auto-api/generate/analyze-cnh').send({ mimeType: 'image/png' });
        const r4 = await request(app).post('/auto-api/generate/analyze').send({ base64Image: '!!!@@@###', mimeType: 'image/png' });
        const r5 = await request(app).post('/auto-api/generate/analyze').send({ base64Image: huge, mimeType: 'application/pdf' });
        expect([r1.status, r2.status, r3.status, r4.status, r5.status]).toEqual([400, 400, 400, 400, 413]);
        expect(ai.calls).toBe(0);
    });
    it('aceita data URL com PDF e imagem válidos', async () => {
        const pdf = await request(app).post('/auto-api/generate/analyze').send({ base64Image: `data:application/pdf;base64,${B64}` });
        const jpg = await request(app).post('/auto-api/generate/analyze-cnh').send({ base64Image: B64 });
        expect([pdf.status, jpg.status]).toEqual([200, 200]);
        expect(ai.calls).toBe(2);
    });
});

describe('Teto diário global de análises gratuitas (vale mesmo trocando de IP)', () => {
    const original = process.env.PRE_PAYMENT_AI_DAILY_LIMIT;
    afterEach(() => { if (original === undefined) delete process.env.PRE_PAYMENT_AI_DAILY_LIMIT; else process.env.PRE_PAYMENT_AI_DAILY_LIMIT = original; });

    it('depois do teto, as 3 rotas deixam de chamar a IA e respondem de forma amigável', async () => {
        // gasta o que já foi consumido neste arquivo e fixa o teto logo acima
        process.env.PRE_PAYMENT_AI_DAILY_LIMIT = '1000000';
        await request(app).post('/auto-api/generate/analyze-text').send({ vehiclePlate: 'X' });
        const used = ai.calls;
        // o contador global do arquivo é desconhecido; usa um teto bem baixo para estourar com certeza
        process.env.PRE_PAYMENT_AI_DAILY_LIMIT = '1';
        ai.calls = 0;
        const text = await request(app).post('/auto-api/generate/analyze-text').set('X-Forwarded-For', freshIp()).send({ vehiclePlate: 'ABC1D23' });
        const img = await request(app).post('/auto-api/generate/analyze').set('X-Forwarded-For', freshIp()).send({ base64Image: B64, mimeType: 'image/png' });
        const cnh = await request(app).post('/auto-api/generate/analyze-cnh').set('X-Forwarded-For', freshIp()).send({ base64Image: B64, mimeType: 'image/png' });
        expect(used).toBe(1);
        expect(ai.calls).toBe(0);
        expect(text.status).toBe(200);
        expect(text.body.strategies.length).toBe(3); // estratégias padrão, sem IA
        expect(img.status).toBe(503);
        expect(cnh.status).toBe(200);
        expect(cnh.body.fullName).toBe('');
    });
    it('o teto não afeta o recurso pago (appeal)', async () => {
        process.env.PRE_PAYMENT_AI_DAILY_LIMIT = '1';
        updateSettings({ isFreeGenerationEnabled: true, freeGenerationLimit: 1, freeGenerationsUsed: 0 });
        const res = await request(app).post('/auto-api/generate/appeal').send(appealBody({ useFreeGeneration: true }));
        expect(res.status).toBe(200);
        expect(ai.calls).toBe(1);
    });
});

describe('Limite por IP nas rotas de análise (rate limit ativo)', () => {
    const original = process.env.NODE_ENV;
    beforeEach(() => { process.env.NODE_ENV = 'production'; });
    afterEach(() => { process.env.NODE_ENV = original; });

    it('um mesmo IP consegue no máximo 10 chamadas por rota em 10 min (30 no total)', async () => {
        const ip = freshIp();
        const routes = [
            ['/auto-api/generate/analyze', { base64Image: B64, mimeType: 'image/png' }],
            ['/auto-api/generate/analyze-cnh', { base64Image: B64, mimeType: 'image/png' }],
            ['/auto-api/generate/analyze-text', { vehiclePlate: 'ABC1D23' }],
        ] as const;
        for (const [route, body] of routes) {
            const before = ai.calls;
            let blocked = 0;
            for (let i = 0; i < 25; i++) {
                const r = await request(app).post(route).set('X-Forwarded-For', ip).send(body);
                if (r.status === 429) blocked++;
            }
            expect(ai.calls - before).toBe(10);
            expect(blocked).toBe(15);
        }
        expect(ai.calls).toBe(30);
    });

    it('IPs diferentes têm contadores separados (quem troca de IP não é limitado)', async () => {
        for (let i = 0; i < 30; i++) {
            await request(app).post('/auto-api/generate/analyze-text').set('X-Forwarded-For', freshIp()).send({ vehiclePlate: 'X' });
        }
        expect(ai.calls).toBe(30);
    });
});

describe('Geração do recurso (appeal): só com pagamento ou cota grátis', () => {
    it('sem pagamento e sem cota grátis: 402 e nenhuma chamada à IA', async () => {
        const res = await request(app).post('/auto-api/generate/appeal').send(appealBody());
        expect(res.status).toBe(402);
        expect(ai.calls).toBe(0);
    });
    it('sem e-mail: 402 e nenhuma chamada à IA', async () => {
        const res = await request(app).post('/auto-api/generate/appeal').send(appealBody({ personalData: { fullName: 'João', cpf: '1' } }));
        expect(res.status).toBe(402);
        expect(ai.calls).toBe(0);
    });
    it('useFreeGeneration com cota grátis desligada: 402 e nenhuma chamada à IA', async () => {
        const res = await request(app).post('/auto-api/generate/appeal').send(appealBody({ useFreeGeneration: true }));
        expect(res.status).toBe(402);
        expect(ai.calls).toBe(0);
    });
    it('e-mail sem venda na Kiwify: 402 e nenhuma chamada à IA', async () => {
        const res = await request(app).post('/auto-api/generate/appeal').send(appealBody());
        expect(res.status).toBe(402);
        expect(ai.calls).toBe(0);
    });
    it('venda pendente (não paga): 402 e nenhuma chamada à IA', async () => {
        kiwify.sales = [{ id: 'v-pend', status: 'waiting_payment', customer: { email: 'comprador@teste.com' } }];
        const res = await request(app).post('/auto-api/generate/appeal').send(appealBody());
        expect(res.status).toBe(402);
        expect(ai.calls).toBe(0);
    });
    it('venda de OUTRO e-mail não libera a geração', async () => {
        kiwify.sales = [{ id: 'v-outro', status: 'paid', customer: { email: 'outro@teste.com' } }];
        const res = await request(app).post('/auto-api/generate/appeal').send(appealBody());
        expect(res.status).toBe(402);
        expect(ai.calls).toBe(0);
    });
    it('campos que tentam burlar (paid, isPaid, APP_MODE, saleId) são ignorados', async () => {
        const res = await request(app).post('/auto-api/generate/appeal')
            .set('X-App-Mode', 'dev')
            .send(appealBody({ paid: true, isPaid: true, status: 'PAID', saleId: 'x', appMode: 'dev', devMode: true }));
        expect(res.status).toBe(402);
        expect(ai.calls).toBe(0);
    });
    it('20 requisições simultâneas com 1 cota grátis geram só 1 vez', async () => {
        updateSettings({ isFreeGenerationEnabled: true, freeGenerationLimit: 1, freeGenerationsUsed: 0 });
        const results = await Promise.all(Array.from({ length: 20 }, () =>
            request(app).post('/auto-api/generate/appeal').send(appealBody({ useFreeGeneration: true }))));
        expect(results.filter(r => r.status === 200).length).toBe(1);
        expect(ai.calls).toBe(1);
        expect(getSettings().freeGenerationsUsed).toBe(1);
    });
    it('10 requisições simultâneas com a mesma venda paga geram só 1 vez', async () => {
        kiwify.sales = [{ id: `v-paga-1-${Date.now()}`, status: 'paid', customer: { email: 'comprador@teste.com' } }];
        const results = await Promise.all(Array.from({ length: 10 }, () =>
            request(app).post('/auto-api/generate/appeal').send(appealBody())));
        expect(results.filter(r => r.status === 200).length).toBe(1);
        expect(ai.calls).toBe(1);
    });
    it('a mesma venda não gera um segundo recurso depois', async () => {
        kiwify.sales = [{ id: `v-paga-2-${Date.now()}`, status: 'paid', customer: { email: 'comprador@teste.com' } }];
        const a = await request(app).post('/auto-api/generate/appeal').send(appealBody());
        const b = await request(app).post('/auto-api/generate/appeal').send(appealBody());
        expect(a.status).toBe(200);
        expect(b.status).toBe(402);
        expect(ai.calls).toBe(1);
    });
});

describe('Rotas que não gastam token', () => {
    it('docx e recover não chamam a IA', async () => {
        await request(app).post('/auto-api/generate/docx').send({ content: 'texto' });
        await request(app).post('/auto-api/resource/recover').send({ email: 'x@y.com', cpf: '1' });
        expect(ai.calls).toBe(0);
    });
});
