import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FileText, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { Drawer } from './ui/Drawer';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/orderFinance';

interface Props {
    open: boolean;
    onClose: () => void;
    serviceOrderId: string;
    osNumber?: string | number | null;
}

interface Emission {
    id: string;
    status: 'processando' | 'enviada' | 'emitida' | 'cancelada' | 'erro';
    numero: string | null;
    valor: number;
    link: string | null;
    error: string | null;
}

interface ServiceLine {
    name: string;
    total: number;
}

const STATUS_LABEL: Record<Emission['status'], string> = {
    processando: 'Processando',
    enviada: 'Enviada, aguardando a prefeitura',
    emitida: 'Emitida',
    cancelada: 'Cancelada',
    erro: 'Erro',
};

const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

// Painel de revisão + emissão de NFS-e (só serviços) via Bling. Os dados vêm da própria OS;
// bairro/cidade/UF do tomador são preenchidos pelo CEP (o cadastro de clientes não guarda separado).
export function EmitNfseDrawer({ open, onClose, serviceOrderId, osNumber }: Props) {
    const [loading, setLoading] = useState(true);
    const [emitting, setEmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [services, setServices] = useState<ServiceLine[]>([]);
    const [discount, setDiscount] = useState(0);
    const [emission, setEmission] = useState<Emission | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [noCustomer, setNoCustomer] = useState(false);
    const [form, setForm] = useState({
        name: '', document: '', email: '', cep: '', address: '', number: '', complement: '',
        neighborhood: '', city: '', uf: '',
    });
    const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const subtotal = services.reduce((a, s) => a + s.total, 0);
    const net = Math.max(0, subtotal - discount);

    useEffect(() => {
        if (!open) return;
        setConfirmed(false);
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, serviceOrderId]);

    const lookupCep = async (cepRaw: string) => {
        const cep = onlyDigits(cepRaw);
        if (cep.length !== 8) return;
        try {
            const { data } = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
            if (!data.erro) {
                setForm((f) => ({
                    ...f,
                    address: f.address || data.logradouro || '',
                    neighborhood: data.bairro || f.neighborhood,
                    city: data.localidade || f.city,
                    uf: data.uf || f.uf,
                }));
            }
        } catch (e) {
            console.error('Erro ao buscar CEP', e);
        }
    };

    const load = async () => {
        setLoading(true);
        try {
            const [{ data: os }, { data: svc }, { data: items }, { data: em }] = await Promise.all([
                supabase.from('service_orders')
                    .select('customer_id, discount_type, discount_value, guest_name').eq('id', serviceOrderId).single(),
                supabase.from('service_order_services')
                    .select('service_name, quantity, price').eq('service_order_id', serviceOrderId),
                supabase.from('service_order_items')
                    .select('quantity, unit_price').eq('service_order_id', serviceOrderId),
                supabase.from('nfse_emissions')
                    .select('id, status, numero, valor, link, error')
                    .eq('service_order_id', serviceOrderId).order('created_at', { ascending: false }).limit(1),
            ]);

            const lines: ServiceLine[] = (svc ?? [])
                .map((s: any) => {
                    const q = Number(s.quantity) || 1;
                    return { name: q > 1 ? `${s.service_name} (x${q})` : s.service_name, total: q * Number(s.price || 0) };
                })
                .filter((l) => l.total > 0);
            setServices(lines);
            setEmission((em?.[0] as Emission) ?? null);

            // Desconto da OS vale para serviços + produtos: aqui entra só a parte proporcional dos serviços.
            const sTotal = lines.reduce((a, l) => a + l.total, 0);
            const pTotal = (items ?? []).reduce((a: number, i: any) => a + (Number(i.quantity) || 0) * Number(i.unit_price || 0), 0);
            const all = sTotal + pTotal;
            const osDiscount = os?.discount_type === 'percent'
                ? all * (Number(os?.discount_value || 0) / 100)
                : Number(os?.discount_value || 0);
            setDiscount(all > 0 ? Math.round(osDiscount * (sTotal / all) * 100) / 100 : 0);

            if (os?.customer_id) {
                setNoCustomer(false);
                const { data: c } = await supabase.from('customers').select('*').eq('id', os.customer_id).single();
                if (c) {
                    const isCompany = c.person_type === 'juridica' || (!c.cpf && !!c.cnpj);
                    const base = {
                        name: (isCompany ? c.company_name || c.name : c.name) || '',
                        document: (isCompany ? c.cnpj : c.cpf) || c.cnpj || c.cpf || '',
                        email: c.email || '',
                        cep: c.cep || '',
                        address: c.address || '',
                        number: c.number || '',
                        complement: c.complement || '',
                        neighborhood: '', city: '', uf: '',
                    };
                    setForm(base);
                    // O endereço antigo vem como "rua, bairro - cidade/UF"; o CEP dá os campos certos.
                    const cep = onlyDigits(c.cep);
                    if (cep.length === 8) {
                        try {
                            const { data } = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
                            if (!data.erro) {
                                setForm({
                                    ...base,
                                    address: data.logradouro || base.address,
                                    neighborhood: data.bairro || '',
                                    city: data.localidade || '',
                                    uf: data.uf || '',
                                });
                            }
                        } catch (e) {
                            console.error('Erro ao buscar CEP', e);
                        }
                    }
                }
            } else {
                setNoCustomer(true);
                setForm((f) => ({ ...f, name: os?.guest_name || '' }));
            }
        } catch (e: any) {
            toast.error('Erro ao carregar dados da OS: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const call = async (action: 'emit' | 'status') => {
        const { data: sessionData } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke('bling-nfse', {
            body: { action, serviceOrderId, customer: form, discount },
            headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
        });
        if (error) {
            // Mensagem amigável vem no corpo da resposta de erro da função
            let msg = error.message;
            try { msg = (await (error as any).context.json()).error || msg; } catch { /* mantém */ }
            throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);
        return data.emission as Emission;
    };

    const handleEmit = async () => {
        setEmitting(true);
        try {
            const em = await call('emit');
            setEmission(em);
            toast.success('NFS-e enviada!');
        } catch (e: any) {
            toast.error(e.message);
            const { data: em } = await supabase.from('nfse_emissions')
                .select('id, status, numero, valor, link, error')
                .eq('service_order_id', serviceOrderId).order('created_at', { ascending: false }).limit(1);
            setEmission((em?.[0] as Emission) ?? null);
        } finally {
            setEmitting(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            setEmission(await call('status'));
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setRefreshing(false);
        }
    };

    const alive = emission && ['processando', 'enviada', 'emitida'].includes(emission.status);
    const docLen = onlyDigits(form.document).length;
    const formOk =
        !!form.name.trim() && (docLen === 11 || docLen === 14) && !!form.neighborhood.trim() &&
        !!form.city.trim() && form.uf.trim().length === 2 && subtotal > 0 && discount < subtotal;

    return (
        <Drawer open={open} onClose={onClose} title={`Emitir NFS-e${osNumber ? ` · OS ${osNumber}` : ''}`}>
            {loading ? (
                <p className="text-sm text-gray-500">Carregando...</p>
            ) : alive ? (
                <div className="space-y-4">
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                        <p className="font-semibold">{STATUS_LABEL[emission!.status]}</p>
                        {emission!.numero && <p>Número da NFS-e: {emission!.numero}</p>}
                        <p>Valor: {formatCurrency(Number(emission!.valor))}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {emission!.link && (
                            <a href={emission!.link} target="_blank" rel="noreferrer">
                                <Button type="button"><ExternalLink className="w-4 h-4 mr-2" />Abrir DANFSe</Button>
                            </a>
                        )}
                        <Button type="button" variant="outline" onClick={handleRefresh} disabled={refreshing}>
                            <RefreshCw className="w-4 h-4 mr-2" />{refreshing ? 'Atualizando...' : 'Atualizar situação'}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-5">
                    {emission?.status === 'erro' && (
                        <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>Última tentativa falhou: {emission.error}</span>
                        </div>
                    )}
                    {noCustomer && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            Esta OS não tem cliente cadastrado (só nome avulso). Preencha CPF/CNPJ e endereço abaixo.
                        </div>
                    )}

                    <section className="space-y-3">
                        <h3 className="font-semibold">Tomador</h3>
                        <Input label="Nome / Razão social" value={form.name} onChange={(e) => set('name', e.target.value)} />
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="CPF / CNPJ" value={form.document} onChange={(e) => set('document', e.target.value)} />
                            <Input label="E-mail" value={form.email} onChange={(e) => set('email', e.target.value)} />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <Input label="CEP" value={form.cep} onChange={(e) => set('cep', e.target.value)} onBlur={(e) => lookupCep(e.target.value)} />
                            <div className="col-span-2"><Input label="Rua" value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Número" value={form.number} onChange={(e) => set('number', e.target.value)} />
                            <Input label="Complemento" value={form.complement} onChange={(e) => set('complement', e.target.value)} />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <Input label="Bairro" value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />
                            <Input label="Cidade" value={form.city} onChange={(e) => set('city', e.target.value)} />
                            <Input label="UF" maxLength={2} value={form.uf} onChange={(e) => set('uf', e.target.value.toUpperCase())} />
                        </div>
                    </section>

                    <section className="space-y-2">
                        <h3 className="font-semibold">Serviços (código 01.07.01)</h3>
                        {services.length === 0 ? (
                            <p className="text-sm text-red-600">Esta OS não tem serviços com valor. Peças não entram na NFS-e.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
                                {services.map((s, i) => (
                                    <li key={i} className="flex justify-between gap-3 px-3 py-2">
                                        <span>{s.name}</span>
                                        <span className="whitespace-nowrap">{formatCurrency(s.total)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="grid grid-cols-2 gap-3 items-end">
                            <Input label="Desconto (R$)" type="number" step="0.01" min="0" value={discount}
                                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} />
                            <div className="text-right text-sm">
                                <p className="text-gray-500">Valor da nota</p>
                                <p className="text-lg font-bold">{formatCurrency(net)}</p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">
                            ISS 0% (MEI). O desconto é a parte proporcional dos serviços no desconto da OS; ajuste se precisar.
                        </p>
                    </section>

                    <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                        <span>Entendo que isto emite uma <strong>nota fiscal real</strong> no Bling e na prefeitura, não um teste.</span>
                    </label>

                    <Button type="button" className="w-full" onClick={handleEmit} disabled={!confirmed || !formOk || emitting}>
                        <FileText className="w-4 h-4 mr-2" />
                        {emitting ? 'Emitindo...' : 'Emitir NFS-e'}
                    </Button>
                </div>
            )}
        </Drawer>
    );
}
