/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string
    readonly VITE_ABACATE_PAY_API_KEY: string
    readonly VITE_DEEPSEEK_API_KEY: string
    readonly VITE_BREVO_API_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
