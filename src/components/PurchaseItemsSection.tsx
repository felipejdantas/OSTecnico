import { useEffect, useState } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { SearchableSelect } from './ui/SearchableSelect';
import { formatCurrency } from '../lib/orderFinance';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type PurchaseItem = {
    id?: string;
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
};

type Product = { id: string; name: string; unit: string; stock_quantity: number };

type Props = {
    // Purchase items never touch stock by themselves — stock only changes when the
    // "Adicionar Estoque" button is pressed on the saved purchase order.
    purchaseOrderId?: string;
    items: PurchaseItem[];
    onChange: (items: PurchaseItem[]) => void;
    disabled?: boolean;
};

export default function PurchaseItemsSection({ purchaseOrderId, items, onChange, disabled }: Props) {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProductId, setSelectedProductId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [unitPrice, setUnitPrice] = useState(0);

    useEffect(() => {
        if (user) fetchProducts();
    }, [user]);

    const fetchProducts = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('products')
            .select('id, name, unit, stock_quantity')
            .eq('user_id', user.id)
            .order('name');
        if (data) setProducts(data);
    };

    const selectedProduct = products.find(p => p.id === selectedProductId);

    const addItem = async () => {
        if (!selectedProduct || quantity < 1) return;

        const newItem: PurchaseItem = {
            product_id: selectedProduct.id,
            product_name: selectedProduct.name,
            quantity,
            unit_price: unitPrice,
        };

        if (purchaseOrderId) {
            const { data, error } = await supabase
                .from('purchase_order_items')
                .insert([{ purchase_order_id: purchaseOrderId, ...newItem }])
                .select()
                .single();
            if (error) {
                console.error('Error adding purchase item:', error);
                return;
            }
            onChange([...items, { ...newItem, id: data.id }]);
        } else {
            onChange([...items, newItem]);
        }

        setSelectedProductId('');
        setQuantity(1);
        setUnitPrice(0);
    };

    const removeItem = async (index: number) => {
        const item = items[index];
        if (purchaseOrderId && item.id) {
            const { error } = await supabase.from('purchase_order_items').delete().eq('id', item.id);
            if (error) {
                console.error('Error removing purchase item:', error);
                return;
            }
        }
        onChange(items.filter((_, i) => i !== index));
    };

    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

    return (
        <Card>
            <h3 className="font-semibold text-base sm:text-lg mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-cyan" />
                Itens do Pedido de Compra
            </h3>

            {!disabled && (
                <div className="flex flex-col sm:flex-row sm:items-end gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                        <label className="text-xs text-gray-500 mb-1 block">Produto</label>
                        <SearchableSelect
                            value={selectedProductId}
                            onChange={(id) => {
                                setSelectedProductId(id);
                                const p = products.find(pr => pr.id === id);
                                if (p) setUnitPrice(0);
                            }}
                            placeholder="Buscar produto..."
                            options={products.map(p => ({
                                value: p.id,
                                label: p.name,
                                sublabel: `Estoque atual: ${p.stock_quantity} ${p.unit}`,
                            }))}
                        />
                    </div>
                    <div className="w-full sm:w-20">
                        <label className="text-xs text-gray-500 mb-1 block">Quantidade</label>
                        <input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                            placeholder="Qtd"
                            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm text-center"
                        />
                    </div>
                    <div className="w-full sm:w-28">
                        <label className="text-xs text-gray-500 mb-1 block">Preço Unit. (R$)</label>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={unitPrice}
                            onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                            placeholder="Preço un."
                            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm text-center"
                        />
                    </div>
                    <Button type="button" onClick={addItem} disabled={!selectedProductId} className="touch-manipulation">
                        <Plus className="w-4 h-4 mr-1" /> Adicionar
                    </Button>
                </div>
            )}

            {items.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum item adicionado a este pedido</p>
            ) : (
                <div className="space-y-2 mt-2">
                    {items.map((item, index) => (
                        <div key={item.id || index} className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-xl text-sm">
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-dark break-words">{item.product_name}</div>
                                <div className="text-xs text-gray-500">
                                    {item.quantity} x {formatCurrency(item.unit_price)} = {formatCurrency(item.quantity * item.unit_price)}
                                </div>
                            </div>
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => removeItem(index)}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-manipulation"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold text-dark">
                        <span>Total dos produtos</span>
                        <span>{formatCurrency(total)}</span>
                    </div>
                </div>
            )}
        </Card>
    );
}
