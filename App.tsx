
import React, { useState, useEffect } from 'react';
import { analyzeTicketImage, generateFinalAppeal, analyzeCNHImage } from './services/geminiService';
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
    address: ''
  });
  const [finalDocument, setFinalDocument] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCnhProcessing, setIsCnhProcessing] = useState<boolean>(false);
  const [isPaying, setIsPaying] = useState<boolean>(false);

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

  const simulatePayment = () => {
    setIsPaying(true);
    setTimeout(() => {
      setIsPaying(false);
      handleGenerateDocument();
    }, 2500);
  };

  const handleGenerateDocument = async () => {
    if (!ticketInfo || !selectedStrategy) return;
    setIsProcessing(true);
    setStep(AppStep.GENERATING);
    try {
      const doc = await generateFinalAppeal(ticketInfo, selectedStrategy, userReason, personalData);
      setFinalDocument(doc);
      setStep(AppStep.FINAL_DOCUMENT);
    } catch (err) {
      setError("Erro ao gerar recurso.");
      setStep(AppStep.USER_DATA);
    } finally {
      setIsProcessing(false);
    }
  };

  const isFormValid = personalData.fullName && personalData.cpf && personalData.rg && personalData.cnh && personalData.address;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-6 px-4">
      {/* Header Premium */}
      <header className="w-full max-w-4xl flex justify-between items-center mb-8 no-print">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Scale className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter">RECORRE<span className="text-blue-600">AI</span></h1>
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
            style={{ width: `${(Object.values(AppStep).indexOf(step) + 1) * 12.5}%` }}
          />
        </div>

        <div className={`bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden ${step === AppStep.FINAL_DOCUMENT ? 'print:shadow-none print:border-none' : ''}`}>

          {step === AppStep.START && (
            <div className="p-8 md:p-12 text-center animate-fadeIn">
              <span className="inline-block px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase tracking-widest mb-6">
                Tecnologia Jurídica 2024
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
              </div>

              {/* TELA DE CHECKOUT SIMULADA */}
              <div className="bg-blue-900 text-white p-6 rounded-2xl mb-8">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-blue-300 text-xs font-black uppercase tracking-widest">Valor do Serviço</p>
                    <p className="text-3xl font-black">R$ 47,90</p>
                  </div>
                  <ShieldCheck className="w-12 h-12 text-blue-400 opacity-50" />
                </div>
                <p className="text-blue-200 text-xs leading-relaxed mb-6">Pague uma única vez e tenha acesso ao recurso completo, pronto para imprimir e ganhar a causa.</p>
                <button
                  disabled={!isFormValid || isPaying}
                  onClick={simulatePayment}
                  className="w-full py-4 bg-white text-blue-900 rounded-xl font-black text-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-3"
                >
                  {isPaying ? <Loader2 className="w-6 h-6 animate-spin" /> : <><CreditCard className="w-6 h-6" /> GERAR RECURSO AGORA</>}
                </button>
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
        <p className="mb-4">© 2024 RECORREAI - Inteligência Artificial para Condutores.</p>
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
