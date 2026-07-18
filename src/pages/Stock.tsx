import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDownCircle, ArrowUpCircle, Boxes, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Product = {
    id: string;
    name: string;
    unit: string;
    stock_quantity: number;
};

type Movement = {
    id: string;
    product_id: string;
    type: 'entrada' | 'saida' | 'ajuste';
    quantity: number;
    note: string | null;
    created_at: string;
    products: { name: string; unit: string } | null;
};

const TYPE_LABELS: Record<Movement['type'], string> = {
    entrada: 'Entrada',
    saida: 'Saída',
    ajuste: 'Ajuste',
};

export default function Stock() {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [movements, setMovements] = useState<Movement[]>([]);
    const [loading, setLoading] = useState(false);

    const [productId, setProductId] = useState('');
    const [type, setType] = useState<Movement['type']>('entrada');
    const [quantity, setQuantity] = useState(1);
    const [note, setNote] = useState('');

    useEffect(() => {
        if (user) {
            fetchProducts();
            fetchMovements();
        }
    }, [user]);

    const fetchProducts = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('products')
            .select('id, name, unit, stock_quantity')
            .eq('user_id', user.id)
            .order('name');
        if (error) console.error('Error fetching products:', error);
        else setProducts(data || []);
    };

    const fetchMovements = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('stock_movements')
            .select('id, product_id, type, quantity, note, created_at, products(name, unit)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) console.error('Error fetching movements:', error);
        else setMovements((data as any) || []);
    };

    const selectedProduct = products.find(p => p.id === productId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !productId || quantity < 1) return;

        if (type === 'saida' && selectedProduct && quantity > selectedProduct.stock_quantity) {
            const proceed = confirm(
                `O estoque atual é ${selectedProduct.stock_quantity} ${selectedProduct.unit}. Isso vai deixar o estoque negativo. Deseja continuar?`
            );
            if (!proceed) return;
        }

        const signedQuantity = type === 'saida' ? -Math.abs(quantity) : Math.abs(quantity);

        setLoading(true);
        try {
            const { error } = await supabase.from('stock_movements').insert([{
                user_id: user.id,
                product_id: productId,
                type,
                quantity: signedQuantity,
                note: note.trim() || null,
            }]);
            if (error) throw error;

            toast.success('Lançamento registrado com sucesso!');
            setProductId('');
            setQuantity(1);
            setNote('');
            fetchProducts();
            fetchMovements();
        } catch (error: any) {
            toast.error('Erro ao registrar lançamento: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (movement: Movement) => {
        if (!confirm(`Tem certeza que deseja excluir este lançamento de "${movement.products?.name}"? O estoque será ajustado de volta.`)) return;

        try {
            const { error } = await supabase.from('stock_movements').delete().eq('id', movement.id);
            if (error) throw error;
            toast.success('Lançamento excluído e estoque ajustado.');
            fetchProducts();
            fetchMovements();
        } catch (error: any) {
            toast.error('Erro ao excluir lançamento: ' + error.message);
        }
    };

    const typeIcon = (t: Movement['type']) => {
        if (t === 'entrada') return <ArrowUpCircle className="w-4 h-4 text-green-600" />;
        if (t === 'saida') return <ArrowDownCircle className="w-4 h-4 text-red-600" />;
        return <SlidersHorizontal className="w-4 h-4 text-amber-600" />;
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-dark flex items-center gap-2">
                    <Boxes className="w-6 h-6 text-primary-cyan" />
                    Estoque
                </h2>
                <p className="text-gray-500">Lance entradas, saídas e ajustes de estoque dos produtos</p>
            </div>

            <Card>
                <h3 className="font-semibold text-base sm:text-lg mb-4">Novo Lançamento</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2">
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Produto</label>
                            <select
                                value={productId}
                                onChange={(e) => setProductId(e.target.value)}
                                required
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 bg-white text-sm"
                            >
                                <option value="">Selecione um produto...</option>
                                {products.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} (estoque atual: {p.stock_quantity} {p.unit})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Tipo</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as Movement['type'])}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 bg-white text-sm"
                            >
                                <option value="entrada">Entrada</option>
                                <option value="saida">Saída</option>
                                <option value="ajuste">Ajuste</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Quantidade</label>
                            <input
                                type="number"
                                min={1}
                                value={quantity}
                                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                                required
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 bg-white text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-600 mb-1 block">Observação (opcional)</label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Ex: compra fornecedor X, contagem física, perda..."
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 bg-white text-sm"
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button type="submit" disabled={loading || !productId}>
                            {loading ? 'Salvando...' : 'Lançar'}
                        </Button>
                    </div>
                </form>
            </Card>

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-base sm:text-lg">Histórico de Lançamentos</h3>
                </div>

                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">Data</th>
                                <th className="px-6 py-3">Produto</th>
                                <th className="px-6 py-3">Tipo</th>
                                <th className="px-6 py-3">Quantidade</th>
                                <th className="px-6 py-3">Observação</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {movements.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                        Nenhum lançamento registrado ainda
                                    </td>
                                </tr>
                            ) : (
                                movements.map((m) => (
                                    <tr key={m.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                                            {new Date(m.created_at).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{m.products?.name}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5">
                                                {typeIcon(m.type)}
                                                {TYPE_LABELS[m.type]}
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 font-medium ${m.quantity < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {m.quantity > 0 ? '+' : ''}{m.quantity} {m.products?.unit}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 max-w-[250px] truncate">{m.note || '-'}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(m)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Excluir lançamento"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="md:hidden space-y-3 p-4">
                    {movements.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">Nenhum lançamento registrado ainda</div>
                    ) : (
                        movements.map((m) => (
                            <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-gray-900 truncate">{m.products?.name}</div>
                                        <div className="text-xs text-gray-500">{new Date(m.created_at).toLocaleString('pt-BR')}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(m)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="inline-flex items-center gap-1.5">
                                        {typeIcon(m.type)}
                                        {TYPE_LABELS[m.type]}
                                    </span>
                                    <span className={`font-medium ${m.quantity < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {m.quantity > 0 ? '+' : ''}{m.quantity} {m.products?.unit}
                                    </span>
                                </div>
                                {m.note && <div className="text-xs text-gray-500">{m.note}</div>}
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
