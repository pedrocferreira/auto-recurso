import React, { useState, useEffect } from 'react';
import { getEvents, getStats, getAbandonedCarts, clearAllData, AnalyticsEvent, getCustomers, getResources, CustomerRecord, ResourceRecord, getAdminSettings, updateAdminSettings, AdminSettings } from './services/analyticsService';
import { sendResourceEmail, sendCartRecoveryEmail } from './services/emailService';
import ReactMarkdown from 'react-markdown';
import {
    TrendingUp,
    DollarSign,
    AlertCircle,
    ShoppingCart,
    Activity,
    LogOut,
    Trash2,
    RefreshCw,
    Users,
    FileText,
    Eye,
    X,
    Mail,
    Send,
    Settings,
    ToggleLeft,
    ToggleRight,
    Zap
} from 'lucide-react';

const ADMIN_PASSWORD = 'admin123';

type TabType = 'overview' | 'customers' | 'resources' | 'logs' | 'abandoned' | 'settings';

const Admin: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [stats, setStats] = useState(getStats());
    const [events, setEvents] = useState<AnalyticsEvent[]>([]);
    const [customers, setCustomers] = useState<CustomerRecord[]>([]);
    const [resources, setResources] = useState<ResourceRecord[]>([]);
    const [abandonedCarts, setAbandonedCarts] = useState(getAbandonedCarts());
    const [filterType, setFilterType] = useState<string>('all');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [selectedResource, setSelectedResource] = useState<ResourceRecord | null>(null);
    const [sendingEmail, setSendingEmail] = useState<string | null>(null);
    const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [adminSettings, setAdminSettings] = useState<AdminSettings>(getAdminSettings());

    useEffect(() => {
        if (isAuthenticated) {
            loadData();
        }
    }, [isAuthenticated]);

    const loadData = () => {
        setStats(getStats());
        setEvents(getEvents().reverse());
        setCustomers(getCustomers().sort((a, b) => b.lastActivity - a.lastActivity));
        setResources(getResources().sort((a, b) => b.generatedAt - a.generatedAt));
        setAbandonedCarts(getAbandonedCarts());
        setAdminSettings(getAdminSettings());
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === ADMIN_PASSWORD) {
            setIsAuthenticated(true);
            setPassword('');
        } else {
            alert('Senha incorreta');
        }
    };

    const handleSendCartRecovery = async (email: string, name: string, plate?: string) => {
        setSendingEmail(email);
        setEmailStatus(null);
        try {
            await sendCartRecoveryEmail(email, name, plate);
            setEmailStatus({ type: 'success', message: 'Email de recuperação enviado com sucesso!' });
            console.log('✅ Cart recovery email sent to:', email);
            setTimeout(() => setEmailStatus(null), 3000);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            console.error('❌ Failed to send cart recovery email:', error);
            setEmailStatus({ type: 'error', message: `Falha: ${errorMessage}` });
            setTimeout(() => setEmailStatus(null), 5000);
        } finally {
            setSendingEmail(null);
        }
    };

    const handleRetryEmail = async (event: AnalyticsEvent) => {
        if (!event.data.customerEmail) return;
        setSendingEmail(event.id);
        setEmailStatus(null);
        try {
            const resource = getResources().find(r => r.customerEmail === event.data.customerEmail);
            if (!resource || !resource.documentContent) {
                const errorMsg = 'Recurso não encontrado no sistema';
                console.error('❌ Resource not found for:', event.data.customerEmail);
                setEmailStatus({ type: 'error', message: errorMsg });
                setTimeout(() => setEmailStatus(null), 5000);
                return;
            }

            console.log('📧 Attempting to resend email to:', event.data.customerEmail);
            await sendResourceEmail(
                event.data.customerEmail,
                event.data.customerName || 'Cliente',
                resource.documentContent,
                event.data.ticketPlate || 'N/A'
            );
            console.log('✅ Email resent successfully to:', event.data.customerEmail);

            // Log success event
            const { logEvent } = await import('./services/analyticsService');
            logEvent('email_sent', {
                customerEmail: event.data.customerEmail,
                customerName: event.data.customerName,
                ticketPlate: event.data.ticketPlate
            });

            setEmailStatus({ type: 'success', message: 'Email reenviado com sucesso!' });
            loadData(); // Refresh logs
            setTimeout(() => setEmailStatus(null), 3000);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            console.error('❌ Failed to resend email:', error);
            console.error('Error details:', {
                email: event.data.customerEmail,
                error: errorMessage,
                fullError: error
            });
            setEmailStatus({ type: 'error', message: `Falha: ${errorMessage}` });
            setTimeout(() => setEmailStatus(null), 5000);
        } finally {
            setSendingEmail(null);
        }
    };

    const handleClearData = () => {
        clearAllData();
        loadData();
        setShowClearConfirm(false);
    };

    const handleUpdateSettings = (updates: Partial<AdminSettings>) => {
        const updated = updateAdminSettings(updates);
        setAdminSettings(updated);
        setEmailStatus({ type: 'success', message: 'Configurações atualizadas!' });
        setTimeout(() => setEmailStatus(null), 3000);
    };

    const filteredEvents = filterType === 'all' ? events : events.filter(e => e.type === filterType);

    const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString('pt-BR');

    const getEventTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            payment_started: 'Pagamento Iniciado',
            payment_completed: 'Pagamento Concluído',
            payment_failed: 'Pagamento Falhou',
            resource_generated: 'Recurso Gerado',
            generation_error: 'Erro na Geração',
            form_abandoned: 'Formulário Abandonado',
            email_failed: 'Falha no Envio de Email',
            email_sent: 'Email Enviado'
        };
        return labels[type] || type;
    };

    const getEventTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            payment_started: 'bg-blue-100 text-blue-800',
            payment_completed: 'bg-green-100 text-green-800',
            payment_failed: 'bg-red-100 text-red-800',
            resource_generated: 'bg-purple-100 text-purple-800',
            generation_error: 'bg-red-100 text-red-800',
            form_abandoned: 'bg-yellow-100 text-yellow-800',
            email_failed: 'bg-orange-100 text-orange-800',
            email_sent: 'bg-green-100 text-green-800'
        };
        return colors[type] || 'bg-gray-100 text-gray-800';
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
                            <Activity className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-2xl font-black text-slate-900">Admin Dashboard</h1>
                        <p className="text-slate-500 text-sm mt-2">Entre para acessar o painel</p>
                    </div>
                    <form onSubmit={handleLogin}>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Senha"
                            className="w-full p-4 border-2 border-slate-200 rounded-xl font-bold mb-4 focus:border-blue-600 outline-none"
                        />
                        <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-all">
                            ENTRAR
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    const tabs = [
        { id: 'overview' as TabType, label: 'Visão Geral', icon: Activity },
        { id: 'customers' as TabType, label: 'Clientes', icon: Users, count: customers.length },
        { id: 'resources' as TabType, label: 'Recursos', icon: FileText, count: resources.length },
        { id: 'logs' as TabType, label: 'Logs', icon: AlertCircle },
        { id: 'abandoned' as TabType, label: 'Abandonos', icon: ShoppingCart, count: abandonedCarts.length },
        { id: 'settings' as TabType, label: 'Configurações', icon: Settings }
    ];

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600 p-2 rounded-lg">
                            <Activity className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-xl font-black text-slate-900">Admin Dashboard</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={loadData} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Atualizar">
                            <RefreshCw className="w-5 h-5 text-slate-600" />
                        </button>
                        <button onClick={() => setIsAuthenticated(false)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                            <LogOut className="w-4 h-4" />
                            <span className="font-bold text-sm">Sair</span>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex gap-2 overflow-x-auto">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-3 font-bold text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                    {tab.count !== undefined && (
                                        <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs">{tab.count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </header>

            {/* Status Notification */}
            {emailStatus && (
                <div className={`fixed top-20 right-4 z-50 px-6 py-4 rounded-xl shadow-lg font-bold text-white ${emailStatus.type === 'success' ? 'bg-green-600' : 'bg-red-600'
                    }`}>
                    {emailStatus.message}
                </div>
            )}

            <main className="max-w-7xl mx-auto p-4 space-y-6">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white rounded-2xl p-6 border border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="bg-purple-100 p-3 rounded-xl">
                                        <TrendingUp className="w-6 h-6 text-purple-600" />
                                    </div>
                                    <span className="text-xs font-bold text-green-600">+{stats.resources24h} hoje</span>
                                </div>
                                <h3 className="text-3xl font-black text-slate-900 mb-1">{stats.totalResources}</h3>
                                <p className="text-sm font-bold text-slate-500">Recursos Gerados</p>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="bg-green-100 p-3 rounded-xl">
                                        <DollarSign className="w-6 h-6 text-green-600" />
                                    </div>
                                    <span className="text-xs font-bold text-green-600">+{stats.payments24h} hoje</span>
                                </div>
                                <h3 className="text-3xl font-black text-slate-900 mb-1">R$ {stats.totalRevenue.toFixed(2)}</h3>
                                <p className="text-sm font-bold text-slate-500">Receita Total</p>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="bg-blue-100 p-3 rounded-xl">
                                        <Users className="w-6 h-6 text-blue-600" />
                                    </div>
                                </div>
                                <h3 className="text-3xl font-black text-slate-900 mb-1">{customers.length}</h3>
                                <p className="text-sm font-bold text-slate-500">Clientes Registrados</p>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="bg-red-100 p-3 rounded-xl">
                                        <AlertCircle className="w-6 h-6 text-red-600" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-500">{stats.successRate}% sucesso</span>
                                </div>
                                <h3 className="text-3xl font-black text-slate-900 mb-1">{stats.totalErrors}</h3>
                                <p className="text-sm font-bold text-slate-500">Erros</p>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="bg-orange-100 p-3 rounded-xl">
                                        <Zap className="w-6 h-6 text-orange-600" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-500">{stats.freeGenerationsUsed} usados</span>
                                </div>
                                <h3 className="text-3xl font-black text-slate-900 mb-1">{stats.freeGenerationLimit}</h3>
                                <p className="text-sm font-bold text-slate-500">Limite Grátis</p>
                            </div>
                        </div>
                    </>
                )}

                {/* Customers Tab */}
                {activeTab === 'customers' && (
                    <div className="bg-white rounded-2xl p-6 border border-slate-100">
                        <h2 className="text-xl font-black text-slate-900 mb-4">Clientes Registrados</h2>
                        {customers.length === 0 ? (
                            <p className="text-center text-slate-400 py-8">Nenhum cliente registrado</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-200">
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Nome</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Email</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">CPF</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Telefone</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Recursos</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Total Pago</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Última Atividade</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {customers.map((customer) => (
                                            <tr key={customer.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-3 px-4 font-bold text-sm">{customer.name}</td>
                                                <td className="py-3 px-4 text-sm">{customer.email}</td>
                                                <td className="py-3 px-4 text-sm">{customer.cpf}</td>
                                                <td className="py-3 px-4 text-sm">{customer.phone}</td>
                                                <td className="py-3 px-4 text-sm">{customer.totalResources}</td>
                                                <td className="py-3 px-4 text-sm">R$ {customer.totalPaid.toFixed(2)}</td>
                                                <td className="py-3 px-4 text-sm text-slate-500">{formatDate(customer.lastActivity)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Resources Tab */}
                {activeTab === 'resources' && (
                    <div className="bg-white rounded-2xl p-6 border border-slate-100">
                        <h2 className="text-xl font-black text-slate-900 mb-4">Recursos Gerados</h2>
                        {resources.length === 0 ? (
                            <p className="text-center text-slate-400 py-8">Nenhum recurso gerado</p>
                        ) : (
                            <div className="space-y-3">
                                {resources.map((resource) => (
                                    <div key={resource.id} className="border border-slate-200 rounded-xl p-4 hover:bg-slate-50">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <h3 className="font-black text-slate-900">{resource.customerName}</h3>
                                                <p className="text-sm text-slate-500">{resource.customerEmail}</p>
                                            </div>
                                            <button
                                                onClick={() => setSelectedResource(resource)}
                                                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold"
                                            >
                                                <Eye className="w-4 h-4" />
                                                Ver Recurso
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                                            <div>
                                                <p className="text-xs text-slate-500">Placa</p>
                                                <p className="font-bold text-sm">{resource.ticketPlate}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Artigo</p>
                                                <p className="font-bold text-sm">{resource.ticketArticle}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Estratégia</p>
                                                <p className="font-bold text-sm">{resource.strategy || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Data</p>
                                                <p className="font-bold text-sm">{formatDate(resource.generatedAt)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Logs Tab */}
                {activeTab === 'logs' && (
                    <div className="bg-white rounded-2xl p-6 border border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-black text-slate-900">Log de Eventos</h2>
                            <div className="flex items-center gap-2">
                                <select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="px-4 py-2 border border-slate-200 rounded-lg font-bold text-sm"
                                >
                                    <option value="all">Todos</option>
                                    <option value="payment_started">Pagamento Iniciado</option>
                                    <option value="payment_completed">Pagamento Concluído</option>
                                    <option value="resource_generated">Recurso Gerado</option>
                                    <option value="generation_error">Erros de Geração</option>
                                    <option value="email_failed">Erros de Email</option>
                                    <option value="form_abandoned">Abandonos</option>
                                </select>
                                <button
                                    onClick={() => setShowClearConfirm(true)}
                                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Limpar Dados"
                                >
                                    <Trash2 className="w-5 h-5 text-red-600" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {filteredEvents.length === 0 ? (
                                <p className="text-center text-slate-400 py-8">Nenhum evento registrado</p>
                            ) : (
                                filteredEvents.map((event) => (
                                    <div key={event.id} className="border border-slate-100 rounded-xl p-4 hover:bg-slate-50">
                                        <div className="flex items-start justify-between mb-2">
                                            <span className={`px-3 py-1 rounded-full text-xs font-black ${getEventTypeColor(event.type)}`}>
                                                {getEventTypeLabel(event.type)}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-400">{formatDate(event.timestamp)}</span>
                                                {(event.type === 'email_failed' || event.type === 'generation_error') && event.data.customerEmail && (
                                                    <button
                                                        onClick={() => handleRetryEmail(event)}
                                                        disabled={sendingEmail === event.id}
                                                        className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                                                    >
                                                        <Mail className="w-3 h-3" />
                                                        {sendingEmail === event.id ? 'Enviando...' : 'Reenviar'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {Object.keys(event.data).length > 0 && (
                                            <div className="text-sm space-y-1 mt-2">
                                                {event.data.customerName && <p><span className="font-bold">Cliente:</span> {event.data.customerName}</p>}
                                                {event.data.customerEmail && <p><span className="font-bold">Email:</span> {event.data.customerEmail}</p>}
                                                {event.data.ticketPlate && <p><span className="font-bold">Placa:</span> {event.data.ticketPlate}</p>}
                                                {event.data.errorMessage && <p className="text-red-600"><span className="font-bold">Erro:</span> {event.data.errorMessage}</p>}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Abandoned Tab */}
                {activeTab === 'abandoned' && (
                    <div className="bg-white rounded-2xl p-6 border border-slate-100">
                        <h2 className="text-xl font-black text-slate-900 mb-4">Recuperação de Carrinho</h2>
                        {abandonedCarts.length === 0 ? (
                            <p className="text-center text-slate-400 py-8">Nenhum carrinho abandonado</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-200">
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Cliente</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Email</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Telefone</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Placa</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Data</th>
                                            <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {abandonedCarts.map((cart, idx) => (
                                            <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-3 px-4 font-bold text-sm">{cart.name || 'N/A'}</td>
                                                <td className="py-3 px-4 text-sm">{cart.email}</td>
                                                <td className="py-3 px-4 text-sm">{cart.phone || 'N/A'}</td>
                                                <td className="py-3 px-4 text-sm">{cart.ticketPlate || 'N/A'}</td>
                                                <td className="py-3 px-4 text-sm text-slate-500">{formatDate(cart.timestamp)}</td>
                                                <td className="py-3 px-4">
                                                    <button
                                                        onClick={() => handleSendCartRecovery(cart.email, cart.name, cart.ticketPlate)}
                                                        disabled={sendingEmail === cart.email}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white rounded text-xs font-bold hover:bg-orange-700 disabled:opacity-50"
                                                    >
                                                        <Send className="w-3 h-3" />
                                                        {sendingEmail === cart.email ? 'Enviando...' : 'Recuperar'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <div className="bg-white rounded-2xl p-6 border border-slate-100 max-w-2xl mx-auto">
                        <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                            <Settings className="w-6 h-6 text-blue-600" />
                            Configurações do Sistema
                        </h2>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                                <div>
                                    <h3 className="font-bold text-slate-900">Geração Grátis</h3>
                                    <p className="text-xs text-slate-500">Permitir que usuários gerem recursos sem pagar</p>
                                </div>
                                <button
                                    onClick={() => handleUpdateSettings({ isFreeGenerationEnabled: !adminSettings.isFreeGenerationEnabled })}
                                    className={`p-1 rounded-full transition-colors ${adminSettings.isFreeGenerationEnabled ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-400'}`}
                                >
                                    {adminSettings.isFreeGenerationEnabled ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
                                </button>
                            </div>

                            <div className="p-4 bg-slate-50 rounded-xl">
                                <h3 className="font-bold text-slate-900 mb-4">Limite de Recursos Grátis</h3>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="number"
                                        value={adminSettings.freeGenerationLimit}
                                        onChange={(e) => handleUpdateSettings({ freeGenerationLimit: parseInt(e.target.value) || 0 })}
                                        className="flex-1 p-3 border border-slate-200 rounded-lg font-bold"
                                        min="0"
                                    />
                                    <div className="text-sm font-bold text-slate-500">
                                        Usados: <span className="text-blue-600">{adminSettings.freeGenerationsUsed}</span> / {adminSettings.freeGenerationLimit}
                                    </div>
                                </div>
                                {adminSettings.isFreeGenerationEnabled && (
                                    <div className="mt-4 w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-600 transition-all"
                                            style={{ width: `${Math.min(100, (adminSettings.freeGenerationsUsed / adminSettings.freeGenerationLimit) * 100)}%` }}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border border-blue-100 bg-blue-50 rounded-xl">
                                <h3 className="font-bold text-blue-900 mb-1">Dica do Admin</h3>
                                <p className="text-sm text-blue-700">O modo grátis é útil para testes ou promoções de lançamento. Quando o limite é atingido, o sistema volta automaticamente para o modo pago.</p>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Resource Viewer Modal */}
            {selectedResource && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-black text-slate-900">Recurso Gerado</h3>
                            <button
                                onClick={() => setSelectedResource(null)}
                                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="mb-4 p-4 bg-slate-50 rounded-xl">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-slate-500">Cliente</p>
                                    <p className="font-bold">{selectedResource.customerName}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Email</p>
                                    <p className="font-bold">{selectedResource.customerEmail}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Placa</p>
                                    <p className="font-bold">{selectedResource.ticketPlate}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Artigo</p>
                                    <p className="font-bold">{selectedResource.ticketArticle}</p>
                                </div>
                            </div>
                        </div>
                        <div className="prose max-w-none">
                            <ReactMarkdown>{selectedResource.documentContent || 'Conteúdo não disponível'}</ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}

            {/* Clear Confirmation Modal */}
            {showClearConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full">
                        <h3 className="text-xl font-black text-slate-900 mb-2">Confirmar Limpeza</h3>
                        <p className="text-slate-600 mb-6">Tem certeza que deseja limpar todos os dados? Esta ação não pode ser desfeita.</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="flex-1 py-3 bg-slate-100 rounded-xl font-black hover:bg-slate-200"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleClearData}
                                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black hover:bg-red-700"
                            >
                                Limpar Tudo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;
