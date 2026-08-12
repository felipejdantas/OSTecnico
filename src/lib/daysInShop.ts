import { isOrderClosed } from './orderStatus';

/**
 * Days the equipment has been physically at the shop, counted from entry_date
 * to today. Returns null once the order is closed (entregue/cancelado) — at
 * that point the equipment isn't sitting here anymore, so the counter stops
 * being meaningful.
 */
export function getDaysInShop(
    entryDate: string | null | undefined,
    status: string | null | undefined
): number | null {
    if (!entryDate || isOrderClosed(status)) return null;

    const entry = new Date(entryDate + 'T00:00:00');
    entry.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Math.round((today.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(days, 0);
}
