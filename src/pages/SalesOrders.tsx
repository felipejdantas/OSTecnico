import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Search, Edit2, Trash2, ShoppingCart, Save, FileDown, MessageCircle, User, Calendar } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { WarrantyBadge } from '../components/WarrantyBadge';
import SaleItemsSection, { type SaleItem } from '../components/SaleItemsSection';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculateOrderTotal, formatCurrency, PAYMENT_STATUS_CONFIG, type PaymentStatus } from '../lib/orderFinance';
import { generateSalesPDF } from '../lib/pdfGenerator';
import { openWhatsApp } from '../lib/shareLinks';

const saleSchema = z.object({
    customerId: z.string().min(1, 'Selecione um cliente'),
    sellerTechnicianId: z.string().optional(),
    saleDate: z.string().min(1, 'Informe a data da venda'),
    billingDate: z.string().optional(),
    discountType: z.enum(['fixed', 'percent']),
    discountValue: z.coerce.number().min(0, 'Valor inválido').optional(),
    otherCosts: z.coerce.number().min(0, 'Valor inválido').optional(),
    warrantyDays: z.coerce.number().int('Deve ser um número inteiro').min(0, 'Valor inválido').optional(),
    warrantyNotes: z.string().optional(),
});

type SaleFormInput = z.input<typeof saleSchema>;
type SaleForm = z.output<typeof saleSchema>;

export default function SalesOrders() {
    const { user } = useAuth();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [customers, setCustomers] = useState<any[]>([]);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [sales, setSales] = useState<any[]>([]);
    const [items, setItems] = useState<SaleItem[]>([]);
    const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('nao_pago');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register, handleSubmit, control, reset, setValue, formState: { errors } } = useForm<SaleFormInput, any, SaleForm>({
        resolver: zodResolver(saleSchema),
        defaultValues: {
            saleDate: new Date().toISOString().slice(0, 10),
            discountType: 'fixed',
        },
    });

    useEffect(() => {
        if (user) fetchAll();
    }, [user]);

    const fetchAll = async () => {
        if (!user) return;

        const [{ data: customersData }, { data: techniciansData }] = await Promise.all([
            supabase.from('customers').select('id, name').eq('user_id', user.id).order('name'),
            supabase.from('technicians').select('id, name').eq('user_id', user.id).order('name'),
        ]);
        if (customersData) setCustomers(customersData);
        if (techniciansData) setTechnicians(techniciansData);

        await fetchSales();
    };

    const fetchSales = async () => {
        if (!user) return;

        const { data: salesData, error } = await supabase
            .from('sales_orders')
            .select('id, sale_number, sale_date, billing_date, customer_id, seller_technician_id, discount_type, discount_value, other_costs, warranty_days, warranty_notes, payment_status, customers (name, phone), technicians (name)')
            .eq('user_id', user.id)
            .order('sale_date', { ascending: false })
            .order('sale_number', { ascending: false });

        if (error) {
            console.error('Error fetching sales orders:', error);
            return;
        }

        const list = salesData || [];
        const saleIds = list.map((s: any) => s.id);
        let itemsBySale: Record<string, { quantity: number; unit_price: number }[]> = {};
        if (saleIds.length > 0) {
            const { data: itemsData } = await supabase
                .from('sale_items')
                .select('sale_id, quantity, unit_price')
                .in('sale_id', saleIds);
            itemsBySale = {};
            for (const item of itemsData || []) {
                (itemsBySale[item.sale_id] ||= []).push(item);
            }
        }

        const computed = list.map((s: any) => {
            const itemsTotal = (itemsBySale[s.id] || []).reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
            const { total } = calculateOrderTotal({
                itemsTotal,
                servicesTotal: 0,
                discountType: s.discount_type || 'fixed',
                discountValue: s.discount_value || 0,
                freight: s.other_costs || 0,
                urgencyFee: 0,
            });
            return { ...s, total, itemCount: (itemsBySale[s.id] || []).length };
        });

        setSales(computed);
    };

    const handleEdit = async (sale: any) => {
        setEditingId(sale.id);
        setValue('customerId', sale.customer_id);
        setValue('sellerTechnicianId', sale.seller_technician_id || '');
        setValue('saleDate', sale.sale_date);
        setValue('billingDate', sale.billing_date || '');
        setValue('discountType', sale.discount_type || 'fixed');
        setValue('discountValue', sale.discount_value || 0);
        setValue('otherCosts', sale.other_costs || 0);
        setValue('warrantyDays', sale.warranty_days ?? undefined);
        setValue('warrantyNotes', sale.warranty_notes || '');
        setPaymentStatus(sale.payment_status || 'nao_pago');

        const { data: saleItems } = await supabase
            .from('sale_items')
            .select('id, product_id, product_name, quantity, unit_price')
            .eq('sale_id', sale.id);
        setItems(saleItems || []);

        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingId(null);
        setItems([]);
        setPaymentStatus('nao_pago');
        reset({ saleDate: new Date().toISOString().slice(0, 10), discountType: 'fixed' });
    };

    const onSubmit = async (data: SaleForm) => {
        if (!user) return;
        if (!editingId && items.length === 0) {
            toast.error('Adicione pelo menos um produto à venda.');
            return;
        }
        if (editingId && !confirm('Tem certeza que deseja atualizar esta venda?')) return;

        setIsSubmitting(true);
        try {
            const row = {
                customer_id: data.customerId,
                seller_technician_id: data.sellerTechnicianId || null,
                sale_date: data.saleDate,
                billing_date: data.billingDate || null,
                discount_type: data.discountType,
                discount_value: data.discountValue || 0,
                other_costs: data.otherCosts || 0,
                warranty_days: data.warrantyDays ?? null,
                warranty_notes: data.warrantyNotes || null,
                payment_status: paymentStatus,
                paid_at: paymentStatus === 'pago' ? new Date().toISOString() : null,
            };

            if (editingId) {
                const { error } = await supabase
                    .from('sales_orders')
                    .update(row)
                    .eq('id', editingId)
                    .eq('user_id', user.id);
                if (error) throw error;
                toast.success('Venda atualizada com sucesso!');
            } else {
                const { data: created, error } = await supabase
                    .from('sales_orders')
                    .insert([{ ...row, user_id: user.id }])
                    .select('id')
                    .single();
                if (error) throw error;

                const { error: itemsError } = await supabase.from('sale_items').insert(
                    items.map(item => ({
                        sale_id: created.id,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                    }))
                );
                if (itemsError) throw itemsError;
                toast.success('Venda registrada com sucesso!');
            }

            handleCancel();
            fetchSales();
        } catch (error: any) {
            toast.error('Erro ao salvar venda: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string, saleNumber: number) => {
        if (!user || !confirm(`Tem certeza que deseja excluir a venda #${saleNumber}? O estoque dos produtos será restaurado.`)) return;

        try {
            const { error } = await supabase.from('sales_orders').delete().eq('id', id).eq('user_id', user.id);
            if (error) throw error;
            toast.success('Venda excluída com sucesso!');
            fetchSales();
        } catch (error: any) {
            toast.error('Erro ao excluir venda: ' + error.message);
        }
    };

    const togglePaymentStatus = async (sale: any) => {
        const newStatus: PaymentStatus = sale.payment_status === 'pago' ? 'nao_pago' : 'pago';
        try {
            const { error } = await supabase
                .from('sales_orders')
                .update({ payment_status: newStatus, paid_at: newStatus === 'pago' ? new Date().toISOString() : null })
                .eq('id', sale.id);
            if (error) throw error;
            fetchSales();
        } catch (error: any) {
            toast.error('Erro ao atualizar pagamento: ' + error.message);
        }
    };

    const exportPDF = async (saleId: string) => {
        if (!user) return;

        try {
            const [{ data, error }, { data: itemsData }, { data: companyData }] = await Promise.all([
                supabase
                    .from('sales_orders')
                    .select(`
          *,
          customers (name, cpf, phone, email, address, number, cnpj, company_name, trade_name, state_registration, municipal_registration),
          technicians (name)
        `)
                    .eq('id', saleId)
                    .eq('user_id', user.id)
                    .single(),
                supabase.from('sale_items').select('*').eq('sale_id', saleId),
                supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle(),
            ]);

            if (error) throw error;

            await generateSalesPDF({
                sale_number: data.sale_number,
                sale_date: data.sale_date,
                customer: data.customers,
                seller: data.technicians,
                items: itemsData || [],
                discount_type: data.discount_type || 'fixed',
                discount_value: data.discount_value || 0,
                other_costs: data.other_costs || 0,
                payment_status: data.payment_status,
                warranty_days: data.warranty_days,
                warranty_notes: data.warranty_notes,
                company: companyData || undefined,
            });
        } catch (error: any) {
            console.error('Error exporting PDF:', error);
            toast.error('Erro ao gerar PDF: ' + (error.message || 'Verifique o console para mais detalhes'));
        }
    };

    const shareViaWhatsApp = (sale: any) => {
        if (!sale.customers?.phone) {
            toast.error('Cliente sem telefone cadastrado');
            return;
        }
        const message = `Olá ${sale.customers.name}! Segue o resumo do seu Pedido de Venda #${sale.sale_number}, no valor de ${formatCurrency(sale.total)}. Qualquer dúvida, estou à disposição!`;
        openWhatsApp(sale.customers.phone, message);
    };

    const itemsSubtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

    const filteredSales = sales.filter(s =>
        String(s.sale_number).includes(searchTerm) ||
        s.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Pedidos de Venda</h2>
                    <p className="text-gray-500">Venda de produtos avulsos, sem vínculo com uma OS</p>
                </div>
                <Button onClick={() => { if (isFormOpen) handleCancel(); else setIsFormOpen(true); }}>
                    {isFormOpen ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Nova Venda</>}
                </Button>
            </div>

            {isFormOpen && (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                    <Card>
                        <h3 className="font-semibold text-base sm:text-lg mb-4">Dados da Venda</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-600">Cliente</label>
                                <Controller
                                    name="customerId"
                                    control={control}
                                    render={({ field }) => (
                                        <SearchableSelect
                                            value={field.value || ''}
                                            onChange={field.onChange}
                                            placeholder="Buscar cliente..."
                                            error={errors.customerId?.message}
                                            options={customers.map(c => ({ value: c.id, label: c.name }))}
                                        />
                                    )}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-600">Vendedor</label>
                                <select
                                    {...register('sellerTechnicianId')}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm sm:text-base"
                                >
                                    <option value="">Não informado</option>
                                    {technicians.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>

                            <Input label="Data da Venda" type="date" {...register('saleDate')} error={errors.saleDate?.message} />

                            <div>
                                <Input label="Data de Faturamento (opcional)" type="date" {...register('billingDate')} />
                                <p className="text-xs text-gray-400 mt-1">
                                    Em qual dia essa venda deve contar no Fluxo de Caixa. Deixe em branco para usar a Data da Venda.
                                </p>
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-600">Pagamento</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentStatus('nao_pago')}
                                        className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${paymentStatus === 'nao_pago' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        A Receber
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentStatus('pago')}
                                        className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${paymentStatus === 'pago' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        Faturado
                                    </button>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <SaleItemsSection saleId={editingId || undefined} items={items} onChange={setItems} />

                    <Card>
                        <h3 className="font-semibold text-base sm:text-lg mb-4">Totais</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-600">Tipo de Desconto</label>
                                <select
                                    {...register('discountType')}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm sm:text-base"
                                >
                                    <option value="fixed">Valor Fixo (R$)</option>
                                    <option value="percent">Percentual (%)</option>
                                </select>
                            </div>
                            <Input label="Desconto" type="number" step="0.01" {...register('discountValue')} error={errors.discountValue?.message} />
                            <Input label="Outras Despesas (R$)" type="number" step="0.01" {...register('otherCosts')} error={errors.otherCosts?.message} />
                        </div>
                        <div className="flex justify-between pt-4 mt-4 border-t border-gray-100 font-semibold text-dark">
                            <span>Total dos itens</span>
                            <span>{formatCurrency(itemsSubtotal)}</span>
                        </div>
                    </Card>

                    <Card>
                        <h3 className="font-semibold text-base sm:text-lg mb-4">Garantia</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Dias de Garantia"
                                type="number"
                                {...register('warrantyDays')}
                                error={errors.warrantyDays?.message}
                                placeholder="Ex: 90"
                            />
                            <div className="sm:col-span-2">
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Observação da Garantia</label>
                                <textarea
                                    {...register('warrantyNotes')}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[80px] text-sm sm:text-base"
                                    placeholder="Ex: garantia cobre apenas defeito de fábrica..."
                                />
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">A contagem da garantia começa na data da venda.</p>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            <Save className="w-4 h-4 mr-2" />
                            {isSubmitting ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Registrar Venda'}
                        </Button>
                    </div>
                </form>
            )}

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por cliente ou número da venda..."
                        className="bg-transparent border-none focus:outline-none w-full text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="p-4 space-y-3">
                    {filteredSales.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">Nenhuma venda registrada ainda</p>
                    ) : (
                        filteredSales.map(sale => (
                            <div
                                key={sale.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-gray-200 rounded-xl hover:shadow-md transition-all"
                            >
                                <div className="flex items-start gap-4 flex-1 mb-3 sm:mb-0">
                                    <div className="w-12 h-12 rounded-full bg-primary-cyan/10 flex items-center justify-center flex-shrink-0">
                                        <ShoppingCart className="w-6 h-6 text-primary-cyan" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <span className="font-bold text-primary-cyan text-lg">Venda #{sale.sale_number}</span>
                                            <button
                                                type="button"
                                                onClick={() => togglePaymentStatus(sale)}
                                                className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${PAYMENT_STATUS_CONFIG[sale.payment_status as PaymentStatus].color}`}
                                                title="Clique para alternar entre Faturado / A Receber"
                                            >
                                                {PAYMENT_STATUS_CONFIG[sale.payment_status as PaymentStatus].label}
                                            </button>
                                            <WarrantyBadge completedDate={sale.sale_date} warrantyDays={sale.warranty_days} />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleEdit(sale)}
                                            title="Clique para atualizar a venda"
                                            className="flex items-center gap-2 mb-1 hover:underline text-left"
                                        >
                                            <User className="w-4 h-4 text-primary-cyan" />
                                            <span className="font-semibold text-dark text-base">{sale.customers?.name || 'N/A'}</span>
                                        </button>

                                        <p className="text-sm text-gray-600 mb-1">
                                            {sale.itemCount} {sale.itemCount === 1 ? 'item' : 'itens'} · {formatCurrency(sale.total)}
                                        </p>

                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(sale.sale_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => shareViaWhatsApp(sale)}
                                        className="touch-manipulation min-w-[40px] text-green-600 border-green-200 hover:bg-green-50"
                                        title="Enviar por WhatsApp"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                    </Button>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => exportPDF(sale.id)}
                                        className="touch-manipulation min-w-[40px]"
                                        title="Exportar PDF"
                                    >
                                        <FileDown className="w-4 h-4" />
                                    </Button>

                                    <DropdownMenu
                                        items={[
                                            {
                                                label: 'Atualizar',
                                                icon: <Edit2 className="w-4 h-4" />,
                                                onClick: () => handleEdit(sale),
                                            },
                                            {
                                                label: 'Excluir',
                                                icon: <Trash2 className="w-4 h-4" />,
                                                onClick: () => handleDelete(sale.id, sale.sale_number),
                                                variant: 'danger' as const,
                                            },
                                        ]}
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
