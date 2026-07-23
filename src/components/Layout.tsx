import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    Users, Wrench, FilePlus, Menu, Home, LogOut, Package, Settings, Hammer, Wallet,
    Boxes, ShoppingCart, Truck, ClipboardList, ChevronDown, Search, Calculator,
} from 'lucide-react';
import { cn } from './ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { QuickSearch } from './QuickSearch';

type MenuItem = { icon: typeof Home; label: string; path: string };
type MenuGroup = { title?: string; items: MenuItem[] };

const menuGroups: MenuGroup[] = [
    {
        items: [
            { icon: Home, label: 'Dashboard', path: '/' },
            { icon: FilePlus, label: 'Nova OS', path: '/nova-os' },
        ],
    },
    {
        title: 'Cadastro',
        items: [
            { icon: Users, label: 'Clientes', path: '/clientes' },
            { icon: Wrench, label: 'Técnicos', path: '/tecnicos' },
            { icon: Truck, label: 'Fornecedores', path: '/fornecedores' },
            { icon: Package, label: 'Produtos', path: '/produtos' },
            { icon: Hammer, label: 'Serviços', path: '/servicos' },
        ],
    },
    {
        title: 'Vendas',
        items: [
            { icon: Calculator, label: 'Orçamentos', path: '/orcamentos' },
            { icon: ShoppingCart, label: 'Pedidos de Venda', path: '/vendas' },
        ],
    },
    {
        title: 'Compras',
        items: [
            { icon: ClipboardList, label: 'Pedidos de Compra', path: '/compras' },
            { icon: Boxes, label: 'Estoque', path: '/estoque' },
        ],
    },
    {
        title: 'Financeiro',
        items: [
            { icon: Wallet, label: 'Fluxo de Caixa', path: '/caixa' },
        ],
    },
    {
        items: [
            { icon: Settings, label: 'Configurações', path: '/configuracoes' },
        ],
    },
];

function activeGroupTitle(pathname: string): string | undefined {
    return menuGroups.find(g => g.items.some(i => i.path === pathname))?.title;
}

export function Layout({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
    const location = useLocation();
    const { signOut, user } = useAuth();

    // Only the group containing the current page starts open; everything else stays
    // collapsed until the user taps it, so the menu doesn't grow as more areas are added.
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
        const active = activeGroupTitle(location.pathname);
        return new Set(menuGroups.filter(g => g.title && g.title !== active).map(g => g.title!));
    });

    // Whenever navigation lands in a different group, make sure that group is visible —
    // without forcing closed any group the user had manually opened.
    useEffect(() => {
        const active = activeGroupTitle(location.pathname);
        if (!active) return;
        setCollapsedGroups(prev => {
            if (!prev.has(active)) return prev;
            const next = new Set(prev);
            next.delete(active);
            return next;
        });
    }, [location.pathname]);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setIsQuickSearchOpen(true);
            }
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    const toggleGroup = (title: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(title)) next.delete(title);
            else next.add(title);
            return next;
        });
    };

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/20 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={cn(
                "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 transform transition-transform duration-200 lg:transform-none flex flex-col",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="p-4 sm:p-6">
                    <div className="flex items-center gap-3">
                        <img
                            src="/logo-full.jpg"
                            alt="OSTecnico"
                            className="h-10 sm:h-12 w-auto object-contain"
                            onError={(e) => {
                                // Fallback to text if image fails to load
                                e.currentTarget.style.display = 'none';
                                const textLogo = e.currentTarget.nextElementSibling;
                                if (textLogo) textLogo.classList.remove('hidden');
                            }}
                        />
                        <div className="hidden">
                            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-primary-cyan to-primary-cyan bg-clip-text text-transparent">
                                OSTecnico
                            </h1>
                            <p className="text-xs text-gray-400 mt-1">Sistema de Gestão</p>
                        </div>
                    </div>
                </div>

                <nav className="px-3 sm:px-4 mt-2 space-y-1 flex-1 overflow-y-auto">
                    {menuGroups.map((group, groupIndex) => {
                        const isCollapsed = group.title ? collapsedGroups.has(group.title) : false;

                        return (
                            <div key={group.title || groupIndex} className={groupIndex > 0 ? 'pt-3' : ''}>
                                {group.title && (
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.title!)}
                                        className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 touch-manipulation"
                                    >
                                        {group.title}
                                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isCollapsed && "-rotate-90")} />
                                    </button>
                                )}

                                {!isCollapsed && (
                                    <div className="space-y-1">
                                        {group.items.map((item) => {
                                            const Icon = item.icon;
                                            const isActive = location.pathname === item.path;

                                            return (
                                                <Link
                                                    key={item.path}
                                                    to={item.path}
                                                    onClick={() => setIsSidebarOpen(false)}
                                                    className={cn(
                                                        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group touch-manipulation min-h-[44px]",
                                                        isActive
                                                            ? "bg-primary-cyan/10 text-primary-cyan font-medium"
                                                            : "text-gray-500 hover:bg-gray-50 hover:text-dark active:bg-gray-100"
                                                    )}
                                                >
                                                    <Icon className={cn(
                                                        "w-5 h-5 transition-colors flex-shrink-0",
                                                        isActive ? "text-primary-cyan" : "text-gray-400 group-hover:text-primary-cyan"
                                                    )} />
                                                    <span className="text-sm sm:text-base">{item.label}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={() => signOut()}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group touch-manipulation min-h-[44px] w-full text-gray-500 hover:bg-red-50 hover:text-red-600"
                    >
                        <LogOut className="w-5 h-5 transition-colors flex-shrink-0 group-hover:text-red-600" />
                        <span className="text-sm sm:text-base">Sair</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0">
                <header className="bg-white border-b border-gray-100 h-14 sm:h-16 flex items-center justify-between px-3 sm:px-4 lg:px-8 sticky top-0 z-30">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg touch-manipulation active:bg-gray-200"
                        aria-label="Abrir menu"
                    >
                        <Menu className="w-6 h-6" />
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsQuickSearchOpen(true)}
                        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors text-sm w-64"
                    >
                        <Search className="w-4 h-4" />
                        <span className="flex-1 text-left">Buscar...</span>
                        <kbd className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">Ctrl+K</kbd>
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsQuickSearchOpen(true)}
                        className="sm:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg touch-manipulation"
                        aria-label="Buscar"
                    >
                        <Search className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-3 sm:gap-4 ml-auto">
                        <div className="hidden md:flex items-center gap-2 text-sm text-gray-600">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="font-medium">{user?.email || 'Usuário'}</span>
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="hidden sm:flex items-center gap-2 text-gray-500 hover:text-red-600 transition-colors"
                            title="Sair"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="text-sm font-medium">Sair</span>
                        </button>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-primary-cyan to-blue-500 flex items-center justify-center text-white font-bold text-xs sm:text-sm">
                            {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                    </div>
                </header>

                <div className="p-3 sm:p-4 lg:p-8 max-w-[1600px] mx-auto">
                    {children}
                </div>
            </main>

            <QuickSearch isOpen={isQuickSearchOpen} onClose={() => setIsQuickSearchOpen(false)} />
        </div>
    );
}
