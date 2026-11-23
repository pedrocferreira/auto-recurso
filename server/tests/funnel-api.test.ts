import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { app } from '../index.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

describe('API do funil de visitantes', () => {
    let token = '';
    const vid = `tst${Date.now()}abcd`;
    beforeAll(() => { process.env.NODE_ENV = 'test'; token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET!, { expiresIn: '1h' }); });

    it('rejeita evento de funil sem visitorId válido ou com etapa inexistente', async () => {
        expect((await request(app).post('/auto-api/analytics/event').send({ type: 'funnel', data: { step: 'visit' } })).status).toBe(400);
        expect((await request(app).post('/auto-api/analytics/event').send({ type: 'funnel', data: { visitorId: vid, step: 'hack' } })).status).toBe(400);
        expect((await request(app).post('/auto-api/analytics/event').send({ type: 'funnel', data: { visitorId: 'a b!', step: 'visit' } })).status).toBe(400);
    });

    it('registra etapas e o painel admin devolve o visitante na etapa mais avançada', async () => {
        await request(app).post('/auto-api/analytics/event').send({ type: 'funnel', data: { visitorId: vid, step: 'visit', gclid: true, device: 'mobile' } }).expect(200);
        await request(app).post('/auto-api/analytics/event').send({ type: 'funnel', data: { visitorId: vid, step: 'upload' } }).expect(200);
        const res = await request(app).get('/auto-api/admin/funnel?days=1').set('Authorization', `Bearer ${token}`).expect(200);
        const v = res.body.visitors.find((x: any) => x.id === vid);
        expect(v).toBeTruthy(); expect(v.stage).toBe('upload'); expect(v.source).toBe('Google Ads');
        expect(res.body.steps[0].count).toBeGreaterThanOrEqual(1);
    });

    it('o funil exige autenticação de admin', async () => {
        expect((await request(app).get('/auto-api/admin/funnel')).status).toBe(401);
    });
});
