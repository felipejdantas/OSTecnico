import { Clock } from 'lucide-react';
import { getDaysInShop } from '../lib/daysInShop';

interface DaysInShopBadgeProps {
    entryDate: string | null | undefined;
    status: string | null | undefined;
}

export function DaysInShopBadge({ entryDate, status }: DaysInShopBadgeProps) {
    const days = getDaysInShop(entryDate, status);
    if (days === null) return null;

    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600"
            title={`Equipamento recebido há ${days} ${days === 1 ? 'dia' : 'dias'}`}
        >
            <Clock className="w-3 h-3" />
            {days} {days === 1 ? 'dia' : 'dias'}
        </span>
    );
}
