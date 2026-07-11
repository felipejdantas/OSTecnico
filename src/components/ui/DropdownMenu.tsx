import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

interface DropdownMenuItem {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    variant?: 'default' | 'danger';
}

interface DropdownMenuProps {
    items: DropdownMenuItem[];
    triggerClassName?: string;
}

export function DropdownMenu({ items, triggerClassName = '' }: DropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Renders the menu in a portal (fixed-positioned from the trigger's
    // coordinates) so it isn't clipped by an ancestor's overflow-x-auto,
    // which happens when the trigger sits inside a scrollable table.
    const updatePosition = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const menuWidth = 192; // w-48
        setMenuPos({
            top: rect.bottom + 4,
            left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
        });
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                menuRef.current && !menuRef.current.contains(event.target as Node) &&
                triggerRef.current && !triggerRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen]);

    const handleToggle = () => {
        if (!isOpen) updatePosition();
        setIsOpen(!isOpen);
    };

    const handleItemClick = (onClick: () => void) => {
        onClick();
        setIsOpen(false);
    };

    return (
        <>
            <button
                ref={triggerRef}
                onClick={handleToggle}
                className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${triggerClassName}`}
                title="Ações"
            >
                <MoreVertical className="w-4 h-4" />
            </button>

            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
                    className="w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                >
                    {items.map((item, index) => (
                        <button
                            key={index}
                            onClick={() => handleItemClick(item.onClick)}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${item.variant === 'danger'
                                    ? 'text-red-600 hover:bg-red-50'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}
