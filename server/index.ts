import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import jwt from 'jsonwebtoken';
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
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            generationConfig: {
                // ... existing config ...
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
        });

        console.log('🤖 [Analyze] Calling Gemini API with cleaned image...');
        const result = await model.generateContent([
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: "Analise esta foto de uma multa de trânsito brasileira. Extraia as informações principais e sugira 3 estratégias de defesa baseadas no Código de Trânsito Brasileiro (CTB). TENTE TAMBÉM identificar dados do condutor/proprietário como Nome, CPF e Endereço se estiverem visíveis. IMPORTANTE: Se um dado não for encontrado ou for ilegível, retorne uma string VAZIA (\"\"). NUNCA retorne textos como \"Não visível\", \"N/A\" ou similares. Retorne os dados estritamente no formato JSON conforme o schema especificado." }
        ]);

        const response = await result.response;
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

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
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
        });

        const result = await model.generateContent([
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: "Extraia os dados desta CNH (Carteira Nacional de Habilitação). Campos: Nome Completo, CPF, RG, Número da CNH e Endereço (se houver). IMPORTANTE: Se um dado não for encontrado, retorne uma string VAZIA (\"\"). Retorne estritamente em JSON." }
        ]);

        const response = await result.response;
        res.json(JSON.parse(response.text()));
    } catch (error: any) {
        console.error('❌ [Analyze CNH] Error:', error);
        res.status(500).json({ error: error.message, details: error.toString() });
    }
});

app.post('/auto-api/generate/appeal', async (req, res) => {
    try {
        const { ticketInfo, selectedStrategyId, userReason, personalData, city, dateString } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const strategy = ticketInfo.strategies.find((s: any) => s.id === selectedStrategyId);

        const prompt = `
    Aja como um renomado Advogado Especialista em Direito de Trânsito Brasileiro. Gere um RECURSO ADMINISTRATIVO DE INFRAÇÃO DE TRÂNSITO profissional e bem formatado em Markdown puro.
    DADOS: Recorrente: ${personalData.fullName}, CPF: ${personalData.cpf}, Placa: ${ticketInfo.vehiclePlate}, Infração: ${ticketInfo.violationType}, Artigo: ${ticketInfo.article}, Tese: ${strategy?.title}, Relato: ${userReason}.
    Retorne APENAS o texto do recurso em Markdown puro.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
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
        console.log(`🔍 [Kiwify] Verifying payment for email: ${email}`);
        const token = await getKiwifyToken();
        const accountId = process.env.KIWIFY_ACCOUNT_ID || '';

        // Search sales by customer email
        const salesUrl = `https://public-api.kiwify.com/v1/sales?customer_email=${encodeURIComponent(email)}`;
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

        const result: any = await response.json();
        const sales = result.data || [];

        // Check if any sale is paid/approved (most recent first)
        const paidSale = sales.find((sale: any) =>
            sale.status === 'paid' ||
            sale.status === 'approved' ||
            sale.status === 'completed'
        );

        if (paidSale) {
            console.log(`✅ [Kiwify] Payment confirmed for ${email}, sale ID: ${paidSale.id}`);
            res.json({ status: 'PAID', saleId: paidSale.id });
        } else {
            console.log(`⏳ [Kiwify] No confirmed payment found for ${email}`);
            res.json({ status: 'PENDING' });
        }
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
    res.json({ success: true });
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

app.use((req, res) => {
    console.log(`[404] Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
});
