
import { GoogleGenAI, Type } from "@google/genai";
import { TicketInfo, PersonalInfo } from "../types";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Modelo padrão definido nas diretrizes para tarefas básicas/médias
const MODEL_NAME = 'gemini-3-flash-preview';

// Retry logic para lidar com rate limits (429) e timeouts
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 12000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const is429 = error.message?.includes('429') || error.status === 'RESOURCE_EXHAUSTED' || error.code === 429;

    if (retries > 0 && is429) {
      console.warn(`Rate limit atingido. Aguardando ${delay / 1000}s antes de tentar novamente...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 1.5); // Aumenta o delay gradualmente
    }
    throw error;
  }
};

export const analyzeTicketImage = async (base64Image: string): Promise<TicketInfo> => {
  return withRetry(async () => {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
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
          TENTE TAMBÉM identificar dados do condutor/proprietário como Nome, CPF e Endereço se estiverem visíveis.
          IMPORTANTE: Se um dado não for encontrado ou for ilegível, retorne uma string VAZIA (""). NUNCA retorne textos como "Não visível", "N/A" ou similares.
          Retorne os dados estritamente no formato JSON conforme o schema especificado.`
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
  });
};

export const analyzeCNHImage = async (base64Image: string): Promise<Partial<PersonalInfo>> => {
  return withRetry(async () => {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
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
  });
};

export const generateFinalAppeal = async (
  ticketInfo: TicketInfo,
  selectedStrategyId: string,
  userReason: string,
  personalData: PersonalInfo
): Promise<string> => {
  return withRetry(async () => {
    const ai = getAIClient();
    const strategy = ticketInfo.strategies.find(s => s.id === selectedStrategyId);

    const prompt = `
    Aja como um renomado Advogado Especialista em Direito de Trânsito Brasileiro. 
    Gere um RECURSO ADMINISTRATIVO DE INFRAÇÃO DE TRÂNSITO extremamente profissional e bem formatado.

    ESTRUTURA E ESTÉTICA DO DOCUMENTO:
    1. CABEÇALHO: O endereçamento deve ser em CAIXA ALTA e negrito, centralizado visualmente.
    2. QUALIFICAÇÃO: Apresente os dados do recorrente de forma elegante e fluida.
    3. SEÇÕES: Use numerais romanos (I, II, III) para as seções principais.
    4. CITAÇÕES LEGAIS: Use blocos de citação (blockquote) para destacar artigos do CTB ou resoluções.
    5. ESPAÇAMENTO: Garanta linhas em branco entre os parágrafos.
    6. LINGUAGEM: Use termos jurídicos adequados.

    DADOS:
    - Recorrente: ${personalData.fullName}, CPF: ${personalData.cpf}, RG: ${personalData.rg}, CNH: ${personalData.cnh}, Endereço: ${personalData.address}
    - Infração: ${ticketInfo.violationType}, Artigo: ${ticketInfo.article}, Local: ${ticketInfo.location}, Data: ${ticketInfo.date}, Placa: ${ticketInfo.vehiclePlate}, Órgão: ${ticketInfo.authority}
    - Tese Jurídica: ${strategy?.title}
    - Fundamentação da Tese: ${strategy?.description}
    - Argumento Adicional do Usuário: ${userReason}

    O texto final deve ser em Markdown, pronto para impressão.
  `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    return response.text || "Erro ao gerar o recurso.";
  });
};
