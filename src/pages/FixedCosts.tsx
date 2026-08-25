import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Search, Edit2, Trash2, Repeat, CheckCircle2, Undo2, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { matchesSearchFields } from '../lib/search';
import { formatCurrency } from '../lib/orderFinance';
import { dueDateForMonth, isPaidForMonth, type FixedCost } from '../lib/fixedCosts';

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

type PaidEntry = { id: string; fixed_cost_id: string; entry_date: string; amount: number };

// Local calendar date (YYYY-MM-DD), matching CashFlow.tsx's toDateStr — avoids
// toISOString() rolling the date forward in the evening for UTC-3.
function toDateStr(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export default function FixedCosts() {
    const { tenantId } = useAuth();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
    const [paidEntries, setPaidEntries] = useState<PaidEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FixedCostFormInput, any, FixedCostForm>({
        resolver: zodResolver(fixedCostSchema),
        defaultValues: { active: true },
    });

    useEffect(() => {
        if (tenantId) fetchAll();
    }, [tenantId]);

    const fetchAll = async () => {
        if (!tenantId) return;
        const [costsRes, entriesRes] = await Promise.all([
            supabase.from('os_fixed_costs').select('*').eq('user_id', tenantId).order('due_day'),
            supabase.from('cash_entries').select('id, fixed_cost_id, entry_date, amount').eq('user_id', tenantId).not('fixed_cost_id', 'is', null),
        ]);
        if (costsRes.error) console.error('Error fetching fixed costs:', costsRes.error);
        else setFixedCosts(costsRes.data || []);
        setPaidEntries((entriesRes.data || []) as PaidEntry[]);
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

    const handleCancel = () => {
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
            handleCancel();
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao salvar custo fixo: ' + error.message);
        }
    };

    const handleDelete = async (id: string, title: string) => {
        if (!tenantId || !confirm(`Tem certeza que deseja excluir o custo fixo "${title}"? Lançamentos já pagos no Fluxo de Caixa não são afetados.`)) return;
        try {
            const { error } = await supabase.from('os_fixed_costs').delete().eq('id', id).eq('user_id', tenantId);
            if (error) throw error;
            toast.success('Custo fixo excluído com sucesso!');
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao excluir custo fixo: ' + error.message);
        }
    };

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const markAsPaid = async (fc: FixedCost) => {
        if (!tenantId) return;
        const entryDateStr = toDateStr(dueDateForMonth(fc.due_day, year, month));
        try {
            const { error } = await supabase.from('cash_entries').insert([{
                user_id: tenantId,
                entry_date: entryDateStr,
                competence_date: entryDateStr,
                type: 'saida',
                category: fc.category,
                amount: fc.amount,
                description: fc.title,
                related_party: null,
                source: 'fixo',
                fixed_cost_id: fc.id,
            }]);
            if (error) throw error;
            toast.success('Pagamento registrado no Fluxo de Caixa!');
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao registrar pagamento: ' + error.message);
        }
    };

    const undoPayment = async (fc: FixedCost) => {
        const match = paidEntries.find(e => {
            if (e.fixed_cost_id !== fc.id) return false;
            const d = new Date(e.entry_date + 'T00:00:00');
            return d.getFullYear() === year && d.getMonth() === month;
        });
        if (!match) return;
        if (!confirm(`Desfazer o pagamento de "${fc.title}" deste mês? O lançamento sai do Fluxo de Caixa.`)) return;
        const { error } = await supabase.from('cash_entries').delete().eq('id', match.id);
        if (error) { toast.error('Erro ao desfazer pagamento: ' + error.message); return; }
        toast.success('Pagamento desfeito.');
        fetchAll();
    };

    const filteredCosts = fixedCosts.filter(fc =>
        matchesSearchFields([fc.title, fc.category], searchTerm)
    );

    const statusFor = (fc: FixedCost) => {
        if (!fc.active) return { label: 'Inativo', color: 'bg-gray-100 text-gray-500' };
        if (isPaidForMonth(fc.id, year, month, paidEntries)) return { label: 'Pago este mês', color: 'bg-green-100 text-green-700' };
        const dueDate = dueDateForMonth(fc.due_day, year, month);
        const daysUntil = Math.round((dueDate.getTime() - new Date(year, month, today.getDate()).getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil < 0) return { label: `Vencido há ${Math.abs(daysUntil)}d`, color: 'bg-red-100 text-red-700' };
        if (daysUntil <= 5) return { label: daysUntil === 0 ? 'Vence hoje' : `Vence em ${daysUntil}d`, color: 'bg-amber-100 text-amber-700' };
        return { label: `Todo dia ${fc.due_day}`, color: 'bg-gray-100 text-gray-500' };
    };

    const paymentAction = (fc: FixedCost) => {
        if (!fc.active) return null;
        const paid = isPaidForMonth(fc.id, year, month, paidEntries);
        return paid ? (
            <button type="button" onClick={() => undoPayment(fc)} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-600">
                <Undo2 className="w-3.5 h-3.5" /> Desfazer pagamento
            </button>
        ) : (
            <button type="button" onClick={() => markAsPaid(fc)} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-cyan hover:text-primary-cyan-dark">
                <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como pago
            </button>
        );
    };

    return (
        <div className="space-y-6">
            <div className="sticky top-0 z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/95 backdrop-blur-sm py-3 border-b border-gray-100 -mx-2 px-2 sm:-mx-0 sm:px-0">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Custos Fixos</h2>
                    <p className="text-gray-500">Aluguel, energia, cartão... cadastre uma vez e receba aviso perto do vencimento</p>
                </div>
                <Button onClick={() => { if (isFormOpen) handleCancel(); else setIsFormOpen(true); }}>
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
                            Ativo (gera aviso de vencimento no Dashboard)
                        </label>
                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
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
                                <th className="px-6 py-3">Nome</th>
                                <th className="px-6 py-3">Categoria</th>
                                <th className="px-6 py-3">Valor</th>
                                <th className="px-6 py-3">Situação</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCosts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                        Nenhum custo fixo cadastrado
                                    </td>
                                </tr>
                            ) : (
                                filteredCosts.map((fc) => {
                                    const status = statusFor(fc);
                                    return (
                                        <tr key={fc.id} className="bg-white border-b hover:bg-gray-50">
                                            <td className="px-6 py-4 font-medium text-gray-900">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0">
                                                        <Repeat className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold">{fc.title}</div>
                                                        {paymentAction(fc)}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">{fc.category || '-'}</td>
                                            <td className="px-6 py-4 font-medium">{formatCurrency(fc.amount)}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <DropdownMenu
                                                    items={[
                                                        { label: 'Atualizar', icon: <Edit2 className="w-4 h-4" />, onClick: () => handleEdit(fc) },
                                                        { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => handleDelete(fc.id, fc.title), variant: 'danger' as const },
                                                    ]}
                                                />
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
                    {filteredCosts.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">Nenhum custo fixo cadastrado</div>
                    ) : (
                        filteredCosts.map((fc) => {
                            const status = statusFor(fc);
                            return (
                                <div key={fc.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 active:bg-gray-50 transition-colors">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0">
                                                <Repeat className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-semibold text-gray-900 truncate">{fc.title}</div>
                                                <div className="text-xs text-gray-400">{fc.category || 'Sem categoria'}</div>
                                            </div>
                                        </div>
                                        <DropdownMenu
                                            items={[
                                                { label: 'Atualizar', icon: <Edit2 className="w-4 h-4" />, onClick: () => handleEdit(fc) },
                                                { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: () => handleDelete(fc.id, fc.title), variant: 'danger' as const },
                                            ]}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-gray-900">{formatCurrency(fc.amount)}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                                    </div>
                                    {paymentAction(fc)}
                                </div>
                            );
                        })
                    )}
                </div>
            </Card>

            <Card className="bg-amber-50/50 border-amber-100 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>O aviso de vencimento aparece no Dashboard quando faltam 5 dias ou menos, e continua até você marcar como pago (ou o pagamento vira automaticamente um lançamento de "Saída" no Fluxo de Caixa).</p>
            </Card>
        </div>
    );
}
