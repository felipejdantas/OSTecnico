import { useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, Shuffle, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { supabase } from '../lib/supabase';

// Avoids visually ambiguous characters (0/O, 1/l/I) since this gets read aloud
// or retyped by whoever the master hands it to.
function generatePassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
}

export default function Assistencias() {
    const [companyName, setCompanyName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [created, setCreated] = useState<{ companyName: string; email: string; password: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyName.trim() || !email.trim() || !password.trim()) {
            toast.error('Preencha nome da assistência, e-mail e senha.');
            return;
        }

        setIsSubmitting(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const { data, error } = await supabase.functions.invoke('create-assistencia-owner', {
                body: { email: email.trim(), password, companyName: companyName.trim() },
                headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            setCreated({ companyName: companyName.trim(), email: email.trim(), password });
            setCompanyName('');
            setEmail('');
            setPassword('');
            toast.success('Assistência criada com sucesso!');
        } catch (error: any) {
            toast.error('Erro ao criar assistência: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-cyan/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-primary-cyan" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-dark">Assistências</h2>
                    <p className="text-gray-500">Área de administrador master — crie o primeiro login de uma nova assistência técnica cliente</p>
                </div>
            </div>

            {created && (
                <Card className="bg-green-50 border-green-200">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="font-semibold text-green-800">
                                "{created.companyName}" criada — repasse esses dados de acesso pra pessoa (WhatsApp, etc.). A senha não aparece de novo depois de sair desta tela.
                            </p>
                            <p className="text-sm text-green-700">E-mail: <span className="font-mono font-semibold">{created.email}</span></p>
                            <p className="text-sm text-green-700">Senha: <span className="font-mono font-semibold">{created.password}</span></p>
                        </div>
                    </div>
                </Card>
            )}

            <Card>
                <h3 className="font-semibold text-lg text-primary-cyan mb-4">Nova Assistência</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Nome da Assistência"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Ex: Assistência Silva Informática"
                    />
                    <Input
                        label="E-mail de acesso"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="dono@exemplo.com"
                    />
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <Input
                                label="Senha provisória"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                            />
                        </div>
                        <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
                            <Shuffle className="w-4 h-4 mr-2" />
                            Gerar
                        </Button>
                    </div>
                    <p className="text-xs text-gray-400">
                        Essa pessoa loga direto com esses dados e já entra com sua própria conta, separada e sem acesso aos dados de nenhuma outra assistência.
                    </p>
                    <div className="flex justify-end pt-2">
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Criando...' : 'Criar Assistência'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
