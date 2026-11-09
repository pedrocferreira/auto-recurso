import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || (process.env.NODE_ENV === 'test'
  ? path.join(__dirname, 'test_autorecurso.db')
  : path.join(__dirname, 'autorecurso.db'));

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// Configurações de alta performance e concorrência para produção
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

// Criação das tabelas
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT,
      timestamp INTEGER,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      generated_at INTEGER,
      customer_name TEXT,
      customer_email TEXT,
      customer_cpf TEXT,
      customer_phone TEXT,
      ticket_plate TEXT,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS abandoned_carts (
      id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      phone TEXT,
      plate TEXT,
      created_at INTEGER,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS consumed_sales (
      sale_id TEXT PRIMARY KEY,
      email TEXT,
      consumed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_resources_email ON resources(customer_email);
    CREATE INDEX IF NOT EXISTS idx_resources_plate ON resources(ticket_plate);
    CREATE INDEX IF NOT EXISTS idx_resources_cpf ON resources(customer_cpf);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  `);

  // Inicializa configurações padrão se vazias
  const defaultSettings = {
    isFreeGenerationEnabled: false,
    freeGenerationLimit: 10,
    freeGenerationsUsed: 0
  };

  const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertSettingStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  for (const [key, val] of Object.entries(defaultSettings)) {
    const existing = getSettingStmt.get(key);
    if (!existing) {
      insertSettingStmt.run(key, JSON.stringify(val));
    }
  }

  // Migra dados do data.json legado se existir e o banco estiver vazio
  migrateFromJsonIfPresent();
}

function migrateFromJsonIfPresent() {
  const jsonPath = path.join(__dirname, 'data.json');
  if (!fs.existsSync(jsonPath)) return;

  const countEvents = (db.prepare('SELECT count(*) as count FROM events').get() as any).count;
  const countResources = (db.prepare('SELECT count(*) as count FROM resources').get() as any).count;

  if (countEvents === 0 && countResources === 0) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      const data = JSON.parse(raw);

      const insertEventStmt = db.prepare('INSERT OR IGNORE INTO events (id, type, timestamp, data) VALUES (?, ?, ?, ?)');
      const insertResourceStmt = db.prepare('INSERT OR IGNORE INTO resources (id, generated_at, customer_name, customer_email, customer_cpf, customer_phone, ticket_plate, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

      const migration = db.transaction(() => {
        if (Array.isArray(data.events)) {
          for (const ev of data.events) {
            const evId = ev.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const evType = ev.type || ev.name || 'unknown';
            const evTimestamp = ev.timestamp || Date.now();
            insertEventStmt.run(evId, evType, evTimestamp, JSON.stringify(ev.data || ev.metadata || {}));
          }
        }

        if (Array.isArray(data.resources)) {
          for (const res of data.resources) {
            const resId = res.id || `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            insertResourceStmt.run(
              resId,
              res.generatedAt || Date.now(),
              res.customerName || '',
              res.customerEmail || '',
              res.customerCpf || '',
              res.customerPhone || '',
              res.ticketPlate || '',
              JSON.stringify(res)
            );
          }
        }

        if (data.settings && typeof data.settings === 'object') {
          const insertSettingStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
          for (const [k, v] of Object.entries(data.settings)) {
            insertSettingStmt.run(k, JSON.stringify(v));
          }
        }
      });

      migration();
      console.log('✅ [SQLite] Dados do data.json migrados com sucesso para SQLite!');
    } catch (err) {
      console.error('⚠️ [SQLite] Erro ao migrar data.json:', err);
    }
  }
}

// Inicializa no carregamento do módulo
initDatabase();

// --- Métodos de Repositório ---

export const getEvents = () => {
  const rows = db.prepare('SELECT * FROM events ORDER BY timestamp DESC').all() as any[];
  return rows.map(r => ({
    id: r.id,
    type: r.type,
    timestamp: r.timestamp,
    data: r.data ? JSON.parse(r.data) : {}
  }));
};

export const addEvent = (eventData: any) => {
  const id = eventData.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = eventData.timestamp || Date.now();
  const type = eventData.type || eventData.name || 'custom_event';
  const data = eventData.data || eventData.metadata || eventData;

  db.prepare('INSERT INTO events (id, type, timestamp, data) VALUES (?, ?, ?, ?)').run(
    id,
    type,
    timestamp,
    JSON.stringify(data)
  );

  return { id, type, timestamp, data };
};

export const getResources = () => {
  const rows = db.prepare('SELECT * FROM resources ORDER BY generated_at DESC').all() as any[];
  return rows.map(r => ({
    ...JSON.parse(r.data || '{}'),
    id: r.id,
    generatedAt: r.generated_at,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerCpf: r.customer_cpf,
    customerPhone: r.customer_phone,
    ticketPlate: r.ticket_plate
  }));
};

export const addResource = (resourceData: any) => {
  const id = resourceData.id || `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const generatedAt = resourceData.generatedAt || Date.now();
  const customerName = resourceData.customerName || resourceData.personalData?.fullName || '';
  const customerEmail = resourceData.customerEmail || resourceData.personalData?.email || '';
  const customerCpf = resourceData.customerCpf || resourceData.personalData?.cpf || '';
  const customerPhone = resourceData.customerPhone || resourceData.personalData?.phone || '';
  const ticketPlate = resourceData.ticketPlate || resourceData.ticketInfo?.vehiclePlate || '';

  const fullResource = {
    ...resourceData,
    id,
    generatedAt,
    customerName,
    customerEmail,
    customerCpf,
    customerPhone,
    ticketPlate
  };

  db.prepare(`
    INSERT INTO resources (id, generated_at, customer_name, customer_email, customer_cpf, customer_phone, ticket_plate, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    generatedAt,
    customerName,
    customerEmail,
    customerCpf,
    customerPhone,
    ticketPlate,
    JSON.stringify(fullResource)
  );

  return fullResource;
};

export const searchCustomerResources = (rawQuery: string) => {
  const raw = rawQuery.trim();
  const cleanQuery = raw.toLowerCase();
  const cleanDigits = raw.replace(/\D/g, '');
  const cleanPlate = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const isEmail = cleanQuery.includes('@') && cleanQuery.length >= 5;
  const isCpf = cleanDigits.length === 11;
  const isPlate = cleanPlate.length === 7;

  if (!isEmail && !isCpf && !isPlate) {
    return {
      success: false,
      message: 'Por favor, informe um e-mail válido, CPF completo (11 dígitos) ou placa completa (7 caracteres).'
    };
  }

  const resources = getResources();

  const foundResources = resources.filter((r: any) => {
    const emailMatch = isEmail && r.customerEmail && r.customerEmail.toLowerCase() === cleanQuery;
    const cpfDigits = (r.customerCpf || '').replace(/\D/g, '');
    const cpfMatch = isCpf && cpfDigits === cleanDigits;
    const plateDigits = (r.ticketPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const plateMatch = isPlate && plateDigits === cleanPlate;

    return emailMatch || cpfMatch || plateMatch;
  });

  if (foundResources.length > 0) {
    foundResources.sort((a: any, b: any) => (b.generatedAt || 0) - (a.generatedAt || 0));
    return { success: true, resources: foundResources };
  }

  // Verifica se há evento recente de pagamento ou checkout iniciado
  const events = getEvents();
  const hasStarted = events.some((e: any) => {
    const emailMatch = e.data?.customerEmail && e.data.customerEmail.toLowerCase() === cleanQuery;
    const cpfMatch = cleanDigits && (e.data?.customerCpf || '').replace(/\D/g, '') === cleanDigits;
    return emailMatch || cpfMatch;
  });

  return {
    success: false,
    hasPendingPayment: hasStarted,
    message: hasStarted
      ? 'Identificamos seu cadastro recente, mas o recurso ainda não foi gerado ou o pagamento está em processamento.'
      : 'Nenhum recurso encontrado com estes dados. Por favor, verifique se digitou o e-mail, CPF ou placa corretamente.'
  };
};

export const getSettings = () => {
  const rows = db.prepare('SELECT * FROM settings').all() as any[];
  const settings: Record<string, any> = {};
  for (const r of rows) {
    try {
      settings[r.key] = JSON.parse(r.value);
    } catch {
      settings[r.key] = r.value;
    }
  }
  return settings;
};

export const updateSettings = (newSettings: Record<string, any>) => {
  const insertStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const updateTx = db.transaction(() => {
    for (const [k, v] of Object.entries(newSettings)) {
      insertStmt.run(k, JSON.stringify(v));
    }
  });
  updateTx();
  return getSettings();
};

// --- Controle de gerações pagas/grátis ---

// Reserva uma venda para uma única geração. Retorna false se ela já foi usada.
export const claimSale = (saleId: string, email: string): boolean => {
  const result = db.prepare('INSERT OR IGNORE INTO consumed_sales (sale_id, email, consumed_at) VALUES (?, ?, ?)').run(
    saleId,
    email,
    Date.now()
  );
  return result.changes > 0;
};

export const releaseSale = (saleId: string) => {
  db.prepare('DELETE FROM consumed_sales WHERE sale_id = ?').run(saleId);
};

export const isSaleConsumed = (saleId: string): boolean => {
  return !!db.prepare('SELECT 1 FROM consumed_sales WHERE sale_id = ?').get(saleId);
};

// Reserva uma geração grátis de forma atômica. Retorna false se a cota acabou ou está desativada.
export const claimFreeGeneration = (): boolean => {
  const tx = db.transaction(() => {
    const settings = getSettings();
    const used = Number(settings.freeGenerationsUsed) || 0;
    const limit = Number(settings.freeGenerationLimit) || 0;
    if (!settings.isFreeGenerationEnabled || used >= limit) return false;
    updateSettings({ freeGenerationsUsed: used + 1 });
    return true;
  });
  return tx();
};

export const releaseFreeGeneration = () => {
  const used = Number(getSettings().freeGenerationsUsed) || 0;
  updateSettings({ freeGenerationsUsed: Math.max(0, used - 1) });
};

export const clearAllData = () => {
  db.exec(`
    DELETE FROM events;
    DELETE FROM resources;
    DELETE FROM abandoned_carts;
  `);
};

export const getAdminSnapshot = () => {
  const events = getEvents();
  const resources = getResources();
  const settings = getSettings();

  const customersMap = new Map();

  // Processa eventos
  events.forEach((event: any) => {
    if (!event.data?.customerEmail) return;

    const email = event.data.customerEmail;
    if (!customersMap.has(email)) {
      customersMap.set(email, {
        id: email,
        name: event.data.customerName || 'Cliente',
        email: email,
        cpf: event.data.customerCpf || '',
        phone: event.data.customerPhone || '',
        lastActivity: event.timestamp || 0,
        totalResources: 0,
        totalPaid: 0
      });
    }

    const customer = customersMap.get(email);
    if (event.timestamp > customer.lastActivity) {
      customer.lastActivity = event.timestamp;
    }
    if (event.type === 'payment_completed') {
      customer.totalPaid += (event.data.amount || 39.9);
    }

    if (event.data.customerName && event.data.customerName !== 'Cliente') customer.name = event.data.customerName;
    if (event.data.customerCpf) customer.cpf = event.data.customerCpf;
    if (event.data.customerPhone) customer.phone = event.data.customerPhone;
  });

  // Processa recursos
  resources.forEach((resource: any) => {
    if (!resource.customerEmail) return;

    const email = resource.customerEmail;
    if (!customersMap.has(email)) {
      customersMap.set(email, {
        id: email,
        name: resource.customerName || 'Cliente',
        email: email,
        cpf: resource.customerCpf || '',
        phone: resource.customerPhone || '',
        lastActivity: resource.generatedAt || 0,
        totalResources: 0,
        totalPaid: 0
      });
    }

    const customer = customersMap.get(email);
    customer.totalResources += 1;
    if (resource.generatedAt > customer.lastActivity) {
      customer.lastActivity = resource.generatedAt;
    }

    if (resource.customerName && resource.customerName !== 'Cliente') customer.name = resource.customerName;
    if (resource.customerCpf) customer.cpf = resource.customerCpf;
    if (resource.customerPhone) customer.phone = resource.customerPhone;
  });

  const customers = Array.from(customersMap.values());

  return {
    events,
    resources,
    customers,
    abandonedCarts: [],
    settings
  };
};
