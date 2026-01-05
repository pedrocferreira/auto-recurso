
import { GoogleGenAI, Type } from "@google/genai";
import { TicketInfo, PersonalInfo } from "../types";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const analyzeTicketImage = async (base64Image: string): Promise<TicketInfo> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image
          }
        },
        {
          text: `Analise esta foto de uma multa de trânsito brasileira. Extraia as informações principais e sugira 3 estratégias de defesa baseadas no Código de Trânsito Brasileiro (CTB). 
          TENTE TAMBÉM identificar dados do condutor/proprietário como Nome, CPF e Endereço.
          IMPORTANTE: Se um dado não for encontrado, retorne uma string VAZIA (""). NUNCA retorne "Não visível", "N/A" ou algo similar.
          Retorne os dados estritamente no formato JSON conforme o schema.`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          violationType: { type: Type.STRING },
          article: { type: Type.STRING },
          location: { type: Type.STRING },
          date: { type: Type.STRING },
          vehiclePlate: { type: Type.STRING },
          authority: { type: Type.STRING },
          extractedPersonalInfo: {
            type: Type.OBJECT,
            properties: {
              fullName: { type: Type.STRING },
              cpf: { type: Type.STRING },
              address: { type: Type.STRING }
            }
          },
          strategies: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["id", "title", "description"]
            }
          }
        },
        required: ["violationType", "article", "location", "date", "vehiclePlate", "authority", "strategies"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Não foi possível processar a imagem.");
  return JSON.parse(text) as TicketInfo;
};

export const analyzeCNHImage = async (base64Image: string): Promise<Partial<PersonalInfo>> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image
          }
        },
        {
          text: `Extraia os dados desta CNH (Carteira Nacional de Habilitação). 
          Campos: Nome Completo, CPF, RG, Número da CNH e Endereço (se houver).
          IMPORTANTE: Se um dado não for encontrado, retorne uma string VAZIA ("").
          Retorne estritamente em JSON.`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING },
          cpf: { type: Type.STRING },
          rg: { type: Type.STRING },
          cnh: { type: Type.STRING },
          address: { type: Type.STRING }
        }
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Não foi possível processar a CNH.");
  return JSON.parse(text) as Partial<PersonalInfo>;
};

export const generateFinalAppeal = async (
  ticketInfo: TicketInfo,
  selectedStrategyId: string,
  userReason: string,
  personalData: PersonalInfo
): Promise<string> => {
  const ai = getAIClient();
  const strategy = ticketInfo.strategies.find(s => s.id === selectedStrategyId);
  
  const prompt = `
    Aja como um advogado especialista em direito de trânsito brasileiro. 
    Gere um recurso formal de infração de trânsito direcionado à JARI (Junta Administrativa de Recursos de Infrações).
    
    DADOS DO RECORRENTE:
    - Nome: ${personalData.fullName}
    - CPF: ${personalData.cpf}
    - RG: ${personalData.rg}
    - CNH: ${personalData.cnh}
    - Endereço: ${personalData.address}

    DADOS DA INFRAÇÃO:
    - Infração: ${ticketInfo.violationType}
    - Artigo do CTB: ${ticketInfo.article}
    - Local: ${ticketInfo.location}
    - Data: ${ticketInfo.date}
    - Placa do Veículo: ${ticketInfo.vehiclePlate}
    - Órgão Autuador: ${ticketInfo.authority}
    
    Estratégia Escolhida: ${strategy?.title}
    Fundamentação da Estratégia: ${strategy?.description}
    Relato Personalizado do Condutor: ${userReason}
    
    O documento deve ser formal, completo e pronto para assinatura. NÃO USE PLACEHOLDERS como [NOME]. Use os dados fornecidos acima.
    Inclua:
    1. Endereçamento à JARI.
    2. Qualificação completa do recorrente.
    3. Exposição dos fatos e fundamentos jurídicos (cite o CTB).
    4. O pedido final de cancelamento da penalidade e baixa da pontuação.
    
    Formate em Markdown.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt
  });

  return response.text || "Erro ao gerar o recurso.";
};
