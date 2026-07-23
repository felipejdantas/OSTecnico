import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
    Plus, Search, Edit2, Trash2, Calculator, Save, FileDown, MessageCircle,
    User, Calendar, Wrench, ShoppingCart, XCircle, Undo2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import QuoteItemsSection, { type QuoteItem } from '../components/QuoteItemsSection';
import QuoteServicesSection, { type QuoteServiceLine } from '../components/QuoteServicesSection';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculateOrderTotal, formatCurrency } from '../lib/orderFinance';
import { generateQuotePDF } from '../lib/pdfGenerator';
import { openWhatsApp } from '../lib/shareLinks';

const quoteSchema = z.object({
    customerId: z.string().min(1, 'Selecione um cliente'),
    quoteDate: z.string().min(1, 'Informe a data do orçamento'),
    validUntil: z.string().optional(),
    equipment: z.string().optional(),
    notes: z.string().optional(),
    discountType: z.enum(['fixed', 'percent']),
    discountValue: z.coerce.number().min(0, 'Valor inválido').optional(),
    otherCosts: z.coerce.number().min(0, 'Valor inválido').optional(),
});

type QuoteFormInput = z.input<typeof quoteSchema>;
type QuoteForm = z.output<typeof quoteSchema>;

const QUOTE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    aberto: { label: 'Aberto', color: 'bg-blue-100 text-blue-700' },
    convertido: { label: 'Convertido', color: 'bg-green-100 text-green-700' },
    recusado: { label: 'Recusado', color: 'bg-red-100 text-red-700' },
};

export default function Quotes() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingStatus, setEditingStatus] = useState<{ status: string; converted_to: string | null; converted_order_id: string | null } | null>(null);
    const [customers, setCustomers] = useState<any[]>([]);
    const [quotes, setQuotes] = useState<any[]>([]);
    const [items, setItems] = useState<QuoteItem[]>([]);
    const [services, setServices] = useState<QuoteServiceLine[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const { register, handleSubmit, control, reset, setValue, formState: { errors } } = useForm<QuoteFormInput, any, QuoteForm>({
        resolver: zodResolver(quoteSchema),
        defaultValues: {
            quoteDate: new Date().toISOString().slice(0, 10),
            discountType: 'fixed',
        },
    });

    useEffect(() => {
        if (user) fetchAll();
    }, [user]);

    const fetchAll = async () => {
        if (!user) return;
        const { data: customersData } = await supabase.from('customers').select('id, name, phone').eq('user_id', user.id).order('name');
        if (customersData) setCustomers(customersData);
        await fetchQuotes();
    };

    const fetchQuotes = async () => {
        if (!user) return;

        const { data: quotesData, error } = await supabase
            .from('quotes')
            .select('id, quote_number, quote_date, valid_until, customer_id, equipment, notes, discount_type, discount_value, other_costs, status, converted_to, converted_order_id, customers (name, phone)')
            .eq('user_id', user.id)
            .order('quote_date', { ascending: false })
            .order('quote_number', { ascending: false });

        if (error) {
            console.error('Error fetching quotes:', error);
            return;
        }

        const list = quotesData || [];
        const quoteIds = list.map((q: any) => q.id);
        let itemsByQuote: Record<string, { quantity: number; unit_price: number }[]> = {};
        let servicesByQuote: Record<string, { quantity: number; price: number }[]> = {};
        if (quoteIds.length > 0) {
            const [{ data: itemsData }, { data: servicesData }] = await Promise.all([
                supabase.from('quote_items').select('quote_id, quantity, unit_price').in('quote_id', quoteIds),
                supabase.from('quote_services').select('quote_id, quantity, price').in('quote_id', quoteIds),
            ]);
            for (const item of itemsData || []) {
                (itemsByQuote[item.quote_id] ||= []).push(item);
            }
            for (const line of servicesData || []) {
                (servicesByQuote[line.quote_id] ||= []).push(line);
            }
        }

        const computed = list.map((q: any) => {
            const itemsTotal = (itemsByQuote[q.id] || []).reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
            const servicesTotal = (servicesByQuote[q.id] || []).reduce((sum, s) => sum + s.quantity * s.price, 0);
            const { total } = calculateOrderTotal({
                itemsTotal,
                servicesTotal,
                discountType: q.discount_type || 'fixed',
                discountValue: q.discount_value || 0,
                freight: q.other_costs || 0,
                urgencyFee: 0,
            });
            return { ...q, total, itemCount: (itemsByQuote[q.id] || []).length, serviceCount: (servicesByQuote[q.id] || []).length };
        });

        setQuotes(computed);
    };

    const handleEdit = async (quote: any) => {
        setEditingId(quote.id);
        setEditingStatus({ status: quote.status, converted_to: quote.converted_to, converted_order_id: quote.converted_order_id });
        setValue('customerId', quote.customer_id);
        setValue('quoteDate', quote.quote_date);
        setValue('validUntil', quote.valid_until || '');
        setValue('equipment', quote.equipment || '');
        setValue('notes', quote.notes || '');
        setValue('discountType', quote.discount_type || 'fixed');
        setValue('discountValue', quote.discount_value || 0);
        setValue('otherCosts', quote.other_costs || 0);

        const [{ data: quoteItems }, { data: quoteServices }] = await Promise.all([
            supabase.from('quote_items').select('id, product_id, product_name, quantity, unit_price').eq('quote_id', quote.id),
            supabase.from('quote_services').select('id, service_id, service_name, description, quantity, price').eq('quote_id', quote.id),
        ]);
        setItems(quoteItems || []);
        setServices(quoteServices || []);

        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingId(null);
        setEditingStatus(null);
        setItems([]);
        setServices([]);
        reset({ quoteDate: new Date().toISOString().slice(0, 10), discountType: 'fixed' });
    };

    const onSubmit = async (data: QuoteForm) => {
        if (!user) return;
        if (!editingId && items.length === 0 && services.length === 0) {
            toast.error('Adicione pelo menos um produto ou serviço ao orçamento.');
            return;
        }

        setIsSubmitting(true);
        try {
            const row = {
                customer_id: data.customerId,
                quote_date: data.quoteDate,
                valid_until: data.validUntil || null,
                equipment: data.equipment || null,
                notes: data.notes || null,
                discount_type: data.discountType,
                discount_value: data.discountValue || 0,
                other_costs: data.otherCosts || 0,
            };

            if (editingId) {
                const { error } = await supabase.from('quotes').update(row).eq('id', editingId).eq('user_id', user.id);
                if (error) throw error;
                toast.success('Orçamento atualizado!');
            } else {
                const { data: created, error } = await supabase
                    .from('quotes')
                    .insert([{ ...row, user_id: user.id }])
                    .select('id')
                    .single();
                if (error) throw error;

                if (items.length > 0) {
                    const { error: itemsError } = await supabase.from('quote_items').insert(
                        items.map(item => ({
                            quote_id: created.id,
                            product_id: item.product_id,
                            product_name: item.product_name,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                        }))
                    );
                    if (itemsError) throw itemsError;
                }

                if (services.length > 0) {
                    const { error: servicesError } = await supabase.from('quote_services').insert(
                        services.map(line => ({
                            quote_id: created.id,
                            service_id: line.service_id,
                            service_name: line.service_name,
                            description: line.description,
                            quantity: line.quantity,
                            price: line.price,
                        }))
                    );
                    if (servicesError) throw servicesError;
                }

                toast.success('Orçamento registrado!');
            }

            handleCancel();
            fetchQuotes();
        } catch (error: any) {
            toast.error('Erro ao salvar orçamento: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string, quoteNumber: number) => {
        if (!user || !confirm(`Tem certeza que deseja excluir o orçamento #${quoteNumber}?`)) return;

        try {
            const { error } = await supabase.from('quotes').delete().eq('id', id).eq('user_id', user.id);
            if (error) throw error;
            toast.success('Orçamento excluído!');
            fetchQuotes();
        } catch (error: any) {
            toast.error('Erro ao excluir orçamento: ' + error.message);
        }
    };

    const convertToOSFor = async (quote: any) => {
        if (!user) return;
        if (!confirm(`Confirma converter o orçamento #${quote.quote_number} em uma nova OS?`)) return;

        setIsActionLoading(true);
        try {
            const [{ data: quoteItems }, { data: quoteServices }] = await Promise.all([
                supabase.from('quote_items').select('product_id, product_name, quantity, unit_price').eq('quote_id', quote.id),
                supabase.from('quote_services').select('service_id, service_name, description, quantity, price').eq('quote_id', quote.id),
            ]);

            const { data: newOS, error } = await supabase
                .from('service_orders')
                .insert([{
                    user_id: user.id,
                    customer_id: quote.customer_id,
                    equipment: quote.equipment || 'Não especificado',
                    problem_description: quote.notes || null,
                    discount_type: quote.discount_type || 'fixed',
                    discount_value: quote.discount_value || 0,
                    freight: quote.other_costs || 0,
                }])
                .select('id, os_number')
                .single();
            if (error) throw error;

            if (quoteItems && quoteItems.length > 0) {
                const { error: itemsError } = await supabase.from('service_order_items').insert(
                    quoteItems.map(i => ({ service_order_id: newOS.id, ...i }))
                );
                if (itemsError) throw itemsError;
            }
            if (quoteServices && quoteServices.length > 0) {
                const { error: servicesError } = await supabase.from('service_order_services').insert(
                    quoteServices.map(s => ({ service_order_id: newOS.id, ...s }))
                );
                if (servicesError) throw servicesError;
            }

            const { error: updateError } = await supabase
                .from('quotes')
                .update({ status: 'convertido', converted_to: 'os', converted_order_id: newOS.id })
                .eq('id', quote.id);
            if (updateError) throw updateError;

            toast.success(`Convertido em OS #${newOS.os_number}!`);
            navigate(`/editar-os/${newOS.id}`);
        } catch (error: any) {
            toast.error('Erro ao converter em OS: ' + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const convertToSaleFor = async (quote: any) => {
        if (!user) return;
        if (quote.serviceCount > 0) {
            const proceed = confirm(
                `Este orçamento tem ${quote.serviceCount} serviço(s) que não serão transferidos, pois Pedido de Venda não suporta serviços. Deseja continuar?`
            );
            if (!proceed) return;
        } else {
            if (!confirm(`Confirma converter o orçamento #${quote.quote_number} em um novo Pedido de Venda?`)) return;
        }

        setIsActionLoading(true);
        try {
            const { data: quoteItems } = await supabase
                .from('quote_items')
                .select('product_id, product_name, quantity, unit_price')
                .eq('quote_id', quote.id);

            const { data: newSale, error } = await supabase
                .from('sales_orders')
                .insert([{
                    user_id: user.id,
                    customer_id: quote.customer_id,
                    sale_date: new Date().toISOString().slice(0, 10),
                    discount_type: quote.discount_type || 'fixed',
                    discount_value: quote.discount_value || 0,
                    other_costs: quote.other_costs || 0,
                    payment_status: 'nao_pago',
                }])
                .select('id, sale_number')
                .single();
            if (error) throw error;

            if (quoteItems && quoteItems.length > 0) {
                const { error: itemsError } = await supabase.from('sale_items').insert(
                    quoteItems.map(i => ({ sale_id: newSale.id, ...i }))
                );
                if (itemsError) throw itemsError;
            }

            const { error: updateError } = await supabase
                .from('quotes')
                .update({ status: 'convertido', converted_to: 'venda', converted_order_id: newSale.id })
                .eq('id', quote.id);
            if (updateError) throw updateError;

            toast.success(`Convertido em Pedido de Venda #${newSale.sale_number}!`);
            navigate('/vendas');
        } catch (error: any) {
            toast.error('Erro ao converter em Pedido de Venda: ' + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const markRejectedFor = async (quote: any) => {
        if (!confirm(`Marcar o orçamento #${quote.quote_number} como recusado?`)) return;
        try {
            const { error } = await supabase.from('quotes').update({ status: 'recusado' }).eq('id', quote.id);
            if (error) throw error;
            if (editingId === quote.id) setEditingStatus(prev => prev ? { ...prev, status: 'recusado' } : prev);
            toast.success('Orçamento marcado como recusado.');
            fetchQuotes();
        } catch (error: any) {
            toast.error('Erro ao atualizar orçamento: ' + error.message);
        }
    };

    const reopenQuoteFor = async (quote: any) => {
        if (!confirm(`Reabrir o orçamento #${quote.quote_number}?`)) return;
        try {
            const { error } = await supabase.from('quotes').update({ status: 'aberto' }).eq('id', quote.id);
            if (error) throw error;
            if (editingId === quote.id) setEditingStatus(prev => prev ? { ...prev, status: 'aberto' } : prev);
            toast.success('Orçamento reaberto!');
            fetchQuotes();
        } catch (error: any) {
            toast.error('Erro ao reabrir orçamento: ' + error.message);
        }
    };

    const convertToOS = () => {
        const quote = quotes.find(q => q.id === editingId);
        if (quote) convertToOSFor(quote);
    };
    const convertToSale = () => {
        const quote = quotes.find(q => q.id === editingId);
        if (quote) convertToSaleFor(quote);
    };
    const markRejected = () => {
        const quote = quotes.find(q => q.id === editingId);
        if (quote) markRejectedFor(quote);
    };
    const reopenQuote = () => {
        const quote = quotes.find(q => q.id === editingId);
        if (quote) reopenQuoteFor(quote);
    };

    const exportPDF = async (quoteId: string) => {
        if (!user) return;
        try {
            const [{ data, error }, { data: itemsData }, { data: servicesData }, { data: companyData }] = await Promise.all([
                supabase
                    .from('quotes')
                    .select('*, customers (name, cpf, phone, email, address, number, cnpj, company_name, trade_name, state_registration, municipal_registration)')
                    .eq('id', quoteId)
                    .eq('user_id', user.id)
                    .single(),
                supabase.from('quote_items').select('*').eq('quote_id', quoteId),
                supabase.from('quote_services').select('*').eq('quote_id', quoteId),
                supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle(),
            ]);

            if (error) throw error;

            await generateQuotePDF({
                quote_number: data.quote_number,
                quote_date: data.quote_date,
                valid_until: data.valid_until,
                customer: data.customers,
                equipment: data.equipment,
                notes: data.notes,
                items: itemsData || [],
                services: servicesData || [],
                discount_type: data.discount_type || 'fixed',
                discount_value: data.discount_value || 0,
                other_costs: data.other_costs || 0,
                company: companyData || undefined,
            });
        } catch (error: any) {
            console.error('Error exporting PDF:', error);
            toast.error('Erro ao gerar PDF: ' + (error.message || 'Verifique o console para mais detalhes'));
        }
    };

    const shareViaWhatsApp = (quote: any) => {
        if (!quote.customers?.phone) {
            toast.error('Cliente sem telefone cadastrado');
            return;
        }
        const validity = quote.valid_until ? ` Válido até ${new Date(quote.valid_until + 'T00:00:00').toLocaleDateString('pt-BR')}.` : '';
        const message = `Olá ${quote.customers.name}! Segue o orçamento #${quote.quote_number}, no valor de ${formatCurrency(quote.total)}.${validity} Qualquer dúvida, estou à disposição!`;
        openWhatsApp(quote.customers.phone, message);
    };

    const itemsSubtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    const servicesSubtotal = services.reduce((sum, l) => sum + l.quantity * l.price, 0);

    const filteredQuotes = quotes.filter(q =>
        String(q.quote_number).includes(searchTerm) ||
        q.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isLocked = editingStatus?.status === 'convertido';

    const quoteMenuItems = (q: any) => [
        ...(q.status === 'aberto' ? [
            { label: 'Converter em OS', icon: <Wrench className="w-4 h-4" />, onClick: () => convertToOSFor(q) },
            { label: 'Converter em Pedido de Venda', icon: <ShoppingCart className="w-4 h-4" />, onClick: () => convertToSaleFor(q) },
            { label: 'Marcar como Recusado', icon: <XCircle className="w-4 h-4" />, onClick: () => markRejectedFor(q) },
        ] : []),
        ...(q.status === 'recusado' ? [
            { label: 'Reabrir Orçamento', icon: <Undo2 className="w-4 h-4" />, onClick: () => reopenQuoteFor(q) },
        ] : []),
        { label: 'Exportar PDF', icon: <FileDown className="w-4 h-4" />, onClick: () => exportPDF(q.id) },
        { label: 'Enviar por WhatsApp', icon: <MessageCircle className="w-4 h-4" />, onClick: () => shareViaWhatsApp(q) },
        { label: 'Atualizar', icon: <Edit2 className="w-4 h-4" />, onClick: () => handleEdit(q) },
        { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => handleDelete(q.id, q.quote_number), variant: 'danger' as const },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Orçamentos</h2>
                    <p className="text-gray-500">Monte um orçamento antes de virar OS ou Pedido de Venda</p>
                </div>
                <Button onClick={() => { if (isFormOpen) handleCancel(); else setIsFormOpen(true); }}>
                    {isFormOpen ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Novo Orçamento</>}
                </Button>
            </div>

            {isFormOpen && (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                    <Card>
                        <h3 className="font-semibold text-base sm:text-lg mb-4">Dados do Orçamento</h3>
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
                                            disabled={isLocked}
                                            options={customers.map(c => ({ value: c.id, label: c.name }))}
                                        />
                                    )}
                                />
                            </div>

                            <Input label="Equipamento (opcional)" {...register('equipment')} disabled={isLocked} placeholder="Ex: Notebook Dell Inspiron" />

                            <Input label="Data do Orçamento" type="date" {...register('quoteDate')} error={errors.quoteDate?.message} disabled={isLocked} />
                            <Input label="Válido até (opcional)" type="date" {...register('validUntil')} disabled={isLocked} />

                            <div className="sm:col-span-2">
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Observações (opcional)</label>
                                <textarea
                                    {...register('notes')}
                                    disabled={isLocked}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[80px] text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                                    placeholder="Descrição do problema, condições do orçamento..."
                                />
                            </div>
                        </div>
                    </Card>

                    <QuoteServicesSection quoteId={editingId || undefined} lines={services} onChange={setServices} disabled={isLocked} />
                    <QuoteItemsSection quoteId={editingId || undefined} items={items} onChange={setItems} disabled={isLocked} />

                    <Card>
                        <h3 className="font-semibold text-base sm:text-lg mb-4">Totais</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-600">Tipo de Desconto</label>
                                <select
                                    {...register('discountType')}
                                    disabled={isLocked}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                                >
                                    <option value="fixed">Valor Fixo (R$)</option>
                                    <option value="percent">Percentual (%)</option>
                                </select>
                            </div>
                            <Input label="Desconto" type="number" step="0.01" {...register('discountValue')} error={errors.discountValue?.message} disabled={isLocked} />
                            <Input label="Outras Despesas (R$)" type="number" step="0.01" {...register('otherCosts')} error={errors.otherCosts?.message} disabled={isLocked} />
                        </div>
                        <div className="flex justify-between pt-4 mt-4 border-t border-gray-100 text-sm text-gray-600">
                            <span>Total dos serviços</span>
                            <span>{formatCurrency(servicesSubtotal)}</span>
                        </div>
                        <div className="flex justify-between pt-1 text-sm text-gray-600">
                            <span>Total dos produtos</span>
                            <span>{formatCurrency(itemsSubtotal)}</span>
                        </div>
                    </Card>

                    {editingId && (
                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-1">Ações do Orçamento</h3>
                            <p className="text-xs text-gray-500 mb-4">
                                {isLocked
                                    ? `Este orçamento já foi convertido em ${editingStatus?.converted_to === 'os' ? 'uma OS' : 'um Pedido de Venda'} e não pode mais ser editado.`
                                    : 'Converta em OS ou Pedido de Venda quando o cliente aprovar, ou marque como recusado.'}
                            </p>
                            <div className="flex flex-wrap gap-3">
                                {!isLocked && editingStatus?.status !== 'recusado' && (
                                    <>
                                        <Button type="button" variant="primary" disabled={isActionLoading} onClick={convertToOS}>
                                            <Wrench className="w-4 h-4 mr-2" /> Converter em OS
                                        </Button>
                                        <Button type="button" variant="primary" disabled={isActionLoading} onClick={convertToSale}>
                                            <ShoppingCart className="w-4 h-4 mr-2" /> Converter em Pedido de Venda
                                        </Button>
                                        <Button type="button" variant="outline" disabled={isActionLoading} onClick={markRejected}>
                                            <XCircle className="w-4 h-4 mr-2" /> Marcar como Recusado
                                        </Button>
                                    </>
                                )}
                                {!isLocked && editingStatus?.status === 'recusado' && (
                                    <Button type="button" variant="outline" onClick={reopenQuote}>
                                        <Undo2 className="w-4 h-4 mr-2" /> Reabrir Orçamento
                                    </Button>
                                )}
                            </div>
                        </Card>
                    )}

                    {!isLocked && (
                        <div className="flex justify-end gap-3">
                            <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                <Save className="w-4 h-4 mr-2" />
                                {isSubmitting ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Registrar Orçamento'}
                            </Button>
                        </div>
                    )}
                </form>
            )}

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por cliente ou número do orçamento..."
                        className="bg-transparent border-none focus:outline-none w-full text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="p-4 space-y-3">
                    {filteredQuotes.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">Nenhum orçamento registrado ainda</p>
                    ) : (
                        filteredQuotes.map(quote => (
                            <div
                                key={quote.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-gray-200 rounded-xl hover:shadow-md transition-all"
                            >
                                <div className="flex items-start gap-4 flex-1 mb-3 sm:mb-0">
                                    <div className="w-12 h-12 rounded-full bg-primary-cyan/10 flex items-center justify-center flex-shrink-0">
                                        <Calculator className="w-6 h-6 text-primary-cyan" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <span className="font-bold text-primary-cyan text-lg">Orçamento #{quote.quote_number}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${QUOTE_STATUS_CONFIG[quote.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                                                {QUOTE_STATUS_CONFIG[quote.status]?.label || quote.status}
                                            </span>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleEdit(quote)}
                                            title="Clique para atualizar o orçamento"
                                            className="flex items-center gap-2 mb-1 hover:underline text-left"
                                        >
                                            <User className="w-4 h-4 text-primary-cyan" />
                                            <span className="font-semibold text-dark text-base">{quote.customers?.name || 'N/A'}</span>
                                        </button>

                                        <p className="text-sm text-gray-600 mb-1">
                                            {quote.itemCount} produto(s) · {quote.serviceCount} serviço(s) · {formatCurrency(quote.total)}
                                        </p>

                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(quote.quote_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => shareViaWhatsApp(quote)}
                                        className="touch-manipulation min-w-[40px] text-green-600 border-green-200 hover:bg-green-50"
                                        title="Enviar por WhatsApp"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                    </Button>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => exportPDF(quote.id)}
                                        className="touch-manipulation min-w-[40px]"
                                        title="Exportar PDF"
                                    >
                                        <FileDown className="w-4 h-4" />
                                    </Button>

                                    <DropdownMenu items={quoteMenuItems(quote)} />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
