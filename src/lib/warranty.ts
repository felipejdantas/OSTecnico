export type WarrantyStatus = 'sem_dados' | 'dentro' | 'fora';

export interface WarrantyInfo {
    status: WarrantyStatus;
    expiryDate?: Date;
    /** Positive while still under warranty, negative once expired. */
    daysRemaining?: number;
}

/**
 * Warranty is counted from completed_date (when the OS reaches "pronto"/"entregue"),
 * not the entry date, since the warranty covers the repair delivered to the customer.
 */
export function getWarrantyInfo(
    completedDate: string | null | undefined,
    warrantyDays: number | null | undefined
): WarrantyInfo {
    if (!completedDate || !warrantyDays || warrantyDays <= 0) {
        return { status: 'sem_dados' };
    }

    const expiry = new Date(completedDate + 'T00:00:00');
    expiry.setDate(expiry.getDate() + warrantyDays);
    expiry.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysRemaining = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return {
        status: daysRemaining >= 0 ? 'dentro' : 'fora',
        expiryDate: expiry,
        daysRemaining,
    };
}
