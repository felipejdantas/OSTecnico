export type DiscountType = 'fixed' | 'percent';

type OrderTotalInput = {
    itemsTotal: number;
    servicesTotal: number;
    discountType: DiscountType;
    discountValue: number;
    freight: number;
    urgencyFee: number;
};

export function calculateOrderTotal({ itemsTotal, servicesTotal, discountType, discountValue, freight, urgencyFee }: OrderTotalInput) {
    const subtotal = itemsTotal + servicesTotal;
    const discountAmount = discountType === 'percent' ? subtotal * (discountValue / 100) : discountValue;
    const total = Math.max(0, subtotal - discountAmount + freight + urgencyFee);
    return { subtotal, discountAmount, total };
}

export function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
