import { PersonalInfo } from "../types";

const KIWIFY_CHECKOUT_URL = import.meta.env.VITE_KIWIFY_CHECKOUT_URL || 'https://pay.kiwify.com.br/YtpRqSE';

export const redirectToKiwifyCheckout = async (personalData: PersonalInfo): Promise<{ url: string }> => {
    // Save email to localStorage so we can verify payment when user returns
    localStorage.setItem('paymentEmail', personalData.email);

    // Build Kiwify checkout URL with pre-filled email
    const checkoutUrl = new URL(KIWIFY_CHECKOUT_URL);
    if (personalData.email) {
        checkoutUrl.searchParams.set('email', personalData.email);
    }
    if (personalData.fullName) {
        checkoutUrl.searchParams.set('name', personalData.fullName);
    }

    return { url: checkoutUrl.toString() };
};

export const checkKiwifyPaymentStatus = async (email: string): Promise<string> => {
    const response = await fetch(`/auto-api/payment/verify/${encodeURIComponent(email)}`);
    if (!response.ok) {
        throw new Error("Erro ao verificar pagamento");
    }
    const result = await response.json();
    return result.status;
};
