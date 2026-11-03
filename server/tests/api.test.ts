import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { getSettings, updateSettings } from '../db.js';
import jwt from 'jsonwebtoken';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables for tests
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

describe('Auto Recurso - API Integration Test Suite (QA Senior)', () => {
  const adminPassword = process.env.ADMIN_PASSWORD!;
  const jwtSecret = process.env.JWT_SECRET!;
  let validAdminToken = '';

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    validAdminToken = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: '1h' });

    // Mock determinístico do Gemini para garantir velocidade e zero consumo de cota em testes
    vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockImplementation(() => ({
      generateContent: async (prompt: any) => {
        return {
          response: {
            text: () => {
              // Se for análise de dados da multa
              return JSON.stringify({
                vehiclePlate: 'ABC1D23',
                article: 'Art. 218, I do CTB',
                violationType: 'Transitar em velocidade superior à máxima permitida em até 20%',
                location: 'Av. Paulista, 1000 - São Paulo/SP',
                date: '2026-08-20',
                authority: 'DSV / CET SP',
                strategies: [
                  {
                    id: 'strat_1',
                    title: 'Vício Formal no AIT (Art. 280)',
                    description: 'Inconsistência no preenchimento do auto'
                  },
                  {
                    id: 'strat_2',
                    title: 'Falta de Calibração do Radar (Art. 281)',
                    description: 'Ausência de laudo do INMETRO válido'
                  }
                ]
              });
            }
          }
        } as any;
      }
    } as any));
  });

  describe('1. Health Check & Observabilidade', () => {
    it('GET /health deve retornar status 200 e payload de saúde do serviço', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.uptime).toBe('number');
    });

    it('GET /auto-api/health deve responder com status ok sob o prefixo de rota', async () => {
      const response = await request(app).get('/auto-api/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('GET rota inexistente deve responder com 404 JSON estruturado', async () => {
      const response = await request(app).get('/auto-api/rota-inexistente-xyz');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Route not found');
    });
  });

  describe('2. Autenticação & Segurança de Rotas Admin', () => {
    it('POST /auto-api/admin/login deve autenticar com sucesso com a senha correta', async () => {
      const response = await request(app)
        .post('/auto-api/admin/login')
        .send({ password: adminPassword });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
      expect(response.body.success).toBe(true);
    });

    it('POST /auto-api/admin/login deve rejeitar com 401 para senha incorreta', async () => {
      const response = await request(app)
        .post('/auto-api/admin/login')
        .send({ password: 'senha_totalmente_incorreta_123' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Senha incorreta');
      expect(response.body.success).toBe(false);
    });

    it('GET /auto-api/admin/data deve bloquear requisições sem header Authorization (401)', async () => {
      const response = await request(app).get('/auto-api/admin/data');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('GET /auto-api/admin/data deve rejeitar token inválido/malformado com 403', async () => {
      const response = await request(app)
        .get('/auto-api/admin/data')
        .set('Authorization', 'Bearer token_invalido_12345');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('GET /auto-api/admin/data deve retornar métricas e dados com token JWT válido', async () => {
      const response = await request(app)
        .get('/auto-api/admin/data')
        .set('Authorization', `Bearer ${validAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('customers');
      expect(response.body).toHaveProperty('resources');
      expect(response.body).toHaveProperty('settings');
      expect(Array.isArray(response.body.events)).toBe(true);
    });
  });

  describe('3. Análise de Multas & Geração com IA (Gemini Mocked)', () => {
    it('POST /auto-api/generate/analyze-text deve analisar dados manuais e retornar estratégias jurídicas', async () => {
      const ticketPayload = {
        vehiclePlate: 'ABC1D23',
        article: 'Art. 218, I do CTB - Excesso de Velocidade em até 20%',
        violationType: 'Transitar em velocidade superior à máxima permitida em até 20%',
        location: 'Av. Paulista, 1000 - São Paulo/SP',
        date: '2026-08-20',
        authority: 'DSV / CET SP'
      };

      const response = await request(app)
        .post('/auto-api/generate/analyze-text')
        .send(ticketPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('vehiclePlate', 'ABC1D23');
      expect(response.body).toHaveProperty('strategies');
      expect(Array.isArray(response.body.strategies)).toBe(true);
      expect(response.body.strategies.length).toBeGreaterThan(0);
      expect(response.body.strategies[0]).toHaveProperty('id', 'strat_1');
    });

    const appealPayload = {
      ticketInfo: {
        vehiclePlate: 'ABC1D23',
        article: 'Art. 218',
        violationType: 'Velocidade',
        authority: 'DETRAN',
        date: '2026-08-20',
        location: 'São Paulo'
      },
      selectedStrategyId: 'strat_1',
      userReason: 'Não havia sinalização visível',
      personalData: {
        fullName: 'João Silva',
        cpf: '111.222.333-44',
        rg: '12.345.678-9',
        cnh: '12345678900',
        address: 'Rua das Palmeiras, 50',
        email: 'joao@teste.com',
        phone: '(11) 98888-8888'
      },
      city: 'São Paulo',
      dateString: '26 de Agosto de 2026'
    };

    it('POST /auto-api/generate/appeal deve bloquear (402) a geração sem pagamento identificado', async () => {
      const response = await request(app)
        .post('/auto-api/generate/appeal')
        .send({ ...appealPayload, personalData: { ...appealPayload.personalData, email: '' } });

      expect(response.status).toBe(402);
      expect(response.body).not.toHaveProperty('appeal');
    });

    it('POST /auto-api/generate/appeal deve gerar recurso grátis e consumir a cota no servidor', async () => {
      updateSettings({ isFreeGenerationEnabled: true, freeGenerationLimit: 1, freeGenerationsUsed: 0 });

      const response = await request(app)
        .post('/auto-api/generate/appeal')
        .send({ ...appealPayload, useFreeGeneration: true });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('appeal');
      expect(typeof response.body.appeal).toBe('string');
      expect(getSettings().freeGenerationsUsed).toBe(1);
    });

    it('POST /auto-api/generate/appeal deve bloquear (402) a geração grátis quando a cota acabou', async () => {
      updateSettings({ isFreeGenerationEnabled: true, freeGenerationLimit: 1, freeGenerationsUsed: 1 });

      const response = await request(app)
        .post('/auto-api/generate/appeal')
        .send({ ...appealPayload, useFreeGeneration: true });

      expect(response.status).toBe(402);
      expect(getSettings().freeGenerationsUsed).toBe(1);
      updateSettings({ isFreeGenerationEnabled: false, freeGenerationsUsed: 0 });
    });
  });

  describe('4. Geração de Documento DOCX', () => {
    it('POST /auto-api/generate/docx deve gerar e retornar um arquivo .docx binário válido', async () => {
      const docxPayload = {
        content: `ILUSTRÍSSIMO SENHOR PRESIDENTE DA JUNTA ADMINISTRATIVA DE RECURSOS DE INFRAÇÕES - JARI

FULANO DE TAL, brasileiro, portador do CPF 123.456.789-00, vem apresentar DEFESA PRÉVIA contra o Auto de Infração nº 123456.

DOS FATOS E DO DIREITO:
A autuação não respeitou os requisitos do Art. 280 do CTB.

DOS PEDIDOS:
Requer o arquivamento do auto de infração.

São Paulo, 26 de agosto de 2026.
_____________________________
FULANO DE TAL`,
        ticketInfo: {
          vehiclePlate: 'ABC1D23',
          article: 'Art. 218 do CTB',
          violationType: 'Excesso de velocidade',
          authority: 'DETRAN-SP',
          date: '2026-08-20',
          location: 'São Paulo/SP'
        },
        personalData: {
          fullName: 'Fulano de Tal',
          cpf: '123.456.789-00',
          rg: '12.345.678-9',
          cnh: '12345678900',
          address: 'Rua das Flores, 123',
          email: 'fulano@teste.com',
          phone: '(11) 99999-9999'
        },
        city: 'São Paulo',
        dateString: '26 de Agosto de 2026'
      };

      const response = await request(app)
        .post('/auto-api/generate/docx')
        .send(docxPayload)
        .buffer(true)
        .parse((res, callback) => {
          let data = Buffer.from([]);
          res.on('data', (chunk) => {
            data = Buffer.concat([data, chunk]);
          });
          res.on('end', () => {
            callback(null, data);
          });
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(response.headers['content-disposition']).toContain('attachment; filename=');
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(1000); // DOCX binário gerado
    });

    it('POST /auto-api/generate/docx deve tratar erro amigavelmente quando appealText/content estiver ausente (400 Bad Request)', async () => {
      const response = await request(app)
        .post('/auto-api/generate/docx')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('5. Analytics & Registro de Eventos', () => {
    it('POST /auto-api/analytics/event deve registrar evento de tracking com sucesso', async () => {
      const eventPayload = {
        name: 'page_view_test',
        metadata: {
          page: '/checkout',
          source: 'automated_test'
        }
      };

      const response = await request(app)
        .post('/auto-api/analytics/event')
        .send(eventPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('6. Recuperação de Recursos do Cliente', () => {
    it('POST /auto-api/resource/recover deve validar query obrigatória com 400', async () => {
      const response = await request(app)
        .post('/auto-api/resource/recover')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('message');
    });

    it('POST /auto-api/resource/recover deve responder igual exista ou não recurso, sem devolver dados', async () => {
      const notFound = await request(app)
        .post('/auto-api/resource/recover')
        .send({ query: 'inexistente_99999@teste.com' });
      // Placa do recurso gerado no teste de geração grátis
      const found = await request(app)
        .post('/auto-api/resource/recover')
        .send({ query: 'ABC1D23' });

      expect(notFound.status).toBe(200);
      expect(found.status).toBe(200);
      expect(found.body).toEqual(notFound.body);
      expect(found.body).not.toHaveProperty('resources');
      expect(JSON.stringify(found.body)).not.toContain('111.222.333-44');
    });

    it('POST /auto-api/email/send-pdf não deve mais existir como rota pública', async () => {
      const response = await request(app)
        .post('/auto-api/email/send-pdf')
        .send({ to: 'vitima@teste.com', name: 'X', documentContent: 'spam' });

      expect(response.status).toBe(404);
    });
  });
});
