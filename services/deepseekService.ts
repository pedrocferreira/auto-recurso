import { TicketInfo, PersonalInfo } from "../types";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

const getAPIKey = () => {
    return process.env.DEEPSEEK_API_KEY;
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
    try {
        return await fn();
    } catch (error: any) {
        if (retries > 0 && (error.message?.includes('429') || error.status === 429)) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return withRetry(fn, retries - 1, delay * 2);
        }
        throw error;
    }
};

export const analyzeTicketImage = async (base64Image: string): Promise<TicketInfo> => {
    // Nota: Modelos DeepSeek V3/Reasoner não suportam visão nativamente. 
    // Em um app real, usaríamos um modelo como GPT-4o ou Claude 3.5 Sonnet para OCR.
    // Por enquanto, retornaremos um objeto vazio para o usuário preencher manualmente.
    console.warn("DeepSeek não suporta análise de imagem nativamente. Por favor, preencha os dados manualmente.");
    return {
        violationType: "",
        article: "",
        location: "",
        date: "",
        vehiclePlate: "",
        authority: "",
        strategies: [
            { id: "1", title: "Defesa Processual", description: "Verifique se todos os campos obrigatórios do auto de infração foram preenchidos corretamente (Art. 280 do CTB)." },
            { id: "2", title: "Mérito: Ausência de Sinalização", description: "Alegue que a sinalização no local era inexistente, insuficiente ou estava obstruída (Resolução CONTRAN nº 798/2020)." },
            { id: "3", title: "Aferição de Equipamento", description: "Verifique se o radar ou equipamento utilizado foi aferido pelo INMETRO nos últimos 12 meses." }
        ]
    };
};

export const analyzeCNHImage = async (base64Image: string): Promise<Partial<PersonalInfo>> => {
    console.warn("DeepSeek não suporta análise de imagem nativamente.");
    return {};
};

export const generateFinalAppeal = async (
    ticketInfo: TicketInfo,
    selectedStrategyId: string,
    userReason: string,
    personalData: PersonalInfo
): Promise<string> => {
    const apiKey = getAPIKey();
    const strategy = ticketInfo.strategies.find(s => s.id === selectedStrategyId);

    return withRetry(async () => {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: "Você é um renomado Advogado Especialista em Direito de Trânsito Brasileiro. Gere recursos de alta qualidade em Markdown puro."
                    },
                    {
                        role: "user",
                        content: `
Gere um RECURSO ADMINISTRATIVO DE INFRAÇÃO DE TRÂNSITO profissional.

REGRAS CRÍTICAS:
1. USE OS DADOS REAIS ABAIXO. NÃO INVENTE DADOS.
2. Formate em Markdown puro (negrito com **, títulos com #).
3. Substitua todos os espaços de qualificação pelos dados fornecidos.

DADOS DO CLIENTE:
- Nome: ${personalData.fullName}
- CPF: ${personalData.cpf}
- RG: ${personalData.rg}
- CNH: ${personalData.cnh}
- Endereço: ${personalData.address}
- Profissão: ${personalData.profession}
- Estado Civil: ${personalData.civilStatus}
${personalData.isDifferentDriver ? `- Condutor (Diferente do Proprietário): ${personalData.driverFullName}, CPF: ${personalData.driverCpf}` : ""}

DETALHES DA MULTA:
- Infração: ${ticketInfo.violationType}
- Artigo: ${ticketInfo.article}
- Local: ${ticketInfo.location}
- Órgão: ${ticketInfo.authority}
- Tese: ${strategy?.title}
- Fundamentação: ${strategy?.description}
- Relato do Condutor: ${userReason}

Retorne APENAS o texto do recurso.`
                    }
                ],
                temperature: 0.7,
                max_tokens: 4000
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
    });
};
