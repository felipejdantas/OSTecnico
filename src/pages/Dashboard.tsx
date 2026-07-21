import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FileText, User, Calendar, Star, PenTool, FileDown, Edit, Copy, Trash2, MessageCircle, Mail, ChevronDown, ChevronUp, AlertTriangle, X, Search } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { WarrantyBadge } from '../components/WarrantyBadge';

import { supabase } from '../lib/supabase';
import { generateOSPDF } from '../lib/pdfGenerator';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { STATUS_STEPS, STATUS_CONFIG, getStatusConfig, changeOrderStatus, type OrderStatus } from '../lib/orderStatus';
import { buildTrackingLink, buildTrackingMessage, openWhatsApp, openEmail, type TrackingMessageContext } from '../lib/shareLinks';
import { PAYMENT_STATUS_CONFIG, type PaymentStatus } from '../lib/orderFinance';
import { elapsedBusinessHours, isBudgetOverdue, BUDGET_SLA_BUSINESS_HOURS } from '../lib/businessHours';

type ServiceOrder = {
    id: string;
    os_number: number;
    created_at: string;
    equipment: string;
    brand: string | null;
    equipment_type: string | null;
    status: OrderStatus;
    payment_status: PaymentStatus;
    completed_date: string | null;
    warranty_days: number | null;
    customers: {
        name: string; phone: string | null; email: string | null;
        cpf: string | null; cnpj: string | null; company_name: string | null; trade_name: string | null;
    } | null;
    technicians: { name: string } | null;
    is_pinned: boolean;
    signature_token: string;
    client_signed_at: string | null;
    budget_approved_at: string | null;
};

type OverdueBudget = { order: ServiceOrder; diagnosisStartedAt: Date; hoursOverdue: number };

export default function Dashboard() {
    const { user } = useAuth();
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isListOpen, setIsListOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'todos' | 'em_andamento' | OrderStatus>('todos');
    const [searchTerm, setSearchTerm] = useState('');
    const [overdueBudgets, setOverdueBudgets] = useState<OverdueBudget[]>([]);
    const [showOverdueAlert, setShowOverdueAlert] = useState(false);
    const navigate = useNavigate();

    const openList = (filter: 'todos' | 'em_andamento' | OrderStatus) => {
        setStatusFilter(filter);
        setIsListOpen(true);
    };

    useEffect(() => {
        if (user) fetchOrders();
    }, [user]);

    // Reveals the list automatically once the shop starts typing a search,
    // so they don't have to click "expand" first to see results.
    useEffect(() => {
        if (searchTerm.trim()) setIsListOpen(true);
    }, [searchTerm]);

    // Flags OS's still "Em Diagnóstico" for longer than the 24-business-hour
    // deadline to send a budget, so the shop sees it the moment it opens the app.
    const checkBudgetDeadlines = async (allOrders: ServiceOrder[]) => {
        const inDiagnosis = allOrders.filter(o => o.status === 'em_diagnostico');
        if (inDiagnosis.length === 0) {
            setOverdueBudgets([]);
            return;
        }

        const { data, error } = await supabase
            .from('status_history')
            .select('service_order_id, created_at')
            .eq('status', 'em_diagnostico')
            .in('service_order_id', inDiagnosis.map(o => o.id))
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error checking budget deadlines:', error);
            return;
        }

        const latestEntryByOrder = new Map<string, string>();
        for (const row of data || []) {
            if (!latestEntryByOrder.has(row.service_order_id)) {
                latestEntryByOrder.set(row.service_order_id, row.created_at);
            }
        }

        const overdue: OverdueBudget[] = [];
        for (const order of inDiagnosis) {
            const enteredAt = latestEntryByOrder.get(order.id);
            if (!enteredAt) continue;
            const diagnosisStartedAt = new Date(enteredAt);
            if (isBudgetOverdue(diagnosisStartedAt)) {
                overdue.push({
                    order,
                    diagnosisStartedAt,
                    hoursOverdue: Math.floor(elapsedBusinessHours(diagnosisStartedAt, new Date()) - BUDGET_SLA_BUSINESS_HOURS),
                });
            }
        }

        setOverdueBudgets(overdue);
        if (overdue.length > 0) setShowOverdueAlert(true);
    };

    const fetchOrders = async () => {
        if (!user) return;

        try {
            const { data, error } = await supabase
                .from('service_orders')
                .select(`
          id,
          os_number,
          created_at,
          equipment,
          brand,
          equipment_type,
          status,
          payment_status,
          completed_date,
          warranty_days,
          is_pinned,
          signature_token,
          client_signed_at,
          budget_approved_at,
          customers (name, phone, email, cpf, cnpj, company_name, trade_name),
          technicians (name)
        `)
                .eq('user_id', user.id)
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            const fetchedOrders = (data as any) || [];
            setOrders(fetchedOrders);
            await checkBudgetDeadlines(fetchedOrders);
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const togglePin = async (id: string, currentPinned: boolean) => {
        try {
            const { error } = await supabase
                .from('service_orders')
                .update({
                    is_pinned: !currentPinned,
                    pinned_at: !currentPinned ? new Date().toISOString() : null
                })
                .eq('id', id);

            if (error) throw error;
            fetchOrders();
        } catch (error) {
            console.error('Error toggling pin:', error);
            toast.error('Erro ao fixar/desafixar OS');
        }
    };

    const copySignatureLink = (token: string) => {
        const link = `${window.location.origin}/assinar/${token}`;
        navigator.clipboard.writeText(link);
        toast.success('Link de assinatura copiado!');
    };

    const deleteOS = async (orderId: string, osNumber: number) => {
        if (!user || !confirm(`Tem certeza que deseja excluir a OS #${osNumber}?`)) return;

        try {
            const { error } = await supabase
                .from('service_orders')
                .delete()
                .eq('id', orderId)
                .eq('user_id', user.id);

            if (error) throw error;
            toast.success('OS excluída com sucesso!');
            fetchOrders();
        } catch (error: any) {
            console.error('Error deleting OS:', error);
            toast.error('Erro ao excluir OS: ' + error.message);
        }
    };

    const duplicateOS = async (orderId: string) => {
        if (!user || !confirm('Tem certeza que deseja duplicar esta OS?')) return;

        try {
            // 1. Fetch original OS data
            const { data: originalOS, error: fetchError } = await supabase
                .from('service_orders')
                .select('*')
                .eq('id', orderId)
                .eq('user_id', user.id)
                .single();

            if (fetchError) throw fetchError;

            // 2. Prepare new OS object
            // Explicitly destructure to remove system fields
            const {
                id,
                created_at,
                os_number,
                signature_token,
                client_signed_at,
                client_signature_url,
                is_pinned,
                pinned_at,
                updated_at, // If exists
                user_id, // Let the database assign the current user
                ...osData
            } = originalOS;

            // 3. Insert new OS
            const { error: insertError } = await supabase
                .from('service_orders')
                .insert([{
                    ...osData,
                    user_id: user.id,
                    status: 'pendente',
                    // Ensure arrays are copied correctly
                    physical_condition: osData.physical_condition || [],
                    operating_condition: osData.operating_condition || [],
                    technical_tests: osData.technical_tests || [],
                    photos: osData.photos || [],
                }]);

            if (insertError) throw insertError;

            toast.success('OS duplicada com sucesso!');
            fetchOrders();

        } catch (error: any) {
            console.error('Error duplicating OS:', error);
            toast.error('Erro ao duplicar OS: ' + (error.message || 'Erro desconhecido'));
        }
    };

    const exportPDF = async (orderId: string) => {
        if (!user) return;

        try {
            const [{ data, error }, { data: itemsData }, { data: servicesData }, { data: companyData }] = await Promise.all([
                supabase
                    .from('service_orders')
                    .select(`
          *,
          customers (name, cpf, phone, email, address, number, cnpj, company_name, trade_name, state_registration, municipal_registration),
          technicians (name)
        `)
                    .eq('id', orderId)
                    .eq('user_id', user.id)
                    .single(),
                supabase.from('service_order_items').select('*').eq('service_order_id', orderId),
                supabase.from('service_order_services').select('*').eq('service_order_id', orderId),
                supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle(),
            ]);

            if (error) throw error;

            await generateOSPDF({
                os_number: data.os_number,
                created_at: data.created_at,
                entry_date: data.entry_date,
                estimated_completion_date: data.estimated_completion_date,
                completed_date: data.completed_date,
                customer: data.customers, // This should be an object {name, cpf, phone}
                technician: data.technicians, // This should be an object {name}
                equipment: data.equipment,
                brand: data.brand,
                equipment_type: data.equipment_type,
                serial_number: data.serial_number,
                problem_description: data.problem_description,
                physical_condition: data.physical_condition || [],
                operating_condition: data.operating_condition || [],
                technical_tests: data.technical_tests || [],
                accessories_received: data.accessories_received || { fonte: false, cabo: false, mochila: false, outro: '' },
                technician_observation: data.technician_observation,
                status: data.status,
                client_signed_at: data.client_signed_at,
                client_signature_url: data.client_signature_url,
                photos: data.photos || [], // Pass photos to PDF generator
                items: itemsData || [],
                services: servicesData || [],
                discount_type: data.discount_type || 'fixed',
                discount_value: data.discount_value || 0,
                freight: data.freight || 0,
                urgency_fee: data.urgency_fee || 0,
                company: companyData || undefined,
            });
        } catch (error: any) {
            console.error('Error exporting PDF:', error);
            toast.error('Erro ao gerar PDF: ' + (error.message || 'Verifique o console para mais detalhes'));
        }
    };

    const quickChangeStatus = async (orderId: string, newStatus: OrderStatus) => {
        try {
            await changeOrderStatus(orderId, newStatus);
            toast.success('Status atualizado!');
            fetchOrders();
        } catch (error: any) {
            toast.error('Erro ao atualizar status: ' + error.message);
        }
    };

    const togglePaymentStatus = async (orderId: string, currentStatus: PaymentStatus) => {
        const newStatus: PaymentStatus = currentStatus === 'pago' ? 'nao_pago' : 'pago';
        try {
            const { error } = await supabase
                .from('service_orders')
                .update({ payment_status: newStatus, paid_at: newStatus === 'pago' ? new Date().toISOString() : null })
                .eq('id', orderId);

            if (error) throw error;
            toast.success(newStatus === 'pago' ? 'Marcado como Faturado!' : 'Marcado como A Receber!');
            fetchOrders();
        } catch (error: any) {
            toast.error('Erro ao atualizar pagamento: ' + error.message);
        }
    };

    // The message invites the client to the specific action the OS still needs
    // from them (approve the budget, then sign), falling back to plain tracking.
    const trackingContextFor = (order: ServiceOrder): TrackingMessageContext => {
        if (order.status === 'aguardando_aprovacao' && !order.budget_approved_at) return 'approval';
        if (!order.client_signed_at) return 'signature';
        return 'tracking';
    };

    const shareViaWhatsApp = (order: ServiceOrder) => {
        if (!order.customers?.phone) {
            toast.error('Cliente sem telefone cadastrado');
            return;
        }
        const link = buildTrackingLink(order.signature_token);
        const message = buildTrackingMessage(order.customers.name, order.os_number, link, trackingContextFor(order));
        openWhatsApp(order.customers.phone, message);
    };

    const shareViaEmail = (order: ServiceOrder) => {
        if (!order.customers?.email) {
            toast.error('Cliente sem e-mail cadastrado');
            return;
        }
        const link = buildTrackingLink(order.signature_token);
        const message = buildTrackingMessage(order.customers.name, order.os_number, link, trackingContextFor(order));
        openEmail(order.customers.email, order.os_number, message);
    };

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const searchDigits = searchTerm.replace(/\D/g, '');

    const filteredOrders = orders.filter(o => {
        if (statusFilter === 'em_andamento') {
            if (['pronto', 'entregue', 'cancelado'].includes(o.status)) return false;
        } else if (statusFilter !== 'todos' && o.status !== statusFilter) {
            return false;
        }

        if (!normalizedSearch) return true;

        const customer = o.customers;
        const haystack = [
            o.equipment, o.brand, o.equipment_type,
            customer?.name, customer?.company_name, customer?.trade_name,
            o.technicians?.name,
        ].filter(Boolean).join(' ').toLowerCase();

        if (haystack.includes(normalizedSearch)) return true;
        if (String(o.os_number).includes(normalizedSearch)) return true;

        if (searchDigits) {
            const cpfDigits = customer?.cpf?.replace(/\D/g, '') || '';
            const cnpjDigits = customer?.cnpj?.replace(/\D/g, '') || '';
            if (cpfDigits.includes(searchDigits) || cnpjDigits.includes(searchDigits)) return true;
            if (String(o.os_number).includes(searchDigits)) return true;
        }

        return false;
    });

    const allStatuses: OrderStatus[] = [...STATUS_STEPS, 'cancelado'];

    // Top summary cards only surface the active workflow stages the shop
    // triages day to day; the filter chips below still cover every status.
    const topStatuses: OrderStatus[] = ['recebido', 'em_diagnostico', 'aguardando_aprovacao', 'aguardando_peca', 'em_reparo', 'pronto'];

    return (
        <div className="space-y-4 sm:space-y-6">
            {showOverdueAlert && overdueBudgets.length > 0 && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <Card className="max-w-lg w-full border-2 border-amber-300">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-lg text-dark">Prazo de orçamento estourado</h3>
                                <p className="text-sm text-gray-500">
                                    {overdueBudgets.length === 1 ? 'Esta OS está' : `Estas ${overdueBudgets.length} OS's estão`} há mais de {BUDGET_SLA_BUSINESS_HOURS}h úteis em diagnóstico sem orçamento enviado.
                                </p>
                            </div>
                            <button onClick={() => setShowOverdueAlert(false)} className="p-1 hover:bg-gray-100 rounded-lg flex-shrink-0">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {overdueBudgets.map(({ order, hoursOverdue }) => (
                                <button
                                    key={order.id}
                                    onClick={() => { setShowOverdueAlert(false); navigate(`/editar-os/${order.id}`); }}
                                    className="w-full text-left p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                                >
                                    <p className="font-semibold text-dark">OS #{order.os_number} · {order.customers?.name || 'Cliente'}</p>
                                    <p className="text-xs text-amber-700">{hoursOverdue}h úteis além do prazo</p>
                                </button>
                            ))}
                        </div>

                        <Button variant="outline" className="w-full mt-4" onClick={() => setShowOverdueAlert(false)}>
                            Fechar
                        </Button>
                    </Card>
                </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-dark">Dashboard</h2>
                    <p className="text-sm sm:text-base text-gray-500">Visão geral das ordens de serviço</p>
                </div>
                <Button onClick={() => navigate('/nova-os')}>
                    Nova Ordem de Serviço
                </Button>
            </div>

            {/* Stats Cards: only the statuses the shop actively triages day to day */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                {topStatuses.map(s => {
                    const count = orders.filter(o => o.status === s).length;
                    return (
                        <Card
                            key={s}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => openList(s)}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs sm:text-sm text-gray-600">{STATUS_CONFIG[s].shortLabel}</p>
                                    <p className="text-2xl sm:text-3xl font-bold text-dark">{count}</p>
                                </div>
                                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${STATUS_CONFIG[s].dot}`} />
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* Orders List */}
            <Card>
                <button
                    type="button"
                    onClick={() => setIsListOpen(!isListOpen)}
                    className="flex items-center justify-between w-full"
                >
                    <h3 className="font-semibold text-lg">Ordens de Serviço {isListOpen ? `(${filteredOrders.length})` : ''}</h3>
                    {isListOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </button>

                <div className="flex items-center gap-3 mt-4 px-4 py-2 rounded-xl border border-gray-200 bg-gray-50/50">
                    <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                        type="text"
                        placeholder="Buscar por cliente, CPF/CNPJ, nº da OS, equipamento ou técnico..."
                        className="bg-transparent border-none focus:outline-none w-full text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button type="button" onClick={() => setSearchTerm('')} className="flex-shrink-0">
                            <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                        </button>
                    )}
                </div>

                {!isListOpen ? (
                    <p className="text-sm text-gray-400 mt-2">Clique para ver as ordens de serviço, ou clique em um card acima para filtrar por status.</p>
                ) : (
                    <>
                        {/* Status filter chips */}
                        <div className="flex flex-wrap gap-2 mt-4 mb-4">
                            <button
                                type="button"
                                onClick={() => setStatusFilter('todos')}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === 'todos' ? 'bg-primary-cyan text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                Todos ({orders.length})
                            </button>
                            {allStatuses.map(s => {
                                const count = orders.filter(o => o.status === s).length;
                                return (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setStatusFilter(s)}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary-cyan text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        {STATUS_CONFIG[s].shortLabel} ({count})
                                    </button>
                                );
                            })}
                        </div>

                        {loading ? (
                            <p className="text-center text-gray-500 py-8">Carregando...</p>
                        ) : filteredOrders.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">Nenhuma ordem de serviço encontrada</p>
                        ) : (
                    <div className="space-y-3">
                        {filteredOrders.map((order) => {
                            const statusConfig = getStatusConfig(order.status);

                            return (
                                <div
                                    key={order.id}
                                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl hover:shadow-md transition-all ${order.is_pinned ? 'border-primary-cyan bg-primary-cyan/5' : 'border-gray-200'
                                        }`}
                                >
                                    <div className="flex items-start gap-4 flex-1 mb-3 sm:mb-0">
                                        <div className="w-12 h-12 rounded-full bg-primary-cyan/10 flex items-center justify-center flex-shrink-0">
                                            <FileText className="w-6 h-6 text-primary-cyan" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <span className="font-bold text-primary-cyan text-lg">OS #{order.os_number}</span>
                                                <select
                                                    value={order.status}
                                                    onChange={(e) => quickChangeStatus(order.id, e.target.value as OrderStatus)}
                                                    className={`px-2 py-0.5 rounded-full text-xs font-medium border-none cursor-pointer ${statusConfig.color}`}
                                                    title="Alterar status"
                                                >
                                                    {STATUS_STEPS.map(s => (
                                                        <option key={s} value={s}>{STATUS_CONFIG[s].shortLabel}</option>
                                                    ))}
                                                    <option value="cancelado">{STATUS_CONFIG.cancelado.shortLabel}</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => togglePaymentStatus(order.id, order.payment_status)}
                                                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${PAYMENT_STATUS_CONFIG[order.payment_status || 'nao_pago'].color}`}
                                                    title="Clique para alternar entre Faturado / A Receber"
                                                >
                                                    {PAYMENT_STATUS_CONFIG[order.payment_status || 'nao_pago'].label}
                                                </button>
                                                {order.is_pinned && (
                                                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                                )}
                                                {order.client_signed_at && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                        Assinado
                                                    </span>
                                                )}
                                                <WarrantyBadge completedDate={order.completed_date} warrantyDays={order.warranty_days} />
                                            </div>

                                            {/* Customer name highlighted */}
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/editar-os/${order.id}`)}
                                                title="Clique para atualizar a OS"
                                                className="flex items-center gap-2 mb-1 hover:underline text-left"
                                            >
                                                <User className="w-4 h-4 text-primary-cyan" />
                                                <span className="font-semibold text-dark text-base">{order.customers?.name || 'N/A'}</span>
                                            </button>

                                            <p className="text-sm text-gray-600 mb-1">
                                                {[order.equipment_type, order.brand, order.equipment].filter(Boolean).join(' · ')}
                                            </p>

                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-center gap-2 flex-wrap">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => togglePin(order.id, order.is_pinned)}
                                            className="touch-manipulation min-w-[40px]"
                                            title="Fixar/Desafixar"
                                        >
                                            <Star className={`w-4 h-4 ${order.is_pinned ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                                        </Button>

                                        {!order.client_signed_at && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => copySignatureLink(order.signature_token)}
                                                className="touch-manipulation min-w-[40px]"
                                                title="Copiar link do cliente"
                                            >
                                                <PenTool className="w-4 h-4" />
                                            </Button>
                                        )}

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => shareViaWhatsApp(order)}
                                            className="touch-manipulation min-w-[40px] text-green-600 border-green-200 hover:bg-green-50"
                                            title="Enviar link por WhatsApp"
                                        >
                                            <MessageCircle className="w-4 h-4" />
                                        </Button>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => shareViaEmail(order)}
                                            className="touch-manipulation min-w-[40px]"
                                            title="Enviar link por e-mail"
                                        >
                                            <Mail className="w-4 h-4" />
                                        </Button>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => exportPDF(order.id)}
                                            className="touch-manipulation min-w-[40px]"
                                            title="Exportar PDF"
                                        >
                                            <FileDown className="w-4 h-4" />
                                        </Button>

                                        <DropdownMenu
                                            items={[
                                                {
                                                    label: 'Atualizar',
                                                    icon: <Edit className="w-4 h-4" />,
                                                    onClick: () => navigate(`/editar-os/${order.id}`),
                                                },
                                                {
                                                    label: 'Duplicar',
                                                    icon: <Copy className="w-4 h-4" />,
                                                    onClick: () => duplicateOS(order.id),
                                                },
                                                {
                                                    label: 'Excluir',
                                                    icon: <Trash2 className="w-4 h-4" />,
                                                    onClick: () => deleteOS(order.id, order.os_number),
                                                    variant: 'danger' as const,
                                                },
                                            ]}
                                            triggerClassName="min-w-[40px]"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                        )}
                    </>
                )}
            </Card>

            <div className="flex justify-end">
                <Button onClick={() => navigate('/nova-os')}>
                    Nova Ordem de Serviço
                </Button>
            </div>
        </div>
    );
}
