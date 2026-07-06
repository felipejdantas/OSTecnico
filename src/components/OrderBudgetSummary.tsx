import { Receipt } from 'lucide-react';
import { Card } from './ui/Card';
import { calculateOrderTotal, formatCurrency, type DiscountType } from '../lib/orderFinance';

type Props = {
    itemsTotal: number;
    servicesTotal: number;
    discountType: DiscountType;
    discountValue: number;
    freight: number;
    urgencyFee: number;
    onDiscountTypeChange: (value: DiscountType) => void;
    onDiscountValueChange: (value: number) => void;
    onFreightChange: (value: number) => void;
    onUrgencyFeeChange: (value: number) => void;
};

export default function OrderBudgetSummary({
    itemsTotal, servicesTotal, discountType, discountValue, freight, urgencyFee,
    onDiscountTypeChange, onDiscountValueChange, onFreightChange, onUrgencyFeeChange,
}: Props) {
    const { subtotal, discountAmount, total } = calculateOrderTotal({
        itemsTotal, servicesTotal, discountType, discountValue, freight, urgencyFee,
    });

    return (
        <Card>
            <h3 className="font-semibold text-base sm:text-lg mb-4 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary-cyan" />
                Orçamento
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-600">Desconto</label>
                    <div className="flex gap-1">
                        <select
                            value={discountType}
                            onChange={(e) => onDiscountTypeChange(e.target.value as DiscountType)}
                            className="px-2 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm"
                        >
                            <option value="fixed">R$</option>
                            <option value="percent">%</option>
                        </select>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={discountValue}
                            onChange={(e) => onDiscountValueChange(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-600">Frete (R$)</label>
                    <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={freight}
                        onChange={(e) => onFreightChange(parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm"
                        placeholder="Uber/motoboy"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-600">Taxa de Urgência (R$)</label>
                    <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={urgencyFee}
                        onChange={(e) => onUrgencyFeeChange(parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm"
                    />
                </div>
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                    <span>Subtotal (serviços + peças)</span>
                    <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                    <div className="flex justify-between text-red-600">
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
        </Card>
    );
}
