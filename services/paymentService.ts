export const createAbacatePayBilling = async (fullName: string, email: string, cpfOrCnpj: string, cellphone: string): Promise<{ url: string, id: string }> => {
    const response = await fetch("/api/payment/create", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
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
                    price: 2490
                }
            ],
            customer: {
                name: fullName,
                email: email,
                taxId: cpfOrCnpj.replace(/\D/g, ''),
                cellphone: cellphone.replace(/\D/g, '')
            },
            returnUrl: window.location.origin,
            completionUrl: window.location.origin + "/?success=true"
        })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message || "Erro ao criar cobrança.");
    return { url: result.data.url, id: result.data.id };
};

export const checkAbacatePayBillingStatus = async (billingId: string): Promise<string> => {
    const response = await fetch(`/api/payment/status/${billingId}`);
    const result = await response.json();
    return result.status;
};
