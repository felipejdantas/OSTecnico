// Business schedule used to compute SLA deadlines: Monday-Saturday, 8h-18h.
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;
const BUSINESS_DAYS = new Set([1, 2, 3, 4, 5, 6]); // Sunday (0) excluded

export const BUDGET_SLA_BUSINESS_HOURS = 24;

/**
 * Counts only the hours that fall within the business schedule between two
 * timestamps, so a deadline of "24 business hours" doesn't get eaten by
 * nights, Sundays, or hours before opening.
 */
export function elapsedBusinessHours(start: Date, end: Date): number {
    if (end <= start) return 0;

    let totalMs = 0;
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= end) {
        if (BUSINESS_DAYS.has(cursor.getDay())) {
            const dayStart = new Date(cursor);
            dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);
            const dayEnd = new Date(cursor);
            dayEnd.setHours(BUSINESS_END_HOUR, 0, 0, 0);

            const overlapStart = new Date(Math.max(dayStart.getTime(), start.getTime()));
            const overlapEnd = new Date(Math.min(dayEnd.getTime(), end.getTime()));
            if (overlapEnd > overlapStart) {
                totalMs += overlapEnd.getTime() - overlapStart.getTime();
            }
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    return totalMs / (1000 * 60 * 60);
}

export function isBudgetOverdue(diagnosisStartedAt: Date, now: Date = new Date()): boolean {
    return elapsedBusinessHours(diagnosisStartedAt, now) >= BUDGET_SLA_BUSINESS_HOURS;
}
