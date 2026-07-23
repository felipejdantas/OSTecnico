import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, FileText, Users, Package, Truck, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type ResultItem = { id: string; title: string; subtitle?: string; onSelect: () => void };
type ResultGroup = { label: string; icon: typeof FileText; items: ResultItem[] };

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function QuickSearch({ isOpen, onClose }: Props) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [groups, setGroups] = useState<ResultGroup[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            setQuery('');
            setGroups([]);
        }
    }, [isOpen]);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!user || !isOpen || query.trim().length < 2) {
            setGroups([]);
            return;
        }
        const handle = setTimeout(() => runSearch(query.trim()), 300);
        return () => clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, user, isOpen]);

    const goTo = (path: string, prefillSearch?: string) => {
        onClose();
        navigate(path, prefillSearch ? { state: { prefillSearch } } : undefined);
    };

    const runSearch = async (q: string) => {
        if (!user) return;
        setLoading(true);
        try {
            const isNumeric = /^\d+$/.test(q);
            // Comma/parens have special meaning in PostgREST's .or() filter syntax —
            // strip them so a search term can't break out of the intended filter.
            const safe = q.replace(/[,()]/g, '');

            const [osRes, customersRes, productsRes, suppliersRes] = await Promise.all([
                isNumeric
                    ? supabase.from('service_orders').select('id, os_number, equipment, customers (name)').eq('user_id', user.id).eq('os_number', parseInt(q)).limit(5)
                    : supabase.from('service_orders').select('id, os_number, equipment, customers (name)').eq('user_id', user.id).or(`equipment.ilike.%${safe}%,brand.ilike.%${safe}%`).limit(5),
                supabase.from('customers').select('id, name, cpf, phone').eq('user_id', user.id).or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,cpf.ilike.%${safe}%`).limit(5),
                supabase.from('products').select('id, name, sku').eq('user_id', user.id).or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`).limit(5),
                supabase.from('suppliers').select('id, name, phone').eq('user_id', user.id).or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`).limit(5),
            ]);

            const newGroups: ResultGroup[] = [];

            if ((osRes.data || []).length > 0) {
                newGroups.push({
                    label: 'Ordens de Serviço',
                    icon: FileText,
                    items: (osRes.data || []).map((o: any) => ({
                        id: o.id,
                        title: `OS #${o.os_number}`,
                        subtitle: [o.customers?.name, o.equipment].filter(Boolean).join(' · '),
                        onSelect: () => goTo(`/editar-os/${o.id}`),
                    })),
                });
            }
            if ((customersRes.data || []).length > 0) {
                newGroups.push({
                    label: 'Clientes',
                    icon: Users,
                    items: (customersRes.data || []).map((c: any) => ({
                        id: c.id,
                        title: c.name,
                        subtitle: c.phone || c.cpf || undefined,
                        onSelect: () => goTo('/clientes', c.name),
                    })),
                });
            }
            if ((productsRes.data || []).length > 0) {
                newGroups.push({
                    label: 'Produtos',
                    icon: Package,
                    items: (productsRes.data || []).map((p: any) => ({
                        id: p.id,
                        title: p.name,
                        subtitle: p.sku || undefined,
                        onSelect: () => goTo('/produtos', p.name),
                    })),
                });
            }
            if ((suppliersRes.data || []).length > 0) {
                newGroups.push({
                    label: 'Fornecedores',
                    icon: Truck,
                    items: (suppliersRes.data || []).map((s: any) => ({
                        id: s.id,
                        title: s.name,
                        subtitle: s.phone || undefined,
                        onSelect: () => goTo('/fornecedores', s.name),
                    })),
                });
            }

            setGroups(newGroups);
        } catch (error) {
            console.error('Error running quick search:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center pt-20 sm:pt-24 px-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                    <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar cliente, produto, fornecedor, nº da OS..."
                        className="flex-1 border-none outline-none text-sm sm:text-base"
                    />
                    {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />}
                    <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg flex-shrink-0">
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                <div className="max-h-96 overflow-y-auto">
                    {query.trim().length < 2 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Digite ao menos 2 caracteres para buscar</p>
                    ) : groups.length === 0 && !loading ? (
                        <p className="text-sm text-gray-400 text-center py-8">Nenhum resultado encontrado</p>
                    ) : (
                        groups.map(group => (
                            <div key={group.label} className="py-2">
                                <p className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">{group.label}</p>
                                {group.items.map(item => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={item.onSelect}
                                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3 touch-manipulation"
                                    >
                                        <group.icon className="w-4 h-4 text-primary-cyan flex-shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-dark truncate">{item.title}</div>
                                            {item.subtitle && <div className="text-xs text-gray-400 truncate">{item.subtitle}</div>}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ))
                    )}
                </div>

                <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
                    <span>Atalho: Ctrl+K</span>
                    <span>Esc para fechar</span>
                </div>
            </div>
        </div>
    );
}
