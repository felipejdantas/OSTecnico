import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileText, User, Calendar, Star, PenTool, FileDown, Edit, Copy, Trash2, MessageCircle, Mail, ChevronDown, ChevronUp, AlertTriangle, X, Search, Calculator } from 'lucide-react';
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
import { PAYMENT_STATUS_CONFIG, calculateOrderTotal, formatCurrency, type PaymentStatus } from '../lib/orderFinance';
import { elapsedBusinessHours, isBudgetOverdue, BUDGET_SLA_BUSINESS_HOURS } from '../lib/businessHours';
import { matchesSearchFields } from '../lib/search';

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
    discount_type: 'fixed' | 'percent' | null;
    discount_value: number | null;
    freight: number | null;
    urgency_fee: number | null;
    total: number;
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
type RankedRow = { label: string; count: number; revenue: number };
type LowStockProduct = { id: string; name: string; unit: string; stock_quantity: number; min_stock_alert: number };
type TrendPoint = { label: string; count: number };
type TrendGranularity = 'dia' | 'semana' | 'mes';

// Single-series horizontal bar (magnitude, one hue) — no legend needed, the
// card title already names the series. Direct-labeled since there are only ~5 rows.
function RankedBarRow({ label, count, maxCount, suffix }: { label: string; count: number; maxCount: number; suffix?: string }) {
    const widthPct = maxCount > 0 ? Math.max((count / maxCount) * 100, 4) : 0;
    return (
        <div className="text-sm">
            <div className="flex justify-between gap-2 mb-1">
                <span className="text-gray-700 truncate">{label}</span>
                <span className="text-gray-500 flex-shrink-0">{count}{suffix}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-primary-cyan" style={{ width: `${widthPct}%` }} />
            </div>
        </div>
    );
}

// Validated adjacent-safe categorical slots (CVD-checked order) — only used
// here, where multiple named segments share one bar, so identity actually
// needs distinct hues instead of one magnitude hue.
const CATEGORICAL_SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

// Part-to-whole (composition): a pie, colored with validated adjacent-safe
// categorical slots. The legend below is the identity channel (never
// color-alone) and carries the count/share so the pie itself stays unlabeled.
function ServicesPie({ rows }: { rows: RankedRow[] }) {
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    if (total === 0) return null;

    let cumulative = 0;
    const segments = rows.map((r, i) => {
        const startDeg = (cumulative / total) * 360;
        cumulative += r.count;
        const endDeg = (cumulative / total) * 360;
        return { ...r, color: CATEGORICAL_SLOTS[i % CATEGORICAL_SLOTS.length], startDeg, endDeg };
    });
    const gradient = segments.map(s => `${s.color} ${s.startDeg}deg ${s.endDeg}deg`).join(', ');

    return (
        <div className="flex flex-col items-center">
            <div
                className="w-36 h-36 rounded-full flex-shrink-0"
                style={{ background: `conic-gradient(${gradient})` }}
                role="img"
                aria-label={segments.map(s => `${s.label}: ${s.count}`).join(', ')}
            />
            <div className="w-full mt-4 space-y-2">
                {segments.map(s => (
                    <div key={s.label} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-gray-600 truncate flex-1 min-w-0">{s.label}</span>
                        <span className="text-gray-400 flex-shrink-0">{s.count}</span>
                        <span className="text-gray-300 flex-shrink-0 w-10 text-right">{Math.round((s.count / total) * 100)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Meter: a ratio against a limit (stock vs. its minimum threshold), not a
// ranking — the fill's severity deepens the further under the line it sits,
// and the tick marks exactly where "minimum" is so the gap is legible at a glance.
function StockMeterRow({ product }: { product: LowStockProduct }) {
    const { name, unit, stock_quantity, min_stock_alert } = product;
    const scaleMax = Math.max(min_stock_alert * 1.4, stock_quantity, 1);
    const fillPct = Math.max((stock_quantity / scaleMax) * 100, stock_quantity > 0 ? 3 : 0);
    const tickPct = Math.min((min_stock_alert / scaleMax) * 100, 100);
    const severity = stock_quantity === 0 ? '#d03b3b' : stock_quantity <= min_stock_alert / 2 ? '#ec835a' : '#fab219';
    return (
        <div className="text-sm">
            <div className="flex justify-between gap-2 mb-1">
                <span className="text-gray-700 truncate">{name}</span>
                <span className="text-gray-500 flex-shrink-0">{stock_quantity} {unit} <span className="text-gray-300">/ mín {min_stock_alert}</span></span>
            </div>
            <div className="relative h-2.5 rounded-full bg-red-50 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${fillPct}%`, backgroundColor: severity }} />
                <div className="absolute top-0 bottom-0 w-px bg-gray-400/70" style={{ left: `${tickPct}%` }} title={`Mínimo: ${min_stock_alert} ${unit}`} />
            </div>
        </div>
    );
}

// Trend over time (line, not columns) — the job here is "is it going up or
// down," which a line reads at a glance; only the current month is
// direct-labeled (marks-and-anatomy: never a number on every point), the
// rest live in each dot's hover/focus title.
function TrendLine({ months }: { months: TrendPoint[] }) {
    const width = 800;
    const height = 260;
    const padX = 30;
    const padY = 36;
    const maxCount = Math.max(...months.map(m => m.count), 1);
    const stepX = (width - padX * 2) / Math.max(months.length - 1, 1);
    const points = months.map((m, i) => ({
        x: padX + i * stepX,
        y: padY + (1 - m.count / maxCount) * (height - padY * 2),
        ...m,
    }));
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;
    const last = points[points.length - 1];

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: `${height}px` }}>
            <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#e1e0d9" strokeWidth={1} />
            <path d={areaPath} fill="#0891b2" opacity={0.1} />
            <path d={linePath} fill="none" stroke="#0891b2" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            {points.map(p => (
                <g key={p.label}>
                    <circle cx={p.x} cy={p.y} r={6} fill="#0891b2" stroke="#fff" strokeWidth={2.5}>
                        <title>{`${p.label}: ${p.count} OS`}</title>
                    </circle>
                    <text x={p.x} y={height - 10} textAnchor="middle" fontSize={12} fill="#898781" className="capitalize">{p.label}</text>
                </g>
            ))}
            <text x={last.x} y={last.y - 16} textAnchor="middle" fontSize={18} fontWeight={700} fill="#1f2937">{last.count}</text>
        </svg>
    );
}

export default function Dashboard() {
    const { tenantId } = useAuth();
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isListOpen, setIsListOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'todos' | 'em_andamento' | OrderStatus>('todos');
    const [searchTerm, setSearchTerm] = useState('');
    const [overdueBudgets, setOverdueBudgets] = useState<OverdueBudget[]>([]);
    const [showOverdueAlert, setShowOverdueAlert] = useState(false);
    const [topServicesMonth, setTopServicesMonth] = useState<RankedRow[]>([]);
    const [topPartsMonth, setTopPartsMonth] = useState<RankedRow[]>([]);
    const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
    const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>('mes');
    const navigate = useNavigate();

    const openList = (filter: 'todos' | 'em_andamento' | OrderStatus) => {
        setStatusFilter(filter);
        setIsListOpen(true);
    };

    useEffect(() => {
        if (tenantId) {
            fetchOrders();
            fetchLowStock();
        }
    }, [tenantId]);

    const fetchLowStock = async () => {
        if (!tenantId) return;
        const { data, error } = await supabase
            .from('products')
            .select('id, name, unit, stock_quantity, min_stock_alert')
            .eq('user_id', tenantId);
        if (error) {
            console.error('Error fetching low stock products:', error);
            return;
        }
        const low = (data || [])
            .filter(p => p.stock_quantity <= p.min_stock_alert)
            .sort((a, b) => a.stock_quantity - b.stock_quantity)
            .slice(0, 5);
        setLowStockProducts(low);
    };

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
        if (!tenantId) return;

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
          discount_type,
          discount_value,
          freight,
          urgency_fee,
          is_pinned,
          signature_token,
          client_signed_at,
          budget_approved_at,
          customers (name, phone, email, cpf, cnpj, company_name, trade_name),
          technicians (name)
        `)
                .eq('user_id', tenantId)
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            const fetchedOrders = (data as any) || [];

            const orderIds = fetchedOrders.map((o: any) => o.id);
            const itemsByOrder: Record<string, { quantity: number; unit_price: number }[]> = {};
            const servicesByOrder: Record<string, { quantity: number; price: number }[]> = {};
            if (orderIds.length > 0) {
                const [{ data: itemsData }, { data: servicesData }] = await Promise.all([
                    supabase.from('service_order_items').select('service_order_id, product_name, quantity, unit_price, created_at').in('service_order_id', orderIds),
                    supabase.from('service_order_services').select('service_order_id, service_name, quantity, price, created_at').in('service_order_id', orderIds),
                ]);
                for (const item of itemsData || []) {
                    (itemsByOrder[item.service_order_id] ||= []).push(item);
                }
                for (const line of servicesData || []) {
                    (servicesByOrder[line.service_order_id] ||= []).push(line);
                }

                // "This month" ranking — what actually left the shop recently, not
                // all-time totals (which would just crown whatever's been sold longest).
                const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
                const rankByName = (rows: { name: string; quantity: number; price: number; created_at: string }[]): RankedRow[] => {
                    const totals = new Map<string, RankedRow>();
                    for (const row of rows) {
                        if (new Date(row.created_at) < startOfMonth) continue;
                        const entry = totals.get(row.name) || { label: row.name, count: 0, revenue: 0 };
                        entry.count += row.quantity;
                        entry.revenue += row.quantity * row.price;
                        totals.set(row.name, entry);
                    }
                    return [...totals.values()].sort((a, b) => b.count - a.count).slice(0, 5);
                };

                setTopPartsMonth(rankByName((itemsData || []).map((i: any) => ({ name: i.product_name, quantity: i.quantity, price: i.unit_price, created_at: i.created_at }))));
                setTopServicesMonth(rankByName((servicesData || []).map((s: any) => ({ name: s.service_name, quantity: s.quantity, price: s.price, created_at: s.created_at }))));
            }

            const enrichedOrders: ServiceOrder[] = fetchedOrders.map((o: any) => {
                const itemsTotal = (itemsByOrder[o.id] || []).reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
                const servicesTotal = (servicesByOrder[o.id] || []).reduce((sum, s) => sum + s.quantity * s.price, 0);
                const { total } = calculateOrderTotal({
                    itemsTotal,
                    servicesTotal,
                    discountType: o.discount_type || 'fixed',
                    discountValue: o.discount_value || 0,
                    freight: o.freight || 0,
                    urgencyFee: o.urgency_fee || 0,
                });
                return { ...o, total };
            });

            setOrders(enrichedOrders);
            await checkBudgetDeadlines(enrichedOrders);
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

    const deleteOS = async (orderId: string, osNumber: number, status: string) => {
        if (!tenantId) return;

        if (status === 'pronto' || status === 'entregue') {
            toast.error('OS finalizada — mude o status antes de excluir, para evitar exclusões acidentais.');
            return;
        }

        if (!confirm(`Tem certeza que deseja excluir a OS #${osNumber}?`)) return;

        try {
            const { error } = await supabase
                .from('service_orders')
                .delete()
                .eq('id', orderId)
                .eq('user_id', tenantId);

            if (error) throw error;
            toast.success('OS excluída com sucesso!');
            fetchOrders();
        } catch (error: any) {
            console.error('Error deleting OS:', error);
            toast.error('Erro ao excluir OS: ' + error.message);
        }
    };

    const duplicateOS = async (orderId: string) => {
        if (!tenantId || !confirm('Tem certeza que deseja duplicar esta OS?')) return;

        try {
            // 1. Fetch original OS data
            const { data: originalOS, error: fetchError } = await supabase
                .from('service_orders')
                .select('*')
                .eq('id', orderId)
                .eq('user_id', tenantId)
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
                    user_id: tenantId,
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
        if (!tenantId) return;

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
                    .eq('user_id', tenantId)
                    .single(),
                supabase.from('service_order_items').select('*').eq('service_order_id', orderId),
                supabase.from('service_order_services').select('*').eq('service_order_id', orderId),
                supabase.from('company_settings').select('*').eq('user_id', tenantId).maybeSingle(),
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
                warranty_days: data.warranty_days,
                warranty_notes: data.warranty_notes,
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
        if (!order.budget_approved_at && order.status !== 'cancelado' && order.status !== 'entregue') return 'approval';
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
        if (matchesSearchFields([
            o.equipment, o.brand, o.equipment_type,
            customer?.name, customer?.company_name, customer?.trade_name,
            o.technicians?.name,
        ], searchTerm)) return true;
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

    // OS volume trend, derived from what's already loaded (`orders` already
    // holds full history) — granularity is view-only, no extra round trip.
    const ddmm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const startOfWeek = (d: Date) => {
        const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const day = date.getDay();
        date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day)); // Monday
        return date;
    };

    const trendData = useMemo<TrendPoint[]>(() => {
        const now = new Date();
        const points: TrendPoint[] = [];

        if (trendGranularity === 'mes') {
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
                const count = orders.filter(o => {
                    const c = new Date(o.created_at);
                    return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
                }).length;
                points.push({ label, count });
            }
        } else if (trendGranularity === 'semana') {
            const thisWeekStart = startOfWeek(now);
            for (let i = 7; i >= 0; i--) {
                const weekStart = new Date(thisWeekStart);
                weekStart.setDate(weekStart.getDate() - i * 7);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 7);
                const count = orders.filter(o => {
                    const c = new Date(o.created_at);
                    return c >= weekStart && c < weekEnd;
                }).length;
                points.push({ label: ddmm(weekStart), count });
            }
        } else {
            for (let i = 9; i >= 0; i--) {
                const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                const nextDay = new Date(day);
                nextDay.setDate(nextDay.getDate() + 1);
                const count = orders.filter(o => {
                    const c = new Date(o.created_at);
                    return c >= day && c < nextDay;
                }).length;
                points.push({ label: ddmm(day), count });
            }
        }

        return points;
    }, [orders, trendGranularity]);

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
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate('/orcamentos')}>
                        <Calculator className="w-4 h-4 mr-2" />
                        Orçamento
                    </Button>
                    <Button onClick={() => navigate('/nova-os')}>
                        Nova Ordem de Serviço
                    </Button>
                </div>
            </div>

            {/* Stats Cards: every status, including entregue/cancelado */}
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-4">
                {allStatuses.map(s => {
                    const count = orders.filter(o => o.status === s).length;
                    return (
                        <Card
                            key={s}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => openList(s)}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">{STATUS_CONFIG[s].shortLabel}</p>
                                    <p className="text-2xl sm:text-3xl font-bold text-dark">{count}</p>
                                </div>
                                <span className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${STATUS_CONFIG[s].dot}`} />
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
                        {statusFilter !== 'todos' && (
                            <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
                                Filtrando por: <span className="px-2 py-0.5 rounded-full font-medium bg-primary-cyan/10 text-primary-cyan">{statusFilter === 'em_andamento' ? 'Em andamento' : STATUS_CONFIG[statusFilter].shortLabel}</span>
                                <button type="button" onClick={() => setStatusFilter('todos')} className="text-primary-cyan hover:underline">
                                    Limpar filtro
                                </button>
                            </div>
                        )}

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
                                                {order.budget_approved_at ? (
                                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                                        Orçamento aprovado
                                                    </span>
                                                ) : order.status !== 'entregue' && order.status !== 'cancelado' && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                                        Orçamento pendente
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

                                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                            </div>

                                            {order.total > 0 && (
                                                <p className="font-bold text-base text-dark">{formatCurrency(order.total)}</p>
                                            )}
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
                                                    onClick: () => deleteOS(order.id, order.os_number, order.status),
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

            {/* Attention panel: monthly rankings + stock alerts + volume trend */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card>
                    <h3 className="font-semibold text-base sm:text-lg mb-4">Serviços mais realizados no mês</h3>
                    {topServicesMonth.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Nenhum serviço registrado este mês ainda.</p>
                    ) : (
                        <ServicesPie rows={topServicesMonth} />
                    )}
                </Card>

                <Card>
                    <h3 className="font-semibold text-base sm:text-lg mb-4">Produtos mais vendidos</h3>
                    {topPartsMonth.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Nenhuma peça usada este mês ainda.</p>
                    ) : (
                        <div className="space-y-3">
                            {topPartsMonth.map(row => (
                                <RankedBarRow key={row.label} label={row.label} count={row.count} maxCount={topPartsMonth[0].count} />
                            ))}
                        </div>
                    )}
                </Card>

                <Card>
                    <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <h3 className="font-semibold text-base sm:text-lg">Estoque abaixo do mínimo</h3>
                    </div>
                    {lowStockProducts.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Nenhum produto abaixo do estoque mínimo.</p>
                    ) : (
                        <div className="space-y-3">
                            {lowStockProducts.map(p => (
                                <StockMeterRow key={p.id} product={p} />
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            <Card>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-base sm:text-lg">
                        OS abertas por {trendGranularity === 'dia' ? 'dia' : trendGranularity === 'semana' ? 'semana' : 'mês'}
                    </h3>
                    <div className="flex items-center gap-2 text-xs">
                        {(['dia', 'semana', 'mes'] as const).map(g => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => setTrendGranularity(g)}
                                className={trendGranularity === g ? 'text-primary-cyan font-semibold' : 'text-gray-400 hover:text-gray-600'}
                            >
                                {g === 'dia' ? 'Dia' : g === 'semana' ? 'Semana' : 'Mês'}
                            </button>
                        ))}
                    </div>
                </div>
                <TrendLine months={trendData} />
            </Card>

            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => navigate('/orcamentos')}>
                    <Calculator className="w-4 h-4 mr-2" />
                    Orçamento
                </Button>
                <Button onClick={() => navigate('/nova-os')}>
                    Nova Ordem de Serviço
                </Button>
            </div>
        </div>
    );
}
