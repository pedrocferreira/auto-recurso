import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeManualTicket, analyzeTicketImage, analyzeCNHImage, generateFinalAppeal } from '../services/geminiService';
import { logEvent, searchResources } from '../services/analyticsService';
import { redirectToKiwifyCheckout, checkKiwifyPaymentStatus } from '../services/paymentService';
import { sendEmail, sendResourceEmail } from '../services/emailService';

describe('Frontend Services - Unit & Resilience Test Suite (QA Senior)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. geminiService - Tratamento de Erros e Fallback', () => {
    it('analyzeManualTicket deve retornar estratégias jurídicas de fallback padrão se a API falhar', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const input = {
        vehiclePlate: 'XYZ9876',
        article: 'Art. 181 - Estacionamento Irregular',
      };

      const result = await analyzeManualTicket(input);

      expect(result).toBeDefined();
      expect(result.vehiclePlate).toBe('XYZ9876');
      expect(result.article).toBe('Art. 181 - Estacionamento Irregular');
      expect(Array.isArray(result.strategies)).toBe(true);
      expect(result.strategies.length).toBe(3);
      expect(result.strategies[0]).toHaveProperty('id', 'strat_1');
      expect(result.strategies[0].title).toContain('Art. 280');
    });

    it('analyzeManualTicket deve retornar os dados da API quando a requisição for bem-sucedida', async () => {
      const mockSuccessData = {
        vehiclePlate: 'BRA2E19',
        article: 'Art. 218',
        violationType: 'Excesso de velocidade',
        location: 'Rodovia dos Imigrantes',
        date: '2026-08-26',
        authority: 'DER',
        strategies: [
          { id: 'custom_strat', title: 'Falha no radar', description: 'Sem aferição do Inmetro' }
        ]
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSuccessData,
      } as any);

      const result = await analyzeManualTicket({ vehiclePlate: 'BRA2E19' });
      expect(result.vehiclePlate).toBe('BRA2E19');
      expect(result.strategies[0].id).toBe('custom_strat');
    });

    it('analyzeTicketImage deve lançar erro formatado quando o backend falhar', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Imagem ilegível ou formato não suportado' }),
      } as any);

      await expect(analyzeTicketImage('fake_base64_data', 'image/png'))
        .rejects
        .toThrow('Imagem ilegível ou formato não suportado');
    });

    it('analyzeCNHImage deve lançar erro quando falhar no servidor', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Não foi possível detectar CNH' }),
      } as any);

      await expect(analyzeCNHImage('fake_cnh_base64', 'image/jpeg'))
        .rejects
        .toThrow('Não foi possível detectar CNH');
    });

    it('generateFinalAppeal deve formatar e enviar payload completo e retornar recurso gerado', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ appeal: 'TEXTO COMPLETO DO RECURSO JURÍDICO' }),
      } as any);

      const ticketInfo = {
        vehiclePlate: 'ABC1234',
        article: 'Art. 218',
        violationType: 'Velocidade',
        location: 'São Paulo',
        date: '26/08/2026',
        authority: 'DETRAN',
        strategies: []
      };

      const personalData = {
        fullName: 'Carlos Silva',
        cpf: '123.456.789-00',
        rg: '12.345.678-9',
        cnh: '12345678900',
        address: 'Rua A, 100',
        email: 'carlos@teste.com',
        phone: '11999999999'
      };

      const appeal = await generateFinalAppeal(
        ticketInfo,
        'strat_1',
        'Não havia placa regulamentadora visível',
        personalData,
        'São Paulo',
        '26 de agosto de 2026'
      );

      expect(appeal).toBe('TEXTO COMPLETO DO RECURSO JURÍDICO');
      expect(global.fetch).toHaveBeenCalledWith('/auto-api/generate/appeal', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));
    });
  });

  describe('2. analyticsService - Resiliência e Envio de Métricas', () => {
    it('logEvent não deve quebrar a execução se a API de tracking falhar', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Analytics server down'));

      // Resilient: no throw
      await expect(logEvent('button_click', { button: 'generate' })).resolves.not.toThrow();
    });

    it('logEvent deve enviar payload estruturado para /auto-api/analytics/event', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as any);

      await logEvent('checkout_start', { step: 1, price: 47 });

      expect(global.fetch).toHaveBeenCalledWith('/auto-api/analytics/event', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'checkout_start', data: { step: 1, price: 47 } })
      }));
    });

    it('searchResources deve retornar resultado estruturado', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Enviamos para o e-mail da compra.' })
      } as any);

      const result = await searchResources('cliente@email.com');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Enviamos para o e-mail da compra.');
    });
  });

  describe('3. paymentService - Validação e Redirecionamento Kiwify', () => {
    it('checkKiwifyPaymentStatus deve retornar status do pagamento quando respondido com sucesso', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'PAID', message: 'Pagamento confirmado' }),
      } as any);

      const result = await checkKiwifyPaymentStatus('comprador@email.com');
      expect(result.status).toBe('PAID');
      expect(result.message).toBe('Pagamento confirmado');
    });

    it('checkKiwifyPaymentStatus deve lançar erro se a resposta HTTP não for ok', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      } as any);

      await expect(checkKiwifyPaymentStatus('comprador@email.com')).rejects.toThrow('Falha na comunicação');
    });

    it('redirectToKiwifyCheckout deve construir URL com parâmetros de e-mail e nome', async () => {
      // Mock localStorage
      const mockSetItem = vi.fn();
      vi.stubGlobal('localStorage', { setItem: mockSetItem });

      const personalData = {
        fullName: 'Maria Oliveira',
        email: 'maria@teste.com',
        cpf: '11122233344',
        rg: '',
        cnh: '',
        address: '',
        phone: ''
      };

      const result = await redirectToKiwifyCheckout(personalData);
      expect(result.url).toContain('email=maria%40teste.com');
      expect(result.url).toContain('name=Maria+Oliveira');
      expect(mockSetItem).toHaveBeenCalledWith('paymentEmail', 'maria@teste.com');
    });
  });

  describe('4. emailService - Disparo de E-mails Transacionais', () => {
    it('sendEmail deve enviar e-mail com sucesso', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as any);

      const result = await sendEmail({
        to: 'cliente@teste.com',
        subject: 'Recurso de Multa',
        htmlContent: '<h1>Seu Recurso</h1>'
      });
      expect(result).toBe(true);
    });

    it('sendResourceEmail deve formatar conteúdo HTML e disparar e-mail', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as any);

      const result = await sendResourceEmail('cliente@teste.com', 'Carlos', 'Conteudo do Recurso\nLinha 2', 'ABC1234');
      expect(result).toBe(true);
    });

  });
});
