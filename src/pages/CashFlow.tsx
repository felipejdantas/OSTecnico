import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
    ChevronLeft, ChevronRight, Wallet, FileText, ShoppingCart, ArrowUpCircle, ArrowDownCircle,
    CalendarDays, CalendarRange, Calendar, Plus, Trash2, Edit2, X, Truck, FileSpreadsheet,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculateOrderTotal, formatCurrency, PAYMENT_STATUS_CONFIG, type PaymentStatus } from '../lib/orderFinance';

type LedgerRow = {
    id: string;
    origin: 'os' | 'venda' | 'cash';
    label: string;
    date: string; // effective date (YYYY-MM-DD): billing_date when set, otherwise completed_date/sale_date
    party: string;
    category: string | null;
    amount: number; // signed: positive entrada, negative saida
    payment_status?: PaymentStatus;
    source?: 'manual' | 'compra' | 'nfe';
};

type PeriodStats = { entradas: number; saidas: number; saldo: number };

// Fetches every OS/Venda/lançamento the tenant has and resolves each one's "effective"
// date (billing_date overrides completed_date/sale_date when set). Everything below —
// quick stats, the browsable month, the ledger table — is just filtering this one list,
// so a manually chosen billing date is honored everywhere without juggling DB-side
// coalesce logic across three different range queries.
async function fetchAllLedgerRows(userId: string): Promise<LedgerRow[]> {
    const [osRes, salesRes, cashRes] = await Promise.all([
        supabase
            .from('service_orders')
            .select('id, os_number, completed_date, billing_date, discount_type, discount_value, freight, urgency_fee, payment_status, customers (name)')
            .eq('user_id', userId)
            .neq('status', 'cancelado')
            .or('completed_date.not.is.null,billing_date.not.is.null'),
        supabase
            .from('sales_orders')
            .select('id, sale_number, sale_date, billing_date, discount_type, discount_value, freight, other_costs, payment_status, customers (name)')
            .eq('user_id', userId),
        supabase
            .from('cash_entries')
            .select('id, entry_date, type, category, amount, description, related_party, source')
            .eq('user_id', userId),
    ]);

    const osList = osRes.data || [];
    const salesList = salesRes.data || [];
    const osIds = osList.map((o: any) => o.id);
    const saleIds = salesList.map((s: any) => s.id);

    const [itemsRes, servicesRes, saleItemsRes] = await Promise.all([
        osIds.length > 0 ? supabase.from('service_order_items').select('service_order_id, quantity, unit_price').in('service_order_id', osIds) : Promise.resolve({ data: [] as any[] }),
        osIds.length > 0 ? supabase.from('service_order_services').select('service_order_id, quantity, price').in('service_order_id', osIds) : Promise.resolve({ data: [] as any[] }),
        saleIds.length > 0 ? supabase.from('sale_items').select('sale_id, quantity, unit_price').in('sale_id', saleIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const items = itemsRes.data || [];
    const services = servicesRes.data || [];
    const saleItems = saleItemsRes.data || [];

    const osRows: LedgerRow[] = osList.map((o: any) => {
        const itemsTotal = items.filter((i: any) => i.service_order_id === o.id).reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0);
        const servicesTotal = services.filter((s: any) => s.service_order_id === o.id).reduce((s: number, sv: any) => s + sv.quantity * sv.price, 0);
        const { total } = calculateOrderTotal({
            itemsTotal, servicesTotal,
            discountType: o.discount_type || 'fixed',
            discountValue: o.discount_value || 0,
            freight: o.freight || 0,
            urgencyFee: o.urgency_fee || 0,
        });
        return {
            id: o.id,
            origin: 'os',
            label: `OS #${o.os_number}`,
            date: o.billing_date || o.completed_date,
            party: o.customers?.name || 'N/A',
            category: null,
            amount: total,
            payment_status: (o.payment_status || 'nao_pago') as PaymentStatus,
        };
    });

    const saleRows: LedgerRow[] = salesList.map((s: any) => {
        const itemsTotal = saleItems.filter((i: any) => i.sale_id === s.id).reduce((sum: number, i: any) => sum + i.quantity * i.unit_price, 0);
        const { total } = calculateOrderTotal({
            itemsTotal, servicesTotal: 0,
            discountType: s.discount_type || 'fixed',
            discountValue: s.discount_value || 0,
            freight: s.freight || 0,
            urgencyFee: s.other_costs || 0,
        });
        return {
            id: s.id,
            origin: 'venda',
            label: `Venda #${s.sale_number}`,
            date: s.billing_date || s.sale_date,
            party: s.customers?.name || 'N/A',
            category: null,
            amount: total,
            payment_status: (s.payment_status || 'nao_pago') as PaymentStatus,
        };
    });

    const cashRows: LedgerRow[] = (cashRes.data || []).map((e: any) => ({
        id: e.id,
        origin: 'cash',
        label: e.description,
        date: e.entry_date,
        party: e.related_party || '-',
        category: e.category,
        amount: e.type === 'saida' ? -Number(e.amount) : Number(e.amount),
        source: e.source,
    }));

    return [...osRows, ...saleRows, ...cashRows];
}

// OS/Venda only actually become cash once marked Faturado — until then they're a
// receivable, not money in hand, so they're excluded from every total below (they
// still show up in the ledger table with the "A Receber" badge for tracking).
// Manual/compra cash_entries have no pending state, so they always count.
function isRealized(r: LedgerRow) {
    return r.origin === 'cash' || r.payment_status === 'pago';
}

function computeStats(allRows: LedgerRow[], start: string, end: string): PeriodStats {
    const inRange = allRows.filter(r => r.date >= start && r.date <= end);
    const realized = inRange.filter(isRealized);
    const entradas = realized.filter(r => r.amount >= 0).reduce((s, r) => s + r.amount, 0);
    const saidas = realized.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
    return { entradas, saidas, saldo: entradas - saidas };
}

// Local calendar date (YYYY-MM-DD), not UTC — toISOString() would roll the date
// forward in the evening for any timezone behind UTC (like Brazil's UTC-3), making
// "Hoje" silently point at tomorrow for the last few hours of every day.
function toDateStr(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const manualEntrySchema = { entry_date: '', competence_date: '', category: '', amount: '', description: '', related_party: '' };
type ManualEntryForm = typeof manualEntrySchema;

export default function CashFlow() {
    const { tenantId } = useAuth();
    const [monthDate, setMonthDate] = useState(() => new Date());
    const [dayDate, setDayDate] = useState(() => new Date());
    const [allRows, setAllRows] = useState<LedgerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState<'todos' | 'entrada' | 'saida'>('todos');
    const [originFilter, setOriginFilter] = useState<'todos' | 'os' | 'venda' | 'cash'>('todos');

    const [entryModal, setEntryModal] = useState<'entrada' | 'saida' | null>(null);
    const [entryForm, setEntryForm] = useState<ManualEntryForm>(manualEntrySchema);
    const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

    useEffect(() => {
        if (tenantId) fetchAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId]);

    const fetchAll = async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const allData = await fetchAllLedgerRows(tenantId);
            setAllRows(allData);
        } catch (error) {
            console.error('Error fetching cash flow data:', error);
        } finally {
            setLoading(false);
        }
    };

    const togglePaymentStatus = async (row: LedgerRow) => {
        if (row.origin === 'cash' || !row.payment_status) return;
        const newStatus: PaymentStatus = row.payment_status === 'pago' ? 'nao_pago' : 'pago';
        const table = row.origin === 'os' ? 'service_orders' : 'sales_orders';
        const { error } = await supabase
            .from(table)
            .update({ payment_status: newStatus, paid_at: newStatus === 'pago' ? new Date().toISOString() : null })
            .eq('id', row.id);
        if (!error) {
            setAllRows(prev => prev.map(r => (r.origin === row.origin && r.id === row.id) ? { ...r, payment_status: newStatus } : r));
        }
    };

    const openEntryModal = (type: 'entrada' | 'saida') => {
        const today = new Date().toISOString().slice(0, 10);
        setEditingEntryId(null);
        setEntryForm({ ...manualEntrySchema, entry_date: today, competence_date: today });
        setEntryModal(type);
    };

    const openEditEntryModal = async (row: LedgerRow) => {
        const { data, error } = await supabase.from('cash_entries').select('*').eq('id', row.id).single();
        if (error || !data) {
            toast.error('Erro ao carregar lançamento.');
            return;
        }
        setEditingEntryId(row.id);
        setEntryForm({
            entry_date: data.entry_date,
            competence_date: data.competence_date || data.entry_date,
            category: data.category || '',
            amount: String(data.amount),
            description: data.description || '',
            related_party: data.related_party || '',
        });
        setEntryModal(data.type === 'saida' ? 'saida' : 'entrada');
    };

    const closeEntryModal = () => {
        setEntryModal(null);
        setEditingEntryId(null);
    };

    const submitManualEntry = async () => {
        if (!tenantId || !entryModal) return;
        const amount = parseFloat(entryForm.amount.replace(',', '.'));
        if (!entryForm.description.trim()) {
            toast.error('Informe o histórico do lançamento.');
            return;
        }
        if (!amount || amount <= 0) {
            toast.error('Informe um valor válido.');
            return;
        }

        setIsSubmittingEntry(true);
        try {
            if (editingEntryId) {
                const { error } = await supabase.from('cash_entries').update({
                    entry_date: entryForm.entry_date,
                    competence_date: entryForm.competence_date || entryForm.entry_date,
                    category: entryForm.category.trim() || null,
                    amount,
                    description: entryForm.description.trim(),
                    related_party: entryForm.related_party.trim() || null,
                }).eq('id', editingEntryId);
                if (error) throw error;
                toast.success('Lançamento atualizado com sucesso!');
            } else {
                const { error } = await supabase.from('cash_entries').insert([{
                    user_id: tenantId,
                    entry_date: entryForm.entry_date,
                    competence_date: entryForm.competence_date || entryForm.entry_date,
                    type: entryModal,
                    category: entryForm.category.trim() || null,
                    amount,
                    description: entryForm.description.trim(),
                    related_party: entryForm.related_party.trim() || null,
                    source: 'manual',
                }]);
                if (error) throw error;
                toast.success(entryModal === 'entrada' ? 'Entrada lançada com sucesso!' : 'Saída lançada com sucesso!');
            }

            closeEntryModal();
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao lançar: ' + error.message);
        } finally {
            setIsSubmittingEntry(false);
        }
    };

    const deleteManualEntry = async (row: LedgerRow) => {
        if (!confirm(`Tem certeza que deseja excluir o lançamento "${row.label}"?`)) return;
        try {
            const { error } = await supabase.from('cash_entries').delete().eq('id', row.id);
            if (error) throw error;
            toast.success('Lançamento excluído!');
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao excluir: ' + error.message);
        }
    };

    const monthLabel = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const changeMonth = (delta: number) => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1));

    const changeDay = (delta: number) => setDayDate(prev => {
        const next = new Date(prev);
        next.setDate(next.getDate() + delta);
        return next;
    });
    const dayDateStr = toDateStr(dayDate);
    const isViewingToday = dayDateStr === toDateStr(new Date());
    const dayLabel = isViewingToday ? 'Hoje' : dayDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    const today = new Date();
    const dayOfWeek = today.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const currentMonthStart = toDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
    const currentMonthEnd = toDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 0));

    const dayStat = computeStats(allRows, dayDateStr, dayDateStr);
    const weekStat = computeStats(allRows, toDateStr(monday), toDateStr(sunday));
    const currentMonthStat = computeStats(allRows, currentMonthStart, currentMonthEnd);

    const browsedMonthStart = toDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
    const browsedMonthEnd = toDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
    const rows = allRows
        .filter(r => r.date >= browsedMonthStart && r.date <= browsedMonthEnd)
        .sort((a, b) => b.date.localeCompare(a.date));

    const realizedRows = rows.filter(isRealized);
    const monthEntradas = realizedRows.filter(r => r.amount >= 0).reduce((s, r) => s + r.amount, 0);
    const monthSaidas = realizedRows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
    const monthSaldo = monthEntradas - monthSaidas;

    const filteredRows = rows.filter(r => {
        if (typeFilter === 'entrada' && r.amount < 0) return false;
        if (typeFilter === 'saida' && r.amount >= 0) return false;
        if (originFilter !== 'todos' && r.origin !== originFilter) return false;
        return true;
    });

    const originBadge = (row: LedgerRow) => {
        if (row.origin === 'os') return <span className="inline-flex items-center gap-1.5 text-primary-cyan"><FileText className="w-4 h-4" />{row.label}</span>;
        if (row.origin === 'venda') return <span className="inline-flex items-center gap-1.5 text-purple-600"><ShoppingCart className="w-4 h-4" />{row.label}</span>;
        if (row.source === 'compra') return <span className="inline-flex items-center gap-1.5 text-orange-600"><Truck className="w-4 h-4" />{row.label}</span>;
        if (row.source === 'nfe') return <span className="inline-flex items-center gap-1.5 text-indigo-600"><FileSpreadsheet className="w-4 h-4" />{row.label}</span>;
        return <span className={`inline-flex items-center gap-1.5 ${row.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>{row.amount >= 0 ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}{row.label}</span>;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary-cyan/10 flex items-center justify-center flex-shrink-0">
                        <Wallet className="w-6 h-6 text-primary-cyan" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-dark">Fluxo de Caixa</h2>
                        <p className="text-gray-500">OS, Pedidos de Venda e lançamentos manuais</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => openEntryModal('entrada')}>
                        <Plus className="w-4 h-4 mr-1" /> Entrada
                    </Button>
                    <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => openEntryModal('saida')}>
                        <Plus className="w-4 h-4 mr-1" /> Saída
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <Card className="bg-gradient-to-br from-primary-cyan/10 to-primary-cyan/5">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 text-gray-600">
                            <CalendarDays className="w-4 h-4" />
                            <p className="text-xs sm:text-sm capitalize">{dayLabel}</p>
                        </div>
                        <div className="flex items-center -mr-1.5">
                            <button type="button" onClick={() => changeDay(-1)} className="p-1 hover:bg-white/60 rounded-lg transition-colors touch-manipulation" aria-label="Dia anterior">
                                <ChevronLeft className="w-4 h-4 text-primary-cyan" />
                            </button>
                            <button type="button" onClick={() => changeDay(1)} className="p-1 hover:bg-white/60 rounded-lg transition-colors touch-manipulation" aria-label="Próximo dia">
                                <ChevronRight className="w-4 h-4 text-primary-cyan" />
                            </button>
                        </div>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-dark">{loading ? '...' : formatCurrency(dayStat.saldo)}</p>
                    {!loading && (
                        <p className="text-xs mt-0.5">
                            <span className="text-green-600">+{formatCurrency(dayStat.entradas)}</span>{' / '}
                            <span className="text-red-500">-{formatCurrency(dayStat.saidas)}</span>
                        </p>
                    )}
                    {!loading && !isViewingToday && (
                        <p className="text-xs text-gray-500 mt-0.5">
                            <button type="button" onClick={() => setDayDate(new Date())} className="text-primary-cyan hover:underline">
                                voltar para hoje
                            </button>
                        </p>
                    )}
                </Card>
                <Card className="bg-gradient-to-br from-primary-cyan/10 to-primary-cyan/5">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <CalendarRange className="w-4 h-4" />
                        <p className="text-xs sm:text-sm">Esta Semana</p>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-dark">{loading ? '...' : formatCurrency(weekStat.saldo)}</p>
                    {!loading && (
                        <p className="text-xs mt-0.5">
                            <span className="text-green-600">+{formatCurrency(weekStat.entradas)}</span>{' / '}
                            <span className="text-red-500">-{formatCurrency(weekStat.saidas)}</span>
                        </p>
                    )}
                </Card>
                <Card className="bg-gradient-to-br from-primary-cyan/10 to-primary-cyan/5">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        <p className="text-xs sm:text-sm">Este Mês</p>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-dark">{loading ? '...' : formatCurrency(currentMonthStat.saldo)}</p>
                    {!loading && (
                        <p className="text-xs mt-0.5">
                            <span className="text-green-600">+{formatCurrency(currentMonthStat.entradas)}</span>{' / '}
                            <span className="text-red-500">-{formatCurrency(currentMonthStat.saidas)}</span>
                        </p>
                    )}
                </Card>
            </div>

            <Card className="bg-gradient-to-br from-primary-cyan/10 to-primary-cyan/5">
                <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => changeMonth(-1)} className="p-2 hover:bg-white/60 rounded-lg transition-colors touch-manipulation" aria-label="Mês anterior">
                        <ChevronLeft className="w-5 h-5 text-primary-cyan" />
                    </button>
                    <h3 className="font-semibold text-lg text-dark capitalize">{monthLabel}</h3>
                    <button type="button" onClick={() => changeMonth(1)} className="p-2 hover:bg-white/60 rounded-lg transition-colors touch-manipulation" aria-label="Próximo mês">
                        <ChevronRight className="w-5 h-5 text-primary-cyan" />
                    </button>
                </div>
                <p className="text-center text-3xl sm:text-4xl font-bold text-primary-cyan">{formatCurrency(monthSaldo)}</p>
                <p className="text-center text-sm text-gray-500 mt-1">
                    <span className="text-green-600">+{formatCurrency(monthEntradas)}</span>{' · '}
                    <span className="text-red-500">-{formatCurrency(monthSaidas)}</span>{' · '}
                    {rows.length} registro{rows.length !== 1 ? 's' : ''}
                </p>
            </Card>

            {/* Subgrupos: filtro por tipo e por origem */}
            <div className="flex flex-wrap gap-2">
                {(['todos', 'entrada', 'saida'] as const).map(t => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTypeFilter(t)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${typeFilter === t ? 'bg-primary-cyan text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        {t === 'todos' ? 'Todos' : t === 'entrada' ? 'Entradas' : 'Saídas'}
                    </button>
                ))}
                <span className="w-px bg-gray-200 mx-1" />
                {([
                    ['todos', 'Todas Origens'],
                    ['os', 'OS'],
                    ['venda', 'Vendas'],
                    ['cash', 'Manuais/Compras'],
                ] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setOriginFilter(key)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${originFilter === key ? 'bg-dark text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <Card className="p-0 overflow-hidden">
                {loading ? (
                    <p className="text-center text-gray-500 py-8">Carregando...</p>
                ) : filteredRows.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Nenhum registro encontrado</p>
                ) : (
                    <>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3">Origem</th>
                                        <th className="px-6 py-3">Categoria</th>
                                        <th className="px-6 py-3">Cliente/Fornecedor</th>
                                        <th className="px-6 py-3">Data</th>
                                        <th className="px-6 py-3">Pagamento</th>
                                        <th className="px-6 py-3 text-right">Valor</th>
                                        <th className="px-6 py-3 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRows.map(r => (
                                        <tr key={`${r.origin}-${r.id}`} className="bg-white border-b hover:bg-gray-50">
                                            <td className="px-6 py-4 font-semibold">{originBadge(r)}</td>
                                            <td className="px-6 py-4 text-gray-500 text-xs">{r.category || '-'}</td>
                                            <td className="px-6 py-4 text-gray-900">{r.party}</td>
                                            <td className="px-6 py-4 text-gray-600">{new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                            <td className="px-6 py-4">
                                                {r.payment_status ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => togglePaymentStatus(r)}
                                                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${PAYMENT_STATUS_CONFIG[r.payment_status].color}`}
                                                    >
                                                        {PAYMENT_STATUS_CONFIG[r.payment_status].label}
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className={`px-6 py-4 text-right font-medium ${r.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                {r.amount >= 0 ? '' : '- '}{formatCurrency(Math.abs(r.amount))}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {r.origin === 'cash' && r.source === 'manual' && (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditEntryModal(r)}
                                                            className="p-2 text-gray-400 hover:text-primary-cyan hover:bg-primary-cyan/10 rounded-lg transition-colors"
                                                            title="Editar lançamento"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteManualEntry(r)}
                                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Excluir lançamento"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 font-bold">
                                        <td className="px-6 py-3" colSpan={5}>Saldo do filtro (faturado)</td>
                                        <td className={`px-6 py-3 text-right ${filteredRows.filter(isRealized).reduce((s, r) => s + r.amount, 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {formatCurrency(filteredRows.filter(isRealized).reduce((s, r) => s + r.amount, 0))}
                                        </td>
                                        <td />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div className="md:hidden space-y-3 p-4">
                            {filteredRows.map(r => (
                                <div key={`${r.origin}-${r.id}`} className="bg-white border border-gray-200 rounded-xl p-4 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-sm">{originBadge(r)}</span>
                                        <span className={`font-bold ${r.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {r.amount >= 0 ? '' : '- '}{formatCurrency(Math.abs(r.amount))}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-700">{r.party}</p>
                                    {r.category && <p className="text-xs text-gray-400">{r.category}</p>}
                                    <div className="flex items-center justify-between mt-2">
                                        <p className="text-xs text-gray-400">{new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                                        <div className="flex items-center gap-2">
                                            {r.payment_status && (
                                                <button
                                                    type="button"
                                                    onClick={() => togglePaymentStatus(r)}
                                                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${PAYMENT_STATUS_CONFIG[r.payment_status].color}`}
                                                >
                                                    {PAYMENT_STATUS_CONFIG[r.payment_status].label}
                                                </button>
                                            )}
                                            {r.origin === 'cash' && r.source === 'manual' && (
                                                <>
                                                    <button type="button" onClick={() => openEditEntryModal(r)} className="p-1.5 text-gray-400 hover:text-primary-cyan hover:bg-primary-cyan/10 rounded-lg">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button type="button" onClick={() => deleteManualEntry(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </Card>

            {entryModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeEntryModal}>
                    <Card className="max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-lg text-dark">
                                {editingEntryId
                                    ? (entryModal === 'entrada' ? 'Editar Entrada' : 'Editar Saída')
                                    : (entryModal === 'entrada' ? 'Nova Entrada' : 'Nova Saída')}
                            </h3>
                            <button type="button" onClick={closeEntryModal} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <Input
                                label="Categoria (opcional)"
                                value={entryForm.category}
                                onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })}
                                placeholder={entryModal === 'entrada' ? 'Ex: Serviço avulso' : 'Ex: Internet, Aluguel...'}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Data"
                                    type="date"
                                    value={entryForm.entry_date}
                                    onChange={(e) => setEntryForm({ ...entryForm, entry_date: e.target.value })}
                                />
                                <Input
                                    label="Valor (R$)"
                                    type="number"
                                    step="0.01"
                                    value={entryForm.amount}
                                    onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })}
                                />
                            </div>
                            <Input
                                label="Competência"
                                type="date"
                                value={entryForm.competence_date}
                                onChange={(e) => setEntryForm({ ...entryForm, competence_date: e.target.value })}
                            />
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Histórico</label>
                                <textarea
                                    value={entryForm.description}
                                    onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[80px] text-sm"
                                    placeholder="Descreva o lançamento..."
                                />
                            </div>
                            <Input
                                label="Cliente ou Fornecedor (opcional)"
                                value={entryForm.related_party}
                                onChange={(e) => setEntryForm({ ...entryForm, related_party: e.target.value })}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-6">
                            <Button type="button" variant="outline" onClick={closeEntryModal}>Cancelar</Button>
                            <Button type="button" onClick={submitManualEntry} disabled={isSubmittingEntry}>
                                {isSubmittingEntry ? 'Salvando...' : editingEntryId ? 'Salvar Alterações' : 'Salvar'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
