
export interface PersonalInfo {
  fullName: string;
  cpf: string;
  rg: string;
  cnh: string;
  address: string;
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
  GENERATING = 'GENERATING',
  FINAL_DOCUMENT = 'FINAL_DOCUMENT'
}
