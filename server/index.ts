import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

dotenv.config();
const port = process.env.PORT || 3001;
console.log('--- Server Start Configuration ---');
console.log('PORT:', port);
console.log('GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);
console.log('ABACATE_PAY_API_KEY loaded:', !!process.env.ABACATE_PAY_API_KEY);
console.log('---------------------------------');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
const MODEL_NAME = 'gemini-2.0-flash';

// --- Routes ---

app.post('/api/generate/analyze', async (req, res) => {
    console.log('📥 [Analyze] Request received');
    try {
        const { base64Image } = req.body;
        console.log('📷 [Analyze] Image size:', base64Image?.length, 'chars');

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
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
        });

        console.log('🤖 [Analyze] Calling Gemini API...');
        const result = await model.generateContent([
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: "Analise esta foto de uma multa de trânsito brasileira. Extraia as informações principais e sugira 3 estratégias de defesa baseadas no Código de Trânsito Brasileiro (CTB). TENTE TAMBÉM identificar dados do condutor/proprietário como Nome, CPF e Endereço se estiverem visíveis. IMPORTANTE: Se um dado não for encontrado ou for ilegível, retorne uma string VAZIA (\"\"). NUNCA retorne textos como \"Não visível\", \"N/A\" ou similares. Retorne os dados estritamente no formato JSON conforme o schema especificado." }
        ]);

        const response = await result.response;
        console.log('✅ [Analyze] Gemini responded successfully');
        res.json(JSON.parse(response.text()));
    } catch (error: any) {
        console.error('❌ [Analyze] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/generate/analyze-cnh', async (req, res) => {
    try {
        const { base64Image } = req.body;
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
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/generate/appeal', async (req, res) => {
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

app.post('/api/payment/create', async (req, res) => {
    try {
        const response = await fetch('https://api.abacatepay.com/v1/billing/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.ABACATE_PAY_API_KEY}`
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/payment/status/:id', async (req, res) => {
    try {
        const response = await fetch('https://api.abacatepay.com/v1/billing/list', {
            headers: { 'Authorization': `Bearer ${process.env.ABACATE_PAY_API_KEY}` }
        });
        const result: any = await response.json();
        const billing = result.data.find((b: any) => b.id === req.params.id);
        res.json({ status: billing ? billing.status : "NOT_FOUND" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        res.json({ success: true, token: 'fake-jwt-token' });
    } else {
        res.status(401).json({ success: false, message: 'Senha incorreta' });
    }
});

app.get('/api/admin/data', (req, res) => {
    res.json(loadData());
});

app.post('/api/analytics/event', (req, res) => {
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

app.post('/api/admin/register-resource', (req, res) => {
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

app.post('/api/email/send', async (req, res) => {
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
app.post('/api/email/send-pdf', async (req, res) => {
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

app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
});
