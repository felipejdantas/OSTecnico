import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Save, Building2, Upload, X, Users, UserPlus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type TeamMember = {
    id: string;
    name: string | null;
    email: string | null;
    created_at: string;
};

function TeamSection() {
    const { user } = useAuth();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (user) fetchMembers();
    }, [user]);

    const fetchMembers = async () => {
        const { data, error } = await supabase
            .from('team_members')
            .select('id, name, email, created_at')
            .order('created_at');
        if (error) console.error('Error fetching team members:', error);
        else setMembers(data || []);
        setLoading(false);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;
        if (!confirm(`Criar acesso ao sistema para "${email}"? Essa pessoa vai poder ver e editar todos os clientes, produtos, OS e estoque.`)) return;

        setIsAdding(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const { data, error } = await supabase.functions.invoke('create-team-user', {
                body: { name, email, password },
                headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            toast.success('Usuário criado com sucesso!');
            setName('');
            setEmail('');
            setPassword('');
            fetchMembers();
        } catch (error: any) {
            toast.error('Erro ao criar usuário: ' + error.message);
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemove = async (member: TeamMember) => {
        if (!confirm(`Remover o acesso de "${member.name || member.email}"? Essa pessoa não vai conseguir mais entrar no sistema.`)) return;

        try {
            const { error } = await supabase.from('team_members').delete().eq('id', member.id);
            if (error) throw error;
            toast.success('Acesso removido com sucesso!');
            fetchMembers();
        } catch (error: any) {
            toast.error('Erro ao remover acesso: ' + error.message);
        }
    };

    return (
        <Card>
            <div className="flex items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-primary-cyan" />
                <h3 className="font-semibold text-base sm:text-lg">Usuários da Equipe</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
                Crie logins para outras pessoas acessarem este mesmo sistema (clientes, produtos, OS e estoque).
            </p>

            {loading ? (
                <p className="text-sm text-gray-400">Carregando...</p>
            ) : (
                <div className="space-y-2 mb-4">
                    {members.length === 0 ? (
                        <p className="text-sm text-gray-400">Nenhum usuário adicional cadastrado ainda.</p>
                    ) : (
                        members.map((m) => (
                            <div key={m.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl text-sm">
                                <div>
                                    <div className="font-medium text-dark">{m.name || m.email}</div>
                                    <div className="text-xs text-gray-500">{m.email}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemove(m)}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Remover acesso"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3 pt-4 border-t border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João (técnico)" />
                    <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <Input label="Senha provisória" type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                </div>
                <div className="flex justify-end">
                    <Button type="submit" disabled={isAdding}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        {isAdding ? 'Criando...' : 'Criar Usuário'}
                    </Button>
                </div>
            </form>
        </Card>
    );
}

const settingsSchema = z.object({
    company_name: z.string().min(2, 'Informe o nome da empresa'),
    cnpj: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.union([z.literal(''), z.string().email('E-mail inválido')]).optional(),
    pix_key: z.string().optional(),
    bank_details: z.string().optional(),
    warranty_days: z.coerce.number().int().min(0, 'Valor inválido'),
    warranty_text: z.string().optional(),
    terms_text: z.string().optional(),
});

type SettingsFormInput = z.input<typeof settingsSchema>;
type SettingsForm = z.output<typeof settingsSchema>;

// Pre-filled per the Código de Defesa do Consumidor (Lei 8.078/90, art. 26, II) so a
// new account already has a legally coherent warranty clause instead of a blank field.
const DEFAULT_WARRANTY_TEXT = 'A garantia prevista cobre exclusivamente o defeito relacionado ao serviço executado e/ou à peça substituída nesta Ordem de Serviço, contada a partir da data de entrega do equipamento, conforme o Código de Defesa do Consumidor (Lei nº 8.078/90, art. 26, inciso II). Não estão cobertos: danos decorrentes de mau uso, quedas, impactos, oxidação ou contato com líquidos; violação do lacre ou intervenção técnica de terceiros após a entrega; defeitos não relacionados ao reparo original; ou desgaste natural de outros componentes do equipamento. Constatada a reincidência do defeito coberto dentro do prazo de garantia, o reparo será refeito sem cobrança de mão de obra. Esta garantia contratual complementa, e não substitui, a garantia legal prevista no Código de Defesa do Consumidor.';

export default function CompanySettings() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
    const [signatureFile, setSignatureFile] = useState<File | null>(null);
    const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
    const signatureInputRef = useRef<HTMLInputElement>(null);
    const { register, handleSubmit, setValue, formState: { errors } } = useForm<SettingsFormInput, any, SettingsForm>({
        resolver: zodResolver(settingsSchema),
        defaultValues: { warranty_days: 90, warranty_text: DEFAULT_WARRANTY_TEXT },
    });

    useEffect(() => {
        if (user) fetchSettings();
    }, [user]);

    const fetchSettings = async () => {
        if (!user) return;

        const { data, error } = await supabase
            .from('company_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) console.error('Error fetching company settings:', error);

        if (data) {
            setValue('company_name', data.company_name || '');
            setValue('cnpj', data.cnpj || '');
            setValue('address', data.address || '');
            setValue('phone', data.phone || '');
            setValue('email', data.email || '');
            setValue('pix_key', data.pix_key || '');
            setValue('bank_details', data.bank_details || '');
            setValue('warranty_days', data.warranty_days ?? 90);
            setValue('warranty_text', data.warranty_text || DEFAULT_WARRANTY_TEXT);
            setValue('terms_text', data.terms_text || '');
            setSignatureUrl(data.default_technician_signature_url || null);
        }
        setLoading(false);
    };

    const handleSignatureSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSignatureFile(file);
        setSignaturePreview(URL.createObjectURL(file));
    };

    const removeSignature = () => {
        setSignatureFile(null);
        setSignaturePreview(null);
        setSignatureUrl(null);
    };

    const onSubmit = async (data: SettingsForm) => {
        if (!user) return;

        try {
            setIsSubmitting(true);

            let technicianSignatureUrl = signatureUrl;
            if (signatureFile) {
                const fileExt = signatureFile.name.split('.').pop();
                const fileName = `signature-${Math.random()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage.from('os-images').upload(fileName, signatureFile);
                if (uploadError) throw uploadError;
                const { data: urlData } = supabase.storage.from('os-images').getPublicUrl(fileName);
                technicianSignatureUrl = urlData.publicUrl;
            }

            const { error } = await supabase
                .from('company_settings')
                .upsert([{ ...data, default_technician_signature_url: technicianSignatureUrl, user_id: user.id }], { onConflict: 'user_id' });

            if (error) throw error;
            setSignatureUrl(technicianSignatureUrl);
            setSignatureFile(null);
            setSignaturePreview(null);
            toast.success('Configurações salvas com sucesso!');
        } catch (error: any) {
            toast.error('Erro ao salvar configurações: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="flex justify-center p-8">Carregando...</div>;

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-cyan/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-primary-cyan" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-dark">Configurações da Empresa</h2>
                    <p className="text-gray-500">Usado no PDF e na página de acompanhamento do cliente</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                <Card>
                    <h3 className="font-semibold text-base sm:text-lg mb-4">Dados da Empresa</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Nome da Empresa" {...register('company_name')} error={errors.company_name?.message} />
                        <Input label="CNPJ" {...register('cnpj')} />
                        <Input label="Telefone / WhatsApp" {...register('phone')} />
                        <Input label="E-mail" type="email" {...register('email')} error={errors.email?.message} />
                        <div className="md:col-span-2">
                            <Input label="Endereço" {...register('address')} />
                        </div>
                    </div>
                </Card>

                <Card>
                    <h3 className="font-semibold text-base sm:text-lg mb-4">Pagamento</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Chave PIX" {...register('pix_key')} />
                        <div className="md:col-span-2">
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Dados Bancários / Formas de Pagamento</label>
                            <textarea
                                {...register('bank_details')}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[80px] text-sm"
                                placeholder="Ex: Banco, agência, conta, ou aceita dinheiro/cartão/PIX..."
                            />
                        </div>
                    </div>
                </Card>

                <Card>
                    <h3 className="font-semibold text-base sm:text-lg mb-4">Garantia</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Prazo de Garantia (dias)" type="number" {...register('warranty_days')} error={errors.warranty_days?.message} />
                        <div className="md:col-span-2">
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Condições de Garantia</label>
                            <textarea
                                {...register('warranty_text')}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[100px] text-sm"
                                placeholder="Ex: Garantia cobre apenas o serviço/peça trocada, não cobre mau uso, quedas, líquidos..."
                            />
                        </div>
                    </div>
                </Card>

                <Card>
                    <h3 className="font-semibold text-base sm:text-lg mb-1">Assinatura Padrão do Técnico</h3>
                    <p className="text-xs text-gray-500 mb-4">
                        Aparece automaticamente em todas as Ordens de Serviço, ao lado da assinatura do cliente.
                    </p>
                    <input
                        type="file"
                        ref={signatureInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={handleSignatureSelect}
                    />
                    {(signaturePreview || signatureUrl) ? (
                        <div className="flex items-center gap-4">
                            <img
                                src={signaturePreview || signatureUrl || ''}
                                alt="Assinatura do técnico"
                                className="h-20 border border-gray-200 rounded-lg bg-white px-3"
                            />
                            <div className="flex flex-col gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => signatureInputRef.current?.click()}>
                                    Alterar
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={removeSignature}>
                                    <X className="w-4 h-4 mr-1" /> Remover
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => signatureInputRef.current?.click()}
                            className="w-full border-2 border-dashed border-gray-200 hover:border-primary-green/50 rounded-2xl p-6 text-center text-gray-400 transition-colors"
                        >
                            <Upload className="w-6 h-6 mx-auto mb-2" />
                            <span className="font-semibold text-primary-green">Clique para enviar</span> uma imagem da sua assinatura
                        </button>
                    )}
                </Card>

                <TeamSection />

                <Card>
                    <h3 className="font-semibold text-base sm:text-lg mb-1">Cláusula de Serviço</h3>
                    <p className="text-xs text-gray-500 mb-4">
                        Escreva aqui os seus próprios termos (não copie de outra empresa). Aparece no final do PDF e da página de acompanhamento do cliente.
                    </p>
                    <textarea
                        {...register('terms_text')}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[140px] text-sm"
                        placeholder="Ex: condições de aprovação de orçamento, prazos, responsabilidade sobre o equipamento, política de retirada..."
                    />
                </Card>

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 lg:static lg:bg-transparent lg:border-none lg:p-0 mt-6 z-20">
                    <div className="max-w-7xl mx-auto flex justify-end">
                        <Button type="submit" size="lg" className="w-full sm:w-auto min-w-[200px] touch-manipulation shadow-xl lg:shadow-none" disabled={isSubmitting}>
                            <Save className="w-5 h-5 mr-2" />
                            {isSubmitting ? 'Salvando...' : 'Salvar Configurações'}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}
