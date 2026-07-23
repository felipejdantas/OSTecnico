import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Search, Edit2, Trash2, Truck, Save, PackageCheck, Wallet, CheckCircle2, UserPlus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import PurchaseItemsSection, { type PurchaseItem } from '../components/PurchaseItemsSection';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/orderFinance';

const purchaseSchema = z.object({
    supplierId: z.string().min(1, 'Selecione um fornecedor'),
    purchaseDate: z.string().min(1, 'Informe a data da compra'),
    expectedDate: z.string().optional(),
    discountValue: z.coerce.number().min(0, 'Valor inválido').optional(),
    freight: z.coerce.number().min(0, 'Valor inválido').optional(),
});

type PurchaseFormInput = z.input<typeof purchaseSchema>;
type PurchaseForm = z.output<typeof purchaseSchema>;

export default function PurchaseOrders() {
    const { user } = useAuth();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingStatus, setEditingStatus] = useState<{ status: string; stock_added: boolean; account_added: boolean } | null>(null);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [items, setItems] = useState<PurchaseItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState('');
    const [newSupplierPhone, setNewSupplierPhone] = useState('');

    const { register, handleSubmit, control, reset, setValue, watch, formState: { errors } } = useForm<PurchaseFormInput, any, PurchaseForm>({
        resolver: zodResolver(purchaseSchema),
        defaultValues: { purchaseDate: new Date().toISOString().slice(0, 10) },
    });

    useEffect(() => {
        if (user) fetchAll();
    }, [user]);

    const fetchAll = async () => {
        if (!user) return;
        const { data: suppliersData } = await supabase.from('suppliers').select('id, name, phone').eq('user_id', user.id).order('name');
        if (suppliersData) setSuppliers(suppliersData);
        await fetchPurchases();
    };

    const fetchPurchases = async () => {
        if (!user) return;

        const { data: purchasesData, error } = await supabase
            .from('purchase_orders')
            .select('id, purchase_number, purchase_date, expected_date, discount_value, freight, status, stock_added, account_added, suppliers (name)')
            .eq('user_id', user.id)
            .order('purchase_date', { ascending: false })
            .order('purchase_number', { ascending: false });

        if (error) {
            console.error('Error fetching purchase orders:', error);
            return;
        }

        const list = purchasesData || [];
        const purchaseIds = list.map((p: any) => p.id);
        let itemsByPurchase: Record<string, { quantity: number; unit_price: number }[]> = {};
        if (purchaseIds.length > 0) {
            const { data: itemsData } = await supabase
                .from('purchase_order_items')
                .select('purchase_order_id, quantity, unit_price')
                .in('purchase_order_id', purchaseIds);
            for (const item of itemsData || []) {
                (itemsByPurchase[item.purchase_order_id] ||= []).push(item);
            }
        }

        const computed = list.map((p: any) => {
            const itemsTotal = (itemsByPurchase[p.id] || []).reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
            const total = Math.max(0, itemsTotal - (p.discount_value || 0) + (p.freight || 0));
            return { ...p, total };
        });

        setPurchases(computed);
    };

    const createSupplier = async () => {
        if (!user || !newSupplierName.trim()) return;
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .insert([{ user_id: user.id, name: newSupplierName.trim(), phone: newSupplierPhone.trim() || null }])
                .select('id, name, phone')
                .single();
            if (error) throw error;
            setSuppliers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
            setValue('supplierId', data.id);
            setNewSupplierName('');
            setNewSupplierPhone('');
            setIsNewSupplierOpen(false);
            toast.success('Fornecedor cadastrado!');
        } catch (error: any) {
            toast.error('Erro ao cadastrar fornecedor: ' + error.message);
        }
    };

    const handleEdit = async (purchase: any) => {
        setEditingId(purchase.id);
        setEditingStatus({ status: purchase.status, stock_added: purchase.stock_added, account_added: purchase.account_added });
        setValue('supplierId', purchase.supplier_id);
        setValue('purchaseDate', purchase.purchase_date);
        setValue('expectedDate', purchase.expected_date || '');
        setValue('discountValue', purchase.discount_value || 0);
        setValue('freight', purchase.freight || 0);

        const { data: purchaseItems } = await supabase
            .from('purchase_order_items')
            .select('id, product_id, product_name, quantity, unit_price')
            .eq('purchase_order_id', purchase.id);
        setItems(purchaseItems || []);

        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingId(null);
        setEditingStatus(null);
        setItems([]);
        setIsNewSupplierOpen(false);
        reset({ purchaseDate: new Date().toISOString().slice(0, 10) });
    };

    const onSubmit = async (data: PurchaseForm) => {
        if (!user) return;
        if (!editingId && items.length === 0) {
            toast.error('Adicione pelo menos um item ao pedido.');
            return;
        }

        setIsSubmitting(true);
        try {
            const row = {
                supplier_id: data.supplierId,
                purchase_date: data.purchaseDate,
                expected_date: data.expectedDate || null,
                discount_value: data.discountValue || 0,
                freight: data.freight || 0,
            };

            if (editingId) {
                const { error } = await supabase.from('purchase_orders').update(row).eq('id', editingId).eq('user_id', user.id);
                if (error) throw error;
                toast.success('Pedido de compra atualizado!');
            } else {
                const { data: created, error } = await supabase
                    .from('purchase_orders')
                    .insert([{ ...row, user_id: user.id }])
                    .select('id')
                    .single();
                if (error) throw error;

                const { error: itemsError } = await supabase.from('purchase_order_items').insert(
                    items.map(item => ({
                        purchase_order_id: created.id,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                    }))
                );
                if (itemsError) throw itemsError;
                toast.success('Pedido de compra registrado!');
            }

            handleCancel();
            fetchPurchases();
        } catch (error: any) {
            toast.error('Erro ao salvar pedido: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string, purchaseNumber: number, stockAdded: boolean, accountAdded: boolean) => {
        const warning = stockAdded || accountAdded
            ? ' O estoque adicionado e/ou o lançamento no caixa gerados por este pedido serão desfeitos automaticamente.'
            : '';
        if (!user || !confirm(`Tem certeza que deseja excluir o pedido de compra #${purchaseNumber}?${warning}`)) return;

        try {
            const { error } = await supabase.from('purchase_orders').delete().eq('id', id).eq('user_id', user.id);
            if (error) throw error;
            toast.success('Pedido de compra excluído!');
            fetchPurchases();
        } catch (error: any) {
            toast.error('Erro ao excluir pedido: ' + error.message);
        }
    };

    // Generic versions take a purchase row (from the list or the form) so the 3-button
    // workflow can run either from the open form or directly from the list's action menu.
    const addStockFor = async (purchase: any, itemsOverride?: { product_id: string | null; quantity: number }[]) => {
        if (!user) return;
        if (!confirm(`Confirma adicionar as quantidades do pedido #${purchase.purchase_number} ao estoque dos produtos?`)) return;

        setIsActionLoading(true);
        try {
            let orderItems: { product_id: string | null; quantity: number }[] = itemsOverride ?? [];
            if (!itemsOverride) {
                const { data, error: itemsError } = await supabase
                    .from('purchase_order_items')
                    .select('product_id, quantity')
                    .eq('purchase_order_id', purchase.id);
                if (itemsError) throw itemsError;
                orderItems = data || [];
            }

            const movements = orderItems
                .filter(i => i.product_id)
                .map(i => ({
                    user_id: user.id,
                    product_id: i.product_id,
                    type: 'entrada' as const,
                    quantity: i.quantity,
                    note: `Pedido de Compra #${purchase.purchase_number}${purchase.suppliers?.name ? ' - ' + purchase.suppliers.name : ''}`,
                }));

            if (movements.length > 0) {
                const { error: movError } = await supabase.from('stock_movements').insert(movements);
                if (movError) throw movError;
            }

            const { error } = await supabase.from('purchase_orders').update({ stock_added: true }).eq('id', purchase.id);
            if (error) throw error;

            if (editingId === purchase.id) setEditingStatus(prev => prev ? { ...prev, stock_added: true } : prev);
            toast.success('Estoque atualizado com sucesso!');
            fetchPurchases();
        } catch (error: any) {
            toast.error('Erro ao adicionar estoque: ' + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const addAccountFor = async (purchase: any) => {
        if (!user) return;
        if (!confirm(`Confirma lançar o valor do pedido #${purchase.purchase_number} como saída no Fluxo de Caixa?`)) return;

        setIsActionLoading(true);
        try {
            const { data: entry, error: entryError } = await supabase
                .from('cash_entries')
                .insert([{
                    user_id: user.id,
                    entry_date: purchase.purchase_date,
                    competence_date: purchase.purchase_date,
                    type: 'saida',
                    category: 'Compra de Mercadoria',
                    amount: purchase.total,
                    description: `Pedido de Compra #${purchase.purchase_number}`,
                    related_party: purchase.suppliers?.name || null,
                    source: 'compra',
                    purchase_order_id: purchase.id,
                }])
                .select('id')
                .single();
            if (entryError) throw entryError;

            const { error } = await supabase
                .from('purchase_orders')
                .update({ account_added: true, cash_entry_id: entry.id })
                .eq('id', purchase.id);
            if (error) throw error;

            if (editingId === purchase.id) setEditingStatus(prev => prev ? { ...prev, account_added: true } : prev);
            toast.success('Lançamento de saída criado no Fluxo de Caixa!');
            fetchPurchases();
        } catch (error: any) {
            toast.error('Erro ao lançar no caixa: ' + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const finalizeFor = async (purchase: any) => {
        if (!confirm(`Finalizar o pedido de compra #${purchase.purchase_number}? Ele deixará de poder ser editado.`)) return;

        try {
            const { error } = await supabase.from('purchase_orders').update({ status: 'finalizado' }).eq('id', purchase.id);
            if (error) throw error;
            if (editingId === purchase.id) setEditingStatus(prev => prev ? { ...prev, status: 'finalizado' } : prev);
            toast.success('Pedido de compra finalizado!');
            fetchPurchases();
        } catch (error: any) {
            toast.error('Erro ao finalizar pedido: ' + error.message);
        }
    };

    const addStock = () => {
        const purchase = purchases.find(p => p.id === editingId);
        if (purchase) addStockFor(purchase, items);
    };
    const addAccount = () => {
        const purchase = purchases.find(p => p.id === editingId);
        if (purchase) addAccountFor(purchase);
    };
    const finalizePurchase = () => {
        const purchase = purchases.find(p => p.id === editingId);
        if (purchase) finalizeFor(purchase);
    };

    const itemsSubtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    const discountValue = Number(watch('discountValue')) || 0;
    const freight = Number(watch('freight')) || 0;
    const orderTotal = Math.max(0, itemsSubtotal - discountValue + freight);

    const filteredPurchases = purchases.filter(p =>
        String(p.purchase_number).includes(searchTerm) ||
        p.suppliers?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isFinalized = editingStatus?.status === 'finalizado';

    const purchaseMenuItems = (p: any) => [
        ...(!p.stock_added ? [{ label: 'Adicionar Estoque', icon: <PackageCheck className="w-4 h-4" />, onClick: () => addStockFor(p) }] : []),
        ...(!p.account_added ? [{ label: 'Adicionar Conta', icon: <Wallet className="w-4 h-4" />, onClick: () => addAccountFor(p) }] : []),
        ...(p.status !== 'finalizado' ? [{ label: 'Finalizar Pedido', icon: <CheckCircle2 className="w-4 h-4" />, onClick: () => finalizeFor(p) }] : []),
        { label: 'Atualizar', icon: <Edit2 className="w-4 h-4" />, onClick: () => handleEdit(p) },
        { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => handleDelete(p.id, p.purchase_number, p.stock_added, p.account_added), variant: 'danger' as const },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Pedidos de Compra</h2>
                    <p className="text-gray-500">Compra de produtos de fornecedores para reposição de estoque</p>
                </div>
                <Button onClick={() => { if (isFormOpen) handleCancel(); else setIsFormOpen(true); }}>
                    {isFormOpen ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Novo Pedido</>}
                </Button>
            </div>

            {isFormOpen && (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                    <Card>
                        <h3 className="font-semibold text-base sm:text-lg mb-4">Fornecedor</h3>
                        <div className="flex gap-2 items-start">
                            <div className="flex-1">
                                <Controller
                                    name="supplierId"
                                    control={control}
                                    render={({ field }) => (
                                        <SearchableSelect
                                            value={field.value || ''}
                                            onChange={field.onChange}
                                            placeholder="Buscar fornecedor..."
                                            error={errors.supplierId?.message}
                                            disabled={isFinalized}
                                            options={suppliers.map(s => ({ value: s.id, label: s.name, sublabel: s.phone || undefined }))}
                                        />
                                    )}
                                />
                            </div>
                            {!isFinalized && (
                                <Button type="button" variant="outline" onClick={() => setIsNewSupplierOpen(!isNewSupplierOpen)}>
                                    <UserPlus className="w-4 h-4" />
                                </Button>
                            )}
                        </div>

                        {isNewSupplierOpen && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <Input placeholder="Nome do fornecedor" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} />
                                <div className="flex gap-2">
                                    <Input placeholder="Telefone (opcional)" value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)} />
                                    <Button type="button" onClick={createSupplier} disabled={!newSupplierName.trim()}>Salvar</Button>
                                </div>
                            </div>
                        )}
                    </Card>

                    <PurchaseItemsSection purchaseOrderId={editingId || undefined} items={items} onChange={setItems} disabled={isFinalized} />

                    <Card>
                        <h3 className="font-semibold text-base sm:text-lg mb-4">Totais da Compra</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input label="Desconto (R$)" type="number" step="0.01" {...register('discountValue')} error={errors.discountValue?.message} disabled={isFinalized} />
                            <Input label="Frete (R$)" type="number" step="0.01" {...register('freight')} error={errors.freight?.message} disabled={isFinalized} />
                        </div>
                        <div className="flex justify-between pt-4 mt-4 border-t border-gray-100 text-sm text-gray-600">
                            <span>Total dos produtos</span>
                            <span>{formatCurrency(itemsSubtotal)}</span>
                        </div>
                        <div className="flex justify-between pt-1 font-bold text-lg text-dark">
                            <span>Total do Pedido</span>
                            <span className="text-primary-cyan">{formatCurrency(orderTotal)}</span>
                        </div>
                    </Card>

                    <Card>
                        <h3 className="font-semibold text-base sm:text-lg mb-4">Detalhes da Compra</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input label="Data da Compra" type="date" {...register('purchaseDate')} error={errors.purchaseDate?.message} disabled={isFinalized} />
                            <Input label="Data Prevista" type="date" {...register('expectedDate')} disabled={isFinalized} />
                        </div>
                    </Card>

                    {editingId && (
                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-1">Ações do Pedido</h3>
                            <p className="text-xs text-gray-500 mb-4">
                                Adicione o estoque e lance a saída no caixa quando o pedido chegar. Finalize quando não precisar mais editar.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Button
                                    type="button"
                                    variant={editingStatus?.stock_added ? 'outline' : 'primary'}
                                    disabled={editingStatus?.stock_added || isActionLoading || isFinalized}
                                    onClick={addStock}
                                >
                                    <PackageCheck className="w-4 h-4 mr-2" />
                                    {editingStatus?.stock_added ? 'Estoque já adicionado' : 'Adicionar Estoque'}
                                </Button>
                                <Button
                                    type="button"
                                    variant={editingStatus?.account_added ? 'outline' : 'primary'}
                                    disabled={editingStatus?.account_added || isActionLoading || isFinalized}
                                    onClick={addAccount}
                                >
                                    <Wallet className="w-4 h-4 mr-2" />
                                    {editingStatus?.account_added ? 'Conta já lançada' : 'Adicionar Conta'}
                                </Button>
                                <Button
                                    type="button"
                                    variant={isFinalized ? 'outline' : 'secondary'}
                                    disabled={isFinalized}
                                    onClick={finalizePurchase}
                                >
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    {isFinalized ? 'Finalizado' : 'Finalizar Pedido'}
                                </Button>
                            </div>
                        </Card>
                    )}

                    {!isFinalized && (
                        <div className="flex justify-end gap-3">
                            <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                <Save className="w-4 h-4 mr-2" />
                                {isSubmitting ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Registrar Pedido'}
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
                        placeholder="Buscar por fornecedor ou número do pedido..."
                        className="bg-transparent border-none focus:outline-none w-full text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">Pedido</th>
                                <th className="px-6 py-3">Fornecedor</th>
                                <th className="px-6 py-3">Data</th>
                                <th className="px-6 py-3">Situação</th>
                                <th className="px-6 py-3 text-right">Total</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPurchases.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Nenhum pedido de compra registrado ainda</td>
                                </tr>
                            ) : (
                                filteredPurchases.map(p => (
                                    <tr key={p.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-semibold text-primary-cyan">
                                            <div className="flex items-center gap-2">
                                                <Truck className="w-4 h-4" />
                                                #{p.purchase_number}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-900">{p.suppliers?.name || 'N/A'}</td>
                                        <td className="px-6 py-4 text-gray-600">{new Date(p.purchase_date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'finalizado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                    {p.status === 'finalizado' ? 'Finalizado' : 'Pendente'}
                                                </span>
                                                {p.stock_added && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Estoque OK</span>}
                                                {p.account_added && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Caixa OK</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-dark">{formatCurrency(p.total)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <DropdownMenu items={purchaseMenuItems(p)} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="md:hidden space-y-3 p-4">
                    {filteredPurchases.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">Nenhum pedido de compra registrado ainda</div>
                    ) : (
                        filteredPurchases.map(p => (
                            <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <span className="flex items-center gap-2 font-semibold text-primary-cyan">
                                        <Truck className="w-4 h-4" />
                                        #{p.purchase_number}
                                    </span>
                                    <DropdownMenu
                                        items={[
                                            { label: 'Atualizar', icon: <Edit2 className="w-4 h-4" />, onClick: () => handleEdit(p) },
                                            { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => handleDelete(p.id, p.purchase_number, p.stock_added, p.account_added), variant: 'danger' as const },
                                        ]}
                                    />
                                </div>
                                <p className="text-sm text-gray-700">{p.suppliers?.name || 'N/A'}</p>
                                <p className="text-xs text-gray-400">{new Date(p.purchase_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                                <div className="flex flex-wrap gap-1">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'finalizado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {p.status === 'finalizado' ? 'Finalizado' : 'Pendente'}
                                    </span>
                                    {p.stock_added && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Estoque OK</span>}
                                    {p.account_added && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Caixa OK</span>}
                                </div>
                                <div className="text-right font-bold text-dark">{formatCurrency(p.total)}</div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
