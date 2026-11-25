import React from 'react';
import { OPERATOR, SUPPORT_PHONE_DISPLAY } from './support';

// Aviso de independência + identificação do responsável pelo serviço.
const LegalNotice: React.FC = () => (
    <div className="text-center text-xs text-slate-400 max-w-lg space-y-2 no-print">
        <p>
            A AutoRecurso é uma ferramenta de inteligência artificial que ajuda o próprio condutor a redigir o texto do seu recurso.
            Não somos escritório de advocacia, não prestamos assessoria jurídica e não temos vínculo com DETRAN, Senatran, Contran,
            Polícia Rodoviária ou qualquer órgão do governo. Não protocolamos o recurso por você e não garantimos o resultado.
        </p>
        <p>
            {OPERATOR.legalName ? <><strong>{OPERATOR.legalName}</strong>{OPERATOR.cnpj ? ` · CNPJ ${OPERATOR.cnpj}` : ''}<br /></> : null}
            {OPERATOR.address ? <>{OPERATOR.address}<br /></> : null}
            E-mail: {OPERATOR.email} · WhatsApp {SUPPORT_PHONE_DISPLAY}
        </p>
    </div>
);

export default LegalNotice;
