import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import jwt from 'jsonwebtoken';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, BorderStyle, Tab, TabStopType, TabStopPosition, Header, Footer, PageNumber, NumberFormat } from 'docx';
import { Request, Response, NextFunction } from 'express';
import { addEvent, addResource, claimFreeGeneration, claimSale, clearAllData, getAdminSnapshot, getSettings, isSaleConsumed, releaseFreeGeneration, releaseSale, searchCustomerResources, updateSettings } from './db.js';

dotenv.config();
const port = process.env.PORT || 3001;
console.log('--- Server Start Configuration ---');
console.log('PORT:', port);
console.log('GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);
console.log('KIWIFY_CLIENT_ID loaded:', !!process.env.KIWIFY_CLIENT_ID);
console.log('KIWIFY_CLIENT_SECRET loaded:', !!process.env.KIWIFY_CLIENT_SECRET);
console.log('KIWIFY_ACCOUNT_ID loaded:', !!process.env.KIWIFY_ACCOUNT_ID);
console.log('JWT_SECRET loaded:', !!process.env.JWT_SECRET);
console.log('ADMIN_PASSWORD loaded:', !!process.env.ADMIN_PASSWORD);
console.log('---------------------------------');

// --- Security: Startup Validation ---
const INSECURE_DEFAULTS = ['supersecretkey_change_me_in_production', 'change_me', 'secret', 'default'];
if (process.env.NODE_ENV !== 'test') {
    if (!process.env.JWT_SECRET || INSECURE_DEFAULTS.some(d => process.env.JWT_SECRET!.toLowerCase().includes(d))) {
        console.error('❌ FATAL: JWT_SECRET não configurado ou usa valor default inseguro. Configure um segredo forte (>= 32 chars).');
        console.error('   Gere um com: openssl rand -base64 48');
        process.exit(1);
    }
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
        console.error('❌ FATAL: ADMIN_PASSWORD não configurado ou muito curto (mínimo 12 caracteres).');
        process.exit(1);
    }
}

// --- Security: HTML Escape Helper ---
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Security: URL Validation ---
const ALLOWED_CHECKOUT_DOMAINS = ['pay.kiwify.com.br', 'kiwify.com.br'];
function isAllowedCheckoutUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && ALLOWED_CHECKOUT_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
    } catch {
        return false;
    }
}

// --- Kiwify OAuth Token Cache ---
let kiwifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getKiwifyToken(): Promise<string> {
    if (kiwifyTokenCache && Date.now() < kiwifyTokenCache.expiresAt) {
        return kiwifyTokenCache.token;
    }
    console.log('🔑 [Kiwify] Requesting new OAuth token...');
    const response = await fetch('https://public-api.kiwify.com/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${encodeURIComponent(process.env.KIWIFY_CLIENT_ID || '')}&client_secret=${encodeURIComponent(process.env.KIWIFY_CLIENT_SECRET || '')}`
    });
    if (!response.ok) {
        const errText = await response.text();
        console.error('❌ [Kiwify] OAuth token error:', errText);
        throw new Error(`Kiwify OAuth error: ${response.status}`);
    }
    const data: any = await response.json();
    const token = data.access_token;
    // Token expires in 96h, refresh 1h early
    kiwifyTokenCache = { token, expiresAt: Date.now() + (95 * 60 * 60 * 1000) };
    console.log('✅ [Kiwify] OAuth token obtained successfully');
    return token;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Logging Middleware
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
    next();
});



// --- Gemini Configuration ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const CANDIDATE_MODELS = [
    process.env.GEMINI_MODEL,
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash'
].filter(Boolean) as string[];

async function generateWithModelFallback(getConfig: (modelName: string) => any, content: any) {
    let lastError: any = null;
    for (const modelName of CANDIDATE_MODELS) {
        try {
            console.log(`🤖 Calling Gemini with model: ${modelName}`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                ...getConfig(modelName)
            });
            const result = await model.generateContent(content);
            const response = await result.response;
            return response;
        } catch (err: any) {
            console.warn(`⚠️ [Gemini] Model ${modelName} failed (${err?.message || err}). Trying next candidate...`);
            lastError = err;
        }
    }
    throw lastError;
}

const JWT_SECRET = process.env.JWT_SECRET!;

// --- Security: Rate Limiting ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (process.env.NODE_ENV === 'test') {
            return next();
        }
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const record = rateLimitMap.get(ip);
        if (!record || now > record.resetAt) {
            rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
            return next();
        }
        if (record.count >= maxRequests) {
            return res.status(429).json({ success: false, error: 'Muitas requisições. Aguarde um momento antes de tentar novamente.' });
        }
        record.count++;
        next();
    };
}

// --- Auth Middleware ---
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Malformed token' });
    }

    try {
        jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
};

// --- Routes ---

app.get(['/health', '/auto-api/health'], (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development'
    });
});

app.post('/auto-api/generate/analyze', async (req, res) => {
    console.log('📥 [Analyze] Request received');
    try {
        let { base64Image, mimeType } = req.body;
        console.log('📷 [Analyze] Received file data length:', base64Image?.length, 'MimeType:', mimeType);

        // Remove data URL prefix if present & extract mimeType if provided in data URL
        if (base64Image && base64Image.includes('base64,')) {
            const matches = base64Image.match(/^data:(.+);base64,/);
            if (matches && matches[1]) {
                mimeType = matches[1];
            }
            console.log('✂️ [Analyze] Removing base64 prefix... Extracted MimeType:', mimeType);
            base64Image = base64Image.split('base64,')[1];
        }

        if (!mimeType) {
            mimeType = 'image/jpeg';
        }

        console.log(`🤖 [Analyze] Calling Gemini API with mimeType: ${mimeType}...`);
        const response = await generateWithModelFallback(
            () => ({
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            violationType: { type: SchemaType.STRING },
                            article: { type: SchemaType.STRING },
                            location: { type: SchemaType.STRING },
                            date: { type: SchemaType.STRING },
                            vehiclePlate: { type: SchemaType.STRING },
                            authority: { type: SchemaType.STRING },
                            extractedPersonalInfo: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    fullName: { type: SchemaType.STRING },
                                    cpf: { type: SchemaType.STRING },
                                    address: { type: SchemaType.STRING }
                                }
                            },
                            strategies: {
                                type: SchemaType.ARRAY,
                                items: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        id: { type: SchemaType.STRING },
                                        title: { type: SchemaType.STRING },
                                        description: { type: SchemaType.STRING }
                                    },
                                    required: ["id", "title", "description"]
                                }
                            }
                        },
                        required: ["violationType", "article", "location", "date", "vehiclePlate", "authority", "strategies"]
                    }
                }
            }),
            [
                { inlineData: { mimeType: mimeType, data: base64Image } },
                { text: "Analise este documento de multa de trânsito brasileira (imagem ou PDF). Extraia as informações principais e sugira 3 estratégias de defesa baseadas no Código de Trânsito Brasileiro (CTB). TENTE TAMBÉM identificar dados do condutor/proprietário como Nome, CPF e Endereço se estiverem visíveis. IMPORTANTE: Se um dado não for encontrado ou for ilegível, retorne uma string VAZIA (\"\"). NUNCA retorne textos como \"Não visível\", \"N/A\" ou similares. Retorne os dados estritamente no formato JSON conforme o schema especificado." }
            ]
        );

        console.log('✅ [Analyze] Gemini responded successfully');
        res.json(JSON.parse(response.text()));
    } catch (error: any) {
        console.error('❌ [Analyze] Error:', error);
        if (error.cause) console.error('❌ [Analyze] Cause:', error.cause);
        res.status(500).json({ error: error.message, details: error.toString() });
    }
});

app.post('/auto-api/generate/analyze-text', async (req, res) => {
    console.log('📥 [Analyze-Text] Manual ticket analysis request received');
    try {
        const { vehiclePlate, article, violationType, location, date, authority } = req.body;

        const response = await generateWithModelFallback(
            () => ({
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            violationType: { type: SchemaType.STRING },
                            article: { type: SchemaType.STRING },
                            location: { type: SchemaType.STRING },
                            date: { type: SchemaType.STRING },
                            vehiclePlate: { type: SchemaType.STRING },
                            authority: { type: SchemaType.STRING },
                            strategies: {
                                type: SchemaType.ARRAY,
                                items: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        id: { type: SchemaType.STRING },
                                        title: { type: SchemaType.STRING },
                                        description: { type: SchemaType.STRING }
                                    },
                                    required: ["id", "title", "description"]
                                }
                            }
                        },
                        required: ["violationType", "article", "location", "date", "vehiclePlate", "authority", "strategies"]
                    }
                }
            }),
            [
                { text: `O condutor inseriu manualmente os dados de uma multa de trânsito brasileira:
- Placa: ${vehiclePlate || 'Não informada'}
- Infração/Artigo: ${article || violationType || 'Infração de trânsito'}
- Data/Hora: ${date || 'Recente'}
- Local: ${location || 'Não informado'}
- Órgão autuador: ${authority || 'DETRAN'}

Sugira 3 estratégias de defesa juridicamente embasadas no Código de Trânsito Brasileiro (CTB) e resoluções do CONTRAN específicas para este tipo de infração. Retorne o resultado em JSON.` }
            ]
        );

        res.json(JSON.parse(response.text()));
    } catch (error: any) {
        console.error('❌ [Analyze-Text] Error:', error);
        res.json({
            vehiclePlate: req.body.vehiclePlate || 'NÃO INFORMADA',
            article: req.body.article || req.body.violationType || 'Art. 218 do CTB',
            violationType: req.body.violationType || req.body.article || 'Infração de Trânsito',
            location: req.body.location || 'Local da Infração',
            date: req.body.date || new Date().toLocaleDateString('pt-BR'),
            authority: req.body.authority || 'DETRAN',
            strategies: [
                {
                    id: 'strat_1',
                    title: 'Vício Formal e Ausência de Requisitos do AIT (Art. 280 do CTB)',
                    description: 'Inconsistência formal na autuação e falta de requisitos legais obrigatórios previstos no CTB.'
                },
                {
                    id: 'strat_2',
                    title: 'Falta de Sinalização Regulamentar / Equipamento Medidor (Art. 281 do CTB)',
                    description: 'Ausência de sinalização indicativa na via ou falta de comprovação de aferição válida do equipamento.'
                },
                {
                    id: 'strat_3',
                    title: 'Cerceamento de Defesa e Nulidade da Autuação (Art. 5º, LV da CF/88)',
                    description: 'Erro no procedimento de notificação e violação dos princípios constitucionais do contraditório.'
                }
            ]
        });
    }
});

app.post('/auto-api/generate/analyze-cnh', async (req, res) => {
    try {
        let { base64Image, mimeType } = req.body;

        // Remove data URL prefix if present & extract mimeType
        if (base64Image && base64Image.includes('base64,')) {
            const matches = base64Image.match(/^data:(.+);base64,/);
            if (matches && matches[1]) {
                mimeType = matches[1];
            }
            base64Image = base64Image.split('base64,')[1];
        }

        if (!mimeType) {
            mimeType = 'image/jpeg';
        }

        console.log(`🤖 [Analyze CNH] Calling Gemini API with mimeType: ${mimeType}...`);
        const response = await generateWithModelFallback(
            () => ({
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            fullName: { type: SchemaType.STRING },
                            cpf: { type: SchemaType.STRING },
                            rg: { type: SchemaType.STRING },
                            cnh: { type: SchemaType.STRING },
                            address: { type: SchemaType.STRING }
                        }
                    }
                }
            }),
            [
                { inlineData: { mimeType: mimeType, data: base64Image } },
                { text: "Extraia os dados desta CNH (Carteira Nacional de Habilitação) em foto ou PDF. Campos: Nome Completo, CPF, RG, Número da CNH e Endereço (se houver). IMPORTANTE: Se um dado não for encontrado, retorne uma string VAZIA (\"\"). Retorne estritamente em JSON." }
            ]
        );

        res.json(JSON.parse(response.text()));
    } catch (error: any) {
        console.error('❌ [Analyze CNH] Error:', error);
        // Graceful fallback: permite que o usuário prossiga preenchendo manualmente sem travar
        res.json({
            fullName: '',
            cpf: '',
            rg: '',
            cnh: '',
            address: '',
            warning: 'Não foi possível extrair os dados da CNH automaticamente. Por favor, preencha os campos manualmente.'
        });
    }
});

app.post('/auto-api/generate/appeal', rateLimit(10, 60000), async (req, res) => {
    // Libera a venda/cota reservada caso a geração falhe, para o cliente poder tentar de novo
    let releaseClaim = () => {};
    try {
        const { ticketInfo, selectedStrategyId, userReason, personalData, city, dateString, paymentEmail, useFreeGeneration } = req.body || {};

        if (!ticketInfo || !personalData) {
            return res.status(400).json({ error: 'Dados da multa e do recorrente são obrigatórios.' });
        }

        // --- Só gera o recurso (chamada de IA) após pagamento confirmado ou cota grátis ---
        if (process.env.APP_MODE === 'dev') {
            console.log('⚡ [Appeal] Dev mode active - Pulando verificação de pagamento');
        } else if (useFreeGeneration) {
            if (!claimFreeGeneration()) {
                return res.status(402).json({ error: 'As gerações grátis estão esgotadas. Realize o pagamento para gerar seu recurso.' });
            }
            releaseClaim = releaseFreeGeneration;
        } else {
            const email = String(paymentEmail || personalData.email || '').trim().toLowerCase();
            if (!email.includes('@')) {
                return res.status(402).json({ error: 'Pagamento não identificado. Informe o e-mail usado na compra.' });
            }
            const payment = await checkKiwifyPayment(email);
            if (payment.status !== 'PAID' || !payment.saleId) {
                return res.status(402).json({ error: payment.message });
            }
            const saleId = payment.saleId;
            if (!claimSale(saleId, email)) {
                return res.status(402).json({ error: 'Este pagamento já foi utilizado para gerar um recurso.' });
            }
            releaseClaim = () => releaseSale(saleId);
        }

        const strategy = (ticketInfo?.strategies || []).find((s: any) => s.id === selectedStrategyId);

        const prompt = `
Aja como um renomado Advogado Especialista em Direito de Trânsito Brasileiro. Gere um RECURSO ADMINISTRATIVO DE INFRAÇÃO DE TRÂNSITO profissional.

REGRA ABSOLUTAMENTE OBRIGATÓRIA: NÃO use NENHUM placeholder, campo em branco, ou texto entre colchetes como [INSERIR...], [NÚMERO], [DATA], etc. TODOS os dados já foram fornecidos abaixo. Use-os DIRETAMENTE no texto. Se algum dado não estiver disponível, simplesmente omita aquela parte do texto. NUNCA peça para o usuário preencher nada.

DADOS DO RECORRENTE:
- Nome Completo: ${personalData.fullName}
- CPF: ${personalData.cpf}
- RG: ${personalData.rg || 'não informado'}
- CNH: ${personalData.cnh || 'não informada'}
- Endereço: ${personalData.address || 'não informado'}
- Profissão: ${personalData.profession || 'não informada'}
- Estado Civil: ${personalData.civilStatus || 'não informado'}

DADOS DA INFRAÇÃO:
- Tipo de Infração: ${ticketInfo.violationType}
- Artigo/Enquadramento: ${ticketInfo.article}
- Local da Infração: ${ticketInfo.location || 'não informado'}
- Data da Infração: ${ticketInfo.date || 'não informada'}
- Placa do Veículo: ${ticketInfo.vehiclePlate}
- Órgão Autuador: ${ticketInfo.authority || 'DETRAN'}

TESE DE DEFESA SELECIONADA: ${strategy?.title || 'Defesa geral'}
DESCRIÇÃO DA TESE: ${strategy?.description || ''}
RELATO DO CONDUTOR: ${userReason}

CIDADE: ${city || 'não informada'}
DATA DE HOJE: ${dateString}

FORMATO DO RECURSO (texto corrido, SEM markdown):
1. Cabeçalho com destinatário (órgão autuador)
2. Identificação completa do recorrente (usar os dados acima)
3. Dos Fatos (narrar o ocorrido usando os dados da infração)
4. Do Direito (fundamentação jurídica com CTB, resoluções do CONTRAN, jurisprudência)
5. Dos Pedidos (pedir cancelamento/arquivamento da multa)
6. Fecho com local, data e assinatura

IMPORTANTE: Retorne APENAS texto puro corrido. NÃO use formatação Markdown (sem #, ##, **, etc). Use apenas quebras de linha e texto normal. O texto será convertido diretamente em um documento DOCX.`;

        const response = await generateWithModelFallback(() => ({}), prompt);
        const appealText = response.text();

        // Auto-save generated resource to database for customer recovery
        if (appealText) {
            try {
                addResource({
                    customerName: personalData?.fullName || '',
                    customerEmail: personalData?.email || '',
                    customerCpf: personalData?.cpf || '',
                    customerPhone: personalData?.phone || '',
                    ticketPlate: ticketInfo?.vehiclePlate || '',
                    ticketArticle: ticketInfo?.article || '',
                    strategy: strategy?.title || '',
                    documentContent: appealText,
                    personalData,
                    ticketInfo
                });
            } catch (saveErr) {
                console.warn('⚠️ [Appeal] Falha ao registrar recurso gerado no banco:', saveErr);
            }
        }

        if (!appealText) {
            releaseClaim();
            return res.status(500).json({ error: 'A IA não retornou o texto do recurso. Tente novamente.' });
        }

        res.json({ appeal: appealText });
    } catch (error: any) {
        releaseClaim();
        res.status(500).json({ error: error.message });
    }
});

app.post('/auto-api/payment/create', async (req, res) => {
    try {
        const { email } = req.body;
        const checkoutUrl = `https://pay.kiwify.com.br/YtpRqSE`;
        // Return checkout URL - the frontend will redirect to Kiwify
        res.json({ url: checkoutUrl, provider: 'kiwify' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

type KiwifyPaymentCheck = {
    status: 'PAID' | 'PENDING' | 'ERROR';
    message: string;
    saleId?: string;
};

// Consulta as vendas dos últimos 5 dias na Kiwify e retorna a venda paga mais recente
// que ainda não foi usada para gerar um recurso.
async function checkKiwifyPayment(rawEmail: string): Promise<KiwifyPaymentCheck> {
    const token = await getKiwifyToken();
    const accountId = process.env.KIWIFY_ACCOUNT_ID || '';

    const today = new Date();
    const endDateStr = today.toISOString().split('T')[0] + ' 23:59';
    today.setDate(today.getDate() - 5);
    const startDateStr = today.toISOString().split('T')[0] + ' 00:00';

    const salesUrl = `https://public-api.kiwify.com/v1/sales?start_date=${encodeURIComponent(startDateStr)}&end_date=${encodeURIComponent(endDateStr)}`;
    const response = await fetch(salesUrl, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'x-kiwify-account-id': accountId
        }
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error('❌ [Kiwify] Sales API error:', response.status, errText);
        return {
            status: 'ERROR',
            message: 'Falha na comunicação com o gateway de pagamentos. Tente novamente em instantes.'
        };
    }

    const data = (await response.json()) as any;
    const sales = data.data || [];

    // Filtrar pelas vendas do email do cliente (case-insensitive)
    const customerSales = sales.filter((sale: any) =>
        sale.customer &&
        sale.customer.email &&
        sale.customer.email.trim().toLowerCase() === rawEmail
    );

    if (customerSales.length === 0) {
        console.log(`❌ [Kiwify] Nenhuma venda encontrada para o email: ${rawEmail}`);
        return {
            status: 'PENDING',
            message: 'Nenhum pagamento identificado para este e-mail nos últimos 5 dias. Se você acabou de pagar via PIX ou Cartão, aguarde alguns segundos para a compensação e clique em Verificar novamente.'
        };
    }

    const isPaidStatus = (sale: any) => ['paid', 'approved', 'completed'].includes((sale.status || '').toLowerCase());
    const paidSales = customerSales.filter(isPaidStatus);

    if (paidSales.length === 0) {
        // Venda mais recente
        const saleStatus = (customerSales[0].status || '').toLowerCase();
        console.log(`✅ [Kiwify] Status do pagamento para ${rawEmail}: PENDING (status bruto Kiwify: ${saleStatus})`);
        return {
            status: 'PENDING',
            message: `Pagamento identificado, mas ainda aguardando confirmação (Status Kiwify: ${saleStatus}). Aguarde alguns instantes e tente novamente.`
        };
    }

    const unusedSale = paidSales.find((sale: any) => !isSaleConsumed(String(sale.id)));
    if (!unusedSale) {
        console.log(`⚠️ [Kiwify] Todas as vendas pagas de ${rawEmail} já foram usadas para gerar recursos`);
        return {
            status: 'PENDING',
            message: 'O pagamento deste e-mail já foi utilizado para gerar um recurso. Para recuperar o documento, use a opção "Recuperar meu recurso". Para uma nova multa, realize um novo pagamento.'
        };
    }

    console.log(`✅ [Kiwify] Status do pagamento para ${rawEmail}: PAID (venda ${unusedSale.id})`);
    return { status: 'PAID', message: 'Pagamento confirmado com sucesso!', saleId: String(unusedSale.id) };
}

app.get('/auto-api/payment/verify/:email', async (req, res) => {
    try {
        const rawEmail = decodeURIComponent(req.params.email || '').trim().toLowerCase();
        console.log(`🔍 [Payment Verify] Verifying payment for email: ${rawEmail}`);

        if (!rawEmail || !rawEmail.includes('@')) {
            return res.status(400).json({ status: 'ERROR', message: 'E-mail inválido fornecido para verificação.' });
        }

        // Dev Mode - ONLY active when APP_MODE is explicitly set to 'dev'
        if (process.env.APP_MODE === 'dev') {
            console.log(`⚡ [Payment Verify] Dev mode active - Auto-approving payment for ${rawEmail}`);
            return res.json({ status: 'PAID', isDev: true, message: 'Pagamento aprovado em modo de teste' });
        }

        const { status, message } = await checkKiwifyPayment(rawEmail);
        return res.json({ status, message });
    } catch (error: any) {
        console.error('❌ [Kiwify] Verification error:', error.message);
        res.status(500).json({ status: 'ERROR', message: 'Erro interno ao consultar status de pagamento.' });
    }
});

app.get('/auto-api/settings/public', (req, res) => {
    try {
        const settings = getSettings();
        res.json({
            isFreeGenerationEnabled: !!settings.isFreeGenerationEnabled,
            freeGenerationLimit: settings.freeGenerationLimit ?? 0,
            freeGenerationsUsed: settings.freeGenerationsUsed ?? 0
        });
    } catch (error: any) {
        res.json({
            isFreeGenerationEnabled: false,
            freeGenerationLimit: 0,
            freeGenerationsUsed: 0
        });
    }
});

app.post('/auto-api/admin/login', rateLimit(10, 60000), (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: 'Senha incorreta' });
    }
});

app.get('/auto-api/admin/data', authMiddleware, (req, res) => {
    try {
        const snapshot = getAdminSnapshot();
        res.json(snapshot);
    } catch (error: any) {
        console.error('Error getting admin snapshot:', error);
        res.status(500).json({ error: 'Erro ao consultar métricas' });
    }
});

app.post('/auto-api/admin/settings', authMiddleware, (req, res) => {
    try {
        const settings = updateSettings(req.body);
        res.json(settings);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/auto-api/admin/clear', authMiddleware, (req, res) => {
    try {
        clearAllData();
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

const ALLOWED_EVENT_TYPES = new Set([
    'page_view',
    'page_view_test',
    'payment_started',
    'payment_completed',
    'payment_failed',
    'resource_generated',
    'generation_error',
    'form_abandoned',
    'email_failed',
    'email_sent'
]);

app.post('/auto-api/analytics/event', rateLimit(100, 60000), (req, res) => {
    try {
        const body = req.body || {};
        const rawType = body.type || body.name;
        if (!rawType || typeof rawType !== 'string' || !ALLOWED_EVENT_TYPES.has(rawType)) {
            return res.status(400).json({ success: false, error: 'Tipo de evento inválido ou não permitido.' });
        }
        const eventData = body.data || body.metadata || {};
        const dataStr = JSON.stringify(eventData);
        if (dataStr.length > 50000) {
            return res.status(413).json({ success: false, error: 'Payload de dados excede o limite máximo permitido.' });
        }
        addEvent({ type: rawType, data: typeof eventData === 'object' ? eventData : {} });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error logging event:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/auto-api/admin/register-resource', authMiddleware, (req, res) => {
    try {
        const resource = addResource(req.body);
        res.json({ success: true, resource });
    } catch (error: any) {
        console.error('Error registering resource:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/auto-api/resource/recover', rateLimit(20, 60000), (req, res) => {
    try {
        const { query } = req.body;
        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ success: false, message: 'Por favor, informe seu e-mail, CPF ou placa.' });
        }

        const result = searchCustomerResources(query);
        return res.json(result);
    } catch (error: any) {
        console.error('❌ [Recover Resource] Error:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar recurso no servidor.' });
    }
});


app.post('/auto-api/email/send', authMiddleware, async (req, res) => {
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY || '',
                'content-type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(result));
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// PDF Generation and Email with Attachment
app.post('/auto-api/email/send-pdf', async (req, res) => {
    console.log('📨 [PDF Email] Request received');
    try {
        const { to, name, documentContent, subject } = req.body;

        // Dynamic import of pdfkit
        const PDFDocument = (await import('pdfkit')).default;

        // Generate PDF in memory
        const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 60, bottom: 60, left: 50, right: 50 }
            });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Header
            doc.fontSize(20).font('Helvetica-Bold').text('RECURSO ADMINISTRATIVO', { align: 'center' });
            doc.moveDown();
            doc.fontSize(10).font('Helvetica').fillColor('#666').text('Gerado por AutoRecurso.online', { align: 'center' });
            doc.moveDown(2);

            // Document content (basic markdown-like parsing)
            const lines = documentContent.split('\n');
            lines.forEach((line: string) => {
                if (line.startsWith('# ')) {
                    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text(line.substring(2));
                    doc.moveDown();
                } else if (line.startsWith('## ')) {
                    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text(line.substring(3));
                    doc.moveDown(0.5);
                } else if (line.startsWith('**') && line.endsWith('**')) {
                    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text(line.replace(/\*\*/g, ''));
                } else if (line.trim() === '') {
                    doc.moveDown(0.5);
                } else {
                    doc.fontSize(12).font('Helvetica').fillColor('#000').text(line, { align: 'justify' });
                }
            });

            doc.end();
        });

        console.log('📄 [PDF Email] PDF generated, size:', pdfBuffer.length, 'bytes');

        // Send email with attachment via Brevo
        const emailPayload = {
            sender: { name: 'AutoRecurso', email: 'recurso@autorecurso.online' },
            to: [{ email: to, name: name }],
            subject: subject || 'Seu Recurso de Trânsito - AutoRecurso',
            htmlContent: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #1e40af;">Seu Recurso está Pronto! 🎉</h1>
                    <p>Olá <strong>${escapeHtml(name || '')}</strong>,</p>
                    <p>Seu recurso de trânsito foi gerado com sucesso e está anexado a este email em formato PDF.</p>
                    <h3>Próximos Passos:</h3>
                    <ol>
                        <li>Imprima o documento anexo</li>
                        <li>Assine nos locais indicados</li>
                        <li>Protocole no DETRAN ou órgão competente</li>
                        <li>Guarde o comprovante de protocolo</li>
                    </ol>
                    <p>Boa sorte com seu recurso!</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #888; font-size: 12px;">AutoRecurso - Inteligência Artificial Jurídica</p>
                </div>
            `,
            attachment: [{
                content: pdfBuffer.toString('base64'),
                name: 'Recurso_AutoRecurso.pdf'
            }]
        };

        const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY || '',
                'content-type': 'application/json'
            },
            body: JSON.stringify(emailPayload)
        });

        const emailResult: any = await emailResponse.json();
        if (!emailResponse.ok) throw new Error(JSON.stringify(emailResult));

        console.log('✅ [PDF Email] Email sent successfully to:', to);
        res.json({ success: true, messageId: emailResult.messageId });
    } catch (error: any) {
        console.error('❌ [PDF Email] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/auto-api/email/checkout', async (req, res) => {
    console.log('📨 [Checkout Email] Request received');
    try {
        const { email, name, checkoutUrl } = req.body;

        // Security: Validate checkout URL against allowed domains
        const safeCheckoutUrl = (checkoutUrl && isAllowedCheckoutUrl(checkoutUrl))
            ? checkoutUrl
            : `https://pay.kiwify.com.br/YtpRqSE`;
        
        const emailPayload = {
            sender: { name: 'AutoRecurso', email: 'recurso@autorecurso.online' },
            to: [{ email, name: escapeHtml(name || '') }],
            subject: 'Seu Recurso de Trânsito aguarda finalização! 🚗',
            htmlContent: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #1e40af;">Finalize seu Recurso de Trânsito</h1>
                    <p>Olá <strong>${escapeHtml(name || '')}</strong>,</p>
                    <p>O seu recurso já foi elaborado pela nossa Inteligência Artificial com base nos dados e teses jurídicas selecionados, e está pronto para ser baixado!</p>
                    <p>Para concluir o pagamento e liberar o documento imediatamente, clique no botão abaixo:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${escapeHtml(safeCheckoutUrl)}" style="background-color: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
                            Concluir Pagamento
                        </a>
                    </div>
                    <p>Assim que o pagamento for confirmado, você poderá baixar seu Recurso em PDF pronto para assinar.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #888; font-size: 12px;">AutoRecurso - Inteligência Artificial Jurídica</p>
                </div>
            `
        };

        const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY || '',
                'content-type': 'application/json'
            },
            body: JSON.stringify(emailPayload)
        });

        const emailResult: any = await emailResponse.json();
        if (!emailResponse.ok) throw new Error(JSON.stringify(emailResult));

        console.log('✅ [Checkout Email] Email sent successfully to:', email);
        res.json({ success: true, messageId: emailResult.messageId });
    } catch (error: any) {
        console.error('❌ [Checkout Email] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/auto-api/generate/docx', async (req, res) => {
    console.log('📄 [DOCX] Generation request received');
    try {
        const { content, appealText, personalData, ticketInfo } = req.body || {};
        const textToFormat = content || appealText;

        if (!textToFormat || typeof textToFormat !== 'string') {
            return res.status(400).json({ error: "Campo 'content' ou 'appealText' é obrigatório para gerar o documento." });
        }

        const lines = textToFormat.split('\n');
        const children: Paragraph[] = [];

        // ─── CABEÇALHO DO DOCUMENTO ───
        children.push(new Paragraph({
            children: [new TextRun({ text: 'RECURSO ADMINISTRATIVO', bold: true, size: 32, font: 'Times New Roman' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 }
        }));
        children.push(new Paragraph({
            children: [new TextRun({ text: 'INFRAÇÃO DE TRÂNSITO', bold: true, size: 28, font: 'Times New Roman' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        }));

        // Linha separadora
        children.push(new Paragraph({
            children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', size: 16, color: '333333', font: 'Times New Roman' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        }));

        // ─── DADOS DO PROCESSO (quadro resumo) ───
        const plate = ticketInfo?.vehiclePlate || '';
        const article = ticketInfo?.article || '';
        const infDate = ticketInfo?.date || '';
        const authority = ticketInfo?.authority || 'DETRAN';

        children.push(new Paragraph({
            children: [
                new TextRun({ text: 'Recorrente: ', bold: true, size: 22, font: 'Times New Roman' }),
                new TextRun({ text: personalData?.fullName || '', size: 22, font: 'Times New Roman' })
            ],
            spacing: { after: 60 }
        }));
        children.push(new Paragraph({
            children: [
                new TextRun({ text: 'CPF: ', bold: true, size: 22, font: 'Times New Roman' }),
                new TextRun({ text: personalData?.cpf || '', size: 22, font: 'Times New Roman' }),
                new TextRun({ text: '     RG: ', bold: true, size: 22, font: 'Times New Roman' }),
                new TextRun({ text: personalData?.rg || '', size: 22, font: 'Times New Roman' })
            ],
            spacing: { after: 60 }
        }));
        children.push(new Paragraph({
            children: [
                new TextRun({ text: 'Placa: ', bold: true, size: 22, font: 'Times New Roman' }),
                new TextRun({ text: plate, size: 22, font: 'Times New Roman' }),
                new TextRun({ text: '     Artigo: ', bold: true, size: 22, font: 'Times New Roman' }),
                new TextRun({ text: article, size: 22, font: 'Times New Roman' })
            ],
            spacing: { after: 60 }
        }));
        if (infDate) {
            children.push(new Paragraph({
                children: [
                    new TextRun({ text: 'Data da Infração: ', bold: true, size: 22, font: 'Times New Roman' }),
                    new TextRun({ text: infDate, size: 22, font: 'Times New Roman' }),
                    new TextRun({ text: '     Órgão: ', bold: true, size: 22, font: 'Times New Roman' }),
                    new TextRun({ text: authority, size: 22, font: 'Times New Roman' })
                ],
                spacing: { after: 60 }
            }));
        }

        // Linha separadora
        children.push(new Paragraph({
            children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', size: 16, color: '333333', font: 'Times New Roman' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 300 }
        }));

        // ─── CORPO DO RECURSO ───
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Remove markdown formatting
            let cleanLine = trimmed
                .replace(/^#{1,6}\s*/, '')
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\*(.*?)\*/g, '$1')
                .replace(/\[INSERIR[^\]]*\]/gi, '')
                .replace(/\[.*?NÚMERO.*?\]/gi, '')
                .replace(/\[.*?DATA.*?\]/gi, '')
                .replace(/\[.*?AIT.*?\]/gi, '')
                .replace(/\[.*?NOME.*?\]/gi, personalData?.fullName || '')
                .replace(/\[.*?CPF.*?\]/gi, personalData?.cpf || '')
                .replace(/\[.*?PLACA.*?\]/gi, ticketInfo?.vehiclePlate || '')
                .trim();

            // Linha vazia = espaço entre parágrafos
            if (!cleanLine) {
                children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
                continue;
            }

            // Detecta cabeçalhos de seção (tudo maiúsculo, ou certos padrões)
            const isHeader = (
                (cleanLine === cleanLine.toUpperCase() && cleanLine.length > 5 && cleanLine.length < 100 && !cleanLine.includes('.')) ||
                /^(I{1,3}V?|V?I{0,3})\s*[-–.]\s*/i.test(cleanLine) ||
                /^(DOS? |DAS? |DO |DA )/.test(cleanLine) && cleanLine === cleanLine.toUpperCase()
            );

            if (isHeader) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: cleanLine, bold: true, size: 24, font: 'Times New Roman' })],
                    spacing: { before: 300, after: 160 },
                    alignment: AlignmentType.LEFT
                }));
            } else {
                children.push(new Paragraph({
                    children: [new TextRun({ text: cleanLine, size: 24, font: 'Times New Roman' })],
                    spacing: { after: 100, line: 360 },
                    alignment: AlignmentType.JUSTIFIED,
                    indent: { firstLine: 708 }
                }));
            }
        }

        // ─── BLOCO DE ASSINATURA ───
        children.push(new Paragraph({ children: [], spacing: { before: 600, after: 100 } }));
        
        // Data e local
        const today = new Date();
        const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        const dateStr = `${today.getDate()} de ${months[today.getMonth()]} de ${today.getFullYear()}`;
        
        let location = '';
        if (personalData?.address) {
            const parts = personalData.address.split('-');
            if (parts.length > 1) location = parts[parts.length - 1].trim();
            else {
                const commaParts = personalData.address.split(',');
                if (commaParts.length > 1) location = commaParts[commaParts.length - 1].trim();
            }
        }
        if (!location) location = '___________________';

        children.push(new Paragraph({
            children: [new TextRun({ text: `${location}, ${dateStr}.`, size: 24, font: 'Times New Roman' })],
            alignment: AlignmentType.RIGHT,
            spacing: { after: 600 }
        }));

        // Linha de assinatura
        children.push(new Paragraph({
            children: [new TextRun({ text: '________________________________________', size: 24, font: 'Times New Roman' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 }
        }));
        children.push(new Paragraph({
            children: [new TextRun({ text: (personalData?.fullName || '').toUpperCase(), bold: true, size: 22, font: 'Times New Roman' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 }
        }));
        children.push(new Paragraph({
            children: [new TextRun({ text: `CPF: ${personalData?.cpf || ''}`, size: 20, font: 'Times New Roman' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 }
        }));
        if (personalData?.rg) {
            children.push(new Paragraph({
                children: [new TextRun({ text: `RG: ${personalData.rg}`, size: 20, font: 'Times New Roman' })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 }
            }));
        }
        children.push(new Paragraph({
            children: [new TextRun({ text: 'Recorrente', italics: true, size: 20, font: 'Times New Roman', color: '555555' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        }));

        const doc = new Document({
            styles: {
                default: {
                    document: {
                        run: { font: 'Times New Roman', size: 24 }
                    }
                }
            },
            sections: [{
                properties: {
                    page: {
                        margin: { top: 1701, right: 1134, bottom: 1134, left: 1701 },
                        size: { width: 11906, height: 16838 }
                    }
                },
                headers: {
                    default: new Header({
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: 'RECURSO ADMINISTRATIVO DE TRÂNSITO', size: 16, font: 'Times New Roman', color: '999999', italics: true })],
                                alignment: AlignmentType.RIGHT
                            })
                        ]
                    })
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({ text: 'Documento gerado por AutoRecurso • autorecurso.online', size: 14, font: 'Times New Roman', color: 'AAAAAA', italics: true }),
                                ],
                                alignment: AlignmentType.CENTER
                            })
                        ]
                    })
                },
                children
            }]
        });

        const buffer = await Packer.toBuffer(doc);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=Recurso_${ticketInfo?.vehiclePlate || 'AutoRecurso'}.docx`);
        res.send(buffer);

        console.log('✅ [DOCX] Document generated successfully');
    } catch (error: any) {
        console.error('❌ [DOCX] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.use((req, res) => {
    console.log(`[404] Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.log(`Backend running at http://localhost:${port}`);
    });
}

export default app;
export { app };
