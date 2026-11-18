import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Package, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
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

interface ItemLine {
    id: string; // service_order_items.id
    productId: string | null;
    name: string;
    quantity: number;
    total: number;
    ncm: string; // como digitado
    savedNcm: string; // dígitos já gravados no produto
}

const STATUS_LABEL: Record<Emission['status'], string> = {
    processando: 'Processando',
    enviada: 'Enviada, aguardando a SEFAZ',
    emitida: 'Autorizada',
    cancelada: 'Cancelada',
    erro: 'Erro',
};

const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

// Painel de revisão + emissão de NF-e de PRODUTOS (só as peças da OS) via Bling.
// Separado do painel de NFS-e, como no Bling. NCM por item: vem do cadastro do produto e é gravado de volta.
export function EmitNfeDrawer({ open, onClose, serviceOrderId, osNumber }: Props) {
    const [loading, setLoading] = useState(true);
    const [emitting, setEmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [items, setItems] = useState<ItemLine[]>([]);
    const [discount, setDiscount] = useState(0);
    const [emission, setEmission] = useState<Emission | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [noCustomer, setNoCustomer] = useState(false);
    const [form, setForm] = useState({
        name: '', document: '', email: '', stateRegistration: '', cep: '', address: '', number: '',
        complement: '', neighborhood: '', city: '', uf: '',
    });
    const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const subtotal = items.reduce((a, i) => a + i.total, 0);
    const net = Math.max(0, subtotal - discount);
    const isCompany = onlyDigits(form.document).length === 14;

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
            const [{ data: os }, { data: rows }, { data: svc }, { data: em }] = await Promise.all([
                supabase.from('service_orders')
                    .select('customer_id, discount_type, discount_value, guest_name').eq('id', serviceOrderId).single(),
                supabase.from('service_order_items')
                    .select('id, product_id, product_name, quantity, unit_price').eq('service_order_id', serviceOrderId),
                supabase.from('service_order_services')
                    .select('quantity, price').eq('service_order_id', serviceOrderId),
                supabase.from('nfe_emissions')
                    .select('id, status, numero, valor, link, error')
                    .eq('service_order_id', serviceOrderId).order('created_at', { ascending: false }).limit(1),
            ]);

            const productIds = [...new Set((rows ?? []).map((r: any) => r.product_id).filter(Boolean))] as string[];
            const ncmMap = new Map<string, string>();
            if (productIds.length) {
                const { data: prods } = await supabase.from('products').select('id, ncm').in('id', productIds);
                (prods ?? []).forEach((p: any) => ncmMap.set(p.id, p.ncm || ''));
            }

            const lines: ItemLine[] = (rows ?? [])
                .map((r: any) => {
                    const q = Number(r.quantity) || 0;
                    const saved = r.product_id ? ncmMap.get(r.product_id) || '' : '';
                    return {
                        id: r.id as string, productId: (r.product_id as string) ?? null, name: r.product_name as string,
                        quantity: q, total: q * Number(r.unit_price || 0), ncm: saved, savedNcm: saved,
                    };
                })
                .filter((l) => l.total > 0);
            setItems(lines);
            setEmission((em?.[0] as Emission) ?? null);

            // Desconto da OS vale para serviços + produtos: aqui entra só a parte proporcional dos produtos.
            const pTotal = lines.reduce((a, l) => a + l.total, 0);
            const sTotal = (svc ?? []).reduce((a: number, s: any) => a + (Number(s.quantity) || 1) * Number(s.price || 0), 0);
            const all = pTotal + sTotal;
            const osDiscount = os?.discount_type === 'percent'
                ? all * (Number(os?.discount_value || 0) / 100)
                : Number(os?.discount_value || 0);
            setDiscount(all > 0 ? Math.round(osDiscount * (pTotal / all) * 100) / 100 : 0);

            if (os?.customer_id) {
                setNoCustomer(false);
                const { data: c } = await supabase.from('customers').select('*').eq('id', os.customer_id).single();
                if (c) {
                    const isCo = c.person_type === 'juridica' || (!c.cpf && !!c.cnpj);
                    const base = {
                        name: (isCo ? c.company_name || c.name : c.name) || '',
                        document: (isCo ? c.cnpj : c.cpf) || c.cnpj || c.cpf || '',
                        email: c.email || '',
                        stateRegistration: c.state_registration || '',
                        cep: c.cep || '', address: c.address || '', number: c.number || '', complement: c.complement || '',
                        neighborhood: '', city: '', uf: '',
                    };
                    setForm(base);
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
        const { data, error } = await supabase.functions.invoke('bling-nfe', {
            body: {
                action, serviceOrderId, customer: form, discount,
                ncm: Object.fromEntries(items.map((i) => [i.id, onlyDigits(i.ncm)])),
            },
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

    const reloadEmission = async () => {
        const { data: em } = await supabase.from('nfe_emissions')
            .select('id, status, numero, valor, link, error')
            .eq('service_order_id', serviceOrderId).order('created_at', { ascending: false }).limit(1);
        setEmission((em?.[0] as Emission) ?? null);
    };

    const handleEmit = async () => {
        setEmitting(true);
        try {
            // Grava o NCM no produto (uma vez só), para as próximas notas já virem preenchidas.
            await Promise.all(items
                .filter((i) => i.productId && onlyDigits(i.ncm).length === 8 && onlyDigits(i.ncm) !== i.savedNcm)
                .map((i) => supabase.from('products').update({ ncm: onlyDigits(i.ncm) }).eq('id', i.productId!)));
            const em = await call('emit');
            setEmission(em);
            if (em.status === 'erro') toast.error(em.error || 'A SEFAZ rejeitou a nota');
            else toast.success('NF-e enviada!');
        } catch (e: any) {
            toast.error(e.message);
            await reloadEmission();
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
        !!form.name.trim() && (docLen === 11 || docLen === 14) && !!form.address.trim() && !!form.neighborhood.trim() &&
        !!form.city.trim() && form.uf.trim().length === 2 && subtotal > 0 && discount < subtotal &&
        items.every((i) => onlyDigits(i.ncm).length === 8);

    return (
        <Drawer open={open} onClose={onClose} title={`Emitir NF-e${osNumber ? ` · OS ${osNumber}` : ''}`}>
            {loading ? (
                <p className="text-sm text-gray-500">Carregando...</p>
            ) : alive ? (
                <div className="space-y-4">
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                        <p className="font-semibold">{STATUS_LABEL[emission!.status]}</p>
                        {emission!.numero && <p>Número da NF-e: {emission!.numero}</p>}
                        <p>Valor: {formatCurrency(Number(emission!.valor))}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {emission!.link && (
                            <a href={emission!.link} target="_blank" rel="noreferrer">
                                <Button type="button"><ExternalLink className="w-4 h-4 mr-2" />Abrir DANFE</Button>
                            </a>
                        )}
                        <Button type="button" variant="outline" onClick={handleRefresh} disabled={refreshing}>
                            <RefreshCw className="w-4 h-4 mr-2" />{refreshing ? 'Atualizando...' : 'Atualizar situação'}
                        </Button>
                    </div>
                    <p className="text-xs text-gray-500">Para cancelar uma NF-e, use o Bling (a API não permite cancelar).</p>
                </div>
            ) : items.length === 0 ? (
                <p className="text-sm text-gray-600">
                    Esta OS não tem produtos (peças) com valor. A NF-e é só para produtos; serviços saem pela NFS-e.
                </p>
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
                        <h3 className="font-semibold">Destinatário</h3>
                        <Input label="Nome / Razão social" value={form.name} onChange={(e) => set('name', e.target.value)} />
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="CPF / CNPJ" value={form.document} onChange={(e) => set('document', e.target.value)} />
                            <Input label="E-mail" value={form.email} onChange={(e) => set('email', e.target.value)} />
                        </div>
                        {isCompany && (
                            <Input label="Inscrição estadual (vazio = não contribuinte)" value={form.stateRegistration}
                                onChange={(e) => set('stateRegistration', e.target.value)} />
                        )}
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
                        <h3 className="font-semibold">Produtos</h3>
                        <ul className="space-y-3">
                            {items.map((i) => (
                                <li key={i.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
                                    <div className="flex justify-between gap-3 text-sm">
                                        <span className="font-medium">{i.name} <span className="text-gray-500">(x{i.quantity})</span></span>
                                        <span className="whitespace-nowrap">{formatCurrency(i.total)}</span>
                                    </div>
                                    <Input
                                        label="NCM (8 dígitos)"
                                        placeholder="Ex: 8504.40.10"
                                        value={i.ncm}
                                        error={i.ncm && onlyDigits(i.ncm).length !== 8 ? 'O NCM tem 8 dígitos' : undefined}
                                        onChange={(e) => setItems((all) => all.map((x) => x.id === i.id ? { ...x, ncm: e.target.value } : x))}
                                    />
                                </li>
                            ))}
                        </ul>
                        <div className="grid grid-cols-2 gap-3 items-end">
                            <Input label="Desconto (R$)" type="number" step="0.01" min="0" value={discount}
                                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} />
                            <div className="text-right text-sm">
                                <p className="text-gray-500">Valor da nota</p>
                                <p className="text-lg font-bold">{formatCurrency(net)}</p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">
                            Natureza: venda de mercadoria para {isCompany ? 'PJ' : 'não contribuinte PF'}. CFOP{' '}
                            {form.uf.trim().toUpperCase() === 'PE' ? '5102' : '6102'} (automático pela UF). Origem, CEST, GTIN e % de tributos vêm da aba Tributação do produto; o NCM digitado aqui fica salvo nele.
                        </p>
                    </section>

                    <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                        <span>Entendo que isto emite uma <strong>nota fiscal real</strong> na SEFAZ, não um teste.</span>
                    </label>

                    <Button type="button" className="w-full" onClick={handleEmit} disabled={!confirmed || !formOk || emitting}>
                        <Package className="w-4 h-4 mr-2" />
                        {emitting ? 'Emitindo...' : 'Emitir NF-e'}
                    </Button>
                </div>
            )}
        </Drawer>
    );
}
