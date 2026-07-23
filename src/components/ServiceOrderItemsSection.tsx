import { useEffect, useState } from 'react';
import { Plus, Trash2, Package, AlertTriangle } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { SearchableSelect } from './ui/SearchableSelect';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type OrderItem = {
    id?: string;
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
};

type Product = {
    id: string;
    name: string;
    sale_price: number;
    stock_quantity: number;
    unit: string;
};

type Props = {
    // When editing an existing OS, items are written straight to the DB (with stock
    // deduction via trigger) as soon as they're added/removed. When creating a new OS
    // there's no order id yet, so items just live in local state until the order is saved.
    orderId?: string;
    items: OrderItem[];
    onChange: (items: OrderItem[]) => void;
    disabled?: boolean;
};

export default function ServiceOrderItemsSection({ orderId, items, onChange, disabled }: Props) {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProductId, setSelectedProductId] = useState('');
    const [quantity, setQuantity] = useState(1);

    useEffect(() => {
        if (user) fetchProducts();
    }, [user]);

    const fetchProducts = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('products')
            .select('id, name, sale_price, stock_quantity, unit')
            .eq('user_id', user.id)
            .order('name');
        if (data) setProducts(data);
    };

    const selectedProduct = products.find(p => p.id === selectedProductId);

    const addItem = async () => {
        if (!selectedProduct || quantity < 1) return;

        const newItem: OrderItem = {
            product_id: selectedProduct.id,
            product_name: selectedProduct.name,
            quantity,
            unit_price: selectedProduct.sale_price,
        };

        if (orderId) {
            const { data, error } = await supabase
                .from('service_order_items')
                .insert([{ service_order_id: orderId, ...newItem }])
                .select()
                .single();
            if (error) {
                console.error('Error adding item:', error);
                return;
            }
            onChange([...items, { ...newItem, id: data.id }]);
            fetchProducts();
        } else {
            onChange([...items, newItem]);
        }

        setSelectedProductId('');
        setQuantity(1);
    };

    const removeItem = async (index: number) => {
        const item = items[index];
        if (orderId && item.id) {
            const { error } = await supabase.from('service_order_items').delete().eq('id', item.id);
            if (error) {
                console.error('Error removing item:', error);
                return;
            }
            fetchProducts();
        }
        onChange(items.filter((_, i) => i !== index));
    };

    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

    return (
        <Card>
            <h3 className="font-semibold text-base sm:text-lg mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-cyan" />
                Peças / Produtos Utilizados
            </h3>

            <div className="flex flex-col sm:flex-row gap-2 mb-2">
                <SearchableSelect
                    className="flex-1 min-w-0"
                    value={selectedProductId}
                    onChange={setSelectedProductId}
                    placeholder="Buscar produto..."
                    disabled={disabled}
                    options={products.map(p => ({
                        value: p.id,
                        label: p.name,
                        sublabel: `Estoque: ${p.stock_quantity} ${p.unit} · R$ ${p.sale_price.toFixed(2)}`,
                    }))}
                />
                <input
                    type="number"
                    min={1}
                    disabled={disabled}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="w-full sm:w-24 px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm text-center disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                />
                <Button type="button" onClick={addItem} disabled={disabled || !selectedProductId} className="touch-manipulation">
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
            </div>

            {selectedProduct && quantity > selectedProduct.stock_quantity && (
                <div className="flex items-center gap-2 text-xs text-amber-600 mb-4">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Estoque insuficiente ({selectedProduct.stock_quantity} {selectedProduct.unit} disponível)
                </div>
            )}

            {items.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhuma peça vinculada a esta OS</p>
            ) : (
                <div className="space-y-2 mt-2">
                    {items.map((item, index) => (
                        <div key={item.id || index} className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-xl text-sm">
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-dark break-words">{item.product_name}</div>
                                <div className="text-xs text-gray-500">
                                    {item.quantity} x R$ {item.unit_price.toFixed(2)} = R$ {(item.quantity * item.unit_price).toFixed(2)}
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => removeItem(index)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold text-dark">
                        <span>Total em peças</span>
                        <span>R$ {total.toFixed(2)}</span>
                    </div>
                </div>
            )}
        </Card>
    );
}
