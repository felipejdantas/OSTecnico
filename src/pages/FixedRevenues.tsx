import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Search, Edit2, Trash2, TrendingUp, CheckCircle2, Undo2, Ban, CalendarClock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { matchesSearchFields } from '../lib/search';
import { formatCurrency } from '../lib/orderFinance';
import {
    toDateStr, buildNextRevenueInstallment, revenueInstallmentStatusLabel,
    type FixedRevenue, type FixedRevenueInstallment,
} from '../lib/fixedRevenues';

const fixedRevenueSchema = z.object({
    title: z.string().min(2, 'Informe o nome da receita'),
    amount: z.coerce.number().positive('Valor inválido'),
    category: z.string().optional(),
    dueDay: z.coerce.number().int('Deve ser um número inteiro').min(1, 'Dia inválido').max(31, 'Dia inválido'),
    notes: z.string().optional(),
    active: z.boolean().optional(),
    // String em vez de z.coerce.number() de propósito — um campo numérico
    // opcional deixado em branco vira "" no form, e z.coerce.number()
    // transformaria isso em 0 (Number('') === 0), não em "sem parcelamento".
    // Parseado manualmente no onSubmit.
    totalInstallments: z.string().optional(),
});
type FixedRevenueFormInput = z.input<typeof fixedRevenueSchema>;
type FixedRevenueForm = z.output<typeof fixedRevenueSchema>;

type InstallmentRow = FixedRevenueInstallment & { fixedRevenue: FixedRevenue };

export default function FixedRevenues() {
    const { tenantId } = useAuth();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [fixedRevenues, setFixedRevenues] = useState<FixedRevenue[]>([]);
    const [installments, setInstallments] = useState<FixedRevenueInstallment[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [receivingInstallment, setReceivingInstallment] = useState<InstallmentRow | null>(null);
    const [receiveDate, setReceiveDate] = useState('');
    const [receiveAmount, setReceiveAmount] = useState('');
    const [isReceiving, setIsReceiving] = useState(false);
    const [editingDueDateRow, setEditingDueDateRow] = useState<InstallmentRow | null>(null);
    const [newDueDate, setNewDueDate] = useState('');
    const [isSavingDueDate, setIsSavingDueDate] = useState(false);

    const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FixedRevenueFormInput, any, FixedRevenueForm>({
        resolver: zodResolver(fixedRevenueSchema),
        defaultValues: { active: true },
    });

    useEffect(() => {
        if (tenantId) init();
    }, [tenantId]);

    const init = async () => {
        await fetchAll();
        await ensureNextInstallments();
        await fetchAll();
    };

    const fetchAll = async () => {
        if (!tenantId) return;
        const [revenuesRes, installmentsRes] = await Promise.all([
            supabase.from('os_fixed_revenues').select('*').eq('user_id', tenantId).order('due_day'),
            supabase.from('os_fixed_revenue_installments').select('*').eq('user_id', tenantId).order('due_date'),
        ]);
        if (revenuesRes.error) console.error('Error fetching fixed revenues:', revenuesRes.error);
        else setFixedRevenues(revenuesRes.data || []);
        if (installmentsRes.error) console.error('Error fetching installments:', installmentsRes.error);
        else setInstallments((installmentsRes.data || []) as FixedRevenueInstallment[]);
    };

    // Mesma lógica de "uma parcela pendente por vez" de Custos Fixos
    // (ensureNextInstallments), com uma diferença: buildNextRevenueInstallment
    // retorna null quando a receita é um plano finito (total_installments)
    // que já bateu o total — nesse caso nada é gerado, o ciclo para sozinho.
    const ensureNextInstallments = async () => {
        if (!tenantId) return;
        const [revenuesRes, instRes] = await Promise.all([
            supabase.from('os_fixed_revenues').select('*').eq('user_id', tenantId).eq('active', true),
            supabase.from('os_fixed_revenue_installments').select('fixed_revenue_id, due_date, status, installment_number').eq('user_id', tenantId),
        ]);
        const active: FixedRevenue[] = revenuesRes.data || [];
        if (active.length === 0) return;

        const latestByFixedRevenue = new Map<string, { due_date: string; status: string; installment_number: number | null }>();
        for (const inst of instRes.data || []) {
            const current = latestByFixedRevenue.get(inst.fixed_revenue_id);
            if (!current || inst.due_date > current.due_date) latestByFixedRevenue.set(inst.fixed_revenue_id, inst);
        }

        const rows = active
            .filter(fr => latestByFixedRevenue.get(fr.id)?.status !== 'pendente')
            .map(fr => {
                const latest = latestByFixedRevenue.get(fr.id);
                return buildNextRevenueInstallment(fr, latest?.due_date ?? null, latest?.installment_number ?? null);
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
            .map(r => ({ ...r, user_id: tenantId }));
        if (rows.length === 0) return;

        const { error } = await supabase.from('os_fixed_revenue_installments').upsert(rows, { onConflict: 'fixed_revenue_id,due_date', ignoreDuplicates: true });
        if (error) console.error('Error generating next installment:', error);
    };

    const handleEdit = (fr: FixedRevenue) => {
        setEditingId(fr.id);
        setValue('title', fr.title);
        setValue('amount', fr.amount);
        setValue('category', fr.category || '');
        setValue('dueDay', fr.due_day);
        setValue('notes', fr.notes || '');
        setValue('active', fr.active);
        setValue('totalInstallments', fr.total_installments != null ? String(fr.total_installments) : '');
        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelForm = () => {
        setIsFormOpen(false);
        setEditingId(null);
        reset({ active: true, title: '', amount: undefined, category: '', dueDay: undefined, notes: '', totalInstallments: '' } as any);
    };

    const onSubmit = async (data: FixedRevenueForm) => {
        if (!tenantId) return;
        const row = {
            title: data.title,
            amount: data.amount,
            category: data.category?.trim() || null,
            due_day: data.dueDay,
            notes: data.notes?.trim() || null,
            active: data.active ?? true,
            total_installments: data.totalInstallments?.trim() ? parseInt(data.totalInstallments, 10) : null,
        };

        try {
            if (editingId) {
                const { error } = await supabase.from('os_fixed_revenues').update(row).eq('id', editingId).eq('user_id', tenantId);
                if (error) throw error;
                toast.success('Receita fixa atualizada com sucesso!');
            } else {
                const { error } = await supabase.from('os_fixed_revenues').insert([{ ...row, user_id: tenantId }]);
                if (error) throw error;
                toast.success('Receita fixa cadastrada com sucesso!');
            }
            handleCancelForm();
            await fetchAll();
            await ensureNextInstallments();
            await fetchAll();
        } catch (error: any) {
            toast.error('Erro ao salvar receita fixa: ' + error.message);
        }
    };

    const handleDeleteFixedRevenue = async (id: string, title: string) => {
        if (!tenantId || !confirm(`Tem certeza que deseja excluir "${title}"? Todas as parcelas geradas (inclusive já recebidas) são excluídas junto — o histórico permanece no Fluxo de Caixa.`)) return;
        try {
            const { error } = await supabase.from('os_fixed_revenues').delete().eq('id', id).eq('user_id', tenantId);
            if (error) throw error;
            toast.success('Receita fixa excluída com sucesso!');
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao excluir receita fixa: ' + error.message);
        }
    };

    const openReceiveModal = (row: InstallmentRow) => {
        setReceivingInstallment(row);
        setReceiveDate(toDateStr(new Date()));
        setReceiveAmount(String(row.amount));
    };

    const confirmReceipt = async () => {
        if (!tenantId || !receivingInstallment) return;
        const amount = parseFloat(receiveAmount.replace(',', '.'));
        if (!amount || amount <= 0) {
            toast.error('Informe um valor válido.');
            return;
        }
        setIsReceiving(true);
        try {
            const { data: entry, error: entryError } = await supabase.from('cash_entries').insert([{
                user_id: tenantId,
                entry_date: receiveDate,
                competence_date: receivingInstallment.due_date,
                type: 'entrada',
                category: receivingInstallment.fixedRevenue.category,
                amount,
                description: receivingInstallment.fixedRevenue.title,
                related_party: null,
                source: 'receita_fixa',
                fixed_revenue_id: receivingInstallment.fixed_revenue_id,
            }]).select('id').single();
            if (entryError) throw entryError;

            const { error: updateError } = await supabase.from('os_fixed_revenue_installments').update({
                status: 'recebido',
                received_at: receiveDate,
                received_amount: amount,
                cash_entry_id: entry.id,
            }).eq('id', receivingInstallment.id);
            if (updateError) throw updateError;

            // Plano finito que acabou de receber sua última parcela — desativa
            // sozinho, em vez de ficar implicitamente "ainda gerando" na lista
            // de modelos (ensureNextInstallments já pararia de gerar de
            // qualquer forma, isso só deixa visualmente claro que encerrou).
            const { fixedRevenue } = receivingInstallment;
            if (fixedRevenue.total_installments != null && receivingInstallment.installment_number === fixedRevenue.total_installments) {
                await supabase.from('os_fixed_revenues').update({ active: false }).eq('id', fixedRevenue.id);
            }

            toast.success('Recebimento registrado no Fluxo de Caixa!');
            setReceivingInstallment(null);
            await fetchAll();
            await ensureNextInstallments();
            await fetchAll();
        } catch (error: any) {
            toast.error('Erro ao registrar recebimento: ' + error.message);
        } finally {
            setIsReceiving(false);
        }
    };

    const openEditDueDate = (row: InstallmentRow) => {
        setEditingDueDateRow(row);
        setNewDueDate(row.due_date);
    };

    const saveDueDate = async () => {
        if (!editingDueDateRow || !newDueDate) return;
        setIsSavingDueDate(true);
        try {
            const { error } = await supabase.from('os_fixed_revenue_installments').update({ due_date: newDueDate }).eq('id', editingDueDateRow.id);
            if (error) throw error;
            toast.success('Vencimento atualizado.');
            setEditingDueDateRow(null);
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao atualizar vencimento: ' + error.message);
        } finally {
            setIsSavingDueDate(false);
        }
    };

    const undoReceipt = async (row: InstallmentRow) => {
        if (!confirm(`Desfazer o recebimento de "${row.fixedRevenue.title}" (venc. ${new Date(row.due_date + 'T00:00:00').toLocaleDateString('pt-BR')})? O lançamento sai do Fluxo de Caixa.`)) return;
        try {
            if (row.cash_entry_id) {
                const { error } = await supabase.from('cash_entries').delete().eq('id', row.cash_entry_id);
                if (error) throw error;
            }
            const { error } = await supabase.from('os_fixed_revenue_installments').update({
                status: 'pendente', received_at: null, received_amount: null, cash_entry_id: null,
            }).eq('id', row.id);
            if (error) throw error;

            // Simétrico ao auto-desativar em confirmReceipt: se essa era a
            // última parcela de um plano finito (e por isso a receita tinha
            // sido desativada sozinha), reativa — senão ela nunca mais gera
            // parcela nenhuma, mesmo com o recebimento desfeito.
            if (row.fixedRevenue.total_installments != null && row.installment_number === row.fixedRevenue.total_installments && !row.fixedRevenue.active) {
                await supabase.from('os_fixed_revenues').update({ active: true }).eq('id', row.fixedRevenue.id);
            }

            // Mesma regra de Custos Fixos: recebe a parcela auto-gera a
            // seguinte; desfazer o recebimento desfaz isso também, pra só
            // sobrar uma parcela pendente por receita de novo. Só remove se
            // ela mesma nunca foi tocada (ainda pendente, sem pagamento).
            const next = installments.find(i =>
                i.fixed_revenue_id === row.fixed_revenue_id && i.due_date > row.due_date && i.status === 'pendente' && !i.cash_entry_id
            );
            if (next) await supabase.from('os_fixed_revenue_installments').delete().eq('id', next.id);

            toast.success('Recebimento desfeito.');
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao desfazer recebimento: ' + error.message);
        }
    };

    const cancelInstallment = async (row: InstallmentRow) => {
        if (!confirm(`Cancelar a parcela de "${row.fixedRevenue.title}" (venc. ${new Date(row.due_date + 'T00:00:00').toLocaleDateString('pt-BR')})? A próxima parcela é gerada em seguida.`)) return;
        const { error } = await supabase.from('os_fixed_revenue_installments').update({ status: 'cancelado' }).eq('id', row.id);
        if (error) { toast.error('Erro ao cancelar: ' + error.message); return; }
        toast.success('Parcela cancelada.');
        await fetchAll();
        await ensureNextInstallments();
        await fetchAll();
    };

    const deleteInstallment = async (row: InstallmentRow) => {
        if (!confirm(`Excluir esta parcela de "${row.fixedRevenue.title}"? Se for a única parcela pendente dessa receita fixa, uma nova é gerada em seguida.`)) return;
        const { error } = await supabase.from('os_fixed_revenue_installments').delete().eq('id', row.id);
        if (error) { toast.error('Erro ao excluir: ' + error.message); return; }
        toast.success('Parcela excluída.');
        await fetchAll();
        await ensureNextInstallments();
        await fetchAll();
    };

    const fixedRevenueById = new Map(fixedRevenues.map(fr => [fr.id, fr]));
    const installmentRows: InstallmentRow[] = installments
        .map(inst => ({ ...inst, fixedRevenue: fixedRevenueById.get(inst.fixed_revenue_id) }))
        .filter((r): r is InstallmentRow => !!r.fixedRevenue)
        .filter(r => showHistory || r.status === 'pendente')
        .filter(r => matchesSearchFields([r.fixedRevenue.title, r.fixedRevenue.category], searchTerm))
        .sort((a, b) => a.due_date.localeCompare(b.due_date));

    return (
        <div className="space-y-6">
            <div className="sticky top-0 z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/95 backdrop-blur-sm py-3 border-b border-gray-100 -mx-2 px-2 sm:-mx-0 sm:px-0">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Receita Fixa</h2>
                    <p className="text-gray-500">Entradas recorrentes — aluguel recebido, venda parcelada, contrato...</p>
                </div>
                <Button onClick={() => { if (isFormOpen) handleCancelForm(); else setIsFormOpen(true); }}>
                    {isFormOpen ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Nova Receita Fixa</>}
                </Button>
            </div>

            {isFormOpen && (
                <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="mb-4 pb-4 border-b border-gray-100">
                        <h3 className="font-semibold text-lg text-primary-cyan">
                            {editingId ? 'Editar Receita Fixa' : 'Nova Receita Fixa'}
                        </h3>
                    </div>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="Nome" placeholder="Ex: Aluguel do Imóvel, Venda Parcelada João" {...register('title')} error={errors.title?.message} />
                            <Input label="Categoria (opcional)" placeholder="Ex: Aluguel, Venda, Contrato..." {...register('category')} error={errors.category?.message} />
                            <Input label="Valor da Parcela (R$)" type="number" step="0.01" {...register('amount')} error={errors.amount?.message} />
                            <Input label="Dia do Vencimento" type="number" min={1} max={31} placeholder="Ex: 10" {...register('dueDay')} error={errors.dueDay?.message} />
                            <div>
                                <Input label="Total de Parcelas (opcional)" type="number" min={1} placeholder="Ex: 5" {...register('totalInstallments')} error={errors.totalInstallments?.message} />
                                <p className="text-xs text-gray-400 mt-1">
                                    Deixe em branco pra uma receita recorrente sem fim (ex: aluguel). Preencha pra um plano que termina sozinho (ex: venda parcelada em 5x).
                                </p>
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Observações (opcional)</label>
                            <textarea
                                {...register('notes')}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[70px] text-sm"
                                placeholder="Ex: Pix direto do cliente, contrato assinado em..."
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input type="checkbox" {...register('active')} className="w-4 h-4 rounded border-gray-300 text-primary-cyan focus:ring-primary-cyan/50" />
                            Ativa (continua gerando parcelas futuras)
                        </label>
                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={handleCancelForm}>Cancelar</Button>
                            <Button type="submit">{editingId ? 'Salvar Alterações' : 'Salvar Receita Fixa'}</Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3 flex-wrap">
                    <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou categoria..."
                        className="bg-transparent border-none focus:outline-none flex-1 min-w-[160px] text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showHistory}
                            onChange={(e) => setShowHistory(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-primary-cyan focus:ring-primary-cyan/50"
                        />
                        Mostrar recebidas/canceladas
                    </label>
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">Receita Fixa</th>
                                <th className="px-6 py-3">Categoria</th>
                                <th className="px-6 py-3">Vencimento</th>
                                <th className="px-6 py-3">Valor</th>
                                <th className="px-6 py-3">Situação</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {installmentRows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                        {fixedRevenues.length === 0
                                            ? 'Nenhuma parcela encontrada. Cadastre uma receita fixa pra começar.'
                                            : showHistory ? 'Nenhuma parcela encontrada.' : 'Tudo em dia — nenhuma parcela pendente. Marque "Mostrar recebidas/canceladas" pra ver o histórico.'}
                                    </td>
                                </tr>
                            ) : (
                                installmentRows.map((row) => {
                                    const status = revenueInstallmentStatusLabel(row);
                                    return (
                                        <tr key={row.id} className="bg-white border-b hover:bg-gray-50">
                                            <td className="px-6 py-4 font-medium text-gray-900">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary-green/10 text-primary-green flex items-center justify-center flex-shrink-0">
                                                        <TrendingUp className="w-4 h-4" />
                                                    </div>
                                                    <div className="font-semibold">{row.fixedRevenue.title}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">{row.fixedRevenue.category || '-'}</td>
                                            <td className="px-6 py-4 text-gray-600">
                                                {new Date(row.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                                {row.installment_number != null && row.fixedRevenue.total_installments != null && (
                                                    <span className="text-xs text-gray-400"> · Parcela {row.installment_number}/{row.fixedRevenue.total_installments}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-medium">{formatCurrency(row.received_amount ?? row.amount)}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {row.status === 'pendente' && (
                                                    <DropdownMenu items={[
                                                        { label: 'Registrar Recebimento', icon: <CheckCircle2 className="w-4 h-4" />, onClick: () => openReceiveModal(row) },
                                                        { label: 'Editar Vencimento', icon: <CalendarClock className="w-4 h-4" />, onClick: () => openEditDueDate(row) },
                                                        { label: 'Cancelar Parcela', icon: <Ban className="w-4 h-4" />, onClick: () => cancelInstallment(row) },
                                                        { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => deleteInstallment(row), variant: 'danger' as const },
                                                    ]} />
                                                )}
                                                {row.status === 'recebido' && (
                                                    <DropdownMenu items={[
                                                        { label: 'Desfazer Recebimento', icon: <Undo2 className="w-4 h-4" />, onClick: () => undoReceipt(row) },
                                                    ]} />
                                                )}
                                                {row.status === 'cancelado' && (
                                                    <DropdownMenu items={[
                                                        { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => deleteInstallment(row), variant: 'danger' as const },
                                                    ]} />
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3 p-4">
                    {installmentRows.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm px-4">
                            {fixedRevenues.length === 0
                                ? 'Nenhuma parcela encontrada. Cadastre uma receita fixa pra começar.'
                                : showHistory ? 'Nenhuma parcela encontrada.' : 'Tudo em dia — nenhuma parcela pendente.'}
                        </div>
                    ) : (
                        installmentRows.map((row) => {
                            const status = revenueInstallmentStatusLabel(row);
                            return (
                                <div key={row.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-primary-green/10 text-primary-green flex items-center justify-center flex-shrink-0">
                                                <TrendingUp className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-semibold text-gray-900 truncate">{row.fixedRevenue.title}</div>
                                                <div className="text-xs text-gray-400">
                                                    {new Date(row.due_date + 'T00:00:00').toLocaleDateString('pt-BR')} · {row.fixedRevenue.category || 'Sem categoria'}
                                                    {row.installment_number != null && row.fixedRevenue.total_installments != null && ` · Parcela ${row.installment_number}/${row.fixedRevenue.total_installments}`}
                                                </div>
                                            </div>
                                        </div>
                                        {row.status === 'pendente' && (
                                            <DropdownMenu items={[
                                                { label: 'Registrar Recebimento', icon: <CheckCircle2 className="w-4 h-4" />, onClick: () => openReceiveModal(row) },
                                                { label: 'Editar Vencimento', icon: <CalendarClock className="w-4 h-4" />, onClick: () => openEditDueDate(row) },
                                                { label: 'Cancelar Parcela', icon: <Ban className="w-4 h-4" />, onClick: () => cancelInstallment(row) },
                                                { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => deleteInstallment(row), variant: 'danger' as const },
                                            ]} />
                                        )}
                                        {row.status === 'recebido' && (
                                            <DropdownMenu items={[
                                                { label: 'Desfazer Recebimento', icon: <Undo2 className="w-4 h-4" />, onClick: () => undoReceipt(row) },
                                            ]} />
                                        )}
                                        {row.status === 'cancelado' && (
                                            <DropdownMenu items={[
                                                { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => deleteInstallment(row), variant: 'danger' as const },
                                            ]} />
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-gray-900">{formatCurrency(row.received_amount ?? row.amount)}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </Card>

            {/* Modelos de Receita Fixa: as recorrências em si, separado da
                tabela de parcelas acima — editar um modelo não toca nas
                parcelas já geradas. */}
            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-sm text-gray-700">Receitas Fixas Cadastradas</h3>
                </div>
                <div className="divide-y divide-gray-100">
                    {fixedRevenues.length === 0 ? (
                        <p className="px-4 py-6 text-center text-gray-500 text-sm">Nenhuma receita fixa cadastrada ainda.</p>
                    ) : (
                        fixedRevenues.map(fr => (
                            <div key={fr.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-gray-800 truncate">{fr.title}</span>
                                    <span className="text-xs text-gray-400">
                                        {fr.category || 'Sem categoria'} · todo dia {fr.due_day} · {formatCurrency(fr.amount)}
                                        {fr.total_installments != null && ` · Parcelado em ${fr.total_installments}x`}
                                    </span>
                                    {!fr.active && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inativa</span>}
                                </div>
                                <DropdownMenu items={[
                                    { label: 'Editar', icon: <Edit2 className="w-4 h-4" />, onClick: () => handleEdit(fr) },
                                    { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => handleDeleteFixedRevenue(fr.id, fr.title), variant: 'danger' as const },
                                ]} />
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {receivingInstallment && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setReceivingInstallment(null)}>
                    <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-bold text-lg text-dark mb-1">Registrar Recebimento</h3>
                        <p className="text-sm text-gray-500 mb-4">{receivingInstallment.fixedRevenue.title} · venc. {new Date(receivingInstallment.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                        <div className="space-y-4">
                            <Input label="Data do Recebimento" type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} />
                            <Input label="Valor Recebido (R$)" type="number" step="0.01" value={receiveAmount} onChange={(e) => setReceiveAmount(e.target.value)} />
                        </div>
                        <div className="flex justify-end gap-3 pt-6">
                            <Button type="button" variant="outline" onClick={() => setReceivingInstallment(null)}>Cancelar</Button>
                            <Button type="button" onClick={confirmReceipt} disabled={isReceiving}>{isReceiving ? 'Salvando...' : 'Confirmar Recebimento'}</Button>
                        </div>
                    </Card>
                </div>
            )}

            {editingDueDateRow && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingDueDateRow(null)}>
                    <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-bold text-lg text-dark mb-1">Editar Vencimento</h3>
                        <p className="text-sm text-gray-500 mb-4">{editingDueDateRow.fixedRevenue.title} · use isso para lançar um mês que ficou pra trás sem registro</p>
                        <Input label="Novo Vencimento" type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
                        <div className="flex justify-end gap-3 pt-6">
                            <Button type="button" variant="outline" onClick={() => setEditingDueDateRow(null)}>Cancelar</Button>
                            <Button type="button" onClick={saveDueDate} disabled={isSavingDueDate}>{isSavingDueDate ? 'Salvando...' : 'Salvar'}</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
