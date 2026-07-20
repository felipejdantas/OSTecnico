import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type SearchableSelectOption = {
    value: string;
    label: string;
    sublabel?: string;
};

interface SearchableSelectProps {
    options: SearchableSelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    error?: string;
    className?: string;
}

function normalize(text: string) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

export function SearchableSelect({ options, value, onChange, placeholder = 'Selecione...', error, className }: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = options.find(o => o.value === value);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setQuery('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const normalizedQuery = normalize(query.trim());
    const filtered = normalizedQuery
        ? options.filter(o =>
            normalize(o.label).includes(normalizedQuery) ||
            (o.sublabel && normalize(o.sublabel).includes(normalizedQuery))
        )
        : options;

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                    ref={inputRef}
                    type="text"
                    value={isOpen ? query : (selected?.label || '')}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (!isOpen) setIsOpen(true);
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        setQuery('');
                    }}
                    placeholder={placeholder}
                    className={cn(
                        'w-full pl-9 pr-9 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm sm:text-base',
                        error && 'border-red-500 focus:ring-red-200'
                    )}
                />
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {isOpen && (
                <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                    {filtered.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-400">Nenhum resultado encontrado</div>
                    ) : (
                        filtered.map(o => (
                            <button
                                key={o.value}
                                type="button"
                                onClick={() => {
                                    onChange(o.value);
                                    setIsOpen(false);
                                    setQuery('');
                                }}
                                className={cn(
                                    'w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors touch-manipulation',
                                    o.value === value && 'bg-primary-green/5 text-primary-green font-medium'
                                )}
                            >
                                <div>{o.label}</div>
                                {o.sublabel && <div className="text-xs text-gray-400">{o.sublabel}</div>}
                            </button>
                        ))
                    )}
                </div>
            )}

            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
    );
}
