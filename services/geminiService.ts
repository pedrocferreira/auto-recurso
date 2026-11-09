import { TicketInfo, PersonalInfo } from "../types";

export const analyzeTicketImage = async (base64Image: string, mimeType: string = 'image/jpeg'): Promise<TicketInfo> => {
  const response = await fetch('/auto-api/generate/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Image, mimeType })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Erro ao analisar arquivo no servidor.");
  }
  return await response.json();
};

export const analyzeManualTicket = async (ticketData: Partial<TicketInfo>): Promise<TicketInfo> => {
  try {
    const response = await fetch('/auto-api/generate/analyze-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketData)
    });
    if (!response.ok) throw new Error('Erro no servidor ao analisar dados da multa');
    return await response.json();
  } catch (err) {
    return {
      vehiclePlate: ticketData.vehiclePlate || 'NÃO INFORMADA',
      article: ticketData.article || 'Infração de Trânsito',
      violationType: ticketData.violationType || ticketData.article || 'Infração de Trânsito',
      location: ticketData.location || 'Local da Infração',
      date: ticketData.date || new Date().toLocaleDateString('pt-BR'),
      authority: ticketData.authority || 'DETRAN',
      strategies: [
        {
          id: 'strat_1',
          title: 'Vício Formal e Ausência de Requisitos do AIT (Art. 280 do CTB)',
          description: 'Inconsistência formal na autuação e falta de requisitos legais obrigatórios previstos no CTB.'
        },
        {
          id: 'strat_2',
          title: 'Falta de Sinalização Regulamentar / Equipamento Medidor (Art. 281 do CTB)',
          description: 'Ausência de sinalização indicativa na via ou falta de comprovação de aferição válida do equipamento.'
        },
        {
          id: 'strat_3',
          title: 'Cerceamento de Defesa e Nulidade da Autuação (Art. 5º, LV da CF/88)',
          description: 'Erro no procedimento de notificação e violação dos princípios constitucionais do contraditório.'
        }
      ]
    };
  }
};

export const analyzeCNHImage = async (base64Image: string, mimeType: string = 'image/jpeg'): Promise<Partial<PersonalInfo>> => {
  const response = await fetch('/auto-api/generate/analyze-cnh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Image, mimeType })
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
  dateString: string,
  options: { paymentEmail?: string; useFreeGeneration?: boolean } = {}
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
      dateString,
      paymentEmail: options.paymentEmail,
      useFreeGeneration: options.useFreeGeneration
    })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Erro ao gerar recurso no servidor.");
  }
  const data = await response.json();
  return data.appeal;
};
