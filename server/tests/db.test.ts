import { describe, it, expect, beforeEach } from 'vitest';
import {
  addEvent,
  getEvents,
  addResource,
  getResources,
  searchCustomerResources,
  getSettings,
  updateSettings,
  clearAllData,
  getAdminSnapshot,
  db
} from '../db.js';

describe('Auto Recurso - SQLite Database Layer (QA Senior)', () => {
  beforeEach(() => {
    clearAllData();
  });

  describe('1. Gerenciamento de Configurações (Settings)', () => {
    it('deve retornar configurações padrão ou atualizadas', () => {
      const initial = getSettings();
      expect(initial).toHaveProperty('isFreeGenerationEnabled');

      const updated = updateSettings({
        isFreeGenerationEnabled: true,
        freeGenerationLimit: 25,
        price: 39.9
      });

      expect(updated.isFreeGenerationEnabled).toBe(true);
      expect(updated.freeGenerationLimit).toBe(25);
      expect(updated.price).toBe(39.9);

      const fetched = getSettings();
      expect(fetched.freeGenerationLimit).toBe(25);
    });
  });

  describe('2. Registro e Consulta de Eventos (Analytics)', () => {
    it('deve persistir e recuperar eventos ordenados pelo mais recente', () => {
      const ev1 = addEvent({
        type: 'checkout_step_1',
        data: { customerEmail: 'teste1@email.com' },
        timestamp: 1000
      });

      const ev2 = addEvent({
        type: 'checkout_step_2',
        data: { customerEmail: 'teste2@email.com' },
        timestamp: 2000
      });

      const events = getEvents();
      expect(events.length).toBe(2);
      expect(events[0].id).toBe(ev2.id); // Mais recente primeiro
      expect(events[1].id).toBe(ev1.id);
      expect(events[0].data.customerEmail).toBe('teste2@email.com');
    });
  });

  describe('3. Registro e Busca de Recursos (Resources)', () => {
    it('deve salvar recurso e permitir busca por e-mail, CPF ou placa', () => {
      const resource = addResource({
        customerName: 'Pedro Ferreira',
        customerEmail: 'pedro@email.com',
        customerCpf: '123.456.789-00',
        customerPhone: '51999999999',
        ticketPlate: 'ABC1D23',
        appealText: 'Defesa teste'
      });

      expect(resource).toHaveProperty('id');
      expect(resource.customerEmail).toBe('pedro@email.com');

      // Busca por email
      const searchByEmail = searchCustomerResources('pedro@email.com');
      expect(searchByEmail.success).toBe(true);
      expect(searchByEmail.resources?.length).toBe(1);
      expect(searchByEmail.resources?.[0].ticketPlate).toBe('ABC1D23');

      // Busca por placa
      const searchByPlate = searchCustomerResources('abc1d23');
      expect(searchByPlate.success).toBe(true);
      expect(searchByPlate.resources?.length).toBe(1);

      // Busca por CPF
      const searchByCpf = searchCustomerResources('12345678900');
      expect(searchByCpf.success).toBe(true);
      expect(searchByCpf.resources?.length).toBe(1);

      // Busca inexistente
      const searchNotFound = searchCustomerResources('inexistente@email.com');
      expect(searchNotFound.success).toBe(false);
      expect(searchNotFound.message).toBeDefined();
    });
  });

  describe('4. Snapshot de Administração e Agregação de Clientes', () => {
    it('deve agregar clientes e valores pagos a partir dos eventos e recursos', () => {
      addEvent({
        type: 'payment_completed',
        data: {
          customerName: 'Ana Souza',
          customerEmail: 'ana@email.com',
          customerCpf: '98765432100',
          amount: 47.0
        },
        timestamp: 1000
      });

      addResource({
        customerName: 'Ana Souza',
        customerEmail: 'ana@email.com',
        customerCpf: '98765432100',
        ticketPlate: 'XYZ9876'
      });

      const snapshot = getAdminSnapshot();
      expect(snapshot.customers.length).toBe(1);
      expect(snapshot.customers[0].email).toBe('ana@email.com');
      expect(snapshot.customers[0].totalPaid).toBe(47.0);
      expect(snapshot.customers[0].totalResources).toBe(1);
      expect(snapshot.customers[0].name).toBe('Ana Souza');
    });

    it('clearAllData deve limpar eventos e recursos mantendo settings', () => {
      addEvent({ type: 'test_event' });
      addResource({ customerName: 'Test' });

      clearAllData();

      const events = getEvents();
      const resources = getResources();
      const settings = getSettings();

      expect(events.length).toBe(0);
      expect(resources.length).toBe(0);
      expect(settings).toBeDefined();
    });
  });
});
