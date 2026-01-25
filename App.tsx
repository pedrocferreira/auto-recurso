
import React, { useState, useEffect } from 'react';
import { analyzeTicketImage, analyzeCNHImage, generateFinalAppeal } from './services/geminiService';
import { createAbacatePayBilling, checkAbacatePayBillingStatus } from './services/paymentService';
import { logEvent, registerResource, getAdminSettings, incrementFreeUsage, AdminSettings } from './services/analyticsService';
import { sendResourceEmail } from './services/emailService';
import { AppStep, TicketInfo, PersonalInfo } from './types';
import {
  Camera,
  Upload,
  FileText,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Scale,
  Download,
  Copy,
  User,
  MapPin,
  CreditCard,
  ScanLine,
  Printer,
  ShieldCheck,
  Zap,
  Lock
} from 'lucide-react';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.START);
  const [error, setError] = useState<string | null>(null);
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [userReason, setUserReason] = useState<string>('');
  const [personalData, setPersonalData] = useState<PersonalInfo>({
    fullName: '',
    cpf: '',
    rg: '',
    cnh: '',
    address: '',
    email: '',
    phone: '',
    isDifferentDriver: false,
    driverFullName: '',
    driverCpf: '',
    driverRg: '',
    driverCnh: '',
    profession: '',
    civilStatus: ''
  });
  const [finalDocument, setFinalDocument] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCnhProcessing, setIsCnhProcessing] = useState<boolean>(false);
  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(getAdminSettings());

  const [dataLoaded, setDataLoaded] = useState<boolean>(false);

  // Carregar dados salvos do localStorage ao iniciar
  useEffect(() => {
    const savedTicketInfo = localStorage.getItem('ticketInfo');
    const savedSelectedStrategy = localStorage.getItem('selectedStrategy');
    const savedUserReason = localStorage.getItem('userReason');
    const savedPersonalData = localStorage.getItem('personalData');

    if (savedTicketInfo) setTicketInfo(JSON.parse(savedTicketInfo));
    if (savedSelectedStrategy) setSelectedStrategy(savedSelectedStrategy);
    if (savedUserReason) setUserReason(savedUserReason);
    if (savedPersonalData) {
      const parsed = JSON.parse(savedPersonalData);
      setPersonalData(prev => ({ ...prev, ...parsed }));
    }
    setDataLoaded(true);
  }, []);

  // Salvar dados no localStorage quando mudarem
  useEffect(() => {
    if (ticketInfo) localStorage.setItem('ticketInfo', JSON.stringify(ticketInfo));
  }, [ticketInfo]);

  useEffect(() => {
    if (selectedStrategy) localStorage.setItem('selectedStrategy', selectedStrategy);
  }, [selectedStrategy]);

  useEffect(() => {
    localStorage.setItem('userReason', userReason);
  }, [userReason]);

  useEffect(() => {
    if (dataLoaded) {
      localStorage.setItem('personalData', JSON.stringify(personalData));
    }
  }, [personalData, dataLoaded]);

  const validateCPF = (cpf: string) => {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
    let sum = 0;
    for (let i = 1; i <= 9; i++) sum = sum + parseInt(cpf.substring(i - 1, i)) * (11 - i);
    let rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(cpf.substring(9, 10))) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum = sum + parseInt(cpf.substring(i - 1, i)) * (12 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(cpf.substring(10, 11))) return false;
    return true;
  };

  const cleanData = (text: string | undefined) => {
    if (!text) return '';
    const garbage = ['não visível', 'não informado', 'n/a', 'indisponível', 'desconhecido', 'não extraído'];
    if (garbage.some(g => text.toLowerCase().includes(g))) return '';
    return text;
  };

  useEffect(() => {
    if (ticketInfo?.extractedPersonalInfo) {
      setPersonalData(prev => ({
        ...prev,
        fullName: cleanData(ticketInfo.extractedPersonalInfo?.fullName) || prev.fullName,
        cpf: cleanData(ticketInfo.extractedPersonalInfo?.cpf) || prev.cpf,
        address: cleanData(ticketInfo.extractedPersonalInfo?.address) || prev.address,
      }));
    }
  }, [ticketInfo]);

  useEffect(() => {
    const checkPayment = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('success') === 'true') {
        const savedStep = localStorage.getItem('appStep');
        const billingId = localStorage.getItem('billingId');

        if (savedStep === AppStep.PAYMENT && billingId) {
          try {
            const status = await checkAbacatePayBillingStatus(billingId);
            if (status === 'PAID' || status === 'CONFIRMED') {
              logEvent('payment_completed', { billingId, amount: 24.90 });
              handleGenerateDocument();
            } else {
              logEvent('payment_failed', { billingId, errorMessage: `Status: ${status}` });
              setError(`O pagamento ainda não foi confirmado (Status: ${status}).`);
              setStep(AppStep.USER_DATA);
            }
          } catch (err) {
            console.error("Erro ao verificar pagamento:", err);
            logEvent('payment_failed', { billingId, errorMessage: String(err) });
            // Em caso de erro na API de verificação, voltamos para a tela de dados
            setError("Não conseguimos confirmar seu pagamento automaticamente. Por favor, tente novamente.");
            setStep(AppStep.USER_DATA);
          }
        }
      }
    };
    checkPayment();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setStep(AppStep.ANALYZING);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const data = await analyzeTicketImage(base64);
        setTicketInfo(data);
        setStep(AppStep.STRATEGY_SELECTION);
        setIsProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Erro ao ler arquivo.");
      setStep(AppStep.START);
      setIsProcessing(false);
    }
  };

  const handleCNHUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsCnhProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const data = await analyzeCNHImage(base64);
        setPersonalData(prev => ({
          ...prev,
          fullName: data.fullName || prev.fullName,
          cpf: data.cpf || prev.cpf,
          rg: data.rg || prev.rg,
          cnh: data.cnh || prev.cnh,
          address: data.address || prev.address
        }));
        setIsCnhProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Erro ao ler CNH.");
      setIsCnhProcessing(false);
    }
  };

  const simulatePayment = () => {
    setIsPaying(true);
    setTimeout(() => {
      setIsPaying(false);
      handleGenerateDocument();
    }, 2500);
  };

  const handleGenerateDocument = async () => {
    let currentTicketInfo = ticketInfo;
    let currentSelectedStrategy = selectedStrategy;
    let currentUserReason = userReason;
    let currentPersonalData = personalData;

    // Recuperar do localStorage se o estado estiver vazio (pós-redirecionamento)
    if (!currentTicketInfo) {
      const saved = localStorage.getItem('ticketInfo');
      if (saved) currentTicketInfo = JSON.parse(saved);
    }
    if (!currentSelectedStrategy) {
      currentSelectedStrategy = localStorage.getItem('selectedStrategy');
    }
    if (!currentUserReason) {
      currentUserReason = localStorage.getItem('userReason') || '';
    }

    // Sempre tenta recuperar dados pessoais do localStorage para garantir completude
    const savedPersonalData = localStorage.getItem('personalData');
    if (savedPersonalData) {
      const parsed = JSON.parse(savedPersonalData);
      currentPersonalData = { ...currentPersonalData, ...parsed };
    }

    if (!currentTicketInfo || !currentSelectedStrategy) {
      setError("Dados insuficientes para gerar o recurso. Por favor, comece novamente.");
      setStep(AppStep.START);
      return;
    }

    // Validação rigorosa dos campos
    const isValid =
      currentPersonalData.fullName &&
      currentPersonalData.cpf &&
      currentPersonalData.rg &&
      currentPersonalData.cnh &&
      currentPersonalData.address;

    if (!isValid) {
      setError("Por favor, preencha todos os campos obrigatórios para gerar o recurso.");
      setStep(AppStep.USER_DATA);
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    setStep(AppStep.GENERATING);
    try {
      // Extrair cidade do endereço (tentativa simples)
      let city = "Cidade";
      if (currentPersonalData.address) {
        const parts = currentPersonalData.address.split('-');
        if (parts.length > 1) {
          city = parts[parts.length - 1].trim(); // Pega o último pedaço após traço (Ex: Rua X - Cidade/UF)
        } else {
          // Tenta pegar último pedaço após vírgula se não tiver traço
          const commaParts = currentPersonalData.address.split(',');
          if (commaParts.length > 1) city = commaParts[commaParts.length - 1].trim();
        }
      }

      // Format Data
      const today = new Date();
      const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      const dateString = `${today.getDate()} de ${months[today.getMonth()]} de ${today.getFullYear()}`;

      const doc = await generateFinalAppeal(
        currentTicketInfo,
        currentSelectedStrategy,
        currentUserReason,
        currentPersonalData,
        city,
        dateString
      );

      logEvent('resource_generated', {
        customerName: currentPersonalData.fullName,
        customerEmail: currentPersonalData.email,
        customerCpf: currentPersonalData.cpf,
        ticketPlate: currentTicketInfo.vehiclePlate,
        ticketArticle: currentTicketInfo.article
      });

      // Register complete resource data
      const strategy = currentTicketInfo.strategies.find(s => s.id === currentSelectedStrategy);
      registerResource({
        customerName: currentPersonalData.fullName,
        customerEmail: currentPersonalData.email,
        customerCpf: currentPersonalData.cpf,
        customerPhone: currentPersonalData.phone,
        customerRg: currentPersonalData.rg,
        customerCnh: currentPersonalData.cnh,
        customerAddress: currentPersonalData.address,
        ticketPlate: currentTicketInfo.vehiclePlate,
        ticketArticle: currentTicketInfo.article,
        ticketLocation: currentTicketInfo.location,
        ticketDate: currentTicketInfo.date,
        strategy: strategy?.title,
        documentContent: doc
      });

      // Send email with resource
      try {
        await sendResourceEmail(
          currentPersonalData.email,
          currentPersonalData.fullName,
          doc,
          currentTicketInfo.vehiclePlate
        );
        console.log('Email sent successfully to:', currentPersonalData.email);
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
        logEvent('email_failed', {
          customerName: currentPersonalData.fullName,
          customerEmail: currentPersonalData.email,
          ticketPlate: currentTicketInfo.vehiclePlate,
          errorMessage: emailError instanceof Error ? emailError.message : 'Erro desconhecido ao enviar email'
        });
        // Don't fail the entire flow if email fails
      }

      setFinalDocument(doc);
      setStep(AppStep.FINAL_DOCUMENT);
      // Limpar localStorage após sucesso
      localStorage.removeItem('appStep');
      localStorage.removeItem('ticketInfo');
      localStorage.removeItem('selectedStrategy');
      localStorage.removeItem('userReason');
      localStorage.removeItem('personalData');
      localStorage.removeItem('billingId');
    } catch (err) {
      logEvent('generation_error', {
        customerName: currentPersonalData.fullName,
        customerEmail: currentPersonalData.email,
        errorMessage: String(err)
      });
      setError("Erro ao gerar recurso.");
      setStep(AppStep.USER_DATA);
    } finally {
      setIsProcessing(false);
    }
  };

  const isFormValid =
    personalData.fullName &&
    validateCPF(personalData.cpf) &&
    personalData.rg &&
    personalData.cnh &&
    personalData.address &&
    personalData.email &&
    personalData.phone &&
    (!personalData.isDifferentDriver || (
      personalData.driverFullName &&
      validateCPF(personalData.driverCpf || '') &&
      personalData.driverRg &&
      personalData.driverCnh
    ));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-6 px-4">
      {/* Header Premium */}
      <header className="w-full max-w-4xl flex justify-between items-center mb-8 no-print">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Scale className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter">AUTO <span className="text-blue-600">RECURSO</span></h1>
          {import.meta.env.VITE_ABACATE_PAY_API_KEY?.startsWith('abc_dev_') && (
            <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded border border-amber-200">DEV MODE</span>
          )}
        </div>
        <div className="hidden md:flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
          <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-green-500" /> 100% Seguro</span>
          <span className="flex items-center gap-1"><Zap className="w-4 h-4 text-yellow-500" /> IA Especialista</span>
        </div>
      </header>

      <main className="w-full max-w-3xl">
        {/* Progress Bar (No-Print) */}
        <div className="w-full h-1.5 bg-slate-200 rounded-full mb-8 overflow-hidden no-print">
          <div
            className="h-full bg-blue-600 transition-all duration-500"
            style={{ width: `${(Object.values(AppStep).indexOf(step) + 1) * 11.1}%` }}
          />
        </div>

        <div className={`bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden ${step === AppStep.FINAL_DOCUMENT ? 'print:shadow-none print:border-none' : ''}`}>

          {step === AppStep.START && (
            <div className="p-8 md:p-12 text-center animate-fadeIn">
              <span className="inline-block px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase tracking-widest mb-6">
                Tecnologia Jurídica 2025
              </span>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 leading-tight">
                Anule sua multa sem precisar de advogado.
              </h2>
              <p className="text-slate-600 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
                Nossa IA analisa o Código de Trânsito Brasileiro em tempo real para encontrar erros na sua multa e gerar o recurso perfeito.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10 text-left max-w-lg mx-auto">
                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <p className="text-sm font-bold text-slate-700">Identifica erros de preenchimento automaticamente.</p>
                </div>
                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <p className="text-sm font-bold text-slate-700">Cita jurisprudência e resoluções do CONTRAN.</p>
                </div>
              </div>

              <label className="inline-flex items-center justify-center gap-3 px-10 py-6 bg-blue-600 text-white rounded-2xl font-black text-xl shadow-2xl hover:bg-blue-700 transition-all cursor-pointer transform hover:-translate-y-1 active:scale-95 w-full md:w-auto">
                <Upload className="w-6 h-6" />
                COMEÇAR AGORA
                <input type='file' className="hidden" accept="image/*" onChange={handleFileUpload} />
              </label>
              <p className="mt-6 text-slate-400 text-sm font-medium flex items-center justify-center gap-2">
                <Lock className="w-4 h-4" /> Seus dados estão protegidos e criptografados.
              </p>
            </div>
          )}

          {(step === AppStep.ANALYZING || step === AppStep.GENERATING) && (
            <div className="p-20 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-6" />
              <h3 className="text-2xl font-black text-slate-900">{step === AppStep.ANALYZING ? "Analisando Auto de Infração..." : "Redigindo Defesa Especializada..."}</h3>
              <p className="text-slate-500 mt-2">Nossa IA está cruzando dados com o CTB atualizado.</p>
            </div>
          )}

          {step === AppStep.STRATEGY_SELECTION && ticketInfo && (
            <div className="p-8 animate-slideIn">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-slate-900">Diagnóstico da Multa</h2>
                <div className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-xs font-black uppercase tracking-tighter animate-pulse">
                  Falha Identificada
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: "Placa", val: ticketInfo.vehiclePlate },
                  { label: "Artigo", val: ticketInfo.article },
                  { label: "Data", val: ticketInfo.date },
                  { label: "Órgão", val: ticketInfo.authority }
                ].map((i, k) => (
                  <div key={k} className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                    <p className="text-[10px] uppercase font-black text-slate-400 mb-1">{i.label}</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{i.val}</p>
                  </div>
                ))}
              </div>

              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                Escolha sua Estratégia de Defesa:
              </h3>
              <div className="space-y-3 mb-8">
                {ticketInfo.strategies.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStrategy(s.id)}
                    className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${selectedStrategy === s.id ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                  >
                    <h4 className="font-black text-slate-900">{s.title}</h4>
                    <p className="text-xs text-slate-600 mt-1">{s.description}</p>
                  </button>
                ))}
              </div>

              <button
                disabled={!selectedStrategy}
                onClick={() => setStep(AppStep.USER_INPUT)}
                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 shadow-xl disabled:opacity-50"
              >
                PROSSEGUIR PARA O RECURSO
              </button>
            </div>
          )}

          {step === AppStep.USER_INPUT && (
            <div className="p-8 animate-slideIn">
              <h2 className="text-2xl font-black text-slate-900 mb-4">Sua Versão dos Fatos</h2>
              <p className="text-slate-500 mb-6 text-sm">Adicione detalhes que a IA deve considerar (ex: buracos na via, falta de sinalização, emergência médica).</p>
              <textarea
                value={userReason}
                onChange={(e) => setUserReason(e.target.value)}
                className="w-full h-40 p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600 transition-all font-medium mb-8"
                placeholder="Descreva o que aconteceu no momento da multa..."
              />
              <button
                onClick={() => setStep(AppStep.USER_DATA)}
                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl"
              >
                CONFIGURAR CABEÇALHO JURÍDICO
              </button>
            </div>
          )}

          {step === AppStep.USER_DATA && (
            <div className="p-8 animate-slideIn">
              <h2 className="text-2xl font-black text-slate-900 mb-6">Finalizar Documento</h2>
              <div className="grid grid-cols-1 gap-4 mb-8">
                <input
                  type="text" placeholder="Nome Completo" value={personalData.fullName}
                  onChange={(e) => setPersonalData({ ...personalData, fullName: e.target.value })}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text" placeholder="CPF" value={personalData.cpf}
                    onChange={(e) => setPersonalData({ ...personalData, cpf: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                  <input
                    type="text" placeholder="RG" value={personalData.rg}
                    onChange={(e) => setPersonalData({ ...personalData, rg: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
                <input
                  type="text" placeholder="CNH" value={personalData.cnh}
                  onChange={(e) => setPersonalData({ ...personalData, cnh: e.target.value })}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
                <input
                  type="text" placeholder="Endereço" value={personalData.address}
                  onChange={(e) => setPersonalData({ ...personalData, address: e.target.value })}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="email" placeholder="E-mail" value={personalData.email}
                    onChange={(e) => setPersonalData({ ...personalData, email: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                  <input
                    type="tel" placeholder="Telefone" value={personalData.phone}
                    onChange={(e) => setPersonalData({ ...personalData, phone: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <label className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={personalData.isDifferentDriver}
                    onChange={(e) => setPersonalData({ ...personalData, isDifferentDriver: e.target.checked })}
                    className="w-5 h-5 accent-blue-600"
                  />
                  <span className="text-sm font-bold text-blue-900">O condutor era outra pessoa?</span>
                </label>

                {personalData.isDifferentDriver && (
                  <div className="space-y-4 animate-slideIn">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest pt-2">Dados do Condutor</h3>
                    <input
                      type="text" placeholder="Nome do Condutor" value={personalData.driverFullName}
                      onChange={(e) => setPersonalData({ ...personalData, driverFullName: e.target.value })}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        type="text" placeholder="CPF do Condutor" value={personalData.driverCpf}
                        onChange={(e) => setPersonalData({ ...personalData, driverCpf: e.target.value })}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                      />
                      <input
                        type="text" placeholder="RG do Condutor" value={personalData.driverRg}
                        onChange={(e) => setPersonalData({ ...personalData, driverRg: e.target.value })}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                      />
                    </div>
                    <input
                      type="text" placeholder="CNH do Condutor" value={personalData.driverCnh}
                      onChange={(e) => setPersonalData({ ...personalData, driverCnh: e.target.value })}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text" placeholder="Estado Civil" value={personalData.civilStatus}
                    onChange={(e) => setPersonalData({ ...personalData, civilStatus: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                  <input
                    type="text" placeholder="Profissão" value={personalData.profession}
                    onChange={(e) => setPersonalData({ ...personalData, profession: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div className="pt-4">
                  <label className="flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-400 transition-all cursor-pointer">
                    {isCnhProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ScanLine className="w-5 h-5" /> Importar dados da CNH</>}
                    <input type="file" className="hidden" accept="image/*" onChange={handleCNHUpload} />
                  </label>
                </div>
              </div>

              {/* TELA DE CHECKOUT SIMULADA */}
              <div className="bg-blue-600 text-white p-6 rounded-2xl mb-8 text-center">
                {adminSettings.isFreeGenerationEnabled && adminSettings.freeGenerationsUsed < adminSettings.freeGenerationLimit ? (
                  <>
                    <p className="text-blue-100 text-xs font-black uppercase tracking-widest mb-2">Modo Cortesia Ativado</p>
                    <p className="text-4xl font-black mb-6">GRÁTIS</p>
                    <button
                      disabled={!isFormValid || isProcessing}
                      onClick={async () => {
                        if (!isFormValid) return;
                        setIsProcessing(true);
                        setError(null);
                        try {
                          logEvent('payment_completed', {
                            customerName: personalData.fullName,
                            customerEmail: personalData.email,
                            amount: 0,
                            isFree: true
                          });
                          incrementFreeUsage();
                          await handleGenerateDocument();
                        } catch (err: any) {
                          setError(err.message || "Erro ao gerar recurso grátis");
                          setIsProcessing(false);
                        }
                      }}
                      className="w-full py-4 bg-white text-blue-600 rounded-xl font-black text-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : "GERAR MEU RECURSO GRÁTIS"}
                    </button>
                    <p className="mt-4 text-blue-100 text-[10px] font-bold uppercase">Restam {adminSettings.freeGenerationLimit - adminSettings.freeGenerationsUsed} recursos gratuitos hoje</p>
                  </>
                ) : (
                  <>
                    <p className="text-blue-100 text-xs font-black uppercase tracking-widest mb-2">Valor da Consultoria Prévia</p>
                    <p className="text-4xl font-black mb-6">R$ 24,90</p>
                    <button
                      disabled={!isFormValid || isProcessing}
                      onClick={async () => {
                        if (!isFormValid) return;
                        setIsProcessing(true);
                        setError(null);
                        try {
                          localStorage.setItem('appStep', AppStep.PAYMENT);
                          // Force save personal data before redirect
                          localStorage.setItem('personalData', JSON.stringify(personalData));

                          logEvent('payment_started', {
                            customerName: personalData.fullName,
                            customerEmail: personalData.email,
                            customerCpf: personalData.cpf,
                            customerPhone: personalData.phone,
                            ticketPlate: ticketInfo?.vehiclePlate,
                            ticketArticle: ticketInfo?.article,
                            amount: 24.90
                          });

                          const { url, id } = await createAbacatePayBilling(
                            personalData.fullName,
                            personalData.email,
                            personalData.cpf,
                            personalData.phone
                          );
                          localStorage.setItem('billingId', id);
                          window.location.href = url;
                        } catch (err: any) {
                          logEvent('payment_failed', {
                            customerEmail: personalData.email,
                            errorMessage: err.message || "Erro ao iniciar pagamento"
                          });
                          setError(err.message || "Erro ao iniciar pagamento");
                          setIsProcessing(false);
                        }
                      }}
                      className="w-full py-4 bg-white text-blue-600 rounded-xl font-black text-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> :
                        (import.meta.env.VITE_ABACATE_PAY_API_KEY?.startsWith('abc_dev_') ? "TESTAR PAGAMENTO (DEV)" : "PROSSEGUIR PARA O PAGAMENTO")}
                    </button>
                  </>
                )}
                {error && <p className="mt-4 text-red-200 text-sm font-bold">{error}</p>}
              </div>
            </div>
          )}

          {step === AppStep.PAYMENT && (
            <div className="p-8 animate-slideIn text-center">
              <h2 className="text-2xl font-black text-slate-900 mb-2">Pagamento via PIX</h2>
              <p className="text-slate-500 mb-8 text-sm">Escaneie o QR Code ou copie a chave abaixo para finalizar.</p>

              <div className="flex flex-col items-center justify-center mb-8">
                <div className="bg-white p-4 rounded-2xl border-4 border-slate-100 mb-6 shadow-sm">
                  {/* Placeholder do QR Code - Em uma implementação real aqui estaria o SVG/Img do PIX */}
                  <div className="w-48 h-48 bg-slate-50 flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200">
                    <div className="grid grid-cols-3 gap-1">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="w-4 h-4 bg-slate-300 rounded-sm" />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="w-full max-w-sm">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 flex items-center justify-between">
                    <code className="text-xs font-mono text-slate-600 truncate mr-4">00020126330014BR.GOV.BCB.PIX0111...</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText("00020126330014BR.GOV.BCB.PIX0111...");
                        alert("Chave PIX copiada!");
                      }}
                      className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-blue-600"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border border-green-100 rounded-2xl p-6 mb-8 flex items-start gap-4 text-left">
                <ShieldCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-green-900">Pagamento 100% Protegido</p>
                  <p className="text-xs text-green-700">Seu recurso será liberado instantaneamente após a confirmação do pagamento.</p>
                </div>
              </div>

              <button
                disabled={isPaying}
                onClick={simulatePayment}
                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 shadow-xl flex items-center justify-center gap-3"
              >
                {isPaying ? <Loader2 className="w-6 h-6 animate-spin" /> : <>JÁ REALIZEI O PAGAMENTO</>}
              </button>

              <button
                onClick={() => setStep(AppStep.USER_DATA)}
                className="mt-6 text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors"
              >
                VOLTAR PARA MEUS DADOS
              </button>
            </div>
          )}

          {step === AppStep.FINAL_DOCUMENT && (
            <div className="p-8 animate-fadeIn">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 no-print">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <ShieldCheck className="w-6 h-6 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900">Recurso Concluído</h2>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black flex items-center gap-2 hover:bg-blue-700 transition-all">
                    <Printer className="w-5 h-5" /> IMPRIMIR
                  </button>
                </div>
              </div>

              <div className="document-sheet">
                <div className="document-seal no-print">RECURSO OFICIAL</div>
                <div className="document-content">
                  {finalDocument}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4 no-print">
                <button onClick={() => setStep(AppStep.START)} className="py-4 bg-slate-100 text-slate-600 rounded-xl font-black">NOVO RECURSO</button>
                <button onClick={() => window.print()} className="py-4 bg-blue-600 text-white rounded-xl font-black shadow-lg">BAIXAR PDF</button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-12 text-center text-slate-400 text-xs max-w-lg no-print">
        <p className="mb-4">© 2025 AUTO RECURSO - Inteligência Artificial para Condutores.</p>
        <p>A ferramenta não garante o deferimento do recurso, mas fornece a melhor fundamentação técnica baseada no CTB e resoluções vigentes.</p>
      </footer>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.8s ease-out; }
        .animate-slideIn { animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        
        .document-sheet {
          background: white;
          padding: 80px 60px;
          min-height: 1000px; 
          position: relative;
          color: #000;
          font-family: 'Times New Roman', serif;
          line-height: 1.6;
          box-shadow: 0 0 20px rgba(0,0,0,0.05);
          border: 1px solid #eee;
        }

        .document-content {
          white-space: pre-wrap;
          font-size: 13pt;
          text-align: justify;
        }

        .document-seal {
          position: absolute;
          top: 40px;
          right: 40px;
          border: 3px solid #eee;
          padding: 8px 15px;
          color: #eee;
          font-weight: bold;
          transform: rotate(15deg);
          border-radius: 4px;
          font-size: 20px;
        }

        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .document-sheet { 
            box-shadow: none !important; 
            border: none !important; 
            padding: 0 !important;
            margin: 0 !important;
          }
          .min-h-screen { padding: 0 !important; }
        }

        @media (max-width: 640px) {
          .document-sheet { padding: 40px 20px; }
        }
      `}</style>
    </div>
  );
};

export default App;
