import React from 'react';
import { ArrowLeft, Shield, Mail, Database, Eye, Lock, Trash2 } from 'lucide-react';

interface PrivacyPolicyProps {
    onBack: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
            <div className="max-w-3xl mx-auto">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold mb-8 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Voltar ao Início
                </button>

                <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 md:p-12">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                            <Shield className="w-7 h-7 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900">Política de Privacidade</h1>
                            <p className="text-slate-500 text-sm">Última atualização: 23 de novembro de 2026</p>
                        </div>
                    </div>

                    <div className="prose prose-slate max-w-none">
                        <p className="text-slate-600 leading-relaxed mb-8">
                            A <strong>AutoRecurso</strong> ("nós", "nosso" ou "Plataforma") está comprometida em proteger a privacidade
                            dos usuários ("você" ou "Usuário"). Esta Política de Privacidade descreve como coletamos, usamos,
                            armazenamos e protegemos suas informações pessoais.
                        </p>

                        <Section
                            icon={<Database className="w-5 h-5" />}
                            title="1. Dados que Coletamos"
                        >
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li><strong>Dados de Identificação:</strong> Nome completo, CPF, RG, CNH, endereço, e-mail e telefone.</li>
                                <li><strong>Dados do Veículo:</strong> Placa, informações do auto de infração.</li>
                                <li><strong>Imagens:</strong> Fotos do auto de infração ou CNH enviadas para análise.</li>
                                <li><strong>Dados de Pagamento:</strong> Processados exclusivamente pela Kiwify. Não armazenamos dados de cartão.</li>
                                <li><strong>Dados de Uso:</strong> Logs de acesso, eventos de navegação e interações com a plataforma, inclusive por ferramentas de mensuração de campanhas do Google (Google Ads/Tag). Também usamos um identificador anônimo, guardado no seu navegador, para saber em que etapa do uso do site as pessoas desistem ou avançam, e a origem do acesso (por exemplo, anúncio ou link). Esse identificador só é ligado ao seu nome e e-mail se você os informar no fluxo de pagamento, e os dados pessoais dos eventos são anonimizados após o prazo de retenção.</li>
                            </ul>
                        </Section>

                        <Section
                            icon={<Eye className="w-5 h-5" />}
                            title="2. Como Usamos seus Dados"
                        >
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li>Gerar recursos de trânsito personalizados utilizando inteligência artificial.</li>
                                <li>Processar pagamentos de forma segura via nosso parceiro Kiwify.</li>
                                <li>Enviar o documento gerado por e-mail.</li>
                                <li>Melhorar nossos serviços e experiência do usuário.</li>
                                <li>Cumprir obrigações legais e regulatórias.</li>
                            </ul>
                        </Section>

                        <Section
                            icon={<Lock className="w-5 h-5" />}
                            title="3. Segurança dos Dados"
                        >
                            <p className="text-slate-600">
                                Utilizamos criptografia TLS/SSL (conexão segura) em todas as comunicações. Seus dados são armazenados em
                                servidores com acesso restrito. As fotos e PDFs enviados (auto de infração e CNH) são enviados a provedores
                                de inteligência artificial apenas para extrair as informações, e a Plataforma não os guarda após a análise.
                                Os dados que você informa e o recurso gerado ficam armazenados para que você possa recuperar o documento.
                            </p>
                            <p className="text-slate-600 mt-4">
                                <strong>Por quanto tempo guardamos seus dados:</strong>
                            </p>
                            <ul className="list-disc pl-5 space-y-2 text-slate-600 mt-2">
                                <li><strong>Recurso gerado e dados de identificação</strong> (nome, CPF, RG, CNH, endereço, e-mail e telefone): por <strong>90 dias</strong> após a geração. Depois disso, são apagados automaticamente e não será mais possível recuperar o documento. Por isso, salve o arquivo assim que o receber.</li>
                                <li><strong>Dados de cadastro de compras não concluídas:</strong> até 30 dias.</li>
                                <li><strong>Registros de uso e navegação:</strong> os dados pessoais deles são removidos após 90 dias, e mantemos apenas estatísticas sem identificação.</li>
                                <li><strong>E-mail ligado a uma venda:</strong> removido após 90 dias. Mantemos apenas o código da venda, para impedir que o mesmo pagamento seja usado duas vezes.</li>
                                <li><strong>Cópias de segurança:</strong> mantidas por até 14 dias, então o que é apagado some também delas em até 14 dias.</li>
                                <li><strong>Pagamentos:</strong> a Kiwify pode guardar os registros da transação pelo prazo exigido por obrigações legais e fiscais, conforme a política dela.</li>
                            </ul>
                            <p className="text-slate-600 mt-4">
                                Você também pode pedir a exclusão antecipada dos seus dados a qualquer momento (veja o item 5).
                            </p>
                        </Section>

                        <Section
                            icon={<Mail className="w-5 h-5" />}
                            title="4. Compartilhamento de Dados"
                        >
                            <p className="text-slate-600 mb-4">Compartilhamos seus dados apenas com:</p>
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li><strong>OpenRouter e Google (Gemini):</strong> Para análise de imagens e geração de texto por inteligência artificial. O OpenRouter intermedeia o acesso aos modelos de IA, e o texto e as imagens enviados são processados pelo provedor do modelo (atualmente o Google).</li>
                                <li><strong>Kiwify:</strong> Para processamento de pagamentos.</li>
                                <li><strong>Brevo (Sendinblue):</strong> Para envio de e-mails transacionais.</li>
                                <li><strong>Google (Ads/Tag):</strong> Para medir o desempenho de campanhas de divulgação.</li>
                            </ul>
                            <p className="text-slate-600 mt-4">
                                <strong>Transferência internacional de dados:</strong> o OpenRouter, o Google, a Brevo e a Kiwify podem
                                tratar dados em servidores localizados fora do Brasil, como nos Estados Unidos e na Europa. Esse envio é
                                necessário para a prestação do serviço (análise do documento e geração do recurso por IA) e ocorre
                                com base no art. 33 da LGPD. Ao enviar seus documentos e dados, você declara estar ciente dessa transferência.
                            </p>
                            <p className="text-slate-600 mt-4">
                                Não vendemos seus dados e não os usamos para treinar modelos de IA próprios.
                            </p>
                        </Section>

                        <Section
                            icon={<Trash2 className="w-5 h-5" />}
                            title="5. Seus Direitos (LGPD)"
                        >
                            <p className="text-slate-600 mb-4">De acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a:</p>
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li>Confirmar a existência de tratamento de dados.</li>
                                <li>Acessar seus dados pessoais.</li>
                                <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
                                <li>Solicitar a exclusão de seus dados.</li>
                                <li>Revogar o consentimento a qualquer momento.</li>
                            </ul>
                            <p className="text-slate-600 mt-4">
                                Para exercer seus direitos, entre em contato pelo e-mail: <strong>privacidade@autorecurso.online</strong>
                            </p>
                        </Section>

                        <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                            <h3 className="font-black text-slate-900 mb-2">Contato</h3>
                            <p className="text-slate-600 text-sm">
                                Em caso de dúvidas sobre esta política, entre em contato conosco:<br />
                                <strong>E-mail:</strong> contato@autorecurso.online<br />
                                <strong>WhatsApp:</strong> (51) 98128-1898
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({
    icon,
    title,
    children,
}) => (
    <div className="mb-8">
        <h2 className="flex items-center gap-3 text-xl font-black text-slate-900 mb-4">
            <span className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                {icon}
            </span>
            {title}
        </h2>
        {children}
    </div>
);

export default PrivacyPolicy;
