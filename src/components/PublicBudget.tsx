import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { calculateOrderTotal, formatCurrency, type DiscountType } from '../lib/orderFinance';

type LineItem = { name: string; quantity: number; unit_price?: number; price?: number; description?: string };

type Props = {
    items: LineItem[];
    services: LineItem[];
    discountType: DiscountType;
    discountValue: number;
    freight: number;
    urgencyFee: number;
    budgetApprovedAt: string | null;
    canApprove: boolean;
    isApproving: boolean;
    onApprove: () => void;
    pixKey?: string | null;
    bankDetails?: string | null;
    companyPhone?: string | null;
    warrantyDays?: number | null;
    warrantyText?: string | null;
};

export function PublicBudget({
    items, services, discountType, discountValue, freight, urgencyFee,
    budgetApprovedAt, canApprove, isApproving, onApprove,
    pixKey, bankDetails, companyPhone, warrantyDays, warrantyText,
}: Props) {
    const itemsTotal = items.reduce((sum, i) => sum + i.quantity * (i.unit_price ?? 0), 0);
    const servicesTotal = services.reduce((sum, s) => sum + s.quantity * (s.price ?? 0), 0);
    const { subtotal, discountAmount, total } = calculateOrderTotal({
        itemsTotal, servicesTotal, discountType, discountValue, freight, urgencyFee,
    });

    if (items.length === 0 && services.length === 0 && subtotal === 0) return null;

    return (
        <Card>
            <h2 className="text-xl font-bold text-dark mb-4 border-b pb-2">Orçamento</h2>

            {services.length > 0 && (
                <div className="mb-4">
                    <div className="bg-gray-100 -mx-6 px-6 py-2 mb-3">
                        <h3 className="font-bold text-gray-800 text-xs uppercase tracking-wide">Serviços</h3>
                    </div>
                    <div className="space-y-2">
                        {services.map((s, i) => (
                            <div key={i} className="flex justify-between text-sm bg-gray-50 p-2 rounded-lg">
                                <div>
                                    <div className="font-medium text-gray-800">{s.name}</div>
                                    {s.description && <div className="text-xs text-gray-500">{s.description}</div>}
                                </div>
                                <div className="text-gray-700 whitespace-nowrap ml-2">{formatCurrency(s.quantity * (s.price ?? 0))}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {items.length > 0 && (
                <div className="mb-4">
                    <div className="bg-gray-100 -mx-6 px-6 py-2 mb-3">
                        <h3 className="font-bold text-gray-800 text-xs uppercase tracking-wide">Peças</h3>
                    </div>
                    <div className="space-y-2">
                        {items.map((it, i) => (
                            <div key={i} className="flex justify-between text-sm bg-gray-50 p-2 rounded-lg">
                                <div className="text-gray-800">{it.name} <span className="text-gray-400">x{it.quantity}</span></div>
                                <div className="text-gray-700 whitespace-nowrap ml-2">{formatCurrency(it.quantity * (it.unit_price ?? 0))}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                        <span>Desconto</span>
                        <span>- {formatCurrency(discountAmount)}</span>
                    </div>
                )}
                {freight > 0 && (
                    <div className="flex justify-between text-gray-600">
                        <span>Frete</span>
                        <span>{formatCurrency(freight)}</span>
                    </div>
                )}
                {urgencyFee > 0 && (
                    <div className="flex justify-between text-gray-600">
                        <span>Taxa de urgência</span>
                        <span>{formatCurrency(urgencyFee)}</span>
                    </div>
                )}
                <div className="flex justify-between font-bold text-lg text-dark pt-1.5 border-t border-gray-100">
                    <span>Total</span>
                    <span className="text-primary-cyan">{formatCurrency(total)}</span>
                </div>
            </div>

            {(pixKey || bankDetails) && (
                <div className="mt-4 text-sm">
                    <div className="bg-gray-100 -mx-6 px-6 py-2 mb-3">
                        <h3 className="font-bold text-gray-800 text-xs uppercase tracking-wide">Pagamento</h3>
                    </div>
                    {pixKey && <p className="text-gray-600">PIX: <span className="font-medium text-gray-800">{pixKey}</span></p>}
                    {bankDetails && <p className="text-gray-600 whitespace-pre-line">{bankDetails}</p>}
                    {companyPhone && <p className="text-gray-500 text-xs mt-1">Dúvidas: {companyPhone}</p>}
                </div>
            )}

            {(warrantyDays || warrantyText) && (
                <div className="mt-4 text-sm">
                    <div className="bg-gray-100 -mx-6 px-6 py-2 mb-3">
                        <h3 className="font-bold text-gray-800 text-xs uppercase tracking-wide">Garantia</h3>
                    </div>
                    <div className="flex gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary-cyan flex-shrink-0 mt-0.5" />
                        <div>
                            <span className="font-semibold text-gray-900">{warrantyDays ? `${warrantyDays} dias corridos` : 'Condições da garantia'}</span>
                            {warrantyText && <p className="text-gray-600 text-xs mt-0.5">{warrantyText}</p>}
                        </div>
                    </div>
                </div>
            )}

            {budgetApprovedAt ? (
                <div className="mt-4 flex items-center gap-2 text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-gray-500" />
                    Orçamento aprovado em {new Date(budgetApprovedAt).toLocaleString('pt-BR')}
                </div>
            ) : canApprove ? (
                <Button onClick={onApprove} size="lg" className="w-full mt-4" disabled={isApproving}>
                    {isApproving ? 'Aprovando...' : 'Aprovar Orçamento'}
                </Button>
            ) : null}
        </Card>
    );
}
