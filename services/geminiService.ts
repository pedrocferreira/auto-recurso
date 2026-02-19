import { TicketInfo, PersonalInfo } from "../types";

export const analyzeTicketImage = async (base64Image: string): Promise<TicketInfo> => {
  const response = await fetch('/auto-api/generate/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Image })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Erro ao analisar imagem no servidor.");
  }
  return await response.json();
};

export const analyzeCNHImage = async (base64Image: string): Promise<Partial<PersonalInfo>> => {
  const response = await fetch('/auto-api/generate/analyze-cnh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Image })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Erro ao analisar CNH no servidor.");
  }
  return await response.json();
};

export const generateFinalAppeal = async (
  ticketInfo: TicketInfo,
  selectedStrategyId: string,
  userReason: string,
  personalData: PersonalInfo,
  city: string,
  dateString: string
): Promise<string> => {
  const response = await fetch('/auto-api/generate/appeal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticketInfo,
      selectedStrategyId,
      userReason,
      personalData,
      city,
      dateString
    })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Erro ao gerar recurso no servidor.");
  }
  const data = await response.json();
  return data.appeal;
};
