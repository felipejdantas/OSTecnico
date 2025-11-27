import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Lock, Laptop } from 'lucide-react';

export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                setSuccessMessage('Conta criada com sucesso! Faça login para continuar.');
                setIsSignUp(false);
                setEmail('');
                setPassword('');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                navigate('/');
            }
        } catch (error: any) {
            console.error('Auth error:', error);
            setError(error.message || 'Erro ao realizar autenticação.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-blue-50 to-cyan-50 px-4 py-8 relative overflow-hidden">
            {/* Decorative circles */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200 rounded-full opacity-20 blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-200 rounded-full opacity-20 blur-3xl translate-y-1/2 -translate-x-1/2"></div>

            <div className="max-w-md w-full space-y-8 relative z-10">
                {/* Logo and Title */}
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-3xl shadow-lg mb-6 transform hover:scale-105 transition-transform">
                        <Laptop className="w-12 h-12 text-white" strokeWidth={1.5} />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">OSTecnico</h1>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">
                        {isSignUp ? 'Criar conta' : 'Bem-vindo de volta'}
                    </h2>
                    <p className="text-gray-600">
                        {isSignUp
                            ? 'Crie sua conta para começar a registrar equipamentos.'
                            : 'Acesse sua conta para registrar equipamentos.'}
                    </p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm" role="alert">
                            <span className="block sm:inline">{error}</span>
                        </div>
                    )}
                    {successMessage && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl text-sm" role="alert">
                            <span className="block sm:inline">{successMessage}</span>
                        </div>
                    )}

                    <form className="space-y-5" onSubmit={handleAuth}>
                        {/* Email Input */}
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="E-mail ou Usuário"
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        {/* Password Input */}
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Senha"
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                                minLength={6}
                            />
                        </div>

                        {/* Forgot Password Link - Only show on login */}
                        {!isSignUp && (
                            <div className="text-right">
                                <button
                                    type="button"
                                    className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                                >
                                    Esqueceu a senha?
                                </button>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold py-4 rounded-full focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                        >
                            {loading ? 'Processando...' : (isSignUp ? 'Criar Conta' : 'Entrar')}
                        </button>

                        {/* Register Button - Only show on login */}
                        {!isSignUp && (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsSignUp(true);
                                    setError('');
                                    setSuccessMessage('');
                                }}
                                className="w-full bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-4 rounded-full focus:outline-none focus:ring-4 focus:ring-blue-200 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Registrar-se
                            </button>
                        )}
                    </form>

                    {/* Toggle Sign Up/Login */}
                    <div className="text-center pt-2">
                        <p className="text-gray-600 text-sm">
                            {isSignUp ? (
                                <>
                                    Já tem uma conta?{' '}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsSignUp(false);
                                            setError('');
                                            setSuccessMessage('');
                                        }}
                                        className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                                    >
                                        Faça login
                                    </button>
                                </>
                            ) : (
                                <>
                                    Novo técnico?{' '}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsSignUp(true);
                                            setError('');
                                            setSuccessMessage('');
                                        }}
                                        className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                                    >
                                        Crie sua conta.
                                    </button>
                                </>
                            )}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
