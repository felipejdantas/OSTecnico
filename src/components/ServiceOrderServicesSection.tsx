import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Hammer } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { SearchableSelect } from './ui/SearchableSelect';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type OrderServiceLine = {
    id?: string;
    service_id: string | null;
    service_name: string;
    description: string;
    quantity: number;
    price: number;
};

type ServiceCatalogEntry = {
    id: string;
    name: string;
    description: string | null;
    default_price: number;
};

type Props = {
    // Same pattern as ServiceOrderItemsSection: with an orderId, lines are written
    // straight to the DB as soon as they're added/removed. Without one (new OS not
    // saved yet), lines just live in local state until the order is created.
    orderId?: string;
    lines: OrderServiceLine[];
    onChange: (lines: OrderServiceLine[]) => void;
    disabled?: boolean;
    budgetApprovedAt?: string | null;
    onApprovalReset?: () => void;
};

export default function ServiceOrderServicesSection({ orderId, lines, onChange, disabled, budgetApprovedAt, onApprovalReset }: Props) {
    const { tenantId } = useAuth();
    const [catalog, setCatalog] = useState<ServiceCatalogEntry[]>([]);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [customDescription, setCustomDescription] = useState('');
    const [customPrice, setCustomPrice] = useState(0);

    // Both budget-approval reset AND the recebido/em_diagnostico -> aguardando_aprovacao
    // advance happen server-side via DB triggers as a side effect of the line
    // insert/delete that already ran by the time this is called — this just
    // re-syncs the form so it doesn't resubmit a stale cached status on next Salvar.
    // Must run even when there was no prior approval (that's exactly the case the
    // auto-advance trigger targets), so the resync itself isn't gated on budgetApprovedAt.
    const invalidateApproval = async () => {
        if (!orderId) return;
        if (budgetApprovedAt) {
            toast('Orçamento alterado — o cliente vai precisar aprovar novamente.', { icon: '⚠️' });
        }
        await onApprovalReset?.();
    };

    useEffect(() => {
        if (tenantId) fetchCatalog();
    }, [tenantId]);

    const fetchCatalog = async () => {
        if (!tenantId) return;
        const { data } = await supabase
            .from('services')
            .select('id, name, description, default_price')
            .eq('user_id', tenantId)
            .order('name');
        if (data) setCatalog(data);
    };

    const selectedService = catalog.find(s => s.id === selectedServiceId);

    const handleSelectService = (id: string) => {
        setSelectedServiceId(id);
        const service = catalog.find(s => s.id === id);
        setCustomDescription(service?.description || '');
        setCustomPrice(service?.default_price || 0);
    };

    const addLine = async () => {
        if (!selectedService || quantity < 1) return;

        const newLine: OrderServiceLine = {
            service_id: selectedService.id,
            service_name: selectedService.name,
            description: customDescription,
            quantity,
            price: customPrice,
        };

        if (orderId) {
            const { data, error } = await supabase
                .from('service_order_services')
                .insert([{ service_order_id: orderId, ...newLine }])
                .select()
                .single();
            if (error) {
                console.error('Error adding service line:', error);
                return;
            }
            onChange([...lines, { ...newLine, id: data.id }]);
            await invalidateApproval();
        } else {
            onChange([...lines, newLine]);
        }

        setSelectedServiceId('');
        setQuantity(1);
        setCustomDescription('');
        setCustomPrice(0);
    };

    const removeLine = async (index: number) => {
        const line = lines[index];
        if (orderId && line.id) {
            const { error } = await supabase.from('service_order_services').delete().eq('id', line.id);
            if (error) {
                console.error('Error removing service line:', error);
                return;
            }
            await invalidateApproval();
        }
        onChange(lines.filter((_, i) => i !== index));
    };

    const total = lines.reduce((sum, l) => sum + l.quantity * l.price, 0);

    return (
        <Card>
            <h3 className="font-semibold text-base sm:text-lg mb-4 flex items-center gap-2">
                <Hammer className="w-5 h-5 text-primary-cyan" />
                Serviços Realizados
            </h3>

            <div className="space-y-2 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                    <div className="flex-1 min-w-0">
                        <label className="text-xs text-gray-500 mb-1 block">Serviço</label>
                        <SearchableSelect
                            value={selectedServiceId}
                            onChange={handleSelectService}
                            placeholder="Buscar serviço..."
                            disabled={disabled}
                            options={catalog.map(s => ({
                                value: s.id,
                                label: s.name,
                                sublabel: `R$ ${s.default_price.toFixed(2)}`,
                            }))}
                        />
                    </div>
                    <input
                        type="number"
                        min={1}
                        disabled={disabled}
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                        className="w-full sm:w-20 px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm text-center disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                        title="Quantidade"
                    />
                    <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={disabled}
                        value={customPrice}
                        onChange={(e) => setCustomPrice(parseFloat(e.target.value) || 0)}
                        className="w-full sm:w-28 px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm text-center disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                        title="Preço"
                    />
                    <Button type="button" onClick={addLine} disabled={disabled || !selectedServiceId} className="touch-manipulation">
                        <Plus className="w-4 h-4 mr-1" /> Adicionar
                    </Button>
                </div>

                {selectedServiceId && (
                    <textarea
                        value={customDescription}
                        disabled={disabled}
                        onChange={(e) => setCustomDescription(e.target.value)}
                        placeholder="Descrição técnica do serviço (aparece no orçamento)..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-gray-50 min-h-[60px] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                )}
            </div>

            {lines.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum serviço adicionado a esta OS</p>
            ) : (
                <div className="space-y-2">
                    {lines.map((line, index) => (
                        <div key={line.id || index} className="flex items-start justify-between gap-2 p-3 bg-gray-50 rounded-xl text-sm">
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-dark">{line.service_name}</div>
                                {line.description && <div className="text-xs text-gray-500 mt-0.5">{line.description}</div>}
                                <div className="text-xs text-gray-500 mt-1">
                                    {line.quantity} x R$ {line.price.toFixed(2)} = R$ {(line.quantity * line.price).toFixed(2)}
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => removeLine(index)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-manipulation flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold text-dark">
                        <span>Total em serviços</span>
                        <span>R$ {total.toFixed(2)}</span>
                    </div>
                </div>
            )}
        </Card>
    );
}
