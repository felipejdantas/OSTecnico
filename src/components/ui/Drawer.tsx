import { type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface DrawerProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

// Painel lateral (slide-over) padrão do workspace para criar/editar registros.
// z-50 fica acima da barra fixa de salvar das páginas de formulário (z-20).
export function Drawer({ open, onClose, title, children }: DrawerProps) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
            <div
                className="flex h-full w-full max-w-md animate-slide-in-right flex-col bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
                    <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Fechar">
                        <ArrowLeft size={20} />
                    </button>
                    <h2 className="text-lg font-semibold text-dark">{title}</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-5">{children}</div>
            </div>
        </div>
    );
}
