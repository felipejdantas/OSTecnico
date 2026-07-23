import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, MapPin, Phone, Mail, Truck, Edit2, Search, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const supplierSchema = z.object({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    phone: z.string().optional(),
    email: z.union([z.literal(''), z.string().email('E-mail inválido')]).optional(),
    document: z.string().optional(),
    address: z.string().optional(),
});

type SupplierForm = z.infer<typeof supplierSchema>;

export default function Suppliers() {
    const { user } = useAuth();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<SupplierForm>({
        resolver: zodResolver(supplierSchema),
    });

    useEffect(() => {
        if (user) fetchSuppliers();
    }, [user]);

    const fetchSuppliers = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('suppliers')
            .select('*')
            .eq('user_id', user.id)
            .order('name');

        if (error) console.error('Error fetching suppliers:', error);
        else setSuppliers(data || []);
    };

    const handleEdit = (supplier: any) => {
        setEditingId(supplier.id);
        setValue('name', supplier.name);
        setValue('phone', supplier.phone || '');
        setValue('email', supplier.email || '');
        setValue('document', supplier.document || '');
        setValue('address', supplier.address || '');
        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingId(null);
        reset({});
    };

    const onSubmit = async (data: SupplierForm) => {
        if (!user) return;
        if (editingId && !confirm('Tem certeza que deseja atualizar os dados deste fornecedor?')) return;

        try {
            if (editingId) {
                const { error } = await supabase
                    .from('suppliers')
                    .update(data)
                    .eq('id', editingId)
                    .eq('user_id', user.id);
                if (error) throw error;
                toast.success('Fornecedor atualizado com sucesso!');
            } else {
                const { error } = await supabase
                    .from('suppliers')
                    .insert([{ ...data, user_id: user.id }]);
                if (error) throw error;
                toast.success('Fornecedor salvo com sucesso!');
            }

            handleCancel();
            fetchSuppliers();
        } catch (error: any) {
            toast.error('Erro ao salvar fornecedor: ' + error.message);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!user || !confirm(`Tem certeza que deseja excluir o fornecedor "${name}"?`)) return;

        try {
            const { error } = await supabase
                .from('suppliers')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id);
            if (error) throw error;
            toast.success('Fornecedor excluído com sucesso!');
            fetchSuppliers();
        } catch (error: any) {
            toast.error('Erro ao excluir fornecedor: ' + error.message);
        }
    };

    const filteredSuppliers = suppliers
        .filter(s =>
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.phone?.includes(searchTerm) ||
            s.document?.includes(searchTerm)
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Fornecedores</h2>
                    <p className="text-gray-500">Gerencie seus fornecedores para Pedidos de Compra</p>
                </div>
                <Button onClick={() => {
                    if (isFormOpen) handleCancel();
                    else setIsFormOpen(true);
                }}>
                    {isFormOpen ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Novo Fornecedor</>}
                </Button>
            </div>

            {isFormOpen && (
                <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="mb-4 pb-4 border-b border-gray-100">
                        <h3 className="font-semibold text-lg text-primary-cyan">
                            {editingId ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                        </h3>
                    </div>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="Nome / Razão Social" {...register('name')} error={errors.name?.message} />
                            <Input label="CNPJ / CPF" {...register('document')} placeholder="00.000.000/0000-00" />
                            <Input label="Telefone" {...register('phone')} />
                            <Input label="E-mail" type="email" {...register('email')} error={errors.email?.message} />
                            <div className="md:col-span-2">
                                <Input label="Endereço" {...register('address')} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
                            <Button type="submit">{editingId ? 'Salvar Alterações' : 'Salvar Fornecedor'}</Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, telefone ou CNPJ/CPF..."
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
                                <th className="px-6 py-3">Fornecedor</th>
                                <th className="px-6 py-3">Telefone</th>
                                <th className="px-6 py-3">Endereço</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSuppliers.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                        Nenhum fornecedor encontrado
                                    </td>
                                </tr>
                            ) : (
                                filteredSuppliers.map((supplier) => (
                                    <tr key={supplier.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    title="Clique para atualizar"
                                                    onClick={() => handleEdit(supplier)}
                                                    className="w-8 h-8 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0 hover:bg-primary-cyan/20 transition-colors cursor-pointer"
                                                >
                                                    <Truck className="w-4 h-4" />
                                                </button>
                                                <div>
                                                    <div className="font-semibold">{supplier.name}</div>
                                                    <div className="text-xs text-gray-500">{supplier.document || supplier.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-600">
                                                <Phone className="w-4 h-4" />
                                                {supplier.phone || '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-600 max-w-[300px] truncate">
                                                <MapPin className="w-4 h-4 flex-shrink-0" />
                                                <span className="truncate">{supplier.address || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <DropdownMenu
                                                items={[
                                                    {
                                                        label: 'Atualizar',
                                                        icon: <Edit2 className="w-4 h-4" />,
                                                        onClick: () => handleEdit(supplier),
                                                    },
                                                    {
                                                        label: 'Excluir',
                                                        icon: <Trash2 className="w-4 h-4" />,
                                                        onClick: () => handleDelete(supplier.id, supplier.name),
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
                    {filteredSuppliers.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            Nenhum fornecedor encontrado
                        </div>
                    ) : (
                        filteredSuppliers.map((supplier) => (
                            <div key={supplier.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 active:bg-gray-50 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <button
                                            type="button"
                                            title="Toque para atualizar"
                                            onClick={() => handleEdit(supplier)}
                                            className="w-10 h-10 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0 hover:bg-primary-cyan/20 transition-colors cursor-pointer"
                                        >
                                            <Truck className="w-5 h-5" />
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold text-gray-900 truncate">{supplier.name}</div>
                                            <div className="text-xs text-gray-500">{supplier.document || supplier.email}</div>
                                        </div>
                                    </div>
                                    <DropdownMenu
                                        items={[
                                            {
                                                label: 'Atualizar',
                                                icon: <Edit2 className="w-4 h-4" />,
                                                onClick: () => handleEdit(supplier),
                                            },
                                            {
                                                label: 'Excluir',
                                                icon: <Trash2 className="w-4 h-4" />,
                                                onClick: () => handleDelete(supplier.id, supplier.name),
                                                variant: 'danger' as const,
                                            },
                                        ]}
                                    />
                                </div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-gray-600">
                                        <Phone className="w-4 h-4 flex-shrink-0" />
                                        <span>{supplier.phone || '-'}</span>
                                    </div>
                                    {supplier.email && (
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <Mail className="w-4 h-4 flex-shrink-0" />
                                            <span>{supplier.email}</span>
                                        </div>
                                    )}
                                    {supplier.address && (
                                        <div className="flex items-start gap-2 text-gray-600">
                                            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                            <span className="line-clamp-2">{supplier.address}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
