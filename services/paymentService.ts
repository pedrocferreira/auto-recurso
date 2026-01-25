
export interface AbacatePayBillingResponse {
    data: {
        id: string;
        url: string;
        status: string;
    };
    error: any;
}

export const createAbacatePayBilling = async (fullName: string, email: string, cpfOrCnpj: string, cellphone: string): Promise<{ url: string, id: string }> => {
    const apiKey = import.meta.env.VITE_ABACATE_PAY_API_KEY;
    if (!apiKey) {
        throw new Error("Abacate Pay API Key not found");
    }

    const response = await fetch("/api-abacate/v1/billing/create", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            frequency: "ONE_TIME",
            methods: ["PIX"],
            products: [
                {
                    externalId: "recurso-multa-ai",
                    name: "Recurso de Multa Inteligente",
                    description: "Análise e geração de recurso de multa via IA",
                    quantity: 1,
                    price: 2490 // R$ 24,90 em centavos (mínimo 100)
                }
            ],
            customer: {
                name: fullName,
                email: email,
                taxId: cpfOrCnpj.replace(/\D/g, ''), // Remove pontuação do CPF
                cellphone: cellphone.replace(/\D/g, '') // Remove pontuação do telefone
            },
            returnUrl: window.location.origin,
            completionUrl: window.location.origin + "/?success=true",
            devMode: apiKey.startsWith('abc_dev_')
        })
    });

    const result: AbacatePayBillingResponse = await response.json();

    if (result.error) {
        console.error("Abacate Pay Error:", result.error);
        throw new Error(result.error.message || "Erro ao criar cobrança no Abacate Pay");
    }

    return { url: result.data.url, id: result.data.id };
};

export const checkAbacatePayBillingStatus = async (billingId: string): Promise<string> => {
    const apiKey = import.meta.env.VITE_ABACATE_PAY_API_KEY;
    if (!apiKey) throw new Error("Abacate Pay API Key not found");

    const response = await fetch("/api-abacate/v1/billing/list", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${apiKey}`
        }
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);

    const billing = result.data.find((b: any) => b.id === billingId);
    return billing ? billing.status : "NOT_FOUND";
};
