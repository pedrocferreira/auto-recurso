import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('Endurecimento da API', () => {
    it('JSON inválido: 400 sem stack trace', async () => {
        const res = await request(app).post('/auto-api/analytics/event').set('Content-Type', 'application/json').send('{bad');
        expect(res.status).toBe(400);
        expect(res.text).not.toMatch(/node_modules|at JSON|SyntaxError/);
    });
    it('health não expõe uptime nem ambiente', async () => {
        const res = await request(app).get('/auto-api/health');
        expect(res.body.status).toBe('ok');
        expect(res.body.uptime).toBeUndefined();
        expect(res.body.env).toBeUndefined();
    });
    it('não envia X-Powered-By', async () => {
        const res = await request(app).get('/auto-api/health');
        expect(res.headers['x-powered-by']).toBeUndefined();
    });
});
