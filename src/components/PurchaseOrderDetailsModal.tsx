import { useEffect, useState } from 'react';
import { X, Truck, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/orderFinance';
import { Card } from './ui/Card';

type ItemRow = { id: string; product_name: string; quantity: number; unit_price: number };

type PurchaseRow = {
    id: string;
    purchase_number: number;
    purchase_date: string;
    expected_date: string | null;
    discount_value: number;
    freight: number;
    status: string;
    stock_added: boolean;
    account_added: boolean;
    suppliers: { name: string; phone: string | null } | null;
};

interface Props {
    purchaseId: string;
    onClose: () => void;
}

export function PurchaseOrderDetailsModal({ purchaseId, onClose }: Props) {
    const [loading, setLoading] = useState(true);
    const [purchase, setPurchase] = useState<PurchaseRow | null>(null);
    const [items, setItems] = useState<ItemRow[]>([]);

    useEffect(() => {
        fetchDetails();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [purchaseId]);

    const fetchDetails = async () => {
        setLoading(true);
        try {
            const [{ data: purchaseData, error: purchaseError }, { data: itemsData, error: itemsError }] = await Promise.all([
                supabase
                    .from('purchase_orders')
                    .select('id, purchase_number, purchase_date, expected_date, discount_value, freight, status, stock_added, account_added, suppliers (name, phone)')
                    .eq('id', purchaseId)
                    .single(),
                supabase
                    .from('purchase_order_items')
                    .select('id, product_name, quantity, unit_price')
                    .eq('purchase_order_id', purchaseId),
            ]);

            if (purchaseError) throw purchaseError;
            if (itemsError) throw itemsError;

            setPurchase(purchaseData as any);
            setItems(itemsData || []);
        } catch (error) {
            console.error('Error fetching purchase order details:', error);
        } finally {
            setLoading(false);
        }
    };

    const itemsTotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    const total = purchase ? Math.max(0, itemsTotal - (purchase.discount_value || 0) + (purchase.freight || 0)) : 0;

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <Card className="max-w-xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-lg text-dark flex items-center gap-2">
                            <Truck className="w-5 h-5 text-primary-cyan" />
                            Pedido de Compra {purchase ? `#${purchase.purchase_number}` : ''}
                        </h3>
                        <p className="text-sm text-gray-500">{purchase?.suppliers?.name || 'Fornecedor não informado'}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg flex-shrink-0">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {loading ? (
                    <p className="text-center text-gray-500 py-8">Carregando...</p>
                ) : !purchase ? (
                    <p className="text-center text-gray-500 py-8">Pedido não encontrado.</p>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-1 mb-4">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${purchase.status === 'finalizado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {purchase.status === 'finalizado' ? 'Finalizado' : 'Pendente'}
                            </span>
                            {purchase.stock_added && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Estoque OK</span>}
                            {purchase.account_added && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Caixa OK</span>}
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                <p className="text-xs text-gray-500">Data da Compra</p>
                                <p className="text-sm font-semibold text-dark">{new Date(purchase.purchase_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                <p className="text-xs text-gray-500">Data Prevista</p>
                                <p className="text-sm font-semibold text-dark">
                                    {purchase.expected_date ? new Date(purchase.expected_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                                </p>
                            </div>
                        </div>

                        <h4 className="text-sm font-semibold text-dark mb-2">Itens do Pedido</h4>
                        {items.length === 0 ? (
                            <p className="text-sm text-gray-500 mb-4">Nenhum item registrado.</p>
                        ) : (
                            <div className="space-y-1 mb-4">
                                {items.map(item => (
                                    <div key={item.id} className="flex items-center justify-between gap-2 text-sm text-gray-700 border-b border-gray-100 py-1.5 last:border-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                            <span className="truncate">{item.product_name} x{item.quantity}</span>
                                        </div>
                                        <span className="flex-shrink-0 text-gray-600">{formatCurrency(item.quantity * item.unit_price)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-1 pt-3 border-t border-gray-100 text-sm">
                            <div className="flex justify-between text-gray-600">
                                <span>Total dos produtos</span>
                                <span>{formatCurrency(itemsTotal)}</span>
                            </div>
                            {purchase.discount_value > 0 && (
                                <div className="flex justify-between text-gray-600">
                                    <span>Desconto</span>
                                    <span>- {formatCurrency(purchase.discount_value)}</span>
                                </div>
                            )}
                            {purchase.freight > 0 && (
                                <div className="flex justify-between text-gray-600">
                                    <span>Frete</span>
                                    <span>{formatCurrency(purchase.freight)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-base text-dark pt-1">
                                <span>Total do Pedido</span>
                                <span className="text-primary-cyan">{formatCurrency(total)}</span>
                            </div>
                        </div>
                    </>
                )}
            </Card>
        </div>
    );
}
