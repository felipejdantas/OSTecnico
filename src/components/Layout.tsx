import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Users, Wrench, FilePlus, Menu, Home, LogOut } from 'lucide-react';
import { cn } from './ui/Button';
import { useAuth } from '../contexts/AuthContext';

export function Layout({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();
    const { signOut, user } = useAuth();

    const menuItems = [
        { icon: Home, label: 'Dashboard', path: '/' },
        { icon: FilePlus, label: 'Nova OS', path: '/nova-os' },
        { icon: Users, label: 'Clientes', path: '/clientes' },
        { icon: Wrench, label: 'Técnicos', path: '/tecnicos' },
    ];

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
                            src="/logo.jpg"
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

                <nav className="px-3 sm:px-4 mt-6 space-y-2 flex-1">
                    {menuItems.map((item) => {
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

                <div className="p-3 sm:p-4 lg:p-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
