// Strips accents/diacritics and case so "Fábio" and "fabio" compare equal.
export function normalizeText(value: string | null | undefined): string {
    return (value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Forgiving search: every word of the query must appear somewhere in the
 * haystack, in any order and not necessarily adjacent — so "fonte dell"
 * matches "Fonte para Notebook Dell 19.5V" even though "dell" isn't right
 * next to "fonte". Accent-insensitive on both sides.
 */
export function matchesSearch(haystack: string | null | undefined, query: string): boolean {
    const q = normalizeText(query);
    if (!q) return true;
    const normalizedHaystack = normalizeText(haystack);
    return q.split(/\s+/).filter(Boolean).every(word => normalizedHaystack.includes(word));
}

/** Same as matchesSearch, but against several fields joined into one haystack. */
export function matchesSearchFields(fields: (string | null | undefined)[], query: string): boolean {
    return matchesSearch(fields.filter(Boolean).join(' '), query);
}

/** Strips everything but digits — for comparing CPF/CNPJ/phone regardless of formatting. */
export function normalizeDigits(value: string | null | undefined): string {
    return (value || '').replace(/\D/g, '');
}

/**
 * Matches a formatted document/phone field against a query that may or may not
 * carry the same punctuation — e.g. typing "12345678901" (no dots/dash) still
 * finds a customer stored as "123.456.789-01".
 */
export function matchesDigits(haystack: string | null | undefined, query: string): boolean {
    const q = normalizeDigits(query);
    if (!q) return false;
    return normalizeDigits(haystack).includes(q);
}
