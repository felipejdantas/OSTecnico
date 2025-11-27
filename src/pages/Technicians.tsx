import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, User, Phone, Search, Edit2, Trash2, Wrench } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const techSchema = z.object({
    name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
    phone: z.string().min(10, 'Telefone inválido'),
});

type TechForm = z.infer<typeof techSchema>;

export default function Technicians() {
    const { user } = useAuth();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<TechForm>({
        resolver: zodResolver(techSchema)
    });

    useEffect(() => {
        if (user) fetchTechnicians();
    }, [user]);

    const fetchTechnicians = async () => {
        if (!user) return;

        const { data, error } = await supabase
            .from('technicians')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) console.error('Error fetching technicians:', error);
        else setTechnicians(data || []);
    };

    const handleEdit = (tech: any) => {
        setEditingId(tech.id);
        setValue('name', tech.name);
        setValue('phone', tech.phone);
        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingId(null);
        reset();
    };

    const onSubmit = async (data: TechForm) => {
        if (!user) return;

        try {
            if (editingId) {
                // Update existing technician
                const { error } = await supabase
                    .from('technicians')
                    .update(data)
                    .eq('id', editingId)
                    .eq('user_id', user.id);

                if (error) throw error;
                toast.success('Técnico atualizado com sucesso!');
            } else {
                // Create new technician
                const { error } = await supabase
                    .from('technicians')
                    .insert([{ ...data, user_id: user.id }]);

                if (error) throw error;
                toast.success('Técnico salvo com sucesso!');
            }

            handleCancel();
            fetchTechnicians();
        } catch (error: any) {
            toast.error('Erro ao salvar técnico: ' + error.message);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!user || !confirm(`Tem certeza que deseja excluir o técnico "${name}"?`)) return;

        try {
            const { error } = await supabase
                .from('technicians')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) throw error;
            toast.success('Técnico excluído com sucesso!');
            fetchTechnicians();
        } catch (error: any) {
            toast.error('Erro ao excluir técnico: ' + error.message);
        }
    };

    const filteredTechnicians = technicians.filter(tech =>
        tech.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tech.phone?.includes(searchTerm)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Técnicos</h2>
                    <p className="text-gray-500">Gerencie sua equipe técnica</p>
                </div>
                <Button onClick={() => {
                    if (isFormOpen) handleCancel();
                    else setIsFormOpen(true);
                }}>
                    {isFormOpen ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Novo Técnico</>}
                </Button>
            </div>

            {isFormOpen && (
                <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="mb-4 pb-4 border-b border-gray-100">
                        <h3 className="font-semibold text-lg text-primary-cyan">
                            {editingId ? 'Editar Técnico' : 'Novo Técnico'}
                        </h3>
                    </div>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="Nome Completo" {...register('name')} error={errors.name?.message} />
                            <Input label="Telefone" {...register('phone')} error={errors.phone?.message} />
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
                            <Button type="submit">{editingId ? 'Salvar Alterações' : 'Salvar Técnico'}</Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou telefone..."
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
                                <th className="px-6 py-3">Telefone</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTechnicians.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                                        Nenhum técnico encontrado
                                    </td>
                                </tr>
                            ) : (
                                filteredTechnicians.map((tech) => (
                                    <tr key={tech.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0">
                                                    <Wrench className="w-4 h-4" />
                                                </div>
                                                <div className="font-semibold">{tech.name}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-600">
                                                <Phone className="w-4 h-4" />
                                                {tech.phone}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <DropdownMenu
                                                items={[
                                                    {
                                                        label: 'Atualizar',
                                                        icon: <Edit2 className="w-4 h-4" />,
                                                        onClick: () => handleEdit(tech),
                                                    },
                                                    {
                                                        label: 'Excluir',
                                                        icon: <Trash2 className="w-4 h-4" />,
                                                        onClick: () => handleDelete(tech.id, tech.name),
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
                    {filteredTechnicians.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            Nenhum técnico encontrado
                        </div>
                    ) : (
                        filteredTechnicians.map((tech) => (
                            <div key={tech.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 active:bg-gray-50 transition-colors">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0">
                                            <Wrench className="w-5 h-5" />
                                        </div>
                                        <div className="font-semibold text-gray-900 truncate">{tech.name}</div>
                                    </div>
                                    <DropdownMenu
                                        items={[
                                            {
                                                label: 'Atualizar',
                                                icon: <Edit2 className="w-4 h-4" />,
                                                onClick: () => handleEdit(tech),
                                            },
                                            {
                                                label: 'Excluir',
                                                icon: <Trash2 className="w-4 h-4" />,
                                                onClick: () => handleDelete(tech.id, tech.name),
                                                variant: 'danger' as const,
                                            },
                                        ]}
                                    />
                                </div>

                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Phone className="w-4 h-4 flex-shrink-0" />
                                    <span>{tech.phone}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
