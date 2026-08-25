export type FixedCost = {
    id: string;
    title: string;
    amount: number;
    category: string | null;
    due_day: number;
    active: boolean;
    notes: string | null;
};

export type FixedCostAlert = {
    fixedCost: FixedCost;
    dueDate: Date;
    daysUntil: number; // negative once overdue
    status: 'overdue' | 'upcoming';
};

// A fixed cost only warns once it's within this many days of its due date —
// far-future due dates shouldn't clutter the dashboard.
export const DUE_SOON_THRESHOLD_DAYS = 5;

// Clamps due_day to the last real day of the given month, so due_day=31 lands
// on 28/29 in February instead of overflowing into March.
export function dueDateForMonth(dueDay: number, year: number, month: number): Date {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(dueDay, lastDay));
}

// A fixed cost counts as paid for a given month if some cash_entries row links
// back to it (fixed_cost_id) with an entry_date inside that same month —
// mirrors the "store the origin ID, don't reconstruct by text" reversal
// pattern already used for Pedido de Compra (ver CEREBRO nota "Reversão de
// Lançamentos Financeiros").
export function isPaidForMonth(
    fixedCostId: string,
    year: number,
    month: number,
    paidEntries: { fixed_cost_id: string | null; entry_date: string }[]
): boolean {
    return paidEntries.some(e => {
        if (e.fixed_cost_id !== fixedCostId) return false;
        const d = new Date(e.entry_date + 'T00:00:00');
        return d.getFullYear() === year && d.getMonth() === month;
    });
}

export function getFixedCostAlerts(
    fixedCosts: FixedCost[],
    paidEntries: { fixed_cost_id: string | null; entry_date: string }[],
    today: Date = new Date()
): FixedCostAlert[] {
    const year = today.getFullYear();
    const month = today.getMonth();
    const todayStart = new Date(year, month, today.getDate());

    const alerts: FixedCostAlert[] = [];
    for (const fc of fixedCosts) {
        if (!fc.active) continue;
        if (isPaidForMonth(fc.id, year, month, paidEntries)) continue;

        const dueDate = dueDateForMonth(fc.due_day, year, month);
        const daysUntil = Math.round((dueDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntil < 0) {
            alerts.push({ fixedCost: fc, dueDate, daysUntil, status: 'overdue' });
        } else if (daysUntil <= DUE_SOON_THRESHOLD_DAYS) {
            alerts.push({ fixedCost: fc, dueDate, daysUntil, status: 'upcoming' });
        }
    }
    return alerts.sort((a, b) => a.daysUntil - b.daysUntil);
}
