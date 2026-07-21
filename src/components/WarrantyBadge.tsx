import { ShieldCheck, ShieldOff } from 'lucide-react';
import { getWarrantyInfo } from '../lib/warranty';

interface WarrantyBadgeProps {
    completedDate: string | null | undefined;
    warrantyDays: number | null | undefined;
}

export function WarrantyBadge({ completedDate, warrantyDays }: WarrantyBadgeProps) {
    const info = getWarrantyInfo(completedDate, warrantyDays);

    if (info.status === 'sem_dados') return null;

    if (info.status === 'dentro') {
        return (
            <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
                title={`Garantia válida até ${info.expiryDate?.toLocaleDateString('pt-BR')}`}
            >
                <ShieldCheck className="w-3 h-3" />
                Na garantia ({info.daysRemaining}d)
            </span>
        );
    }

    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600"
            title={`Garantia expirou em ${info.expiryDate?.toLocaleDateString('pt-BR')}`}
        >
            <ShieldOff className="w-3 h-3" />
            Fora da garantia
        </span>
    );
}
