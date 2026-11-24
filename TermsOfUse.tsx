import React from 'react';
import { ArrowLeft, FileText, Scale, CreditCard, RotateCcw, AlertTriangle, UserCheck, Ban, Gavel } from 'lucide-react';

interface TermsOfUseProps {
    onBack: () => void;
}

const TermsOfUse: React.FC<TermsOfUseProps> = ({ onBack }) => {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
            <div className="max-w-3xl mx-auto">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold mb-8 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Voltar
                </button>

                <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 md:p-12">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                            <FileText className="w-7 h-7 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900">Termos de Uso e Política de Reembolso</h1>
                            <p className="text-slate-500 text-sm">Última atualização: 18 de novembro de 2026</p>
                        </div>
                    </div>

                    <div className="prose prose-slate max-w-none">
                        <p className="text-slate-600 leading-relaxed mb-8">
                            Ao usar a <strong>AutoRecurso</strong> ("Plataforma"), você concorda com estes Termos de Uso. Leia com atenção
                            antes de contratar o serviço. O tratamento dos seus dados pessoais está descrito na nossa Política de Privacidade.
                        </p>

                        <Section icon={<Scale className="w-5 h-5" />} title="1. O que é a AutoRecurso">
                            <p className="text-slate-600 mb-3">
                                A AutoRecurso é uma ferramenta online que utiliza inteligência artificial para ajudar o condutor a redigir
                                um recurso administrativo contra multas de trânsito, com base nas informações que ele mesmo fornece.
                            </p>
                            <p className="text-slate-600">
                                <strong>A Plataforma não é um escritório de advocacia, não presta assessoria jurídica e não representa o
                                usuário perante órgãos de trânsito.</strong> O documento gerado é um modelo de texto produzido por IA.
                            </p>
                        </Section>

                        <Section icon={<AlertTriangle className="w-5 h-5" />} title="2. Sem garantia de resultado">
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li>A decisão de aceitar ou negar o recurso é exclusiva do órgão de trânsito competente. <strong>Não garantimos o cancelamento da multa, a redução de pontos ou qualquer outro resultado.</strong></li>
                                <li>Por ser gerado por inteligência artificial, o texto pode conter imprecisões ou citações inadequadas. <strong>Revise o documento por completo antes de protocolá-lo</strong>, e considere consultar um advogado para casos complexos.</li>
                                <li>Os prazos para apresentar defesa ou recurso são definidos pela legislação e pela notificação recebida. <strong>O controle dos prazos e o protocolo do documento são de responsabilidade do usuário.</strong></li>
                            </ul>
                        </Section>

                        <Section icon={<UserCheck className="w-5 h-5" />} title="3. Responsabilidades do usuário">
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li>Fornecer informações verdadeiras, completas e atualizadas sobre a multa, o veículo e o condutor.</li>
                                <li>Enviar apenas documentos e dados próprios, ou de terceiros que tenham autorizado o uso.</li>
                                <li>Ser maior de 18 anos ou estar representado por responsável legal.</li>
                                <li>Responder pelo conteúdo que fornece e pelo uso que faz do documento gerado.</li>
                            </ul>
                        </Section>

                        <Section icon={<Ban className="w-5 h-5" />} title="4. Usos proibidos">
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li>Usar a Plataforma para fraude, informações falsas ou para prejudicar terceiros.</li>
                                <li>Tentar burlar o pagamento, os limites de uso ou os mecanismos de segurança.</li>
                                <li>Realizar acessos automatizados, cópia em massa ou qualquer uso que sobrecarregue o serviço.</li>
                            </ul>
                            <p className="text-slate-600 mt-3">O descumprimento pode levar ao bloqueio do acesso, sem prejuízo das medidas legais cabíveis.</p>
                        </Section>

                        <Section icon={<CreditCard className="w-5 h-5" />} title="5. Contratação, pagamento e entrega">
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li>A análise inicial da multa e a sugestão de estratégias de defesa podem ser feitas antes do pagamento.</li>
                                <li>O pagamento é processado pela Kiwify. A AutoRecurso não recebe nem armazena dados de cartão.</li>
                                <li>Cada pagamento confirmado dá direito à geração de <strong>um (1) recurso</strong>. Para outra multa, é necessário um novo pagamento.</li>
                                <li>O documento é gerado logo após a confirmação do pagamento, exibido na tela e enviado ao e-mail informado. Você pode recuperá-lo depois pela opção "Recuperar meu recurso" em até <strong>90 dias</strong> após a geração, quando seus dados são apagados. Salve o arquivo assim que o receber.</li>
                                <li>Se a geração falhar por erro técnico nosso, você poderá tentar novamente sem novo pagamento.</li>
                            </ul>
                        </Section>

                        <Section icon={<RotateCcw className="w-5 h-5" />} title="6. Reembolso e direito de arrependimento">
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li>Conforme o art. 49 do Código de Defesa do Consumidor, você pode pedir o reembolso integral em até <strong>7 (sete) dias corridos</strong> contados da data da compra.</li>
                                <li>Também reembolsamos o valor pago se, por falha técnica da Plataforma, não conseguirmos entregar o documento.</li>
                                <li>Para pedir o reembolso, envie um e-mail para <strong>contato@autorecurso.online</strong> ou uma mensagem para o WhatsApp <strong>(51) 98128-1898</strong>, informando o e-mail usado na compra. O estorno é feito pelo mesmo meio de pagamento, em até 10 dias úteis após a solicitação, conforme os prazos da Kiwify e da sua instituição financeira.</li>
                                <li>O reembolso não é devido apenas porque o órgão de trânsito negou o recurso, pois o serviço contratado é a elaboração do documento, não o resultado do julgamento.</li>
                            </ul>
                        </Section>

                        <Section icon={<FileText className="w-5 h-5" />} title="7. Propriedade e licença de uso">
                            <p className="text-slate-600">
                                O documento gerado para você pode ser usado livremente para defender a sua multa. O software, a marca e o
                                conteúdo da Plataforma pertencem à AutoRecurso e não podem ser copiados ou revendidos sem autorização.
                            </p>
                        </Section>

                        <Section icon={<AlertTriangle className="w-5 h-5" />} title="8. Limitação de responsabilidade">
                            <p className="text-slate-600">
                                A Plataforma é oferecida como ferramenta de apoio. Dentro do que a lei permite, a AutoRecurso não responde por
                                multas mantidas, perda de prazo, dados informados incorretamente pelo usuário ou indisponibilidades momentâneas de
                                serviços de terceiros (como Kiwify, provedores de IA e e-mail). Nada nestes Termos limita direitos que o Código
                                de Defesa do Consumidor garante a você.
                            </p>
                        </Section>

                        <Section icon={<Gavel className="w-5 h-5" />} title="9. Alterações e foro">
                            <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li>Podemos atualizar estes Termos. A versão vigente é sempre a publicada nesta página, com a data da última atualização.</li>
                                <li>Estes Termos são regidos pela legislação brasileira. Para resolver qualquer conflito, fica eleito o foro do domicílio do consumidor.</li>
                            </ul>
                        </Section>

                        <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                            <h3 className="font-black text-slate-900 mb-2">Contato</h3>
                            <p className="text-slate-600 text-sm">
                                Dúvidas, suporte e pedidos de reembolso:<br />
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

export default TermsOfUse;
