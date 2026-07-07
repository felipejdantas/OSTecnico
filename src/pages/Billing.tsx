import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Wallet, FileText } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculateOrderTotal, formatCurrency, PAYMENT_STATUS_CONFIG, type PaymentStatus } from '../lib/orderFinance';

type BillingRow = {
    id: string;
    os_number: number;
    completed_date: string;
    customer_name: string;
    total: number;
    payment_status: PaymentStatus;
};

export default function Billing() {
    const { user } = useAuth();
    const [monthDate, setMonthDate] = useState(() => new Date());
    const [rows, setRows] = useState<BillingRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'todos' | PaymentStatus>('todos');

    useEffect(() => {
        if (user) fetchMonth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, monthDate]);

    const fetchMonth = async () => {
        if (!user) return;
        setLoading(true);

        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const startDate = new Date(year, month, 1).toISOString().slice(0, 10);
        const endDate = new Date(year, month + 1, 0).toISOString().slice(0, 10);

        const { data: orders } = await supabase
            .from('service_orders')
            .select('id, os_number, completed_date, discount_type, discount_value, freight, urgency_fee, payment_status, customers (name)')
            .eq('user_id', user.id)
            .gte('completed_date', startDate)
            .lte('completed_date', endDate)
            .order('completed_date', { ascending: true });

        if (!orders || orders.length === 0) {
            setRows([]);
            setLoading(false);
            return;
        }

        const orderIds = orders.map((o: any) => o.id);
        const [{ data: items }, { data: services }] = await Promise.all([
            supabase.from('service_order_items').select('service_order_id, quantity, unit_price').in('service_order_id', orderIds),
            supabase.from('service_order_services').select('service_order_id, quantity, price').in('service_order_id', orderIds),
        ]);

        const computed = orders.map((o: any) => {
            const itemsTotal = (items || [])
                .filter((i: any) => i.service_order_id === o.id)
                .reduce((sum: number, i: any) => sum + i.quantity * i.unit_price, 0);
            const servicesTotal = (services || [])
                .filter((s: any) => s.service_order_id === o.id)
                .reduce((sum: number, s: any) => sum + s.quantity * s.price, 0);
            const { total } = calculateOrderTotal({
                itemsTotal,
                servicesTotal,
                discountType: o.discount_type || 'fixed',
                discountValue: o.discount_value || 0,
                freight: o.freight || 0,
                urgencyFee: o.urgency_fee || 0,
            });
            return {
                id: o.id,
                os_number: o.os_number,
                completed_date: o.completed_date,
                customer_name: o.customers?.name || 'N/A',
                total,
                payment_status: (o.payment_status || 'nao_pago') as PaymentStatus,
            };
        });

        setRows(computed);
        setLoading(false);
    };

    const togglePaymentStatus = async (orderId: string, currentStatus: PaymentStatus) => {
        const newStatus: PaymentStatus = currentStatus === 'pago' ? 'nao_pago' : 'pago';
        const { error } = await supabase
            .from('service_orders')
            .update({ payment_status: newStatus, paid_at: newStatus === 'pago' ? new Date().toISOString() : null })
            .eq('id', orderId);

        if (!error) {
            setRows(prev => prev.map(r => r.id === orderId ? { ...r, payment_status: newStatus } : r));
        }
    };

    const monthTotal = rows.reduce((sum, r) => sum + r.total, 0);
    const faturadoTotal = rows.filter(r => r.payment_status === 'pago').reduce((sum, r) => sum + r.total, 0);
    const aReceberTotal = rows.filter(r => r.payment_status === 'nao_pago').reduce((sum, r) => sum + r.total, 0);
    const monthLabel = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const changeMonth = (delta: number) => {
        setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1));
    };

    const filteredRows = rows.filter(r => filter === 'todos' || r.payment_status === filter);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-cyan/10 flex items-center justify-center flex-shrink-0">
                    <Wallet className="w-6 h-6 text-primary-cyan" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-dark">Faturamento</h2>
                    <p className="text-gray-500">Receita das ordens de serviço concluídas, por mês</p>
                </div>
            </div>

            <Card className="bg-gradient-to-br from-primary-cyan/10 to-primary-cyan/5">
                <div className="flex items-center justify-between mb-3">
                    <button
                        type="button"
                        onClick={() => changeMonth(-1)}
                        className="p-2 hover:bg-white/60 rounded-lg transition-colors touch-manipulation"
                        aria-label="Mês anterior"
                    >
                        <ChevronLeft className="w-5 h-5 text-primary-cyan" />
                    </button>
                    <h3 className="font-semibold text-lg text-dark capitalize">{monthLabel}</h3>
                    <button
                        type="button"
                        onClick={() => changeMonth(1)}
                        className="p-2 hover:bg-white/60 rounded-lg transition-colors touch-manipulation"
                        aria-label="Próximo mês"
                    >
                        <ChevronRight className="w-5 h-5 text-primary-cyan" />
                    </button>
                </div>
                <p className="text-center text-3xl sm:text-4xl font-bold text-primary-cyan">{formatCurrency(monthTotal)}</p>
                <p className="text-center text-sm text-gray-500 mt-1">
                    {rows.length} OS concluída{rows.length !== 1 ? 's' : ''} neste mês
                </p>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Card
                    className={`cursor-pointer transition-shadow hover:shadow-md ${filter === 'pago' ? 'ring-2 ring-green-500' : ''} bg-gradient-to-br from-green-100/50 to-green-50/30`}
                    onClick={() => setFilter(filter === 'pago' ? 'todos' : 'pago')}
                >
                    <p className="text-xs sm:text-sm text-gray-600">Faturado</p>
                    <p className="text-xl sm:text-2xl font-bold text-green-700">{formatCurrency(faturadoTotal)}</p>
                </Card>
                <Card
                    className={`cursor-pointer transition-shadow hover:shadow-md ${filter === 'nao_pago' ? 'ring-2 ring-amber-500' : ''} bg-gradient-to-br from-amber-100/50 to-amber-50/30`}
                    onClick={() => setFilter(filter === 'nao_pago' ? 'todos' : 'nao_pago')}
                >
                    <p className="text-xs sm:text-sm text-gray-600">A Receber</p>
                    <p className="text-xl sm:text-2xl font-bold text-amber-700">{formatCurrency(aReceberTotal)}</p>
                </Card>
            </div>

            <Card className="p-0 overflow-hidden">
                {loading ? (
                    <p className="text-center text-gray-500 py-8">Carregando...</p>
                ) : filteredRows.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Nenhuma OS encontrada</p>
                ) : (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3">OS</th>
                                        <th className="px-6 py-3">Cliente</th>
                                        <th className="px-6 py-3">Concluído em</th>
                                        <th className="px-6 py-3">Pagamento</th>
                                        <th className="px-6 py-3 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRows.map(r => (
                                        <tr key={r.id} className="bg-white border-b hover:bg-gray-50">
                                            <td className="px-6 py-4 font-semibold text-primary-cyan">#{r.os_number}</td>
                                            <td className="px-6 py-4 text-gray-900">{r.customer_name}</td>
                                            <td className="px-6 py-4 text-gray-600">{new Date(r.completed_date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                            <td className="px-6 py-4">
                                                <button
                                                    type="button"
                                                    onClick={() => togglePaymentStatus(r.id, r.payment_status)}
                                                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${PAYMENT_STATUS_CONFIG[r.payment_status].color}`}
                                                >
                                                    {PAYMENT_STATUS_CONFIG[r.payment_status].label}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-dark">{formatCurrency(r.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 font-bold">
                                        <td className="px-6 py-3" colSpan={4}>Total ({filter === 'todos' ? 'geral' : PAYMENT_STATUS_CONFIG[filter].label})</td>
                                        <td className="px-6 py-3 text-right text-primary-cyan">
                                            {formatCurrency(filteredRows.reduce((sum, r) => sum + r.total, 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="md:hidden space-y-3 p-4">
                            {filteredRows.map(r => (
                                <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-primary-cyan" />
                                            <span className="font-semibold text-primary-cyan">#{r.os_number}</span>
                                        </div>
                                        <span className="font-bold text-dark">{formatCurrency(r.total)}</span>
                                    </div>
                                    <p className="text-sm text-gray-700">{r.customer_name}</p>
                                    <div className="flex items-center justify-between mt-2">
                                        <p className="text-xs text-gray-400">{new Date(r.completed_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                                        <button
                                            type="button"
                                            onClick={() => togglePaymentStatus(r.id, r.payment_status)}
                                            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${PAYMENT_STATUS_CONFIG[r.payment_status].color}`}
                                        >
                                            {PAYMENT_STATUS_CONFIG[r.payment_status].label}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </Card>
        </div>
    );
}
