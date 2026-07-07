import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Package, Edit2, Search, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { ImageUpload } from '../components/ImageUpload';
import { ImageViewer } from '../components/ImageViewer';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const productSchema = z.object({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    sku: z.string().optional(),
    category: z.string().optional(),
    unit: z.string().min(1, 'Informe a unidade'),
    cost_price: z.coerce.number().min(0, 'Valor inválido'),
    sale_price: z.coerce.number().min(0, 'Valor inválido'),
    stock_quantity: z.coerce.number().int('Deve ser um número inteiro'),
    min_stock_alert: z.coerce.number().int('Deve ser um número inteiro').min(0),
});

type ProductFormInput = z.input<typeof productSchema>;
type ProductForm = z.output<typeof productSchema>;

type Product = ProductForm & { id: string; photos?: string[] };

export default function Products() {
    const { user } = useAuth();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [newImages, setNewImages] = useState<File[]>([]);
    const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
    const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<ProductFormInput, any, ProductForm>({
        resolver: zodResolver(productSchema),
        defaultValues: { unit: 'un', cost_price: 0, sale_price: 0, stock_quantity: 0, min_stock_alert: 0 },
    });

    useEffect(() => {
        if (user) fetchProducts();
    }, [user]);

    const fetchProducts = async () => {
        if (!user) return;

        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('user_id', user.id)
            .order('name');

        if (error) console.error('Error fetching products:', error);
        else setProducts(data || []);
    };

    const handleEdit = (product: Product) => {
        setEditingId(product.id);
        setValue('name', product.name);
        setValue('sku', product.sku);
        setValue('category', product.category);
        setValue('unit', product.unit);
        setValue('cost_price', product.cost_price);
        setValue('sale_price', product.sale_price);
        setValue('stock_quantity', product.stock_quantity);
        setValue('min_stock_alert', product.min_stock_alert);
        setExistingPhotos(product.photos || []);
        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingId(null);
        setNewImages([]);
        setExistingPhotos([]);
        reset({ unit: 'un', cost_price: 0, sale_price: 0, stock_quantity: 0, min_stock_alert: 0 });
    };

    const uploadFile = async (file: File) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from('os-images').upload(fileName, file);
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('os-images').getPublicUrl(fileName);
        return data.publicUrl;
    };

    const onSubmit = async (data: ProductForm) => {
        if (!user) return;

        try {
            const newPhotoUrls = await Promise.all(newImages.map(uploadFile));
            const photos = [...existingPhotos, ...newPhotoUrls];

            if (editingId) {
                const { error } = await supabase
                    .from('products')
                    .update({ ...data, photos })
                    .eq('id', editingId)
                    .eq('user_id', user.id);

                if (error) throw error;
                toast.success('Produto atualizado com sucesso!');
            } else {
                const { error } = await supabase
                    .from('products')
                    .insert([{ ...data, photos, user_id: user.id }]);

                if (error) throw error;
                toast.success('Produto salvo com sucesso!');
            }

            handleCancel();
            fetchProducts();
        } catch (error: any) {
            toast.error('Erro ao salvar produto: ' + error.message);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!user || !confirm(`Tem certeza que deseja excluir "${name}"?`)) return;

        try {
            const { error } = await supabase
                .from('products')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) throw error;
            toast.success('Produto excluído com sucesso!');
            fetchProducts();
        } catch (error: any) {
            toast.error('Erro ao excluir produto: ' + error.message);
        }
    };

    const filteredProducts = products.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isLowStock = (p: Product) => p.stock_quantity <= p.min_stock_alert;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-dark">Produtos / Estoque</h2>
                    <p className="text-gray-500">Gerencie peças, preços e quantidade em estoque</p>
                </div>
                <Button onClick={() => {
                    if (isFormOpen) handleCancel();
                    else setIsFormOpen(true);
                }}>
                    {isFormOpen ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Novo Produto</>}
                </Button>
            </div>

            {isFormOpen && (
                <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="mb-4 pb-4 border-b border-gray-100">
                        <h3 className="font-semibold text-lg text-primary-cyan">
                            {editingId ? 'Editar Produto' : 'Novo Produto'}
                        </h3>
                    </div>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="Nome do Produto" {...register('name')} error={errors.name?.message} />
                            <Input label="SKU / Código" {...register('sku')} />
                            <Input label="Categoria" {...register('category')} placeholder="Ex: Peças, Cabos, Baterias..." />
                            <Input label="Unidade" {...register('unit')} placeholder="un, pç, m..." error={errors.unit?.message} />
                            <Input label="Preço de Custo (R$)" type="number" step="0.01" {...register('cost_price')} error={errors.cost_price?.message} />
                            <Input label="Preço de Venda (R$)" type="number" step="0.01" {...register('sale_price')} error={errors.sale_price?.message} />
                            <Input label="Quantidade em Estoque" type="number" {...register('stock_quantity')} error={errors.stock_quantity?.message} />
                            <Input label="Alerta de Estoque Mínimo" type="number" {...register('min_stock_alert')} error={errors.min_stock_alert?.message} />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-2 block">Fotos do Produto</label>
                            {existingPhotos.length > 0 && (
                                <div className="mb-3">
                                    <ImageViewer images={existingPhotos} />
                                </div>
                            )}
                            <ImageUpload onImagesChange={setNewImages} />
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
                            <Button type="submit">{editingId ? 'Salvar Alterações' : 'Salvar Produto'}</Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, SKU ou categoria..."
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
                                <th className="px-6 py-3">Produto</th>
                                <th className="px-6 py-3">Categoria</th>
                                <th className="px-6 py-3">Preço Venda</th>
                                <th className="px-6 py-3">Estoque</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                        Nenhum produto cadastrado
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((product) => (
                                    <tr key={product.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            <div className="flex items-center gap-3">
                                                {product.photos && product.photos.length > 0 ? (
                                                    <img src={product.photos[0]} alt={product.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0">
                                                        <Package className="w-4 h-4" />
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="font-semibold">{product.name}</div>
                                                    <div className="text-xs text-gray-500">{product.sku}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{product.category || '-'}</td>
                                        <td className="px-6 py-4 text-gray-600">R$ {Number(product.sale_price).toFixed(2)}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${isLowStock(product) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                {isLowStock(product) && <AlertTriangle className="w-3 h-3" />}
                                                {product.stock_quantity} {product.unit}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <DropdownMenu
                                                items={[
                                                    {
                                                        label: 'Atualizar',
                                                        icon: <Edit2 className="w-4 h-4" />,
                                                        onClick: () => handleEdit(product),
                                                    },
                                                    {
                                                        label: 'Excluir',
                                                        icon: <Trash2 className="w-4 h-4" />,
                                                        onClick: () => handleDelete(product.id, product.name),
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
                    {filteredProducts.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            Nenhum produto cadastrado
                        </div>
                    ) : (
                        filteredProducts.map((product) => (
                            <div key={product.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 active:bg-gray-50 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        {product.photos && product.photos.length > 0 ? (
                                            <img src={product.photos[0]} alt={product.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-primary-cyan/10 text-primary-cyan flex items-center justify-center flex-shrink-0">
                                                <Package className="w-5 h-5" />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold text-gray-900 truncate">{product.name}</div>
                                            <div className="text-xs text-gray-500">{product.sku || product.category}</div>
                                        </div>
                                    </div>
                                    <DropdownMenu
                                        items={[
                                            {
                                                label: 'Atualizar',
                                                icon: <Edit2 className="w-4 h-4" />,
                                                onClick: () => handleEdit(product),
                                            },
                                            {
                                                label: 'Excluir',
                                                icon: <Trash2 className="w-4 h-4" />,
                                                onClick: () => handleDelete(product.id, product.name),
                                                variant: 'danger' as const,
                                            },
                                        ]}
                                    />
                                </div>

                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">R$ {Number(product.sale_price).toFixed(2)}</span>
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${isLowStock(product) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                        {isLowStock(product) && <AlertTriangle className="w-3 h-3" />}
                                        {product.stock_quantity} {product.unit}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
