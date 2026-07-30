import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, FileText, Package, Wrench, ChevronRight, ShoppingCart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getStatusConfig } from '../lib/orderStatus';
import { calculateOrderTotal, formatCurrency, PAYMENT_STATUS_CONFIG, type DiscountType, type PaymentStatus } from '../lib/orderFinance';
import { Card } from './ui/Card';

type OrderItemRow = { service_order_id: string; product_name: string; quantity: number; unit_price: number };
type OrderServiceRow = { service_order_id: string; service_name: string; quantity: number; price: number };

type OrderRow = {
    id: string;
    os_number: number;
    created_at: string;
    equipment: string;
    equipment_type: string | null;
    brand: string | null;
    status: string;
    discount_type: DiscountType;
    discount_value: number;
    freight: number;
    urgency_fee: number;
};

type SaleItemRow = { sale_id: string; product_name: string; quantity: number; unit_price: number };

type SaleRow = {
    id: string;
    sale_number: number;
    sale_date: string;
    discount_type: DiscountType;
    discount_value: number;
    freight: number;
    other_costs: number;
    payment_status: PaymentStatus;
};

interface Props {
    customerId: string;
    customerName: string;
    onClose: () => void;
}

export function CustomerHistoryModal({ customerId, customerName, onClose }: Props) {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<OrderRow[]>([]);
    const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemRow[]>>({});
    const [servicesByOrder, setServicesByOrder] = useState<Record<string, OrderServiceRow[]>>({});
    const [sales, setSales] = useState<SaleRow[]>([]);
    const [itemsBySale, setItemsBySale] = useState<Record<string, SaleItemRow[]>>({});

    useEffect(() => {
        fetchHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerId]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const { data: ordersData, error } = await supabase
                .from('service_orders')
                .select('id, os_number, created_at, equipment, equipment_type, brand, status, discount_type, discount_value, freight, urgency_fee')
                .eq('customer_id', customerId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            const list = ordersData || [];
            setOrders(list);

            const orderIds = list.map(o => o.id);
            if (orderIds.length > 0) {
                const [{ data: itemsData }, { data: servicesData }] = await Promise.all([
                    supabase.from('service_order_items').select('service_order_id, product_name, quantity, unit_price').in('service_order_id', orderIds),
                    supabase.from('service_order_services').select('service_order_id, service_name, quantity, price').in('service_order_id', orderIds),
                ]);

                const itemsGrouped: Record<string, OrderItemRow[]> = {};
                for (const item of itemsData || []) {
                    (itemsGrouped[item.service_order_id] ||= []).push(item);
                }
                setItemsByOrder(itemsGrouped);

                const servicesGrouped: Record<string, OrderServiceRow[]> = {};
                for (const svc of servicesData || []) {
                    (servicesGrouped[svc.service_order_id] ||= []).push(svc);
                }
                setServicesByOrder(servicesGrouped);
            } else {
                setItemsByOrder({});
                setServicesByOrder({});
            }

            const { data: salesData, error: salesError } = await supabase
                .from('sales_orders')
                .select('id, sale_number, sale_date, discount_type, discount_value, freight, other_costs, payment_status')
                .eq('customer_id', customerId)
                .order('sale_date', { ascending: false });

            if (salesError) throw salesError;
            const salesList = salesData || [];
            setSales(salesList);

            const saleIds = salesList.map(s => s.id);
            if (saleIds.length > 0) {
                const { data: saleItemsData } = await supabase
                    .from('sale_items')
                    .select('sale_id, product_name, quantity, unit_price')
                    .in('sale_id', saleIds);

                const saleItemsGrouped: Record<string, SaleItemRow[]> = {};
                for (const item of saleItemsData || []) {
                    (saleItemsGrouped[item.sale_id] ||= []).push(item);
                }
                setItemsBySale(saleItemsGrouped);
            } else {
                setItemsBySale({});
            }
        } catch (error) {
            console.error('Error fetching customer history:', error);
        } finally {
            setLoading(false);
        }
    };

    const orderTotal = (order: OrderRow) => {
        const itemsTotal = (itemsByOrder[order.id] || []).reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
        const servicesTotal = (servicesByOrder[order.id] || []).reduce((sum, s) => sum + s.quantity * s.price, 0);
        return calculateOrderTotal({
            itemsTotal,
            servicesTotal,
            discountType: order.discount_type || 'fixed',
            discountValue: order.discount_value || 0,
            freight: order.freight || 0,
            urgencyFee: order.urgency_fee || 0,
        }).total;
    };

    const saleTotal = (sale: SaleRow) => {
        const itemsTotal = (itemsBySale[sale.id] || []).reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
        return calculateOrderTotal({
            itemsTotal,
            servicesTotal: 0,
            discountType: sale.discount_type || 'fixed',
            discountValue: sale.discount_value || 0,
            freight: sale.freight || 0,
            urgencyFee: sale.other_costs || 0,
        }).total;
    };

    const totalSpentOS = orders
        .filter(o => o.status !== 'cancelado')
        .reduce((sum, o) => sum + orderTotal(o), 0);
    const totalSpentSales = sales.reduce((sum, s) => sum + saleTotal(s), 0);
    const totalSpent = totalSpentOS + totalSpentSales;

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <Card className="max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-lg text-dark">Histórico de {customerName}</h3>
                        <p className="text-sm text-gray-500">Ordens de serviço, vendas e produtos utilizados</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg flex-shrink-0">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {loading ? (
                    <p className="text-center text-gray-500 py-8">Carregando...</p>
                ) : orders.length === 0 && sales.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Nenhuma OS ou venda registrada para este cliente ainda.</p>
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                <p className="text-xs text-gray-500">Total Gasto</p>
                                <p className="text-lg font-bold text-dark">{formatCurrency(totalSpent)}</p>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                <p className="text-xs text-gray-500">Total de OS</p>
                                <p className="text-lg font-bold text-dark">{orders.length}</p>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                <p className="text-xs text-gray-500">Total de Vendas</p>
                                <p className="text-lg font-bold text-dark">{sales.length}</p>
                            </div>
                        </div>

                        {orders.length > 0 && (
                        <>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ordens de Serviço</h4>
                        <div className="space-y-3 mb-6">
                            {orders.map(order => {
                                const statusConfig = getStatusConfig(order.status);
                                const items = itemsByOrder[order.id] || [];
                                const services = servicesByOrder[order.id] || [];
                                return (
                                    <button
                                        type="button"
                                        key={order.id}
                                        onClick={() => navigate(`/editar-os/${order.id}`)}
                                        title="Clique para abrir e editar esta OS"
                                        className="w-full text-left border border-gray-200 rounded-xl p-3 hover:border-primary-cyan hover:bg-primary-cyan/5 transition-colors touch-manipulation"
                                    >
                                        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                            <div className="flex items-center gap-2">
                                                <FileText className="w-4 h-4 text-primary-cyan" />
                                                <span className="font-semibold text-dark">OS #{order.os_number}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                                                    {statusConfig.shortLabel}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <span className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
                                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600 mb-2">
                                            {[order.equipment_type, order.brand, order.equipment].filter(Boolean).join(' · ')}
                                        </p>

                                        {(items.length > 0 || services.length > 0) && (
                                            <div className="space-y-1 mb-2">
                                                {services.map((s, i) => (
                                                    <div key={`s-${i}`} className="flex items-center gap-2 text-xs text-gray-600">
                                                        <Wrench className="w-3 h-3 flex-shrink-0" />
                                                        {s.service_name}{s.quantity > 1 ? ` x${s.quantity}` : ''}
                                                    </div>
                                                ))}
                                                {items.map((it, i) => (
                                                    <div key={`i-${i}`} className="flex items-center gap-2 text-xs text-gray-600">
                                                        <Package className="w-3 h-3 flex-shrink-0" />
                                                        {it.product_name} x{it.quantity}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="text-right font-semibold text-sm text-dark">
                                            {formatCurrency(orderTotal(order))}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        </>
                        )}

                        {sales.length > 0 && (
                        <>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Vendas</h4>
                        <div className="space-y-3">
                            {sales.map(sale => {
                                const saleItems = itemsBySale[sale.id] || [];
                                return (
                                    <button
                                        type="button"
                                        key={sale.id}
                                        onClick={() => navigate('/vendas')}
                                        title="Clique para abrir os Pedidos de Venda"
                                        className="w-full text-left border border-gray-200 rounded-xl p-3 hover:border-primary-cyan hover:bg-primary-cyan/5 transition-colors touch-manipulation"
                                    >
                                        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                            <div className="flex items-center gap-2">
                                                <ShoppingCart className="w-4 h-4 text-primary-cyan" />
                                                <span className="font-semibold text-dark">Venda #{sale.sale_number}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_CONFIG[sale.payment_status || 'nao_pago'].color}`}>
                                                    {PAYMENT_STATUS_CONFIG[sale.payment_status || 'nao_pago'].label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <span className="text-xs text-gray-500">{new Date(sale.sale_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>

                                        {saleItems.length > 0 && (
                                            <div className="space-y-1 mb-2">
                                                {saleItems.map((it, i) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                                                        <Package className="w-3 h-3 flex-shrink-0" />
                                                        {it.product_name} x{it.quantity}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="text-right font-semibold text-sm text-dark">
                                            {formatCurrency(saleTotal(sale))}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        </>
                        )}
                    </>
                )}
            </Card>
        </div>
    );
}
