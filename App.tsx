
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
  ScanLine
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

  // Helper to clean up AI garbage text
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
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const data = await analyzeTicketImage(base64);
          setTicketInfo(data);
          setStep(AppStep.STRATEGY_SELECTION);
        } catch (err) {
          setError("Falha ao analisar a imagem. Tente uma foto mais clara da multa.");
          setStep(AppStep.START);
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Erro ao ler o arquivo.");
      setIsProcessing(false);
      setStep(AppStep.START);
    }
  };

  const handleCnhUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsCnhProcessing(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const extracted = await analyzeCNHImage(base64);
          setPersonalData(prev => ({
            ...prev,
            fullName: cleanData(extracted.fullName) || prev.fullName,
            cpf: cleanData(extracted.cpf) || prev.cpf,
            rg: cleanData(extracted.rg) || prev.rg,
            cnh: cleanData(extracted.cnh) || prev.cnh,
            address: cleanData(extracted.address) || prev.address,
          }));
        } catch (err) {
          setError("Falha ao analisar a CNH. Tente preencher manualmente.");
        } finally {
          setIsCnhProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Erro ao processar imagem da CNH.");
      setIsCnhProcessing(false);
    }
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
      setError("Não foi possível gerar o recurso final.");
      setStep(AppStep.USER_DATA);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setStep(AppStep.START);
    setTicketInfo(null);
    setSelectedStrategy(null);
    setUserReason('');
    setPersonalData({ fullName: '', cpf: '', rg: '', cnh: '', address: '' });
    setFinalDocument('');
    setError(null);
  };

  const isFormValid = personalData.fullName && personalData.cpf && personalData.rg && personalData.cnh && personalData.address;

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
      <header className="w-full text-center mb-8">
        <div className="flex justify-center items-center gap-2 mb-2">
          <Scale className="w-10 h-10 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">RecorreAI</h1>
        </div>
        <p className="text-slate-600 italic">Soluções jurídicas inteligentes para condutores.</p>
      </header>

      <main className="w-full bg-white rounded-3xl shadow-2xl p-6 md:p-10 border border-slate-100 min-h-[500px] flex flex-col relative overflow-hidden">
        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 flex items-start gap-3 rounded-lg animate-fadeIn">
            <AlertCircle className="text-red-500 w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Step: START */}
        {step === AppStep.START && (
          <div className="flex flex-col items-center justify-center flex-grow text-center animate-fadeIn">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-8 rounded-full mb-8 shadow-inner">
              <Camera className="w-16 h-16 text-blue-600" />
            </div>
            <h2 className="text-3xl font-extrabold mb-4 text-slate-800">Recorra sua multa com IA</h2>
            <p className="text-slate-600 mb-10 max-w-md text-lg">
              Analise erros formais e gere um recurso jurídico completo em segundos. Basta fotografar seu auto de infração.
            </p>
            
            <label className="w-full max-w-sm flex flex-col items-center px-6 py-8 bg-blue-600 text-white rounded-2xl shadow-xl hover:shadow-2xl hover:bg-blue-700 transition-all cursor-pointer transform active:scale-95 group">
              <Upload className="w-10 h-10 mb-2 group-hover:bounce" />
              <span className="text-xl font-bold">Enviar Foto da Multa</span>
              <input type='file' className="hidden" accept="image/*" onChange={handleFileUpload} />
            </label>
            <div className="mt-8 grid grid-cols-3 gap-4 text-slate-400 text-xs font-medium uppercase tracking-widest">
              <div className="flex flex-col items-center"><CheckCircle2 className="w-5 h-5 mb-1 text-green-500"/> Análise</div>
              <div className="flex flex-col items-center"><CheckCircle2 className="w-5 h-5 mb-1 text-green-500"/> Estratégia</div>
              <div className="flex flex-col items-center"><CheckCircle2 className="w-5 h-5 mb-1 text-green-500"/> Recurso</div>
            </div>
          </div>
        )}

        {/* Step: ANALYZING / GENERATING */}
        {(step === AppStep.ANALYZING || step === AppStep.GENERATING) && (
          <div className="flex flex-col items-center justify-center flex-grow">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-200 rounded-full blur-xl opacity-20 animate-pulse"></div>
              <Loader2 className="w-20 h-20 text-blue-600 animate-spin relative z-10" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mt-8 text-center">
              {step === AppStep.ANALYZING ? "Extraindo dados da multa..." : "Redigindo documento jurídico..."}
            </h3>
            <p className="text-slate-500 mt-2 italic">Aguarde, estamos processando os fundamentos legais.</p>
          </div>
        )}

        {/* Step: STRATEGY_SELECTION */}
        {step === AppStep.STRATEGY_SELECTION && ticketInfo && (
          <div className="animate-slideIn">
            <button onClick={() => setStep(AppStep.START)} className="flex items-center text-slate-500 hover:text-blue-600 mb-6 text-sm font-bold transition-colors">
              <ArrowLeft className="w-4 h-4 mr-1" /> VOLTAR
            </button>
            <h2 className="text-2xl font-black mb-6 text-slate-900">Dados Identificados</h2>
            <div className="bg-slate-50 rounded-2xl p-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-6 border border-slate-200 shadow-sm">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Tipo de Infração</p>
                <p className="font-bold text-slate-800">{ticketInfo.violationType}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Enquadramento (CTB)</p>
                <p className="font-bold text-slate-800">Artigo {ticketInfo.article}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Local e Data</p>
                <p className="font-bold text-slate-800">{ticketInfo.date} • {ticketInfo.location}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Órgão / Placa</p>
                <p className="font-bold text-slate-800 uppercase">{ticketInfo.authority} • {ticketInfo.vehiclePlate}</p>
              </div>
            </div>

            <h3 className="text-xl font-bold mb-4 text-slate-800">Selecione a Tese de Defesa:</h3>
            <div className="space-y-4 mb-10">
              {ticketInfo.strategies.map((s) => (
                <div 
                  key={s.id}
                  onClick={() => setSelectedStrategy(s.id)}
                  className={`cursor-pointer p-5 rounded-2xl border-2 transition-all ${
                    selectedStrategy === s.id 
                    ? 'border-blue-600 bg-blue-50 shadow-md transform scale-[1.02]' 
                    : 'border-slate-100 hover:border-blue-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${selectedStrategy === s.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>
                      {selectedStrategy === s.id && <CheckCircle2 className="w-4 h-4" />}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900">{s.title}</h4>
                      <p className="text-sm text-slate-600 mt-1 leading-relaxed">{s.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button 
              disabled={!selectedStrategy}
              onClick={() => setStep(AppStep.USER_INPUT)}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xl disabled:opacity-50 hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2 transition-all"
            >
              PRÓXIMO PASSO <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* Step: USER_INPUT (Fatos) */}
        {step === AppStep.USER_INPUT && (
          <div className="animate-slideIn">
             <button onClick={() => setStep(AppStep.STRATEGY_SELECTION)} className="flex items-center text-slate-500 hover:text-blue-600 mb-6 text-sm font-bold transition-colors">
              <ArrowLeft className="w-4 h-4 mr-1" /> VOLTAR
            </button>
            <h2 className="text-2xl font-black mb-4 text-slate-900">Sua Versão dos Fatos</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Explique detalhadamente o ocorrido. Mencione falta de sinalização, urgências ou erros visíveis no local. Quanto mais detalhes, mais forte o recurso.
            </p>
            <textarea
              value={userReason}
              onChange={(e) => setUserReason(e.target.value)}
              placeholder="Ex: No dia do ocorrido, a placa de sinalização estava obstruída por galhos de árvore, impedindo a visualização da velocidade máxima permitida..."
              className="w-full h-56 p-5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all resize-none mb-8 bg-slate-50 text-slate-700 font-medium leading-relaxed shadow-inner"
            />
            <button 
              onClick={() => setStep(AppStep.USER_DATA)}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xl hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2 transition-all"
            >
              DADOS PARA O DOCUMENTO <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* Step: USER_DATA (Dados Pessoais) */}
        {step === AppStep.USER_DATA && (
          <div className="animate-slideIn">
            <button onClick={() => setStep(AppStep.USER_INPUT)} className="flex items-center text-slate-500 hover:text-blue-600 mb-6 text-sm font-bold transition-colors">
              <ArrowLeft className="w-4 h-4 mr-1" /> VOLTAR
            </button>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <h2 className="text-2xl font-black text-slate-900">Dados do Requerente</h2>
              
              <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all ${isCnhProcessing ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                {isCnhProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                {isCnhProcessing ? 'Lendo CNH...' : 'Escanear CNH'}
                <input type="file" className="hidden" accept="image/*" onChange={handleCnhUpload} disabled={isCnhProcessing} />
              </label>
            </div>
            
            <p className="text-slate-600 mb-8">
              Precisamos destes dados para o cabeçalho jurídico. Preencha manualmente ou suba uma foto da CNH para preenchimento automático.
            </p>
            
            <div className="space-y-5 mb-10">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder="Nome Completo" 
                  value={personalData.fullName}
                  onChange={(e) => setPersonalData({...personalData, fullName: e.target.value})}
                  className="w-full pl-12 pr-4 py-4 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none transition-all bg-slate-50 font-bold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="CPF" 
                    value={personalData.cpf}
                    onChange={(e) => setPersonalData({...personalData, cpf: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none transition-all bg-slate-50 font-bold"
                  />
                </div>
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="RG" 
                    value={personalData.rg}
                    onChange={(e) => setPersonalData({...personalData, rg: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none transition-all bg-slate-50 font-bold"
                  />
                </div>
              </div>

              <div className="relative">
                <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder="Número da CNH" 
                  value={personalData.cnh}
                  onChange={(e) => setPersonalData({...personalData, cnh: e.target.value})}
                  className="w-full pl-12 pr-4 py-4 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none transition-all bg-slate-50 font-bold"
                />
              </div>

              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder="Endereço Completo" 
                  value={personalData.address}
                  onChange={(e) => setPersonalData({...personalData, address: e.target.value})}
                  className="w-full pl-12 pr-4 py-4 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none transition-all bg-slate-50 font-bold"
                />
              </div>
            </div>

            <button 
              disabled={!isFormValid || isProcessing}
              onClick={handleGenerateDocument}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xl hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              FINALIZAR RECURSO <FileText className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* Step: FINAL_DOCUMENT */}
        {step === AppStep.FINAL_DOCUMENT && (
          <div className="animate-slideIn">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
               <div>
                 <h2 className="text-3xl font-black text-slate-900">Recurso Pronto!</h2>
                 <p className="text-slate-500">Documento gerado com fundamentação jurídica.</p>
               </div>
               <div className="flex gap-2">
                 <button onClick={() => {
                    navigator.clipboard.writeText(finalDocument);
                    alert("Copiado!");
                 }} className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-blue-100 hover:text-blue-600 transition-all flex items-center gap-2 font-bold" title="Copiar">
                   <Copy className="w-5 h-5" /> Copiar
                 </button>
               </div>
            </div>
            
            <div className="bg-white p-8 rounded-2xl border-2 border-slate-100 font-serif text-slate-800 whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto mb-10 shadow-inner text-sm md:text-base selection:bg-blue-100">
              {finalDocument}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <button 
                onClick={reset}
                className="w-full py-5 bg-slate-100 text-slate-700 rounded-2xl font-black hover:bg-slate-200 transition-all"
              >
                NOVO RECURSO
              </button>
              <button 
                onClick={() => window.print()}
                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xl hover:bg-blue-700 shadow-xl flex items-center justify-center gap-2 transition-all"
              >
                SALVAR EM PDF <Download className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mt-8 p-4 bg-yellow-50 rounded-xl border border-yellow-100 flex gap-3 items-center">
              <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
              <p className="text-xs text-yellow-800 font-medium italic">
                Atenção: Revise todo o texto, imprima em duas vias e protocole no órgão autuador dentro do prazo legal indicado na notificação.
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-12 text-center text-slate-400 text-xs px-4">
        <p className="font-bold tracking-widest uppercase mb-2">RecorreAI © 2024</p>
        <p className="max-w-md mx-auto leading-relaxed">
          Esta ferramenta utiliza inteligência artificial avançada para auxiliar na cidadania. O conteúdo gerado é uma sugestão de fundamentação baseada no CTB e não constitui consulta jurídica formal.
        </p>
      </footer>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.6s ease-out; }
        .animate-slideIn { animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .group:hover .group-hover\:bounce { animation: bounce 1s infinite; }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @media print {
          header, footer, button, .no-print { display: none !important; }
          main { shadow: none !important; border: none !important; p: 0 !important; }
          .bg-white { background: white !important; }
        }
      `}</style>
    </div>
  );
};

export default App;
