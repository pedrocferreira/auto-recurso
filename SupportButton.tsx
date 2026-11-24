import React from 'react';
import { SUPPORT_WA_URL } from './support';
import { trackWhatsAppClick } from './services/analyticsService';

// Botão flutuante de suporte via WhatsApp
const SupportButton: React.FC = () => (
  <a
    href={SUPPORT_WA_URL}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Falar com o suporte no WhatsApp"
    onClick={trackWhatsAppClick}
    className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-2 pl-4 pr-5 py-3 rounded-full bg-green-500 hover:bg-green-600 text-white font-black text-sm shadow-xl transition-colors"
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.4 15.1L2 22l5-1.6A9.9 9.9 0 1 0 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .95.98-2.9-.2-.3a8.2 8.2 0 1 1 6.72 3.58zm4.5-6.15c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.54.06a6.7 6.7 0 0 1-3.3-2.9c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.56-1.35-.76-1.85-.2-.48-.4-.42-.56-.42h-.47c-.16 0-.43.06-.65.3-.23.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.2 3.7 1.55.67 2.15.73 2.93.62.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.17-.06-.1-.23-.16-.47-.28z" />
    </svg>
    Suporte
  </a>
);

export default SupportButton;
