import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Input';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type ClosureType = 'feriado' | 'ausencia';

type Closure = {
    id: string;
    type: ClosureType;
    start_date: string;
    end_date: string;
    client_message: string | null;
};

const TYPE_LABEL: Record<ClosureType, string> = { feriado: 'Feriado', ausencia: 'Ausência' };

const DEFAULT_MESSAGE_HINT =
    'Se ficar vazio, o assistente usa um texto padrão com a data de retorno (sem citar o motivo).';

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' sem passar por Date (evita deslocar o dia por fuso).
function formatDate(iso: string) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function todayIso() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Renderizada FORA do <form> principal de CompanySettings (form aninhado não existe em HTML);
// por isso usa <div> e botões type="button". Só o dono edita — RLS também exige isso.
export function BusinessClosuresSection() {
    const { tenantId, isOwner } = useAuth();
    const [items, setItems] = useState<Closure[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [type, setType] = useState<ClosureType>('feriado');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const [reloadKey, setReloadKey] = useState(0);
    const reload = () => setReloadKey((k) => k + 1);

    useEffect(() => {
        if (!tenantId) return;
        let cancelled = false;
        supabase
            .from('business_closures')
            .select('id, type, start_date, end_date, client_message')
            .eq('user_id', tenantId)
            .order('start_date', { ascending: false })
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) console.error('Error fetching business closures:', error);
                else setItems((data as Closure[]) || []);
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, reloadKey]);

    const openNew = () => {
        setEditingId(null);
        setType('feriado');
        setStartDate('');
        setEndDate('');
        setMessage('');
        setFormError(null);
        setOpen(true);
    };

    const openEdit = (c: Closure) => {
        setEditingId(c.id);
        setType(c.type);
        setStartDate(c.start_date);
        setEndDate(c.end_date);
        setMessage(c.client_message || '');
        setFormError(null);
        setOpen(true);
    };

    const handleSave = async () => {
        if (!startDate || !endDate) {
            setFormError('Informe a data de início e a data de fim.');
            return;
        }
        if (endDate < startDate) {
            setFormError('A data de fim não pode ser antes da data de início.');
            return;
        }
        setFormError(null);
        setSaving(true);
        const payload = {
            type,
            start_date: startDate,
            end_date: endDate,
            client_message: message.trim() || null,
        };
        // Sem user_id no insert: o banco preenche com current_tenant_id().
        const query = editingId
            ? supabase.from('business_closures').update(payload).eq('id', editingId).eq('user_id', tenantId!).select('id')
            : supabase.from('business_closures').insert(payload).select('id');
        const { data, error } = await query;
        setSaving(false);
        if (error) {
            toast.error('Não foi possível salvar: ' + error.message);
            return;
        }
        // UPDATE bloqueado por RLS não dá erro, só devolve 0 linhas.
        if (!data || data.length === 0) {
            toast.error('Nada foi salvo. Só o dono da conta pode alterar feriados e ausências.');
            return;
        }
        toast.success(editingId ? 'Atualizado!' : 'Cadastrado!');
        setOpen(false);
        reload();
    };

    const handleDelete = async (c: Closure) => {
        if (!confirm(`Excluir ${TYPE_LABEL[c.type].toLowerCase()} de ${formatDate(c.start_date)} a ${formatDate(c.end_date)}?`)) return;
        const { data, error } = await supabase
            .from('business_closures')
            .delete()
            .eq('id', c.id)
            .eq('user_id', tenantId!)
            .select('id');
        if (error || !data || data.length === 0) {
            toast.error('Não foi possível excluir.');
            return;
        }
        toast.success('Excluído.');
        reload();
    };

    const today = todayIso();

    return (
        <Card className="mt-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <CalendarOff className="w-5 h-5 text-primary-green" />
                    <h3 className="font-semibold text-base sm:text-lg">Feriados e Ausências</h3>
                </div>
                {isOwner && (
                    <Button type="button" size="sm" onClick={openNew}>
                        <Plus className="w-4 h-4 mr-1" />
                        Novo
                    </Button>
                )}
            </div>
            <p className="text-xs text-gray-500">
                Nos dias cadastrados, o assistente do WhatsApp avisa os clientes que não há atendimento técnico e quando voltamos. O motivo da ausência nunca é informado ao cliente.
            </p>

            {loading ? (
                <p className="text-sm text-gray-400">Carregando...</p>
            ) : items.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum feriado ou ausência cadastrado.</p>
            ) : (
                <div className="space-y-2">
                    {items.map((c) => {
                        const past = c.end_date < today;
                        return (
                            <div
                                key={c.id}
                                className={`flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl text-sm ${past ? 'opacity-50' : ''}`}
                            >
                                <div className="min-w-0">
                                    <div className="font-medium text-dark">
                                        {TYPE_LABEL[c.type]} ·{' '}
                                        {c.start_date === c.end_date
                                            ? formatDate(c.start_date)
                                            : `${formatDate(c.start_date)} a ${formatDate(c.end_date)}`}
                                    </div>
                                    {c.client_message && <div className="text-xs text-gray-500 truncate">{c.client_message}</div>}
                                </div>
                                {isOwner && (
                                    <div className="flex shrink-0 gap-1">
                                        <button
                                            type="button"
                                            onClick={() => openEdit(c)}
                                            className="p-2 text-gray-400 hover:text-primary-green hover:bg-white rounded-lg transition-colors"
                                            title="Editar"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(c)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Excluir"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <Drawer open={open} onClose={() => setOpen(false)} title={editingId ? 'Editar' : 'Novo feriado ou ausência'}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-dark-lighter mb-1">Tipo</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as ClosureType)}
                            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white"
                        >
                            <option value="feriado">Feriado</option>
                            <option value="ausencia">Ausência</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Início"
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                                setStartDate(e.target.value);
                                if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                            }}
                        />
                        <Input label="Fim" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                    <p className="text-xs text-gray-500 -mt-2">Para um dia só, deixe o fim igual ao início.</p>
                    <div>
                        <label className="block text-sm font-medium text-dark-lighter mb-1">Mensagem para o cliente (opcional)</label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[100px] text-sm"
                            placeholder="Ex: Estamos em recesso. Voltamos na segunda-feira, dia 11!"
                        />
                        <p className="mt-1 text-xs text-gray-500">{DEFAULT_MESSAGE_HINT}</p>
                    </div>
                    {formError && <p className="text-sm text-red-500">{formError}</p>}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="button" onClick={handleSave} disabled={saving}>
                            {saving ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </div>
                </div>
            </Drawer>
        </Card>
    );
}
