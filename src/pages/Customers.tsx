import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, MapPin, Phone, User, Edit2, Search, Trash2, Building2, Loader2, History, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { CustomerHistoryModal } from '../components/CustomerHistoryModal';
import { CustomerDetailModal } from '../components/CustomerDetailModal';
import { matchesSearchFields } from '../lib/search';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const customerSchema = z.object({
    personType: z.enum(['fisica', 'juridica']),
    name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
    phone: z.string().min(10, 'Telefone inválido'),
    email: z.union([z.literal(''), z.string().email('E-mail inválido')]).optional(),
    cpf: z.string().min(11, 'CPF inválido'),
    cep: z.string().min(8, 'CEP inválido'),
    address: z.string().min(5, 'Endereço obrigatório'),
    number: z.string().min(1, 'Número obrigatório'),
    complement: z.string().optional(),
    cnpj: z.string().optional(),
    companyName: z.string().optional(),
    tradeName: z.string().optional(),
    stateRegistration: z.string().optional(),
    municipalRegistration: z.string().optional(),
});

type CustomerForm = z.infer<typeof customerSchema>;

// Wizard steps — same fields the single-screen form already had, just grouped.
// "Empresa" only exists in the sequence for pessoa jurídica.
type Step = 'basicos' | 'empresa' | 'contato' | 'endereco';
const STEP_TITLES: Record<Step, string> = {
    basicos: 'Dados do Cliente',
    empresa: 'Dados da Empresa',
    contato: 'Contato',
    endereco: 'Endereço',
};
const STEP_FIELDS: Record<Step, (keyof CustomerForm)[]> = {
    basicos: ['name', 'cpf', 'email'],
    empresa: ['cnpj', 'companyName', 'tradeName', 'stateRegistration', 'municipalRegistration'],
    contato: ['phone'],
    endereco: ['cep', 'address', 'number', 'complement'],
};

export default function Customers() {
    const { tenantId } = useAuth();
    const location = useLocation();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [customers, setCustomers] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState(() => (location.state as any)?.prefillSearch || '');
    const [historyCustomer, setHistoryCustomer] = useState<{ id: string; name: string } | null>(null);
    const [viewingCustomer, setViewingCustomer] = useState<any | null>(null);
    const [step, setStep] = useState<Step>('basicos');
    const { register, handleSubmit, setValue, reset, watch, trigger, formState: { errors } } = useForm<CustomerForm>({
        resolver: zodResolver(customerSchema),
        defaultValues: { personType: 'fisica' },
    });
    const personType = watch('personType');

    const steps: Step[] = personType === 'juridica'
        ? ['basicos', 'empresa', 'contato', 'endereco']
        : ['basicos', 'contato', 'endereco'];
    const stepIndex = steps.indexOf(step);

    const goNext = async () => {
        const valid = await trigger(STEP_FIELDS[step]);
        if (!valid) return;
        if (stepIndex === steps.length - 1) {
            handleSubmit(onSubmit)();
        } else {
            setStep(steps[stepIndex + 1]);
        }
    };

    const goBack = () => {
        if (stepIndex === 0) {
            handleCancel();
        } else {
            setStep(steps[stepIndex - 1]);
        }
    };

    useEffect(() => {
        if (tenantId) fetchCustomers();
    }, [tenantId]);

    const fetchCustomers = async () => {
        if (!tenantId) return;

        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('user_id', tenantId)
            .order('created_at', { ascending: false });

        if (error) console.error('Error fetching customers:', error);
        else setCustomers(data || []);
    };

    const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);

    const handleCepBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length === 8) {
            try {
                const response = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
                if (!response.data.erro) {
                    setValue('address', `${response.data.logradouro}, ${response.data.bairro} - ${response.data.localidade}/${response.data.uf}`);
                }
            } catch (error) {
                console.error('Erro ao buscar CEP', error);
            }
        }
    };

    const handleCnpjSearch = async (cnpjValue: string) => {
        const cnpj = cnpjValue.replace(/\D/g, '');
        if (cnpj.length !== 14) {
            toast.error('CNPJ inválido. Deve ter 14 dígitos.');
            return;
        }

        setIsSearchingCnpj(true);
        try {
            const response = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            const data = response.data;

            setValue('companyName', data.razao_social || '');
            setValue('tradeName', data.nome_fantasia || '');

            const phones = [data.ddd_telefone_1, data.ddd_telefone_2].filter(Boolean).join(' / ');
            if (phones) setValue('phone', phones);
            if (data.email) setValue('email', data.email);
            if (data.cep) setValue('cep', data.cep);
            if (data.logradouro) {
                setValue('address', `${data.logradouro}, ${data.bairro} - ${data.municipio}/${data.uf}`);
            }
            if (data.numero) setValue('number', data.numero);
            if (data.complemento) setValue('complement', data.complemento);

            toast.success('Dados da empresa encontrados na Receita Federal!');
            if (data.descricao_situacao_cadastral && data.descricao_situacao_cadastral !== 'ATIVA') {
                toast.error(`Atenção: situação cadastral deste CNPJ é "${data.descricao_situacao_cadastral}".`, { duration: 6000 });
            }
        } catch (error) {
            console.error('Erro ao buscar CNPJ', error);
            toast.error('Não foi possível encontrar esse CNPJ. Preencha os dados da empresa manualmente.');
        } finally {
            setIsSearchingCnpj(false);
        }
    };

    const handleEdit = (customer: any) => {
        setEditingId(customer.id);
        setValue('personType', customer.person_type === 'juridica' ? 'juridica' : 'fisica');
        setValue('name', customer.name);
        setValue('phone', customer.phone);
        setValue('email', customer.email || '');
        setValue('cpf', customer.cpf);
        setValue('cep', customer.cep);
        setValue('address', customer.address);
        setValue('number', customer.number);
        setValue('complement', customer.complement);
        setValue('cnpj', customer.cnpj || '');
        setValue('companyName', customer.company_name || '');
        setValue('tradeName', customer.trade_name || '');
        setValue('stateRegistration', customer.state_registration || '');
        setValue('municipalRegistration', customer.municipal_registration || '');
        setStep('basicos');
        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingId(null);
        setStep('basicos');
        reset({ personType: 'fisica' });
    };

    const normalizeDoc = (v?: string | null) => (v || '').replace(/\D/g, '');

    const onSubmit = async (data: CustomerForm) => {
        if (!tenantId) return;

        const { personType, cnpj, companyName, tradeName, stateRegistration, municipalRegistration, ...rest } = data;
        const isJuridica = personType === 'juridica';

        // Catch duplicate CPF/CNPJ before hitting the DB, so the error names the
        // conflicting customer instead of a generic constraint-violation message.
        const cpfDigits = normalizeDoc(rest.cpf);
        const cnpjDigits = isJuridica ? normalizeDoc(cnpj) : '';
        const duplicate = customers.find(c => {
            if (c.id === editingId) return false;
            if (cpfDigits && normalizeDoc(c.cpf) === cpfDigits) return true;
            if (cnpjDigits && normalizeDoc(c.cnpj) === cnpjDigits) return true;
            return false;
        });
        if (duplicate) {
            const field = cnpjDigits && normalizeDoc(duplicate.cnpj) === cnpjDigits ? 'CNPJ' : 'CPF';
            toast.error(`Já existe um cliente cadastrado com esse ${field}: ${duplicate.name}`);
            return;
        }

        if (editingId && !confirm('Tem certeza que deseja atualizar os dados deste cliente?')) return;

        const row = {
            ...rest,
            person_type: personType,
            cnpj: isJuridica ? cnpj : null,
            company_name: isJuridica ? companyName : null,
            trade_name: isJuridica ? tradeName : null,
            state_registration: isJuridica ? stateRegistration : null,
            municipal_registration: isJuridica ? municipalRegistration : null,
        };

        try {
            if (editingId) {
                // Update existing customer
                const { error } = await supabase
                    .from('customers')
                    .update(row)
                    .eq('id', editingId)
                    .eq('user_id', tenantId);

                if (error) throw error;
                toast.success('Cliente atualizado com sucesso!');
            } else {
                // Create new customer
                const { error } = await supabase
                    .from('customers')
                    .insert([{ ...row, user_id: tenantId }]);

                if (error) throw error;
                toast.success('Cliente salvo com sucesso!');
            }

            handleCancel();
            fetchCustomers();
        } catch (error: any) {
            if (error.code === '23505') {
                const field = error.message?.includes('cnpj') ? 'CNPJ' : 'CPF';
                toast.error(`Já existe um cliente cadastrado com esse ${field}.`);
            } else {
                toast.error('Erro ao salvar cliente: ' + error.message);
            }
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!tenantId || !confirm(`Tem certeza que deseja excluir o cliente "${name}"?`)) return;

        try {
            const { error } = await supabase
                .from('customers')
                .delete()
                .eq('id', id)
                .eq('user_id', tenantId);

            if (error) throw error;
            toast.success('Cliente excluído com sucesso!');
            fetchCustomers();
        } catch (error: any) {
            toast.error('Erro ao excluir cliente: ' + error.message);
        }
    };

    const filteredCustomers = customers
        .filter(customer =>
            matchesSearchFields([customer.name, customer.trade_name, customer.company_name], searchTerm) ||
            customer.cpf?.includes(searchTerm) ||
            customer.cnpj?.includes(searchTerm) ||
            customer.phone?.includes(searchTerm)
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    return (
        <div className="space-y-6">
            <div className="sticky top-0 z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/95 backdrop-blur-sm py-3 border-b border-gray-100 -mx-2 px-2 sm:-mx-0 sm:px-0">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Clientes</h2>
                    <p className="text-gray-500">Gerencie sua base de clientes</p>
                </div>
                <Button onClick={() => {
                    if (isFormOpen) handleCancel();
                    else setIsFormOpen(true);
                }}>
                    {isFormOpen ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Novo Cliente</>}
                </Button>
            </div>

            {isFormOpen && (
                <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="mb-4 pb-4 border-b border-gray-100">
                        <div className="flex items-center gap-3 mb-3">
                            <button
                                type="button"
                                onClick={goBack}
                                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                                title={stepIndex === 0 ? 'Cancelar' : 'Voltar'}
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h3 className="font-semibold text-lg text-primary-cyan leading-tight">
                                    {editingId ? 'Editar Cliente' : 'Novo Cliente'}
                                </h3>
                                <p className="text-xs text-gray-500">{STEP_TITLES[step]}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-primary-cyan transition-all duration-300"
                                    style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
                                />
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0">{stepIndex + 1}/{steps.length}</span>
                        </div>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); goNext(); }} className="space-y-4">
                        {step === 'basicos' && (
                            <>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setValue('personType', 'fisica')}
                                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${personType === 'fisica' ? 'bg-primary-cyan text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        Pessoa Física
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setValue('personType', 'juridica')}
                                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${personType === 'juridica' ? 'bg-primary-cyan text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        Pessoa Jurídica
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input label="Nome Completo" {...register('name')} error={errors.name?.message} />
                                    <Input label={personType === 'juridica' ? 'CPF do Responsável' : 'CPF'} {...register('cpf')} error={errors.cpf?.message} />
                                    <Input label="E-mail" type="email" {...register('email')} error={errors.email?.message} />
                                </div>
                            </>
                        )}

                        {step === 'empresa' && (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <Building2 className="w-4 h-4 text-primary-cyan" />
                                    <h4 className="text-sm font-semibold text-gray-700">Dados da Empresa</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2 flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Input label="CNPJ" {...register('cnpj')} placeholder="00.000.000/0000-00" />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={isSearchingCnpj}
                                            onClick={(e) => {
                                                const form = (e.target as HTMLElement).closest('form');
                                                const cnpjInput = form?.querySelector<HTMLInputElement>('input[name="cnpj"]');
                                                if (cnpjInput?.value) handleCnpjSearch(cnpjInput.value);
                                            }}
                                        >
                                            {isSearchingCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar CNPJ'}
                                        </Button>
                                    </div>
                                    <Input label="Razão Social" {...register('companyName')} />
                                    <Input label="Nome Fantasia" {...register('tradeName')} />
                                    <Input label="Inscrição Estadual" {...register('stateRegistration')} placeholder="Preencha manualmente" />
                                    <Input label="Inscrição Municipal" {...register('municipalRegistration')} placeholder="Preencha manualmente" />
                                </div>
                                <p className="text-xs text-gray-400 mt-2">
                                    A busca preenche razão social, nome fantasia e endereço via Receita Federal. Inscrição estadual e municipal não têm API pública unificada — preencha manualmente.
                                </p>
                            </div>
                        )}

                        {step === 'contato' && (
                            <Input label="Telefone (WhatsApp)" {...register('phone')} error={errors.phone?.message} />
                        )}

                        {step === 'endereco' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="CEP"
                                    {...register('cep')}
                                    onBlur={handleCepBlur}
                                    error={errors.cep?.message}
                                />
                                <div className="md:col-span-2">
                                    <Input label="Endereço Completo" {...register('address')} error={errors.address?.message} readOnly />
                                </div>
                                <Input label="Número" {...register('number')} error={errors.number?.message} />
                                <Input label="Complemento" {...register('complement')} error={errors.complement?.message} />
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
                            <Button type="submit">
                                {stepIndex === steps.length - 1 ? (editingId ? 'Salvar Alterações' : 'Salvar Cliente') : 'Avançar'}
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, CPF ou telefone..."
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
                                <th className="px-6 py-3">Cliente</th>
                                <th className="px-6 py-3">Telefone</th>
                                <th className="px-6 py-3">Endereço</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCustomers.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                        Nenhum cliente encontrado
                                    </td>
                                </tr>
                            ) : (
                                filteredCustomers.map((customer) => (
                                    <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    title="Ver detalhes"
                                                    onClick={() => setViewingCustomer(customer)}
                                                    className="w-8 h-8 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0 hover:bg-primary-cyan/20 transition-colors cursor-pointer"
                                                >
                                                    <User className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Ver detalhes"
                                                    onClick={() => setViewingCustomer(customer)}
                                                    className="text-left hover:underline"
                                                >
                                                    <div className="font-semibold">{customer.name}</div>
                                                    <div className="text-xs text-gray-500">{customer.trade_name || customer.cpf}</div>
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-600">
                                                <Phone className="w-4 h-4" />
                                                {customer.phone}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-600 max-w-[300px] truncate">
                                                <MapPin className="w-4 h-4 flex-shrink-0" />
                                                <span className="truncate">
                                                    {customer.address}, {customer.number}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setHistoryCustomer({ id: customer.id, name: customer.name })}
                                                    className="touch-manipulation"
                                                >
                                                    <History className="w-4 h-4 mr-1" />
                                                    Histórico
                                                </Button>
                                                <DropdownMenu
                                                    items={[
                                                        {
                                                            label: 'Atualizar',
                                                            icon: <Edit2 className="w-4 h-4" />,
                                                            onClick: () => handleEdit(customer),
                                                        },
                                                        {
                                                            label: 'Excluir',
                                                            icon: <Trash2 className="w-4 h-4" />,
                                                            onClick: () => handleDelete(customer.id, customer.name),
                                                            variant: 'danger' as const,
                                                        },
                                                    ]}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3 p-4">
                    {filteredCustomers.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            Nenhum cliente encontrado
                        </div>
                    ) : (
                        filteredCustomers.map((customer) => (
                            <div key={customer.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 active:bg-gray-50 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <button
                                            type="button"
                                            title="Ver detalhes"
                                            onClick={() => setViewingCustomer(customer)}
                                            className="w-10 h-10 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0 hover:bg-primary-cyan/20 transition-colors cursor-pointer"
                                        >
                                            <User className="w-5 h-5" />
                                        </button>
                                        <button
                                            type="button"
                                            title="Ver detalhes"
                                            onClick={() => setViewingCustomer(customer)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <div className="font-semibold text-gray-900 truncate">{customer.name}</div>
                                            <div className="text-xs text-gray-500">{customer.trade_name || customer.cpf}</div>
                                        </button>
                                    </div>
                                    <DropdownMenu
                                        items={[
                                            {
                                                label: 'Atualizar',
                                                icon: <Edit2 className="w-4 h-4" />,
                                                onClick: () => handleEdit(customer),
                                            },
                                            {
                                                label: 'Excluir',
                                                icon: <Trash2 className="w-4 h-4" />,
                                                onClick: () => handleDelete(customer.id, customer.name),
                                                variant: 'danger' as const,
                                            },
                                        ]}
                                    />
                                </div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-gray-600">
                                        <Phone className="w-4 h-4 flex-shrink-0" />
                                        <span>{customer.phone}</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-gray-600">
                                        <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                        <span className="line-clamp-2">{customer.address}, {customer.number}</span>
                                    </div>
                                </div>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setHistoryCustomer({ id: customer.id, name: customer.name })}
                                    className="w-full touch-manipulation"
                                >
                                    <History className="w-4 h-4 mr-1" />
                                    Histórico
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {viewingCustomer && (
                <CustomerDetailModal
                    customer={viewingCustomer}
                    onClose={() => setViewingCustomer(null)}
                    onEdit={() => { const c = viewingCustomer; setViewingCustomer(null); handleEdit(c); }}
                    onDelete={() => { handleDelete(viewingCustomer.id, viewingCustomer.name); setViewingCustomer(null); }}
                    onViewHistory={() => { const c = viewingCustomer; setViewingCustomer(null); setHistoryCustomer({ id: c.id, name: c.name }); }}
                />
            )}

            {historyCustomer && (
                <CustomerHistoryModal
                    customerId={historyCustomer.id}
                    customerName={historyCustomer.name}
                    onClose={() => setHistoryCustomer(null)}
                />
            )}
        </div>
    );
}
