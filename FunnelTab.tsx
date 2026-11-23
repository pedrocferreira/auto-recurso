import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Smartphone, Monitor, ChevronDown, ChevronUp } from 'lucide-react';
import { getFunnel } from './services/analyticsService';

const STEP_LABELS: Record<string, string> = {
    visit: 'Entrou no site', upload: 'Enviou a multa', analysis: 'Viu a análise', strategy: 'Escolheu a tese',
    data: 'Dados pessoais', checkout: 'Pagamento', pay_click: 'Clicou em pagar', paid: 'Pagou', generated: 'Recurso gerado',
};
const STEP_ORDER = Object.keys(STEP_LABELS);
const PERIODS = [{ d: 1, label: 'Hoje' }, { d: 7, label: '7 dias' }, { d: 30, label: '30 dias' }, { d: 90, label: '90 dias' }];

const fmt = (ts: number) => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const ago = (ts: number) => {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60); if (h < 24) return `há ${h} h`;
    return `há ${Math.floor(h / 24)} d`;
};
const badge = (stage: string, free: boolean) => {
    if (stage === 'generated') return free ? 'bg-emerald-100 text-emerald-700' : 'bg-green-100 text-green-700';
    if (stage === 'paid') return 'bg-green-100 text-green-700';
    if (stage === 'pay_click' || stage === 'checkout') return 'bg-amber-100 text-amber-700';
    if (stage === 'visit') return 'bg-slate-100 text-slate-600';
    return 'bg-blue-100 text-blue-700';
};

const FunnelTab: React.FC = () => {
    const [days, setDays] = useState(7);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'ads' | 'contact' | 'paid'>('all');

    const load = useCallback(async () => {
        setLoading(true);
        try { setData(await getFunnel(days)); setError(''); }
        catch (e: any) { setError(e.message || 'Erro'); }
        finally { setLoading(false); }
    }, [days]);

    useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

    if (!data) return <div className="bg-white rounded-2xl border border-slate-200 p-8 text-slate-500 font-bold">{error || 'Carregando funil...'}</div>;

    const max = Math.max(1, ...data.steps.map((s: any) => s.count));
    const visitors = data.visitors.filter((v: any) =>
        filter === 'ads' ? v.source === 'Google Ads' : filter === 'contact' ? !!v.email : filter === 'paid' ? (v.reached.paid || (v.stageIndex >= 7 && !v.free)) : true);
    const online = data.visitors.filter((v: any) => Date.now() - v.lastSeen < 5 * 60000).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
                {PERIODS.map(p => (
                    <button key={p.d} onClick={() => setDays(p.d)}
                        className={`px-4 py-2 rounded-lg font-bold text-sm ${days === p.d ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{p.label}</button>
                ))}
                <button onClick={load} className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-600">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[['Visitantes', data.totalVisitors, 'text-slate-900'], ['Pagaram', data.paid, 'text-green-600'], ['Conversão', `${data.conversionRate}%`, 'text-blue-600'], ['Online agora', online, 'text-amber-600']].map(([l, v, c]: any) => (
                    <div key={l} className="bg-white rounded-2xl border border-slate-200 p-5">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{l}</p>
                        <p className={`text-3xl font-black mt-1 ${c}`}>{v}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-black text-slate-900 mb-4">Funil de conversão</h2>
                <div className="space-y-3">
                    {data.steps.map((s: any, i: number) => (
                        <div key={s.id}>
                            <div className="flex justify-between text-sm font-bold text-slate-700 mb-1">
                                <span>{i + 1}. {s.label}</span>
                                <span>{s.count} <span className="text-slate-400 font-semibold">({s.pctOfVisits}% do total{i > 0 ? ` · ${s.pctOfPrev}% da etapa anterior` : ''})</span></span>
                            </div>
                            <div className="h-5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${s.id === 'paid' || s.id === 'generated' ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${(s.count / max) * 100}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-slate-400 mt-4">Cada pessoa é contada uma vez por etapa (identificador anônimo no navegador). Gerações grátis não entram em "Clicou em pagar" nem "Pagou". Seus acessos como admin não são contados.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-black text-slate-900 mb-4">Origem do tráfego</h2>
                <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500 border-b"><th className="py-2">Origem</th><th>Visitantes</th><th>Pagaram</th><th>Conversão</th></tr></thead>
                    <tbody>{data.bySource.map((s: any) => (
                        <tr key={s.source} className="border-b border-slate-100"><td className="py-2 font-bold">{s.source}</td><td>{s.visitors}</td><td>{s.paid}</td><td>{s.visitors ? Math.round((s.paid / s.visitors) * 1000) / 10 : 0}%</td></tr>
                    ))}</tbody>
                </table></div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-black text-slate-900">Visitantes ({visitors.length})</h2>
                    <div className="flex gap-2 text-xs font-bold">
                        {([['all', 'Todos'], ['ads', 'Google Ads'], ['contact', 'Com contato'], ['paid', 'Pagaram']] as const).map(([k, l]) => (
                            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full ${filter === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>
                        ))}
                    </div>
                </div>
                <div className="space-y-2">
                    {visitors.length === 0 && <p className="text-slate-400 text-sm">Nenhum visitante neste período.</p>}
                    {visitors.map((v: any) => (
                        <div key={v.id} className="border border-slate-200 rounded-xl">
                            <button onClick={() => setOpen(open === v.id ? null : v.id)} className="w-full flex flex-wrap items-center gap-3 p-3 text-left">
                                {v.device === 'mobile' ? <Smartphone className="w-4 h-4 text-slate-400" /> : <Monitor className="w-4 h-4 text-slate-400" />}
                                <span className="font-mono text-xs text-slate-400">#{v.id.slice(0, 6)}</span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-black ${badge(v.stage, v.free)}`}>{STEP_LABELS[v.stage]}{v.free && v.stage === 'generated' ? ' (grátis)' : ''}</span>
                                <span className="text-sm font-bold text-slate-700">{v.name || v.email || '—'}</span>
                                {v.name && v.email && <span className="text-xs text-slate-500">{v.email}</span>}
                                <span className="ml-auto text-xs text-slate-500">{v.source}{v.campaign ? ` · ${v.campaign}` : ''} · {ago(v.lastSeen)}</span>
                                {open === v.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            {open === v.id && (
                                <div className="px-4 pb-4 border-t border-slate-100">
                                    <ol className="mt-3 space-y-1.5">
                                        {STEP_ORDER.filter(id => v.reached[id]).sort((a, b) => v.reached[a] - v.reached[b]).map(id => (
                                            <li key={id} className="flex items-center gap-3 text-sm"><span className="w-2 h-2 rounded-full bg-blue-500" /><span className="font-bold text-slate-700">{STEP_LABELS[id]}</span><span className="text-slate-400 text-xs">{fmt(v.reached[id])}</span></li>
                                        ))}
                                    </ol>
                                    <p className="text-xs text-slate-400 mt-3">Primeira visita: {fmt(v.firstSeen)} · Última atividade: {fmt(v.lastSeen)}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FunnelTab;
