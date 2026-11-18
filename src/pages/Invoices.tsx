import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, RefreshCw, Ban, FileText } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/orderFinance';

type EmissionStatus = 'processando' | 'enviada' | 'emitida' | 'cancelada' | 'erro';

interface Emission {
    id: string;
    service_order_id: string;
    status: EmissionStatus;
    numero: string | null;
    valor: number;
    link: string | null;
    error: string | null;
    created_at: string;
    canceled_at: string | null;
    cancel_reason: string | null;
}

interface Row extends Emission {
    os_number: number | null;
    customer_name: string;
}

const STATUS_BADGE: Record<EmissionStatus, { label: string; cls: string }> = {
    processando: { label: 'Processando', cls: 'bg-blue-100 text-blue-700' },
    enviada: { label: 'Aguardando prefeitura', cls: 'bg-amber-100 text-amber-700' },
    emitida: { label: 'Emitida', cls: 'bg-green-100 text-green-700' },
    cancelada: { label: 'Cancelada', cls: 'bg-gray-200 text-gray-600' },
    erro: { label: 'Erro', cls: 'bg-red-100 text-red-700' },
};

const CANCEL_REASONS = [
    { value: 1, label: 'Erro na emissão' },
    { value: 2, label: 'Serviço não prestado' },
    { value: 9, label: 'Outros' },
];

type Filter = 'todas' | 'ativas' | 'canceladas' | 'erro';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export default function Invoices() {
    const { isOwner } = useAuth();
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>('todas');
    const [refreshingId, setRefreshingId] = useState<string | null>(null);

    const [cancelRow, setCancelRow] = useState<Row | null>(null);
    const [motivo, setMotivo] = useState(1);
    const [justificativa, setJustificativa] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [canceling, setCanceling] = useState(false);

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const { data: ems, error } = await supabase.from('nfse_emissions')
                .select('id, service_order_id, status, numero, valor, link, error, created_at, canceled_at, cancel_reason')
                .order('created_at', { ascending: false });
            if (error) throw error;

            const osIds = [...new Set((ems ?? []).map((e) => e.service_order_id))];
            const osMap = new Map<string, { os_number: number; customer_id: string | null; guest_name: string | null }>();
            const custMap = new Map<string, string>();
            if (osIds.length) {
                const { data: orders } = await supabase.from('service_orders')
                    .select('id, os_number, customer_id, guest_name').in('id', osIds);
                (orders ?? []).forEach((o: any) => osMap.set(o.id, o));
                const custIds = [...new Set((orders ?? []).map((o: any) => o.customer_id).filter(Boolean))];
                if (custIds.length) {
                    const { data: custs } = await supabase.from('customers').select('id, name, company_name').in('id', custIds as string[]);
                    (custs ?? []).forEach((c: any) => custMap.set(c.id, c.company_name || c.name));
                }
            }
            setRows((ems ?? []).map((e: any) => {
                const o = osMap.get(e.service_order_id);
                return {
                    ...e,
                    valor: Number(e.valor),
                    os_number: o?.os_number ?? null,
                    customer_name: (o?.customer_id ? custMap.get(o.customer_id) : o?.guest_name) || '—',
                } as Row;
            }));
        } catch (e: any) {
            toast.error('Erro ao carregar notas: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const call = async (body: Record<string, unknown>) => {
        const { data: sessionData } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke('bling-nfse', {
            body,
            headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
        });
        if (error) {
            let msg = error.message;
            try { msg = (await (error as any).context.json()).error || msg; } catch { /* mantém */ }
            throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);
        return data.emission as Emission;
    };

    const refresh = async (row: Row) => {
        setRefreshingId(row.id);
        try {
            const em = await call({ action: 'status', serviceOrderId: row.service_order_id });
            setRows((all) => all.map((r) => r.id === row.id ? { ...r, ...em, valor: Number(em.valor) } : r));
            toast.success('Situação atualizada');
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setRefreshingId(null);
        }
    };

    const openCancel = (row: Row) => {
        setCancelRow(row);
        setMotivo(1);
        setJustificativa('');
        setConfirmed(false);
    };

    const doCancel = async () => {
        if (!cancelRow) return;
        setCanceling(true);
        try {
            const em = await call({
                action: 'cancel', serviceOrderId: cancelRow.service_order_id, codigoMotivo: motivo, justificativa,
            });
            setRows((all) => all.map((r) => r.id === cancelRow.id ? { ...r, ...em, valor: Number(em.valor) } : r));
            toast.success('NFS-e cancelada');
            setCancelRow(null);
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setCanceling(false);
        }
    };

    const visible = useMemo(() => rows.filter((r) => {
        if (filter === 'ativas') return ['processando', 'enviada', 'emitida'].includes(r.status);
        if (filter === 'canceladas') return r.status === 'cancelada';
        if (filter === 'erro') return r.status === 'erro';
        return true;
    }), [rows, filter]);

    const totalAtivas = rows
        .filter((r) => r.status === 'emitida' || r.status === 'enviada')
        .reduce((a, r) => a + r.valor, 0);

    const FILTERS: { key: Filter; label: string }[] = [
        { key: 'todas', label: 'Todas' },
        { key: 'ativas', label: 'Ativas' },
        { key: 'canceladas', label: 'Canceladas' },
        { key: 'erro', label: 'Com erro' },
    ];

    return (
        <div className="space-y-4 sm:space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-dark">Notas Fiscais</h2>
                <p className="text-sm text-gray-500">NFS-e emitidas pelo OSTecnico via Bling. Para emitir, use o menu ⋮ da OS.</p>
            </div>

            <Card>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map((f) => (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => setFilter(f.key)}
                                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filter === f.key
                                    ? 'bg-primary-green text-white border-primary-green'
                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-sm text-gray-500">
                        Total ativo: <strong className="text-dark">{formatCurrency(totalAtivas)}</strong>
                    </p>
                </div>

                {loading ? (
                    <p className="text-sm text-gray-500">Carregando...</p>
                ) : visible.length === 0 ? (
                    <div className="py-10 text-center text-gray-500">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        Nenhuma nota por aqui.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {visible.map((r) => {
                            const badge = STATUS_BADGE[r.status];
                            const canCancel = r.status === 'emitida' || r.status === 'enviada';
                            return (
                                <div key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-semibold text-dark">
                                                {r.numero ? `NFS-e ${r.numero}` : 'NFS-e sem número'}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 truncate">
                                            {r.customer_name} · OS {r.os_number ?? '—'} · {fmtDate(r.created_at)}
                                        </p>
                                        {r.status === 'erro' && r.error && <p className="text-xs text-red-600">{r.error}</p>}
                                        {r.status === 'cancelada' && r.cancel_reason && (
                                            <p className="text-xs text-gray-500">
                                                Cancelada em {r.canceled_at ? fmtDate(r.canceled_at) : '—'} · {r.cancel_reason}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-dark whitespace-nowrap">{formatCurrency(r.valor)}</span>
                                        {r.link && (
                                            <a href={r.link} target="_blank" rel="noreferrer" title="Abrir DANFSe">
                                                <Button type="button" variant="outline" size="sm"><ExternalLink className="w-4 h-4" /></Button>
                                            </a>
                                        )}
                                        {(r.status === 'enviada' || r.status === 'emitida') && (
                                            <Button type="button" variant="outline" size="sm" title="Atualizar situação"
                                                onClick={() => refresh(r)} disabled={refreshingId === r.id}>
                                                <RefreshCw className={`w-4 h-4 ${refreshingId === r.id ? 'animate-spin' : ''}`} />
                                            </Button>
                                        )}
                                        {canCancel && isOwner && (
                                            <Button type="button" variant="danger" size="sm" onClick={() => openCancel(r)}>
                                                <Ban className="w-4 h-4 mr-1" />Cancelar
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            <Drawer open={!!cancelRow} onClose={() => setCancelRow(null)} title={`Cancelar NFS-e ${cancelRow?.numero ?? ''}`}>
                {cancelRow && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            Cancelar uma NFS-e é registrado na prefeitura e <strong>não pode ser desfeito</strong>. Para
                            cobrar de novo, será preciso emitir outra nota.
                        </div>
                        <p className="text-sm text-gray-600">
                            {cancelRow.customer_name} · OS {cancelRow.os_number ?? '—'} · {formatCurrency(cancelRow.valor)}
                        </p>

                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-dark-lighter">Motivo</label>
                            <select
                                value={motivo}
                                onChange={(e) => setMotivo(Number(e.target.value))}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-green/50"
                            >
                                {CANCEL_REASONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-dark-lighter">Justificativa (mín. 15 caracteres)</label>
                            <textarea
                                rows={3}
                                maxLength={255}
                                value={justificativa}
                                onChange={(e) => setJustificativa(e.target.value)}
                                placeholder="Ex: valor lançado errado, nota será reemitida."
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-green/50"
                            />
                            <p className="text-xs text-gray-500">{justificativa.trim().length}/15</p>
                        </div>

                        <label className="flex items-start gap-2 text-sm text-gray-700">
                            <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                            <span>Entendo que o cancelamento é definitivo.</span>
                        </label>

                        <Button
                            type="button"
                            variant="danger"
                            className="w-full"
                            onClick={doCancel}
                            disabled={!confirmed || justificativa.trim().length < 15 || canceling}
                        >
                            <Ban className="w-4 h-4 mr-2" />
                            {canceling ? 'Cancelando...' : 'Cancelar NFS-e'}
                        </Button>
                    </div>
                )}
            </Drawer>
        </div>
    );
}
