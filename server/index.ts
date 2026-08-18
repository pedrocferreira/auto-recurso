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

// --- Simple Data Store ---
const DATA_FILE = path.join(__dirname, 'data.json');

const loadData = () => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Error loading data:', err);
    }
    return { events: [], customers: [], resources: [], abandonedCarts: [], settings: { isFreeGenerationEnabled: false, freeGenerationLimit: 10, freeGenerationsUsed: 0 } };
};

const saveData = (data: any) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error saving data:', err);
    }
};

// --- Gemini Configuration ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const CANDIDATE_MODELS = [
    process.env.GEMINI_MODEL,
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
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

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_me_in_production';

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

app.post('/auto-api/generate/analyze', async (req, res) => {
    console.log('📥 [Analyze] Request received');
    try {
        let { base64Image } = req.body;
        console.log('📷 [Analyze] Received image data length:', base64Image?.length);

        // Remove data URL prefix if present
        if (base64Image && base64Image.includes('base64,')) {
            console.log('✂️ [Analyze] Removing base64 prefix...');
            base64Image = base64Image.split('base64,')[1];
        }

        console.log('🤖 [Analyze] Calling Gemini API with cleaned image...');
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
                { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                { text: "Analise esta foto de uma multa de trânsito brasileira. Extraia as informações principais e sugira 3 estratégias de defesa baseadas no Código de Trânsito Brasileiro (CTB). TENTE TAMBÉM identificar dados do condutor/proprietário como Nome, CPF e Endereço se estiverem visíveis. IMPORTANTE: Se um dado não for encontrado ou for ilegível, retorne uma string VAZIA (\"\"). NUNCA retorne textos como \"Não visível\", \"N/A\" ou similares. Retorne os dados estritamente no formato JSON conforme o schema especificado." }
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

app.post('/auto-api/generate/analyze-cnh', async (req, res) => {
    try {
        let { base64Image } = req.body;

        // Remove data URL prefix if present
        if (base64Image && base64Image.includes('base64,')) {
            base64Image = base64Image.split('base64,')[1];
        }

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
                { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                { text: "Extraia os dados desta CNH (Carteira Nacional de Habilitação). Campos: Nome Completo, CPF, RG, Número da CNH e Endereço (se houver). IMPORTANTE: Se um dado não for encontrado, retorne uma string VAZIA (\"\"). Retorne estritamente em JSON." }
            ]
        );

        res.json(JSON.parse(response.text()));
    } catch (error: any) {
        console.error('❌ [Analyze CNH] Error:', error);
        res.status(500).json({ error: error.message, details: error.toString() });
    }
});

app.post('/auto-api/generate/appeal', async (req, res) => {
    try {
        const { ticketInfo, selectedStrategyId, userReason, personalData, city, dateString } = req.body;
        const strategy = ticketInfo.strategies.find((s: any) => s.id === selectedStrategyId);

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
        res.json({ appeal: response.text() });
    } catch (error: any) {
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

app.get('/auto-api/payment/verify/:email', async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        console.log(`🔍 [Payment Verify] Verifying payment for email: ${email}`);

        // Dev Mode / Test Bypass
        const isDev = process.env.APP_MODE === 'dev' || 
                      req.query.dev === 'true' || 
                      email.toLowerCase().includes('teste') || 
                      email.toLowerCase().includes('test') || 
                      email.toLowerCase().includes('dev');

        if (isDev) {
            console.log(`⚡ [Payment Verify] Dev mode active - Auto-approving payment for ${email}`);
            return res.json({ status: 'PAID', isDev: true, message: 'Pagamento aprovado em modo de teste' });
        }

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
            console.error('❌ [Kiwify] Sales API error:', errText);
            return res.json({ status: 'ERROR', message: 'Failed to verify payment' });
        }

        const data = (await response.json()) as any;
        const sales = data.data || [];
        
        // Procurar pelas vendas do email, ordenar para pegar a mais recente
        const customerSales = sales.filter((sale: any) => sale.customer && sale.customer.email.toLowerCase() === email.toLowerCase());

        if (customerSales.length === 0) {
            console.log(`❌ [Kiwify] No sales found for email: ${email}`);
            return res.json({ status: 'PENDING', message: 'Nenhum pagamento encontrado para este e-mail nos últimos dias.' });
        }

        // A venda mais recente será a primeira (assumindo que a API retorna ordenado, mas vamos forçar verificação do status)
        const latestSale = customerSales[0];
        const status = latestSale.status === 'paid' ? 'PAID' : 'PENDING';
        
        console.log(`✅ [Kiwify] Payment status for ${email}: ${status}`);
        res.json({ status });
    } catch (error: any) {
        console.error('❌ [Kiwify] Verification error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/auto-api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: 'Senha incorreta' });
    }
});

app.get('/auto-api/admin/data', authMiddleware, (req, res) => {
    res.json(loadData());
});

app.post('/auto-api/admin/settings', authMiddleware, (req, res) => {
    const data = loadData();
    data.settings = { ...data.settings, ...req.body };
    saveData(data);
    res.json(data.settings);
});

app.post('/auto-api/admin/clear', authMiddleware, (req, res) => {
    const data = { events: [], customers: [], resources: [], abandonedCarts: [], settings: loadData().settings };
    saveData(data);
    res.json({ success: true });
});

app.post('/auto-api/analytics/event', (req, res) => {
    const data = loadData();
    const event = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        ...req.body
    };
    data.events.push(event);
    saveData(data);
    res.json({ success: true });
});

app.post('/auto-api/admin/register-resource', (req, res) => {
    const data = loadData();
    const resource = {
        id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        generatedAt: Date.now(),
        ...req.body
    };
    data.resources.push(resource);
    saveData(data);
    res.json({ success: true, resource });
});

app.post('/auto-api/resource/recover', (req, res) => {
    try {
        const { query } = req.body;
        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ success: false, message: 'Por favor, informe seu e-mail, CPF ou placa.' });
        }

        const data = loadData();
        const raw = query.trim();
        const cleanQuery = raw.toLowerCase();
        const cleanDigits = raw.replace(/\D/g, '');
        const cleanPlate = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

        const foundResources = (data.resources || []).filter((r: any) => {
            const emailMatch = r.customerEmail && r.customerEmail.toLowerCase().includes(cleanQuery);
            const cpfDigits = (r.customerCpf || '').replace(/\D/g, '');
            const cpfMatch = cleanDigits.length >= 7 && (cpfDigits.includes(cleanDigits) || cleanDigits.includes(cpfDigits));
            const plateDigits = (r.ticketPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const plateMatch = cleanPlate.length >= 4 && (plateDigits.includes(cleanPlate) || cleanPlate.includes(plateDigits));

            return emailMatch || cpfMatch || plateMatch;
        });

        if (foundResources.length > 0) {
            // Sort newest first
            foundResources.sort((a: any, b: any) => (b.generatedAt || 0) - (a.generatedAt || 0));
            return res.json({ success: true, resources: foundResources });
        }

        // Check if there was an attempt/payment started
        const hasStarted = (data.events || []).some((e: any) => {
            const emailMatch = e.data?.customerEmail && e.data.customerEmail.toLowerCase() === cleanQuery;
            const cpfMatch = cleanDigits && (e.data?.customerCpf || '').replace(/\D/g, '') === cleanDigits;
            return emailMatch || cpfMatch;
        });

        return res.json({
            success: false,
            hasPendingPayment: hasStarted,
            message: hasStarted
                ? 'Identificamos seu cadastro recente, mas o recurso ainda não foi gerado ou o pagamento está em processamento.'
                : 'Nenhum recurso encontrado com estes dados. Por favor, verifique se digitou o e-mail, CPF ou placa corretamente.'
        });
    } catch (error: any) {
        console.error('❌ [Recover Resource] Error:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar recurso no servidor.' });
    }
});


app.post('/auto-api/email/send', async (req, res) => {
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
                    <p>Olá <strong>${name}</strong>,</p>
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
        
        const emailPayload = {
            sender: { name: 'AutoRecurso', email: 'recurso@autorecurso.online' },
            to: [{ email, name }],
            subject: 'Seu Recurso de Trânsito aguarda finalização! 🚗',
            htmlContent: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #1e40af;">Finalize seu Recurso de Trânsito</h1>
                    <p>Olá <strong>${name}</strong>,</p>
                    <p>O seu recurso já foi elaborado pela nossa Inteligência Artificial com base nos dados e teses jurídicas selecionados, e está pronto para ser baixado!</p>
                    <p>Para concluir o pagamento e liberar o documento imediatamente, clique no botão abaixo:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${checkoutUrl}" style="background-color: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
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
        const { content, personalData, ticketInfo } = req.body;

        const lines = content.split('\n');
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
                                    new TextRun({ text: 'Documento gerado por AutoRecurso • autorecurso.xyz', size: 14, font: 'Times New Roman', color: 'AAAAAA', italics: true }),
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

app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
});
