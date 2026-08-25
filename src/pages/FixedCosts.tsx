import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Search, Edit2, Trash2, Repeat, CheckCircle2, Undo2, Ban } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { matchesSearchFields } from '../lib/search';
import { formatCurrency } from '../lib/orderFinance';
import {
    toDateStr, buildNextInstallment, installmentStatusLabel,
    type FixedCost, type FixedCostInstallment,
} from '../lib/fixedCosts';

const fixedCostSchema = z.object({
    title: z.string().min(2, 'Informe o nome do custo'),
    amount: z.coerce.number().positive('Valor inválido'),
    category: z.string().optional(),
    dueDay: z.coerce.number().int('Deve ser um número inteiro').min(1, 'Dia inválido').max(31, 'Dia inválido'),
    notes: z.string().optional(),
    active: z.boolean().optional(),
});
type FixedCostFormInput = z.input<typeof fixedCostSchema>;
type FixedCostForm = z.output<typeof fixedCostSchema>;

type InstallmentRow = FixedCostInstallment & { fixedCost: FixedCost };

export default function FixedCosts() {
    const { tenantId } = useAuth();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
    const [installments, setInstallments] = useState<FixedCostInstallment[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [payingInstallment, setPayingInstallment] = useState<InstallmentRow | null>(null);
    const [payDate, setPayDate] = useState('');
    const [payAmount, setPayAmount] = useState('');
    const [isPaying, setIsPaying] = useState(false);

    const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FixedCostFormInput, any, FixedCostForm>({
        resolver: zodResolver(fixedCostSchema),
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
        const [costsRes, installmentsRes] = await Promise.all([
            supabase.from('os_fixed_costs').select('*').eq('user_id', tenantId).order('due_day'),
            supabase.from('os_fixed_cost_installments').select('*').eq('user_id', tenantId).order('due_date'),
        ]);
        if (costsRes.error) console.error('Error fetching fixed costs:', costsRes.error);
        else setFixedCosts(costsRes.data || []);
        if (installmentsRes.error) console.error('Error fetching installments:', installmentsRes.error);
        else setInstallments((installmentsRes.data || []) as FixedCostInstallment[]);
    };

    // Only one pending installment per active fixed cost at a time — never a
    // pre-generated horizon. For each active fixed cost, looks at its most
    // recent installment (by due_date): if it's still "pendente", there's
    // already something to pay, so nothing happens; once it's resolved
    // (pago/cancelado) or doesn't exist yet, the next month's installment is
    // generated. Always re-fetches fixed costs/installments directly instead
    // of relying on component state, since this runs right after fetchAll()
    // in several places, before React necessarily re-renders with fresh state.
    const ensureNextInstallments = async () => {
        if (!tenantId) return;
        const [costsRes, instRes] = await Promise.all([
            supabase.from('os_fixed_costs').select('*').eq('user_id', tenantId).eq('active', true),
            supabase.from('os_fixed_cost_installments').select('fixed_cost_id, due_date, status').eq('user_id', tenantId),
        ]);
        const active: FixedCost[] = costsRes.data || [];
        if (active.length === 0) return;

        const latestByFixedCost = new Map<string, { due_date: string; status: string }>();
        for (const inst of instRes.data || []) {
            const current = latestByFixedCost.get(inst.fixed_cost_id);
            if (!current || inst.due_date > current.due_date) latestByFixedCost.set(inst.fixed_cost_id, inst);
        }

        const rows = active
            .filter(fc => latestByFixedCost.get(fc.id)?.status !== 'pendente')
            .map(fc => ({ ...buildNextInstallment(fc, latestByFixedCost.get(fc.id)?.due_date ?? null), user_id: tenantId }));
        if (rows.length === 0) return;

        const { error } = await supabase.from('os_fixed_cost_installments').upsert(rows, { onConflict: 'fixed_cost_id,due_date', ignoreDuplicates: true });
        if (error) console.error('Error generating next installment:', error);
    };

    const handleEdit = (fc: FixedCost) => {
        setEditingId(fc.id);
        setValue('title', fc.title);
        setValue('amount', fc.amount);
        setValue('category', fc.category || '');
        setValue('dueDay', fc.due_day);
        setValue('notes', fc.notes || '');
        setValue('active', fc.active);
        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelForm = () => {
        setIsFormOpen(false);
        setEditingId(null);
        reset({ active: true, title: '', amount: undefined, category: '', dueDay: undefined, notes: '' } as any);
    };

    const onSubmit = async (data: FixedCostForm) => {
        if (!tenantId) return;
        const row = {
            title: data.title,
            amount: data.amount,
            category: data.category?.trim() || null,
            due_day: data.dueDay,
            notes: data.notes?.trim() || null,
            active: data.active ?? true,
        };

        try {
            if (editingId) {
                const { error } = await supabase.from('os_fixed_costs').update(row).eq('id', editingId).eq('user_id', tenantId);
                if (error) throw error;
                toast.success('Custo fixo atualizado com sucesso!');
            } else {
                const { error } = await supabase.from('os_fixed_costs').insert([{ ...row, user_id: tenantId }]);
                if (error) throw error;
                toast.success('Custo fixo cadastrado com sucesso!');
            }
            handleCancelForm();
            await fetchAll();
            await ensureNextInstallments();
            await fetchAll();
        } catch (error: any) {
            toast.error('Erro ao salvar custo fixo: ' + error.message);
        }
    };

    const handleDeleteFixedCost = async (id: string, title: string) => {
        if (!tenantId || !confirm(`Tem certeza que deseja excluir "${title}"? Todas as parcelas geradas (inclusive já pagas) são excluídas junto — o histórico permanece no Fluxo de Caixa.`)) return;
        try {
            const { error } = await supabase.from('os_fixed_costs').delete().eq('id', id).eq('user_id', tenantId);
            if (error) throw error;
            toast.success('Custo fixo excluído com sucesso!');
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao excluir custo fixo: ' + error.message);
        }
    };

    const openPayModal = (row: InstallmentRow) => {
        setPayingInstallment(row);
        setPayDate(toDateStr(new Date()));
        setPayAmount(String(row.amount));
    };

    const confirmPayment = async () => {
        if (!tenantId || !payingInstallment) return;
        const amount = parseFloat(payAmount.replace(',', '.'));
        if (!amount || amount <= 0) {
            toast.error('Informe um valor válido.');
            return;
        }
        setIsPaying(true);
        try {
            const { data: entry, error: entryError } = await supabase.from('cash_entries').insert([{
                user_id: tenantId,
                entry_date: payDate,
                competence_date: payingInstallment.due_date,
                type: 'saida',
                category: payingInstallment.fixedCost.category,
                amount,
                description: payingInstallment.fixedCost.title,
                related_party: null,
                source: 'fixo',
                fixed_cost_id: payingInstallment.fixed_cost_id,
            }]).select('id').single();
            if (entryError) throw entryError;

            const { error: updateError } = await supabase.from('os_fixed_cost_installments').update({
                status: 'pago',
                paid_at: payDate,
                paid_amount: amount,
                cash_entry_id: entry.id,
            }).eq('id', payingInstallment.id);
            if (updateError) throw updateError;

            toast.success('Pagamento registrado no Fluxo de Caixa!');
            setPayingInstallment(null);
            await fetchAll();
            await ensureNextInstallments();
            await fetchAll();
        } catch (error: any) {
            toast.error('Erro ao registrar pagamento: ' + error.message);
        } finally {
            setIsPaying(false);
        }
    };

    const undoPayment = async (row: InstallmentRow) => {
        if (!confirm(`Desfazer o pagamento de "${row.fixedCost.title}" (venc. ${new Date(row.due_date + 'T00:00:00').toLocaleDateString('pt-BR')})? O lançamento sai do Fluxo de Caixa.`)) return;
        try {
            if (row.cash_entry_id) {
                const { error } = await supabase.from('cash_entries').delete().eq('id', row.cash_entry_id);
                if (error) throw error;
            }
            const { error } = await supabase.from('os_fixed_cost_installments').update({
                status: 'pendente', paid_at: null, paid_amount: null, cash_entry_id: null,
            }).eq('id', row.id);
            if (error) throw error;

            // Paying this installment auto-generated the following month's — undoing
            // the payment should undo that too, so there's only ever one pendente
            // installment per fixed cost again. Only removes it if it was never
            // touched itself (still pendente, no payment linked to it).
            const next = installments.find(i =>
                i.fixed_cost_id === row.fixed_cost_id && i.due_date > row.due_date && i.status === 'pendente' && !i.cash_entry_id
            );
            if (next) await supabase.from('os_fixed_cost_installments').delete().eq('id', next.id);

            toast.success('Pagamento desfeito.');
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao desfazer pagamento: ' + error.message);
        }
    };

    const cancelInstallment = async (row: InstallmentRow) => {
        if (!confirm(`Cancelar a parcela de "${row.fixedCost.title}" (venc. ${new Date(row.due_date + 'T00:00:00').toLocaleDateString('pt-BR')})? A próxima parcela é gerada em seguida.`)) return;
        const { error } = await supabase.from('os_fixed_cost_installments').update({ status: 'cancelado' }).eq('id', row.id);
        if (error) { toast.error('Erro ao cancelar: ' + error.message); return; }
        toast.success('Parcela cancelada.');
        await fetchAll();
        await ensureNextInstallments();
        await fetchAll();
    };

    const deleteInstallment = async (row: InstallmentRow) => {
        if (!confirm(`Excluir esta parcela de "${row.fixedCost.title}"? Se for a única parcela pendente desse custo fixo, uma nova é gerada em seguida.`)) return;
        const { error } = await supabase.from('os_fixed_cost_installments').delete().eq('id', row.id);
        if (error) { toast.error('Erro ao excluir: ' + error.message); return; }
        toast.success('Parcela excluída.');
        await fetchAll();
        await ensureNextInstallments();
        await fetchAll();
    };

    const fixedCostById = new Map(fixedCosts.map(fc => [fc.id, fc]));
    const installmentRows: InstallmentRow[] = installments
        .map(inst => ({ ...inst, fixedCost: fixedCostById.get(inst.fixed_cost_id) }))
        .filter((r): r is InstallmentRow => !!r.fixedCost)
        .filter(r => matchesSearchFields([r.fixedCost.title, r.fixedCost.category], searchTerm))
        .sort((a, b) => a.due_date.localeCompare(b.due_date));

    return (
        <div className="space-y-6">
            <div className="sticky top-0 z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/95 backdrop-blur-sm py-3 border-b border-gray-100 -mx-2 px-2 sm:-mx-0 sm:px-0">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Custos Fixos</h2>
                    <p className="text-gray-500">Contas a pagar recorrentes — aluguel, energia, cartão...</p>
                </div>
                <Button onClick={() => { if (isFormOpen) handleCancelForm(); else setIsFormOpen(true); }}>
                    {isFormOpen ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Novo Custo Fixo</>}
                </Button>
            </div>

            {isFormOpen && (
                <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="mb-4 pb-4 border-b border-gray-100">
                        <h3 className="font-semibold text-lg text-primary-cyan">
                            {editingId ? 'Editar Custo Fixo' : 'Novo Custo Fixo'}
                        </h3>
                    </div>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="Nome" placeholder="Ex: Aluguel da Sala" {...register('title')} error={errors.title?.message} />
                            <Input label="Categoria (opcional)" placeholder="Ex: Aluguel, Energia, Cartão..." {...register('category')} error={errors.category?.message} />
                            <Input label="Valor (R$)" type="number" step="0.01" {...register('amount')} error={errors.amount?.message} />
                            <Input label="Dia do Vencimento" type="number" min={1} max={31} placeholder="Ex: 10" {...register('dueDay')} error={errors.dueDay?.message} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Observações (opcional)</label>
                            <textarea
                                {...register('notes')}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[70px] text-sm"
                                placeholder="Ex: Boleto chega por e-mail, vencimento pode variar 1-2 dias"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input type="checkbox" {...register('active')} className="w-4 h-4 rounded border-gray-300 text-primary-cyan focus:ring-primary-cyan/50" />
                            Ativo (continua gerando parcelas futuras)
                        </label>
                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={handleCancelForm}>Cancelar</Button>
                            <Button type="submit">{editingId ? 'Salvar Alterações' : 'Salvar Custo Fixo'}</Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou categoria..."
                        className="bg-transparent border-none focus:outline-none w-full text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">Custo Fixo</th>
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
                                        Nenhuma parcela encontrada. Cadastre um custo fixo pra começar.
                                    </td>
                                </tr>
                            ) : (
                                installmentRows.map((row) => {
                                    const status = installmentStatusLabel(row);
                                    return (
                                        <tr key={row.id} className="bg-white border-b hover:bg-gray-50">
                                            <td className="px-6 py-4 font-medium text-gray-900">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0">
                                                        <Repeat className="w-4 h-4" />
                                                    </div>
                                                    <div className="font-semibold">{row.fixedCost.title}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">{row.fixedCost.category || '-'}</td>
                                            <td className="px-6 py-4 text-gray-600">{new Date(row.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                            <td className="px-6 py-4 font-medium">{formatCurrency(row.paid_amount ?? row.amount)}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {row.status === 'pendente' && (
                                                    <DropdownMenu items={[
                                                        { label: 'Dar Baixa', icon: <CheckCircle2 className="w-4 h-4" />, onClick: () => openPayModal(row) },
                                                        { label: 'Cancelar Parcela', icon: <Ban className="w-4 h-4" />, onClick: () => cancelInstallment(row) },
                                                        { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => deleteInstallment(row), variant: 'danger' as const },
                                                    ]} />
                                                )}
                                                {row.status === 'pago' && (
                                                    <DropdownMenu items={[
                                                        { label: 'Desfazer Pagamento', icon: <Undo2 className="w-4 h-4" />, onClick: () => undoPayment(row) },
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
                        <div className="text-center py-8 text-gray-500">Nenhuma parcela encontrada</div>
                    ) : (
                        installmentRows.map((row) => {
                            const status = installmentStatusLabel(row);
                            return (
                                <div key={row.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0">
                                                <Repeat className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-semibold text-gray-900 truncate">{row.fixedCost.title}</div>
                                                <div className="text-xs text-gray-400">{new Date(row.due_date + 'T00:00:00').toLocaleDateString('pt-BR')} · {row.fixedCost.category || 'Sem categoria'}</div>
                                            </div>
                                        </div>
                                        {row.status === 'pendente' && (
                                            <DropdownMenu items={[
                                                { label: 'Dar Baixa', icon: <CheckCircle2 className="w-4 h-4" />, onClick: () => openPayModal(row) },
                                                { label: 'Cancelar Parcela', icon: <Ban className="w-4 h-4" />, onClick: () => cancelInstallment(row) },
                                                { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => deleteInstallment(row), variant: 'danger' as const },
                                            ]} />
                                        )}
                                        {row.status === 'pago' && (
                                            <DropdownMenu items={[
                                                { label: 'Desfazer Pagamento', icon: <Undo2 className="w-4 h-4" />, onClick: () => undoPayment(row) },
                                            ]} />
                                        )}
                                        {row.status === 'cancelado' && (
                                            <DropdownMenu items={[
                                                { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => deleteInstallment(row), variant: 'danger' as const },
                                            ]} />
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-gray-900">{formatCurrency(row.paid_amount ?? row.amount)}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </Card>

            {/* Modelos de Custo Fixo: the recurring templates themselves — separate
                from the installments table above, since editing a template doesn't
                touch installments already generated. */}
            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-sm text-gray-700">Modelos de Custo Fixo Cadastrados</h3>
                </div>
                <div className="divide-y divide-gray-100">
                    {fixedCosts.length === 0 ? (
                        <p className="px-4 py-6 text-center text-gray-500 text-sm">Nenhum custo fixo cadastrado ainda.</p>
                    ) : (
                        fixedCosts.map(fc => (
                            <div key={fc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                <div className="min-w-0 flex items-center gap-2">
                                    <span className="font-medium text-gray-800 truncate">{fc.title}</span>
                                    <span className="text-xs text-gray-400">{fc.category || 'Sem categoria'} · todo dia {fc.due_day} · {formatCurrency(fc.amount)}</span>
                                    {!fc.active && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inativo</span>}
                                </div>
                                <DropdownMenu items={[
                                    { label: 'Editar', icon: <Edit2 className="w-4 h-4" />, onClick: () => handleEdit(fc) },
                                    { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => handleDeleteFixedCost(fc.id, fc.title), variant: 'danger' as const },
                                ]} />
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {payingInstallment && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPayingInstallment(null)}>
                    <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-bold text-lg text-dark mb-1">Dar Baixa</h3>
                        <p className="text-sm text-gray-500 mb-4">{payingInstallment.fixedCost.title} · venc. {new Date(payingInstallment.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                        <div className="space-y-4">
                            <Input label="Data do Pagamento" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                            <Input label="Valor Pago (R$)" type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                        </div>
                        <div className="flex justify-end gap-3 pt-6">
                            <Button type="button" variant="outline" onClick={() => setPayingInstallment(null)}>Cancelar</Button>
                            <Button type="button" onClick={confirmPayment} disabled={isPaying}>{isPaying ? 'Salvando...' : 'Confirmar Pagamento'}</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
