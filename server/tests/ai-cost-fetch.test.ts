// Quanto uma única requisição pode custar dentro do ai.ts (fallback de modelos e limite de saída).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const net = vi.hoisted(() => ({ requests: [] as any[], mode: 'fail' as 'fail' | 'ok' }));
vi.mock('node-fetch', () => ({
    default: async (_url: string, init: any) => {
        net.requests.push(JSON.parse(init.body));
        if (net.mode === 'fail') return { ok: false, status: 500, json: async () => ({ error: { message: 'erro' } }) };
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }) };
    },
}));

import { generateAI, generateAIJson } from '../ai.js';

beforeEach(() => {
    net.requests = [];
    process.env.OPENROUTER_API_KEY = 'test';
    delete process.env.OPENROUTER_MODEL;
});

describe('Custo por requisição no ai.ts', () => {
    it('quando a IA falha, uma requisição do usuário dispara uma chamada por modelo da lista', async () => {
        net.mode = 'fail';
        await expect(generateAI({ prompt: 'x' })).rejects.toThrow();
        console.log(`[custo] chamadas ao OpenRouter numa requisição que falha: ${net.requests.length}`);
        expect(net.requests.length).toBe(2);
    });
    it('a requisição ao OpenRouter define um teto de tokens de saída (max_tokens)', async () => {
        net.mode = 'ok';
        await generateAIJson({ prompt: 'x', schema: { type: 'object' } });
        expect(net.requests[0].max_tokens).toBeGreaterThan(0);
    });
});
