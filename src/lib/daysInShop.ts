import { isOrderClosed } from './orderStatus';

/**
 * Days the equipment has been physically at the shop, counted from entry_date
 * to today. Returns null once the order is closed (entregue/cancelado) — at
 * that point the equipment isn't sitting here anymore, so the counter stops
 * being meaningful. Also null while still "agendamento" (visita técnica
 * agendada) — the equipment hasn't been received yet, it's still with the
 * client, so there's nothing physically "in the shop" to count days for.
 */
export function getDaysInShop(
    entryDate: string | null | undefined,
    status: string | null | undefined
): number | null {
    if (!entryDate || status === 'agendamento' || isOrderClosed(status)) return null;

    const entry = new Date(entryDate + 'T00:00:00');
    entry.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Math.round((today.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(days, 0);
}
