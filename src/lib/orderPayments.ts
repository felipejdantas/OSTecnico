import type { PaymentStatus } from './orderFinance';

export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'transferencia';

export const PAYMENT_METHODS: PaymentMethod[] = ['pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'transferencia'];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    pix: 'Pix',
    dinheiro: 'Dinheiro',
    cartao_debito: 'Cartão de Débito',
    cartao_credito: 'Cartão de Crédito',
    transferencia: 'Transferência',
};

export type OrderPaymentLeg = {
    id: string;
    method: PaymentMethod;
    amount: number;
    received_date: string;
    cash_entry_id: string | null;
};

// Local calendar date (YYYY-MM-DD), not UTC — toISOString() would roll the
// date forward in the evening for UTC-3.
function toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Cash/Pix/transferência land same day; card settlement (the maquininha's
// prazo de recebimento) typically takes at least a day — this is just a
// starting suggestion, always editable in the form since every processor's
// actual prazo differs.
export function defaultReceivedDate(method: PaymentMethod, from: Date = new Date()): string {
    const d = new Date(from);
    if (method === 'cartao_debito' || method === 'cartao_credito') d.setDate(d.getDate() + 1);
    return toDateStr(d);
}

export function computePaymentStatus(totalPaid: number, orderTotal: number): PaymentStatus {
    if (totalPaid <= 0) return 'nao_pago';
    if (totalPaid >= orderTotal) return 'pago';
    return 'parcial';
}
