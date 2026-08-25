export type FixedCost = {
    id: string;
    title: string;
    amount: number;
    category: string | null;
    due_day: number;
    active: boolean;
    notes: string | null;
};

export type InstallmentStatus = 'pendente' | 'pago' | 'cancelado';

export type FixedCostInstallment = {
    id: string;
    fixed_cost_id: string;
    due_date: string; // YYYY-MM-DD
    amount: number;
    status: InstallmentStatus;
    paid_at: string | null;
    paid_amount: number | null;
    cash_entry_id: string | null;
};

// An installment only warns once it's within this many days of its due date.
export const DUE_SOON_THRESHOLD_DAYS = 5;

// How many months ahead to keep pending installments generated for — topped
// up on every page load and via "Gerar Próximas Parcelas", since there's no
// DB-side cron/trigger doing this automatically (same limitation the FIN 2.0
// fixed-costs system already has, per CEREBRO).
export const GENERATION_HORIZON_MONTHS = 6;

// Local calendar date (YYYY-MM-DD), not UTC — toISOString() would roll the
// date forward in the evening for UTC-3.
export function toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Clamps due_day to the last real day of the given month, so due_day=31 lands
// on 28/29 in February instead of overflowing into March.
export function dueDateForMonth(dueDay: number, year: number, month: number): Date {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(dueDay, lastDay));
}

// First due date on/after `from` — if this month's due day already passed,
// rolls to next month.
export function nextDueDateOnOrAfter(dueDay: number, from: Date): Date {
    const startOfFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const thisMonth = dueDateForMonth(dueDay, from.getFullYear(), from.getMonth());
    if (thisMonth >= startOfFrom) return thisMonth;
    const nextMonth = from.getMonth() + 1;
    return dueDateForMonth(dueDay, from.getFullYear() + Math.floor(nextMonth / 12), nextMonth % 12);
}

function addMonth(d: Date, dueDay: number): Date {
    const nm = d.getMonth() + 1;
    return dueDateForMonth(dueDay, d.getFullYear() + Math.floor(nm / 12), nm % 12);
}

// Builds the next `count` installment rows for a fixed cost, starting from
// the next due date on/after `from`. Caller upserts with onConflict on
// (fixed_cost_id, due_date) + ignoreDuplicates, so calling this again over an
// already-generated horizon is a safe no-op — only genuinely new months get inserted.
export function buildUpcomingInstallments(
    fixedCost: Pick<FixedCost, 'id' | 'due_day' | 'amount'>,
    count: number = GENERATION_HORIZON_MONTHS,
    from: Date = new Date()
): { fixed_cost_id: string; due_date: string; amount: number }[] {
    const rows: { fixed_cost_id: string; due_date: string; amount: number }[] = [];
    let cursor = nextDueDateOnOrAfter(fixedCost.due_day, from);
    for (let i = 0; i < count; i++) {
        rows.push({ fixed_cost_id: fixedCost.id, due_date: toDateStr(cursor), amount: fixedCost.amount });
        cursor = addMonth(cursor, fixedCost.due_day);
    }
    return rows;
}

function daysUntil(dueDateStr: string, today: Date): number {
    const due = new Date(dueDateStr + 'T00:00:00');
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function installmentStatusLabel(
    inst: Pick<FixedCostInstallment, 'status' | 'due_date'>,
    today: Date = new Date()
): { label: string; color: string } {
    if (inst.status === 'pago') return { label: 'Paga', color: 'bg-green-100 text-green-700' };
    if (inst.status === 'cancelado') return { label: 'Cancelada', color: 'bg-gray-100 text-gray-500' };

    const d = daysUntil(inst.due_date, today);
    if (d < 0) return { label: `Atrasada há ${Math.abs(d)}d`, color: 'bg-red-100 text-red-700' };
    if (d === 0) return { label: 'Vence hoje', color: 'bg-amber-100 text-amber-700' };
    if (d <= DUE_SOON_THRESHOLD_DAYS) return { label: `Vence em ${d}d`, color: 'bg-amber-100 text-amber-700' };
    return { label: `Vence em ${d}d`, color: 'bg-gray-100 text-gray-500' };
}

// True for a pending installment that's due within the warning threshold or
// already overdue — what the Dashboard alerts (popup + card) surface.
export function isDueSoonOrOverdue(
    inst: Pick<FixedCostInstallment, 'status' | 'due_date'>,
    today: Date = new Date()
): boolean {
    if (inst.status !== 'pendente') return false;
    return daysUntil(inst.due_date, today) <= DUE_SOON_THRESHOLD_DAYS;
}
