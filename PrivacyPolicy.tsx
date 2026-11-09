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
                            <p className="text-slate-500 text-sm">Última atualização: Janeiro de 2026</p>
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
                                <li><strong>Dados de Uso:</strong> Logs de acesso, eventos de navegação e interações com a plataforma.</li>
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
                                Utilizamos criptografia TLS/SSL em todas as comunicações. Seus dados são armazenados em servidores
                                seguros com acesso restrito. As imagens enviadas são processadas pela API do Google Gemini e não
                                são armazenadas após a análise.
                            </p>
                        </Section>

                        <Section
                            icon={<Mail className="w-5 h-5" />}
                            title="4. Compartilhamento de Dados"
                        >
                            <p className="text-slate-600 mb-4">Compartilhamos seus dados apenas com:</p>
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li><strong>Google Gemini:</strong> Para análise de imagens e geração de texto (IA).</li>
                                <li><strong>Kiwify:</strong> Para processamento de pagamentos.</li>
                                <li><strong>Brevo (Sendinblue):</strong> Para envio de e-mails transacionais.</li>
                            </ul>
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
                                <strong>E-mail:</strong> contato@autorecurso.online
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
