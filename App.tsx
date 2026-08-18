
import React, { useState, useEffect } from 'react';
import { analyzeTicketImage, analyzeCNHImage, generateFinalAppeal } from './services/geminiService';
import { redirectToKiwifyCheckout, checkKiwifyPaymentStatus } from './services/paymentService';
import { logEvent, registerResource, getAdminData, searchResources } from './services/analyticsService';
import { sendResourceEmail, sendPdfEmail } from './services/emailService';
import { AppStep, TicketInfo, PersonalInfo } from './types';
import PrivacyPolicy from './PrivacyPolicy';
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
  Lock,
  Search,
  Mail,
  RefreshCw,
  X,
  ExternalLink,
  FileCheck,
  Check
} from 'lucide-react';

const App: React.FC = () => {
  const [isDevMode, setIsDevMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('dev') === 'true' || params.get('dev') === '1' || params.get('modo') === 'dev') {
        localStorage.setItem('devMode', 'true');
        return true;
      }
      if (params.get('dev') === 'false' || params.get('dev') === '0') {
        localStorage.removeItem('devMode');
        return false;
      }
      if (localStorage.getItem('devMode') === 'true') {
        return true;
      }
      if (localStorage.getItem('devMode') === 'false') {
        return false;
      }
    }
    return import.meta.env.VITE_APP_MODE !== 'production';
  });


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
  const [adminSettings, setAdminSettings] = useState<any>({});
  const [showPrivacy, setShowPrivacy] = useState<boolean>(false);

  // Recovery modal state
  const [showRecoveryModal, setShowRecoveryModal] = useState<boolean>(false);
  const [recoveryQuery, setRecoveryQuery] = useState<string>('');
  const [isRecovering, setIsRecovering] = useState<boolean>(false);
  const [recoveryResults, setRecoveryResults] = useState<any[] | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendSuccessId, setResendSuccessId] = useState<string | null>(null);

  const [dataLoaded, setDataLoaded] = useState<boolean>(false);


  const loadInitialData = async () => {
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

    const savedStep = localStorage.getItem('appStep') as AppStep | null;
    if (savedStep === AppStep.PAYMENT || savedStep === AppStep.FINAL_DOCUMENT) {
      setStep(savedStep);
    }

    // Fetch admin settings from backend
    try {
      const data = await getAdminData();
      setAdminSettings(data.settings);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }

    setDataLoaded(true);
  };

  useEffect(() => {
    loadInitialData();
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

  const handleVerifyPayment = async () => {
    setIsProcessing(true);
    setError(null);
    const paymentEmail = localStorage.getItem('paymentEmail') || personalData.email;
    
    // In Dev Mode: automatically bypass and generate
    if (isDevMode) {
      logEvent('payment_completed', { email: paymentEmail || 'dev@teste.com', amount: 24.90, mode: 'dev' });
      await handleGenerateDocument();
      return;
    }

    if (!paymentEmail) {
      setError("E-mail não encontrado na sua sessão. Por favor, volte e preencha seus dados novamente.");
      setIsProcessing(false);
      return;
    }
    
    try {
      const status = await checkKiwifyPaymentStatus(paymentEmail);
      if (status === 'PAID') {
        logEvent('payment_completed', { email: paymentEmail, amount: 24.90 });
        handleGenerateDocument();
      } else {
        logEvent('payment_failed', { email: paymentEmail, errorMessage: `Status: ${status}` });
        setError(`O pagamento ainda não foi confirmado (Status: ${status}). Aguarde alguns instantes e tente novamente.`);
      }
    } catch (err) {
      console.error("Erro ao verificar pagamento:", err);
      logEvent('payment_failed', { email: paymentEmail, errorMessage: String(err) });
      setError("Não conseguimos confirmar seu pagamento automaticamente agora. Por favor, tente novamente.");
    }
    setIsProcessing(false);
  };


  const handleLoadSampleTicket = () => {
    const sampleTicket: TicketInfo = {
      violationType: 'Transitar em velocidade superior à máxima permitida em até 20%',
      article: 'Art. 218, I do CTB',
      location: 'Av. Ipiranga, 6681 - Porto Alegre/RS',
      date: '10/02/2026 14:32',
      vehiclePlate: 'ABC-1D23',
      authority: 'DETRAN-RS',
      strategies: [
        'Inconsistência formal na identificação do radar medidor (sem aferição do INMETRO há mais de 12 meses)',
        'Ausência de sinalização regulamentar de velocidade máxima permitida (Placa R-19)',
        'Defesa prévia por cerceamento de defesa e vício material na autuação'
      ]
    };
    setTicketInfo(sampleTicket);
    setSelectedStrategy(sampleTicket.strategies[0]);
    setStep(AppStep.STRATEGY_SELECTION);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFillSampleUserData = () => {
    setPersonalData({
      fullName: 'PEDRO DA COSTA FERREIRA',
      cpf: '014.143.970-03',
      rg: '1098765432',
      cnh: '01234567890',
      address: 'Av. Paulista, 1000, Apto 501 - Bela Vista, São Paulo/SP - CEP: 01310-100',
      email: 'pedroocferreira@gmail.com',
      phone: '(51) 98128-1898',
      profession: 'Empresário',
      civilStatus: 'Casado',
      isDifferentDriver: false,
      driverFullName: '',
      driverCpf: '',
      driverRg: '',
      driverCnh: ''
    });
  };


  const handleSearchRecovery = async (customQuery?: string) => {
    const query = customQuery !== undefined ? customQuery : recoveryQuery;
    if (!query || !query.trim()) {
      setRecoveryMessage("Por favor, digite seu e-mail, CPF ou placa do veículo.");
      return;
    }
    setIsRecovering(true);
    setRecoveryMessage(null);
    setRecoveryResults(null);
    try {
      const res = await searchResources(query.trim());
      if (res.success && res.resources && res.resources.length > 0) {
        setRecoveryResults(res.resources);
      } else {
        setRecoveryMessage(res.message || "Nenhum recurso encontrado com estes dados.");
      }
    } catch (err) {
      console.error("Erro na busca de recuperação:", err);
      setRecoveryMessage("Erro ao consultar o servidor. Tente novamente.");
    } finally {
      setIsRecovering(false);
    }
  };

  const handleOpenRecoveredDocument = (resource: any) => {
    setFinalDocument(resource.documentContent || '');
    setPersonalData(prev => ({
      ...prev,
      fullName: resource.customerName || prev.fullName,
      email: resource.customerEmail || prev.email,
      cpf: resource.customerCpf || prev.cpf,
      phone: resource.customerPhone || prev.phone,
      rg: resource.customerRg || prev.rg,
      cnh: resource.customerCnh || prev.cnh,
      address: resource.customerAddress || prev.address
    }));
    setTicketInfo(prev => ({
      violationType: prev?.violationType || 'Infração de Trânsito',
      article: resource.ticketArticle || prev?.article || '',
      location: resource.ticketLocation || prev?.location || '',
      date: resource.ticketDate || prev?.date || '',
      vehiclePlate: resource.ticketPlate || prev?.vehiclePlate || '',
      authority: prev?.authority || 'DETRAN',
      strategies: prev?.strategies || []
    }));
    setStep(AppStep.FINAL_DOCUMENT);
    setShowRecoveryModal(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDownloadDocxDirect = async (resource: any) => {
    try {
      const res = await fetch('/auto-api/generate/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: resource.documentContent,
          personalData: {
            fullName: resource.customerName,
            cpf: resource.customerCpf,
            rg: resource.customerRg,
            cnh: resource.customerCnh,
            address: resource.customerAddress
          },
          ticketInfo: {
            vehiclePlate: resource.ticketPlate,
            article: resource.ticketArticle,
            date: resource.ticketDate,
            authority: 'DETRAN'
          }
        })
      });
      if (!res.ok) throw new Error('Erro ao gerar DOCX');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Recurso_${resource.ticketPlate || 'AutoRecurso'}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao baixar DOCX:', err);
      alert('Erro ao gerar o arquivo DOCX. Tente novamente.');
    }
  };

  const handleResendPdfEmail = async (resource: any) => {
    setResendingId(resource.id);
    setResendSuccessId(null);
    try {
      await sendPdfEmail(
        resource.customerEmail,
        resource.customerName || 'Condutor',
        resource.documentContent,
        `Seu Recurso de Trânsito - ${resource.ticketPlate || 'AutoRecurso'}`
      );
      setResendSuccessId(resource.id);
      setTimeout(() => setResendSuccessId(null), 5000);
    } catch (err) {
      console.error('Erro ao reenviar PDF:', err);
      alert('Não foi possível reenviar o e-mail no momento. Tente novamente.');
    } finally {
      setResendingId(null);
    }
  };

  useEffect(() => {
    const checkQueryParams = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const recoverParam = urlParams.get('recover');
      const emailParam = urlParams.get('email');
      const cpfParam = urlParams.get('cpf');

      if (recoverParam === 'true' || emailParam || cpfParam) {
        setShowRecoveryModal(true);
        const targetQuery = emailParam || cpfParam || '';
        if (targetQuery) {
          setRecoveryQuery(targetQuery);
          handleSearchRecovery(targetQuery);
        }
      }

      if (urlParams.get('success') === 'true') {
        const savedStep = localStorage.getItem('appStep');
        if (savedStep === AppStep.PAYMENT) {
          handleVerifyPayment();
        }
      }
    };
    checkQueryParams();
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

      // Enviar PDF por email
      try {
        await sendPdfEmail(
          currentPersonalData.email,
          currentPersonalData.fullName,
          doc,
          `Seu Recurso de Trânsito - ${currentTicketInfo.vehiclePlate}`
        );
        console.log('PDF email sent successfully to:', currentPersonalData.email);
      } catch (pdfEmailError) {
        console.error('Failed to send PDF email:', pdfEmailError);
        // Don't fail the entire flow if PDF email fails
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

  // Show Privacy Policy page if requested
  if (showPrivacy) {
    return <PrivacyPolicy onBack={() => setShowPrivacy(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-6 px-4">
      {/* Header Premium */}
      <header className="w-full max-w-4xl flex flex-wrap justify-between items-center gap-4 mb-8 no-print">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setStep(AppStep.START)}>
          <div className="bg-blue-600 p-2 rounded-lg">
            <Scale className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter">AUTO <span className="text-blue-600">RECURSO</span></h1>
          {isDevMode && (
            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-black rounded-lg animate-pulse">
              ⚡ MODO DEV ATIVO
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowRecoveryModal(true);
              setRecoveryMessage(null);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-xl text-xs md:text-sm font-bold border border-slate-200 hover:border-blue-200 shadow-sm transition-all group"
            title="Acesse o recurso que você já gerou e pagou"
          >
            <Search className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
            <span>Já pagou? <strong className="text-blue-600 font-black">Recuperar Recurso</strong></span>
          </button>
          <div className="hidden lg:flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">
            <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-green-500" /> 100% Seguro</span>
            <span className="flex items-center gap-1"><Zap className="w-4 h-4 text-yellow-500" /> IA Especialista</span>
          </div>
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
            <div className="p-8 md:p-12 animate-fadeIn">
              {/* Hero Section */}
              <div className="text-center mb-10">
                <span className="inline-block px-4 py-1.5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-600 rounded-full text-xs font-black uppercase tracking-widest mb-6 border border-blue-200/50">
                  ✨ Inteligência Artificial Jurídica
                </span>
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 leading-tight">
                  Anule sua multa em <span className="text-blue-600">3 passos.</span>
                </h2>
                <p className="text-slate-500 text-lg max-w-xl mx-auto">
                  Nossa IA analisa o CTB em tempo real e gera defesas com mais de 90% de precisão técnica.
                </p>
              </div>

              {/* How To Steps */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {[
                  { num: '1', icon: <Camera className="w-8 h-8" />, title: 'Envie a Multa', desc: 'Fotografe o auto de infração ou a notificação. Quanto mais legível, melhor a análise.' },
                  { num: '2', icon: <Scale className="w-8 h-8" />, title: 'Escolha a Tese', desc: 'A IA identifica falhas e sugere teses de defesa. Você escolhe a que mais faz sentido.' },
                  { num: '3', icon: <FileText className="w-8 h-8" />, title: 'Receba o Recurso', desc: 'Seu recurso é gerado em Markdown pronto para imprimir ou enviar ao DETRAN.' }
                ].map((s, i) => (
                  <div key={i} className="relative bg-gradient-to-br from-slate-50 to-white p-6 rounded-2xl border border-slate-100 hover:shadow-lg transition-shadow group">
                    <div className="absolute -top-3 -left-3 w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-sm shadow-lg">
                      {s.num}
                    </div>
                    <div className="flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl mb-4 text-blue-600 group-hover:bg-blue-100 transition-colors">
                      {s.icon}
                    </div>
                    <h4 className="font-black text-slate-900 text-lg mb-2">{s.title}</h4>
                    <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>

              {/* Value Props */}
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 md:p-8 mb-10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  {[
                    { val: '15 seg', label: 'Análise da Multa' },
                    { val: '+1.2k', label: 'Recursos Gerados' },
                    { val: '90%', label: 'Precisão Jurídica' },
                    { val: '24/7', label: 'Disponibilidade' }
                  ].map((m, i) => (
                    <div key={i}>
                      <p className="text-2xl md:text-3xl font-black text-white">{m.val}</p>
                      <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA Button */}
              <label className="relative inline-flex items-center justify-center gap-3 px-10 py-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-black text-xl shadow-2xl hover:from-blue-700 hover:to-blue-800 transition-all cursor-pointer transform hover:-translate-y-1 active:scale-95 w-full group overflow-hidden">
                <span className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></span>
                <Upload className="w-6 h-6" />
                ENVIAR FOTO DA MULTA
                <input type='file' className="hidden" accept="image/*" onChange={handleFileUpload} />
              </label>

              {/* Dev Mode Shortcut */}
              {isDevMode && (
                <button
                  type="button"
                  onClick={handleLoadSampleTicket}
                  className="mt-3 inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-2xl font-black text-xs transition-all w-full shadow-sm active:scale-95"
                >
                  ⚡ CARREGAR MULTA DE TESTE (MODO DEV)
                </button>
              )}

              {/* Recovery CTA on Start Screen */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowRecoveryModal(true);
                    setRecoveryMessage(null);
                  }}
                  className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors py-2 px-4 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-100"
                >
                  <Search className="w-4 h-4 text-blue-500" />
                  <span>Já realizou o pagamento? <span className="underline text-blue-600 font-extrabold">Clique aqui para recuperar seu documento</span></span>
                </button>
              </div>


              {/* Trust Badges */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 font-bold uppercase tracking-widest">
                <span className="flex items-center gap-2"><Lock className="w-4 h-4 text-green-500" /> Dados Criptografados</span>
                <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-500" /> LGPD Compliant</span>
              </div>
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

                <div className="pt-4 space-y-3">
                  <label className="flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-400 transition-all cursor-pointer">
                    {isCnhProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ScanLine className="w-5 h-5" /> Importar dados da CNH</>}
                    <input type="file" className="hidden" accept="image/*" onChange={handleCNHUpload} />
                  </label>

                  {isDevMode && (
                    <button
                      type="button"
                      onClick={handleFillSampleUserData}
                      className="w-full py-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                      ⚡ PREENCHER DADOS DE TESTE (MODO DEV)
                    </button>
                  )}
                </div>
              </div>

              <button
                disabled={!isFormValid || isProcessing}
                onClick={() => {
                  if (!isFormValid) return;
                  if (isDevMode) {
                    // Dev mode: skip payment, go straight to generating
                    handleGenerateDocument();
                  } else {
                    setStep(AppStep.PAYMENT);
                  }
                  window.scrollTo(0, 0);
                }}
                className={`w-full py-5 ${isDevMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-2xl font-black text-lg shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50`}
              >
                {isDevMode ? '⚡ GERAR RECURSO AGORA (MODO DEV - PULAR PAGAMENTO)' : 'PROSSEGUIR PARA PAGAMENTO'}
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          )}


          {step === AppStep.PAYMENT && (
            <div className="p-8 md:p-12 animate-slideIn">
              <div className="text-center mb-10">
                <span className="inline-block px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase tracking-widest mb-4">
                  Última Etapa
                </span>
                <h2 className="text-3xl font-black text-slate-900 mb-2">Revisão do seu Recurso</h2>
                <p className="text-slate-500 font-medium">Confira os detalhes antes de gerar o documento oficial.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                <div className="space-y-6">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <FileText className="w-4 h-4" /> Resumo do Pedido
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Serviço:</span>
                        <span className="text-slate-900 font-bold">Recurso de Multa IA</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Placa:</span>
                        <span className="text-slate-900 font-bold">{ticketInfo?.vehiclePlate}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Estratégia:</span>
                        <span className="text-slate-900 font-bold truncate max-w-[150px]">
                          {ticketInfo?.strategies.find(s => s.id === selectedStrategy)?.title}
                        </span>
                      </div>
                      <div className="h-px bg-slate-200 my-2" />
                      <div className="flex justify-between items-center text-lg">
                        <span className="text-slate-900 font-black">Total:</span>
                        <span className="text-blue-600 font-black text-2xl">
                          {adminSettings.isFreeGenerationEnabled && adminSettings.freeGenerationsUsed < adminSettings.freeGenerationLimit ? "GRÁTIS" : "R$ 24,90"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
                      <ShieldCheck className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-bold text-green-800 font-medium">Garantia de conformidade com o CTB</span>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <Zap className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-bold text-blue-800 font-medium">Emissão instantânea após pagamento</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-2xl flex flex-col justify-between">
                  <div>
                    <h3 className="text-xl font-black mb-4 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-blue-400" /> Checkout Seguro
                    </h3>
                    <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                      Seu pagamento será processado de forma segura via PIX. O documento será enviado para: <br />
                      <span className="text-white font-bold">{personalData.email}</span>
                    </p>
                  </div>

                  <div className="space-y-4">
                    {adminSettings.isFreeGenerationEnabled && adminSettings.freeGenerationsUsed < adminSettings.freeGenerationLimit ? (
                      <button
                        disabled={isProcessing}
                        onClick={async () => {
                          setIsProcessing(true);
                          setError(null);
                          try {
                            logEvent('payment_completed', {
                              customerName: personalData.fullName,
                              customerEmail: personalData.email,
                              amount: 0,
                              isFree: true
                            });
                            // Uso grátis é controlado no servidor
                            await handleGenerateDocument();
                          } catch (err: any) {
                            setError(err.message || "Erro ao gerar recurso grátis");
                            setIsProcessing(false);
                          }
                        }}
                        className="w-full py-5 bg-white text-slate-900 rounded-2xl font-black text-lg hover:bg-slate-100 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                      >
                        {isProcessing ? <Loader2 className="w-6 h-6 animate-spin text-blue-600" /> : "GERAR RECURSO GRÁTIS"}
                      </button>
                    ) : (
                      <button
                        disabled={isProcessing}
                        onClick={async () => {
                          setIsProcessing(true);
                          setError(null);
                          try {
                            localStorage.setItem('appStep', AppStep.PAYMENT);
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

                            const { url } = await redirectToKiwifyCheckout(personalData);
                            
                            // Send recovery email automatically in background
                            fetch('/auto-api/email/checkout', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                email: personalData.email,
                                name: personalData.fullName,
                                checkoutUrl: url
                              })
                            }).catch(console.error);

                            window.open(url, '_blank');
                            setIsProcessing(false);
                          } catch (err: any) {
                            logEvent('payment_failed', {
                              customerEmail: personalData.email,
                              errorMessage: err.message || "Erro ao iniciar pagamento"
                            });
                            setError(err.message || "Erro ao iniciar pagamento");
                            setIsProcessing(false);
                          }
                        }}
                        className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                      >
                        {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : "PAGAR AGORA"}
                      </button>
                    )}

                    {/* Dev Mode Instant Generator */}
                    {isDevMode && (
                      <button
                        disabled={isProcessing}
                        onClick={handleGenerateDocument}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 mb-3 active:scale-95"
                      >
                        ⚡ GERAR RECURSO AGORA (MODO DEV - PULAR PAGAMENTO)
                      </button>
                    )}

                    <button
                      disabled={isProcessing}
                      onClick={handleVerifyPayment}
                      className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-1"
                    >
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : "JÁ FIZ O PAGAMENTO / VERIFICAR AGORA"}
                    </button>

                    <button
                      onClick={() => setStep(AppStep.USER_DATA)}
                      className="w-full py-2 text-slate-400 font-bold text-xs hover:text-white transition-colors"
                    >
                      ALTERAR DADOS DE CADASTRO
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl flex items-center gap-3 mb-6">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-bold">{error}</p>
                </div>
              )}

              <div className="flex justify-center items-center gap-8 opacity-50 grayscale transition-all hover:grayscale-0">
                <img src="https://img.icons8.com/color/48/000000/pix.png" alt="PIX" className="h-6" />
                <div className="flex items-center gap-1 font-black text-slate-400 text-[10px] tracking-widest uppercase">
                  <ShieldCheck className="w-4 h-4" /> Pagamento Seguro
                </div>
                <div className="font-black text-slate-400 text-[10px] tracking-widest uppercase">
                  Kiwify
                </div>
              </div>
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
                  <button 
                    onClick={async () => {
                      try {
                        const res = await fetch('/auto-api/generate/docx', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            content: finalDocument,
                            personalData,
                            ticketInfo
                          })
                        });
                        if (!res.ok) throw new Error('Erro ao gerar DOCX');
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `Recurso_${ticketInfo?.vehiclePlate || 'AutoRecurso'}.docx`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                      } catch (err) {
                        console.error('Erro ao baixar DOCX:', err);
                        alert('Erro ao gerar o documento. Tente novamente.');
                      }
                    }} 
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black flex items-center gap-2 hover:bg-blue-700 transition-all"
                  >
                    <Download className="w-5 h-5" /> BAIXAR DOCX
                  </button>
                  <button onClick={() => window.print()} className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-black flex items-center gap-2 hover:bg-slate-300 transition-all">
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
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch('/auto-api/generate/docx', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          content: finalDocument,
                          personalData,
                          ticketInfo
                        })
                      });
                      if (!res.ok) throw new Error('Erro ao gerar DOCX');
                      const blob = await res.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `Recurso_${ticketInfo?.vehiclePlate || 'AutoRecurso'}.docx`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(url);
                    } catch (err) {
                      console.error('Erro ao baixar DOCX:', err);
                      alert('Erro ao gerar o documento. Tente novamente.');
                    }
                  }}
                  className="py-4 bg-blue-600 text-white rounded-xl font-black shadow-lg flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" /> BAIXAR DOCX
                </button>
              </div>
            </div>
          )}
        </div>
      </main >

      <footer className="mt-12 text-center text-slate-400 text-xs max-w-lg no-print">
        <p className="mb-4">© 2026 AUTO RECURSO - Inteligência Artificial para Condutores.</p>
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

      {/* Modal de Recuperação de Recurso */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full p-6 md:p-8 animate-slideIn relative max-h-[90vh] overflow-y-auto">
            {/* Fechar modal */}
            <button
              onClick={() => {
                setShowRecoveryModal(false);
                setRecoveryResults(null);
                setRecoveryMessage(null);
              }}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Cabeçalho */}
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-50 text-blue-600 p-3 rounded-2xl">
                <FileCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">Recuperar Meu Recurso</h3>
                <p className="text-xs text-slate-500">Localize seu recurso já pago por E-mail, CPF ou Placa</p>
              </div>
            </div>

            {/* Formulário de Busca */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchRecovery();
              }}
              className="mt-6 mb-6"
            >
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                E-mail, CPF ou Placa do Veículo
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={recoveryQuery}
                    onChange={(e) => setRecoveryQuery(e.target.value)}
                    placeholder="Ex: joao@email.com, 123.456.789-00 ou ABC1D23"
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isRecovering || !recoveryQuery.trim()}
                  className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                >
                  {isRecovering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Buscando...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>Buscar</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Mensagem de Erro / Informação */}
            {recoveryMessage && (
              <div className="p-4 mb-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3 animate-fadeIn">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{recoveryMessage}</p>
                  <p className="text-xs text-amber-700 mt-1">
                    💡 Dica: Se o pagamento foi realizado via PIX ou cartão há menos de 1 minuto, aguarde alguns instantes para a compensação e tente novamente.
                  </p>
                </div>
              </div>
            )}

            {/* Resultados Encontrados */}
            {recoveryResults && recoveryResults.length > 0 && (
              <div className="space-y-4 mb-6">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  {recoveryResults.length} recurso(s) encontrado(s):
                </h4>
                {recoveryResults.map((item: any) => (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-blue-300 hover:shadow-md transition-all space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-black rounded-lg">
                          🚗 {item.ticketPlate || 'PLACA N/D'}
                        </span>
                        {item.ticketArticle && (
                          <span className="px-2.5 py-1 bg-slate-200 text-slate-800 text-xs font-bold rounded-lg">
                            Art. {item.ticketArticle}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {item.generatedAt ? new Date(item.generatedAt).toLocaleString('pt-BR') : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                      <div>
                        <strong className="text-slate-800">Condutor / Requerente:</strong> {item.customerName || 'Não informado'}
                      </div>
                      <div>
                        <strong className="text-slate-800">E-mail:</strong> {item.customerEmail || 'Não informado'}
                      </div>
                      {item.ticketLocation && (
                        <div className="sm:col-span-2">
                          <strong className="text-slate-800">Local:</strong> {item.ticketLocation}
                        </div>
                      )}
                    </div>

                    {/* Ações para o recurso */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                      <button
                        onClick={() => handleOpenRecoveredDocument(item)}
                        className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                        title="Abrir recurso no visualizador para leitura e impressão"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Visualizar</span>
                      </button>

                      <button
                        onClick={() => handleDownloadDocxDirect(item)}
                        className="w-full py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                        title="Baixar arquivo DOCX formatado para Word"
                      >
                        <Download className="w-4 h-4 text-slate-600" />
                        <span>Baixar DOCX</span>
                      </button>

                      <button
                        onClick={() => handleResendPdfEmail(item)}
                        disabled={resendingId === item.id}
                        className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm border ${
                          resendSuccessId === item.id
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                        title="Enviar cópia em PDF para o e-mail do condutor"
                      >
                        {resendingId === item.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                            <span>Enviando...</span>
                          </>
                        ) : resendSuccessId === item.id ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-600" />
                            <span>PDF Enviado!</span>
                          </>
                        ) : (
                          <>
                            <Mail className="w-4 h-4 text-slate-600" />
                            <span>Enviar PDF</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Rodapé informativo */}
            <div className="mt-4 pt-4 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-400">
                🔒 Seus dados estão protegidos sob a LGPD e criptografia de ponta a ponta.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full max-w-3xl mt-12 text-center text-xs text-slate-400 no-print">
        <p>© 2026 AutoRecurso. Todos os direitos reservados.</p>
        <button
          onClick={() => setShowPrivacy(true)}
          className="mt-2 underline hover:text-blue-600 transition-colors"
        >
          Política de Privacidade
        </button>
      </footer>
    </div>
  );
};

export default App;
