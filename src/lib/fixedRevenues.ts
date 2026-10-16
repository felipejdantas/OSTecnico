import { toDateStr, nextDueDateOnOrAfter, addMonth, DUE_SOON_THRESHOLD_DAYS } from './fixedCosts';

export { toDateStr, DUE_SOON_THRESHOLD_DAYS };

export type FixedRevenue = {
    id: string;
    title: string;
    amount: number;
    category: string | null;
    due_day: number;
    active: boolean;
    notes: string | null;
    // null = receita recorrente sem fim (ex: aluguel recebido); um número =
    // plano fixo de N parcelas que para de gerar sozinho (ex: venda
    // parcelada em 5x).
    total_installments: number | null;
};

export type RevenueInstallmentStatus = 'pendente' | 'recebido' | 'cancelado';

export type FixedRevenueInstallment = {
    id: string;
    fixed_revenue_id: string;
    installment_number: number | null;
    due_date: string; // YYYY-MM-DD
    amount: number;
    status: RevenueInstallmentStatus;
    received_at: string | null;
    received_amount: number | null;
    cash_entry_id: string | null;
};

// Igual a buildNextInstallment de fixedCosts.ts, mas: (a) carrega o número
// da parcela quando o plano é finito, (b) retorna null quando já bateu o
// total de parcelas — nesse caso o chamador não insere nada, e o ciclo de
// geração simplesmente para sozinho (ex: 5ª de 5 parcelas paga, acabou).
export function buildNextRevenueInstallment(
    fixedRevenue: Pick<FixedRevenue, 'id' | 'due_day' | 'amount' | 'total_installments'>,
    afterDueDate?: string | null,
    afterInstallmentNumber?: number | null,
    from: Date = new Date()
): { fixed_revenue_id: string; due_date: string; amount: number; installment_number: number | null } | null {
    const nextNumber = (afterInstallmentNumber ?? 0) + 1;
    if (fixedRevenue.total_installments != null && nextNumber > fixedRevenue.total_installments) return null;

    const dueDate = afterDueDate
        ? addMonth(new Date(afterDueDate + 'T00:00:00'), fixedRevenue.due_day)
        : nextDueDateOnOrAfter(fixedRevenue.due_day, from);
    return {
        fixed_revenue_id: fixedRevenue.id,
        due_date: toDateStr(dueDate),
        amount: fixedRevenue.amount,
        installment_number: fixedRevenue.total_installments != null ? nextNumber : null,
    };
}

function daysUntil(dueDateStr: string, today: Date): number {
    const due = new Date(dueDateStr + 'T00:00:00');
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function revenueInstallmentStatusLabel(
    inst: Pick<FixedRevenueInstallment, 'status' | 'due_date'>,
    today: Date = new Date()
): { label: string; color: string } {
    if (inst.status === 'recebido') return { label: 'Recebida', color: 'bg-green-100 text-green-700' };
    if (inst.status === 'cancelado') return { label: 'Cancelada', color: 'bg-gray-100 text-gray-500' };

    const d = daysUntil(inst.due_date, today);
    if (d < 0) return { label: `Atrasada há ${Math.abs(d)}d`, color: 'bg-red-100 text-red-700' };
    if (d === 0) return { label: 'Vence hoje', color: 'bg-amber-100 text-amber-700' };
    if (d <= DUE_SOON_THRESHOLD_DAYS) return { label: `Vence em ${d}d`, color: 'bg-amber-100 text-amber-700' };
    return { label: `Vence em ${d}d`, color: 'bg-gray-100 text-gray-500' };
}

export function isRevenueDueSoonOrOverdue(
    inst: Pick<FixedRevenueInstallment, 'status' | 'due_date'>,
    today: Date = new Date()
): boolean {
    if (inst.status !== 'pendente') return false;
    return daysUntil(inst.due_date, today) <= DUE_SOON_THRESHOLD_DAYS;
}
