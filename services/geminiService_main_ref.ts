
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
    Aja como um renomado Advogado Especialista em Direito de Trânsito Brasileiro. 
    Gere um RECURSO ADMINISTRATIVO DE INFRAÇÃO DE TRÂNSITO profissional e bem formatado em Markdown puro.

    IMPORTANTE SOBRE FORMATAÇÃO:
    - Use apenas Markdown puro (sem HTML, sem &nbsp;, sem tags <center>)
    - Para centralizar texto, use espaços normais
    - Use ** para negrito
    - Use # para títulos quando necessário
    - Use linhas em branco para separar parágrafos
    - Use > para citações de artigos legais

    ESTRUTURA DO DOCUMENTO:
    1. CABEÇALHO CENTRALIZADO (use espaçamento para centralizar visualmente):
       ILUSTRÍSSIMO SENHOR PRESIDENTE DA JARI
       [Nome do órgão em CAIXA ALTA]

    2. QUALIFICAÇÃO DO RECORRENTE (parágrafo corrido, formal)

    3. I. DOS FATOS (relato objetivo e cronológico)

    4. II. DO DIREITO / FUNDAMENTOS JURÍDICOS (use blockquote > para citar artigos do CTB)

    5. III. DOS PEDIDOS (lista clara: cancelamento, baixa de pontos, arquivamento)

    6. FECHAMENTO:
       Pede Deferimento.
       
       [Cidade], [data por extenso]
       
       _________________________
       [Nome completo]
       CPF: [cpf]

    DADOS FORNECIDOS:
    - Recorrente: ${personalData.fullName}, CPF: ${personalData.cpf}, RG: ${personalData.rg}, CNH: ${personalData.cnh}
    - Endereço: ${personalData.address}
    - Infração: ${ticketInfo.violationType}
    - Artigo: ${ticketInfo.article}
    - Local: ${ticketInfo.location}
    - Data: ${ticketInfo.date}
    - Placa: ${ticketInfo.vehiclePlate}
    - Órgão: ${ticketInfo.authority}
    - Tese: ${strategy?.title}
    - Fundamentação: ${strategy?.description}
    - Relato do Condutor: ${userReason}

    Retorne APENAS o texto do recurso em Markdown puro, sem comentários ou explicações adicionais.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt
  });

  return response.text || "Erro ao gerar o recurso.";
};
