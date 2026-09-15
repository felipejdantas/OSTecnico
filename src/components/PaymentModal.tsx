import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Plus, Trash2 } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { supabase } from '../lib/supabase';
import { formatCurrency, type PaymentStatus } from '../lib/orderFinance';
import {
    PAYMENT_METHODS, PAYMENT_METHOD_LABELS, defaultReceivedDate, computePaymentStatus,
    type PaymentMethod, type OrderPaymentLeg,
} from '../lib/orderPayments';

interface PaymentModalProps {
    orderType: 'os' | 'venda';
    orderId: string;
    orderLabel: string;
    orderTotal: number;
    customerName?: string | null;
    tenantId: string;
    onClose: () => void;
    onUpdated: (newStatus: PaymentStatus) => void;
}

// One OS/Venda can be paid across several formas de pagamento, each landing
// on its own date (Pix hoje, cartão só amanhã) — every leg here becomes a
// real cash_entries row (source: 'pagamento') dated on its own received_date,
// linked back via order_payments so it can be undone. While the order has
// any legs registered, its own synthetic ledger row in CashFlow.tsx is
// skipped — the legs ARE its entradas now, not a lump sum on one date.
export function PaymentModal({ orderType, orderId, orderLabel, orderTotal, customerName, tenantId, onClose, onUpdated }: PaymentModalProps) {
    const [legs, setLegs] = useState<OrderPaymentLeg[]>([]);
    const [loading, setLoading] = useState(true);
    const [method, setMethod] = useState<PaymentMethod>('pix');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(defaultReceivedDate('pix'));
    const [isSaving, setIsSaving] = useState(false);

    const totalPaid = legs.reduce((s, l) => s + l.amount, 0);
    const remaining = Math.max(0, orderTotal - totalPaid);

    useEffect(() => {
        fetchLegs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    // Prefill with whatever's left to cover — the common case is "quita o
    // restante", editable for a partial amount.
    useEffect(() => {
        if (!loading) setAmount(remaining > 0 ? String(remaining.toFixed(2)) : '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, legs.length]);

    const fetchLegs = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('order_payments')
            .select('id, method, amount, received_date, cash_entry_id')
            .eq('order_type', orderType)
            .eq('order_id', orderId)
            .order('received_date');
        if (!error) setLegs((data || []) as OrderPaymentLeg[]);
        setLoading(false);
    };

    const syncOrderStatus = async (newlyPaid: number) => {
        const newStatus = computePaymentStatus(newlyPaid, orderTotal);
        const table = orderType === 'os' ? 'service_orders' : 'sales_orders';
        await supabase.from(table).update({
            payment_status: newStatus,
            paid_at: newStatus === 'pago' ? new Date().toISOString() : null,
        }).eq('id', orderId);
        onUpdated(newStatus);
    };

    const handleMethodChange = (m: PaymentMethod) => {
        setMethod(m);
        setDate(defaultReceivedDate(m));
    };

    const addLeg = async () => {
        const value = parseFloat(amount.replace(',', '.'));
        if (!value || value <= 0) {
            toast.error('Informe um valor válido.');
            return;
        }
        if (!date) {
            toast.error('Informe a data em que o valor cai na conta.');
            return;
        }
        setIsSaving(true);
        try {
            const methodLabel = PAYMENT_METHOD_LABELS[method];
            const { data: entry, error: entryError } = await supabase.from('cash_entries').insert([{
                user_id: tenantId,
                entry_date: date,
                competence_date: date,
                type: 'entrada',
                category: methodLabel,
                amount: value,
                description: `${orderLabel} · ${methodLabel}`,
                related_party: customerName || null,
                source: 'pagamento',
            }]).select('id').single();
            if (entryError) throw entryError;

            const { error: legError } = await supabase.from('order_payments').insert([{
                user_id: tenantId,
                order_type: orderType,
                order_id: orderId,
                method,
                amount: value,
                received_date: date,
                cash_entry_id: entry.id,
            }]);
            if (legError) throw legError;

            toast.success('Pagamento registrado!');
            await fetchLegs();
            await syncOrderStatus(totalPaid + value);
        } catch (error: any) {
            toast.error('Erro ao registrar pagamento: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const removeLeg = async (leg: OrderPaymentLeg) => {
        if (!confirm(`Remover o pagamento de ${formatCurrency(leg.amount)} (${PAYMENT_METHOD_LABELS[leg.method]})? Ele sai do Fluxo de Caixa também.`)) return;
        try {
            if (leg.cash_entry_id) {
                const { error } = await supabase.from('cash_entries').delete().eq('id', leg.cash_entry_id);
                if (error) throw error;
            }
            const { error } = await supabase.from('order_payments').delete().eq('id', leg.id);
            if (error) throw error;
            toast.success('Pagamento removido.');
            await fetchLegs();
            await syncOrderStatus(totalPaid - leg.amount);
        } catch (error: any) {
            toast.error('Erro ao remover pagamento: ' + error.message);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <Card className="max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-lg text-dark">Registrar Pagamento</h3>
                    <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">{orderLabel}{customerName ? ` · ${customerName}` : ''}</p>

                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <div className="p-2 bg-gray-50 rounded-xl">
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="font-semibold text-dark">{formatCurrency(orderTotal)}</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded-xl">
                        <p className="text-xs text-gray-500">Registrado</p>
                        <p className="font-semibold text-green-600">{formatCurrency(totalPaid)}</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded-xl">
                        <p className="text-xs text-gray-500">Restante</p>
                        <p className={`font-semibold ${remaining > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{formatCurrency(remaining)}</p>
                    </div>
                </div>

                {orderTotal <= 0 ? (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                        Não é possível registrar pagamento — esta {orderType === 'os' ? 'OS' : 'venda'} não tem valor.
                    </p>
                ) : (
                    <>
                        {legs.length > 0 && (
                            <div className="space-y-2 mb-4">
                                {legs.map(leg => (
                                    <div key={leg.id} className="flex items-center justify-between gap-3 p-2.5 bg-gray-50 rounded-xl">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-dark">{PAYMENT_METHOD_LABELS[leg.method]} · {formatCurrency(leg.amount)}</p>
                                            <p className="text-xs text-gray-500">Cai em {new Date(leg.received_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                                        </div>
                                        <button type="button" onClick={() => removeLeg(leg)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {remaining > 0 && (
                            <div className="space-y-3 border-t border-gray-100 pt-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">Forma de Pagamento</label>
                                    <div className="flex flex-wrap gap-2">
                                        {PAYMENT_METHODS.map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => handleMethodChange(m)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${method === m ? 'bg-primary-cyan text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                            >
                                                {PAYMENT_METHOD_LABELS[m]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Input label="Valor (R$)" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                                    <Input label="Cai na conta em" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                                </div>
                                <Button type="button" className="w-full" onClick={addLeg} disabled={isSaving}>
                                    <Plus className="w-4 h-4 mr-2" /> {isSaving ? 'Registrando...' : 'Registrar Pagamento'}
                                </Button>
                            </div>
                        )}

                        {remaining <= 0 && legs.length > 0 && (
                            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
                                Totalmente faturado.
                            </p>
                        )}
                    </>
                )}

                <Button type="button" variant="outline" className="w-full mt-4" onClick={onClose}>Fechar</Button>
            </Card>
        </div>
    );
}
