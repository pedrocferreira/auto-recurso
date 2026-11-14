import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- Camada de IA ---
// Provedor principal: OpenRouter (se OPENROUTER_API_KEY estiver configurada).
// Fallback: Gemini direto (se GEMINI_API_KEY estiver configurada).

export interface AIFile {
    mimeType: string;
    data: string; // base64 sem o prefixo data:
}

export interface AIRequest {
    prompt: string;
    file?: AIFile;
    schema?: Record<string, any>; // JSON Schema da resposta; quando presente, a resposta é JSON
    label?: string; // nome curto para os logs
    maxTokens?: number; // teto de tokens de saída (inclui raciocínio), para limitar o custo por chamada
}

const DEFAULT_MAX_TOKENS = 4000;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TIMEOUT_MS = 120_000;

function openRouterModels(): string[] {
    const fromEnv = (process.env.OPENROUTER_MODEL || '').split(',').map(s => s.trim()).filter(Boolean);
    return [...new Set([...fromEnv, 'google/gemini-3.6-flash', 'google/gemini-2.5-flash'])];
}

function geminiModels(): string[] {
    return [process.env.GEMINI_MODEL, 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'].filter(Boolean) as string[];
}

export function activeAIProvider(): 'openrouter' | 'gemini' | 'none' {
    if (process.env.OPENROUTER_API_KEY) return 'openrouter';
    if (process.env.GEMINI_API_KEY) return 'gemini';
    return 'none';
}

// Alguns modelos devolvem JSON dentro de ```json ... ```, mesmo pedindo JSON puro.
function stripCodeFences(text: string): string {
    const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1] : text.trim();
}

async function callOpenRouter(model: string, req: AIRequest): Promise<string> {
    const content: any[] = [];
    if (req.file) {
        const dataUrl = `data:${req.file.mimeType};base64,${req.file.data}`;
        if (req.file.mimeType === 'application/pdf') {
            content.push({ type: 'file', file: { filename: 'documento.pdf', file_data: dataUrl } });
        } else {
            content.push({ type: 'image_url', image_url: { url: dataUrl } });
        }
    }
    content.push({ type: 'text', text: req.prompt });

    const body: any = {
        model,
        messages: [{ role: 'user', content }],
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    };
    if (req.schema) {
        body.response_format = {
            type: 'json_schema',
            json_schema: { name: 'resposta', strict: false, schema: req.schema },
        };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
    try {
        const res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://autorecurso.com.br',
                'X-Title': 'Auto Recurso',
            },
            body: JSON.stringify(body),
            signal: controller.signal as any,
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
            throw new Error(`OpenRouter ${res.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 300)}`);
        }
        const text = data?.choices?.[0]?.message?.content;
        if (!text || typeof text !== 'string') {
            throw new Error('OpenRouter retornou resposta vazia');
        }
        return req.schema ? stripCodeFences(text) : text;
    } finally {
        clearTimeout(timer);
    }
}

async function callGemini(model: string, req: AIRequest): Promise<string> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const generativeModel = genAI.getGenerativeModel({
        model,
        generationConfig: {
            maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
            ...(req.schema ? { responseMimeType: 'application/json', responseSchema: req.schema as any } : {}),
        },
    });
    const parts: any[] = [];
    if (req.file) parts.push({ inlineData: { mimeType: req.file.mimeType, data: req.file.data } });
    parts.push({ text: req.prompt });
    const result = await generativeModel.generateContent(parts);
    return result.response.text();
}

/** Gera texto (ou JSON, se `schema` for informado) tentando cada modelo do provedor ativo em sequência. */
export async function generateAI(req: AIRequest): Promise<string> {
    const provider = activeAIProvider();
    if (provider === 'none') {
        throw new Error('Nenhum provedor de IA configurado (OPENROUTER_API_KEY ou GEMINI_API_KEY).');
    }
    const models = provider === 'openrouter' ? openRouterModels() : geminiModels();
    const call = provider === 'openrouter' ? callOpenRouter : callGemini;
    const label = req.label ? `[${req.label}] ` : '';

    let lastError: any = null;
    for (const model of models) {
        try {
            console.log(`🤖 ${label}Chamando ${provider} com modelo ${model}`);
            return await call(model, req);
        } catch (err: any) {
            console.warn(`⚠️ ${label}${provider}/${model} falhou (${err?.message || err}). Tentando o próximo...`);
            lastError = err;
        }
    }
    throw lastError;
}

/** Igual a generateAI, mas já devolve o JSON parseado. */
export async function generateAIJson<T = any>(req: AIRequest & { schema: Record<string, any> }): Promise<T> {
    return JSON.parse(await generateAI(req));
}
