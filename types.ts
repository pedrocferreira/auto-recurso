
export interface PersonalInfo {
  fullName: string;
  cpf: string;
  rg: string;
  cnh: string;
  address: string;
  email: string;
  phone: string;
  isDifferentDriver?: boolean;
  driverFullName?: string;
  driverCpf?: string;
  driverRg?: string;
  driverCnh?: string;
  profession?: string;
  civilStatus?: string;
}

export interface TicketInfo {
  violationType: string;
  article: string;
  location: string;
  date: string;
  vehiclePlate: string;
  authority: string;
  extractedPersonalInfo?: Partial<PersonalInfo>;
  strategies: DefenseStrategy[];
}

export interface DefenseStrategy {
  id: string;
  title: string;
  description: string;
}

export enum AppStep {
  START = 'START',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  STRATEGY_SELECTION = 'STRATEGY_SELECTION',
  USER_INPUT = 'USER_INPUT',
  USER_DATA = 'USER_DATA',
  PAYMENT = 'PAYMENT',
  GENERATING = 'GENERATING',
  FINAL_DOCUMENT = 'FINAL_DOCUMENT'
}

export interface AdminSettings {
  isFreeGenerationEnabled: boolean;
  freeGenerationLimit: number;
  freeGenerationsUsed: number;
}

export interface AnalyticsEvent {
  id: string;
  timestamp: number;
  type: 'payment_started' | 'payment_completed' | 'payment_failed' | 'resource_generated' | 'generation_error' | 'form_abandoned' | 'email_failed' | 'email_sent';
  data: any;
}

export interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  lastActivity: number;
  totalResources: number;
  totalPaid: number;
}

export interface ResourceRecord {
  id: string;
  customerName: string;
  customerEmail: string;
  ticketPlate: string;
  ticketArticle: string;
  generatedAt: number;
  documentContent?: string;
}
