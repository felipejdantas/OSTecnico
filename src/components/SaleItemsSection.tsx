import { useEffect, useState } from 'react';
import { Plus, Trash2, Package, AlertTriangle } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { SearchableSelect } from './ui/SearchableSelect';
import { formatCurrency } from '../lib/orderFinance';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type SaleItem = {
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
    // When editing an existing sale, items are written straight to the DB (with
    // stock deduction via trigger) as soon as they're added/removed. When creating
    // a new sale there's no sale id yet, so items just live in local state until save.
    saleId?: string;
    items: SaleItem[];
    onChange: (items: SaleItem[]) => void;
};

export default function SaleItemsSection({ saleId, items, onChange }: Props) {
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

        const newItem: SaleItem = {
            product_id: selectedProduct.id,
            product_name: selectedProduct.name,
            quantity,
            unit_price: selectedProduct.sale_price,
        };

        if (saleId) {
            const { data, error } = await supabase
                .from('sale_items')
                .insert([{ sale_id: saleId, ...newItem }])
                .select()
                .single();
            if (error) {
                console.error('Error adding sale item:', error);
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
        if (saleId && item.id) {
            const { error } = await supabase.from('sale_items').delete().eq('id', item.id);
            if (error) {
                console.error('Error removing sale item:', error);
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
                Produtos
            </h3>

            <div className="flex flex-col sm:flex-row gap-2 mb-2">
                <SearchableSelect
                    className="flex-1 min-w-0"
                    value={selectedProductId}
                    onChange={setSelectedProductId}
                    placeholder="Buscar produto no estoque..."
                    options={products.map(p => ({
                        value: p.id,
                        label: p.name,
                        sublabel: `Estoque: ${p.stock_quantity} ${p.unit} · R$ ${p.sale_price.toFixed(2)}`,
                    }))}
                />
                <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="w-full sm:w-24 px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm text-center"
                />
                <Button type="button" onClick={addItem} disabled={!selectedProductId} className="touch-manipulation">
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
                <p className="text-sm text-gray-400 text-center py-4">Nenhum produto adicionado a esta venda</p>
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
                            <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-manipulation"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold text-dark">
                        <span>Total dos itens</span>
                        <span>{formatCurrency(total)}</span>
                    </div>
                </div>
            )}
        </Card>
    );
}
