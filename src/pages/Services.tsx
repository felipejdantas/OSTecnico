import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Wrench, Edit2, Search, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const serviceSchema = z.object({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    description: z.string().optional(),
    default_price: z.coerce.number().min(0, 'Valor inválido'),
});

type ServiceFormInput = z.input<typeof serviceSchema>;
type ServiceForm = z.output<typeof serviceSchema>;

type ServiceCatalogItem = ServiceForm & { id: string };

export default function Services() {
    const { user } = useAuth();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [services, setServices] = useState<ServiceCatalogItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<ServiceFormInput, any, ServiceForm>({
        resolver: zodResolver(serviceSchema),
        defaultValues: { default_price: 0 },
    });

    useEffect(() => {
        if (user) fetchServices();
    }, [user]);

    const fetchServices = async () => {
        if (!user) return;

        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('user_id', user.id)
            .order('name');

        if (error) console.error('Error fetching services:', error);
        else setServices(data || []);
    };

    const handleEdit = (service: ServiceCatalogItem) => {
        setEditingId(service.id);
        setValue('name', service.name);
        setValue('description', service.description || '');
        setValue('default_price', service.default_price);
        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingId(null);
        reset({ default_price: 0 });
    };

    const onSubmit = async (data: ServiceForm) => {
        if (!user) return;

        try {
            if (editingId) {
                const { error } = await supabase
                    .from('services')
                    .update(data)
                    .eq('id', editingId)
                    .eq('user_id', user.id);

                if (error) throw error;
                toast.success('Serviço atualizado com sucesso!');
            } else {
                const { error } = await supabase
                    .from('services')
                    .insert([{ ...data, user_id: user.id }]);

                if (error) throw error;
                toast.success('Serviço salvo com sucesso!');
            }

            handleCancel();
            fetchServices();
        } catch (error: any) {
            toast.error('Erro ao salvar serviço: ' + error.message);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!user || !confirm(`Tem certeza que deseja excluir "${name}"?`)) return;

        try {
            const { error } = await supabase
                .from('services')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) throw error;
            toast.success('Serviço excluído com sucesso!');
            fetchServices();
        } catch (error: any) {
            toast.error('Erro ao excluir serviço: ' + error.message);
        }
    };

    const filteredServices = services.filter(service =>
        service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Serviços</h2>
                    <p className="text-gray-500">Catálogo de tipos de serviço e preços padrão</p>
                </div>
                <Button onClick={() => {
                    if (isFormOpen) handleCancel();
                    else setIsFormOpen(true);
                }}>
                    {isFormOpen ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Novo Serviço</>}
                </Button>
            </div>

            {isFormOpen && (
                <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="mb-4 pb-4 border-b border-gray-100">
                        <h3 className="font-semibold text-lg text-primary-cyan">
                            {editingId ? 'Editar Serviço' : 'Novo Serviço'}
                        </h3>
                    </div>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="Nome do Serviço" {...register('name')} error={errors.name?.message} placeholder="Ex: Troca de tela, Formatação..." />
                            <Input label="Preço Padrão (R$)" type="number" step="0.01" {...register('default_price')} error={errors.default_price?.message} />
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Descrição Padrão</label>
                                <textarea
                                    {...register('description')}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[80px] text-sm"
                                    placeholder="Descrição técnica que aparece no orçamento (pode editar por OS depois)..."
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
                            <Button type="submit">{editingId ? 'Salvar Alterações' : 'Salvar Serviço'}</Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou descrição..."
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
                                <th className="px-6 py-3">Serviço</th>
                                <th className="px-6 py-3">Descrição</th>
                                <th className="px-6 py-3">Preço Padrão</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredServices.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                        Nenhum serviço cadastrado
                                    </td>
                                </tr>
                            ) : (
                                filteredServices.map((service) => (
                                    <tr key={service.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0">
                                                    <Wrench className="w-4 h-4" />
                                                </div>
                                                <div className="font-semibold">{service.name}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 max-w-[300px] truncate">{service.description || '-'}</td>
                                        <td className="px-6 py-4 text-gray-600">R$ {Number(service.default_price).toFixed(2)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <DropdownMenu
                                                items={[
                                                    {
                                                        label: 'Atualizar',
                                                        icon: <Edit2 className="w-4 h-4" />,
                                                        onClick: () => handleEdit(service),
                                                    },
                                                    {
                                                        label: 'Excluir',
                                                        icon: <Trash2 className="w-4 h-4" />,
                                                        onClick: () => handleDelete(service.id, service.name),
                                                        variant: 'danger' as const,
                                                    },
                                                ]}
                                            />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3 p-4">
                    {filteredServices.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            Nenhum serviço cadastrado
                        </div>
                    ) : (
                        filteredServices.map((service) => (
                            <div key={service.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 active:bg-gray-50 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0">
                                            <Wrench className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold text-gray-900 truncate">{service.name}</div>
                                            <div className="text-xs text-gray-500 truncate">{service.description}</div>
                                        </div>
                                    </div>
                                    <DropdownMenu
                                        items={[
                                            {
                                                label: 'Atualizar',
                                                icon: <Edit2 className="w-4 h-4" />,
                                                onClick: () => handleEdit(service),
                                            },
                                            {
                                                label: 'Excluir',
                                                icon: <Trash2 className="w-4 h-4" />,
                                                onClick: () => handleDelete(service.id, service.name),
                                                variant: 'danger' as const,
                                            },
                                        ]}
                                    />
                                </div>

                                <div className="text-sm text-gray-600">R$ {Number(service.default_price).toFixed(2)}</div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
