import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link2, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { supabase } from '../../lib/supabase';

interface BlingStatus {
    connected: boolean;
    connected_at: string | null;
    refresh_expires_at: string | null;
}

// Conexão OAuth2 com o Bling (emissão de NFS-e). Os tokens ficam só no servidor
// (tabela bling_connections, sem acesso do cliente); aqui só lemos o status.
export function BlingSection() {
    const [status, setStatus] = useState<BlingStatus | null>(null);
    const [connecting, setConnecting] = useState(false);

    const loadStatus = async () => {
        const { data, error } = await supabase.rpc('bling_connection_status');
        if (error) {
            console.error('Error loading Bling status:', error);
            return;
        }
        setStatus((data as BlingStatus[] | null)?.[0] ?? null);
    };

    useEffect(() => {
        // Volta do callback do Bling: /configuracoes?bling=ok|erro&msg=...
        const params = new URLSearchParams(window.location.search);
        const result = params.get('bling');
        if (result) {
            if (result === 'ok') toast.success('Bling conectado com sucesso!');
            else toast.error('Não foi possível conectar o Bling: ' + (params.get('msg') || 'erro desconhecido'));
            window.history.replaceState({}, '', window.location.pathname);
        }
        loadStatus();
    }, []);

    const handleConnect = async () => {
        setConnecting(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const { data, error } = await supabase.functions.invoke('bling-auth-start', {
                body: { returnTo: window.location.origin },
                headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            window.location.href = data.url;
        } catch (error: any) {
            toast.error('Erro ao conectar com o Bling: ' + error.message);
            setConnecting(false);
        }
    };

    const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

    return (
        <Card>
            <h3 className="font-semibold text-base sm:text-lg mb-1">Bling (Nota Fiscal de Serviço)</h3>
            <p className="text-sm text-gray-500 mb-4">
                Conecte sua conta do Bling para emitir NFS-e direto das ordens de serviço.
            </p>
            {status?.connected ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <span className="inline-flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle2 className="w-5 h-5" />
                        Conectado desde {fmt(status.connected_at)}
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={handleConnect} disabled={connecting}>
                        {connecting ? 'Abrindo...' : 'Reconectar'}
                    </Button>
                </div>
            ) : (
                <Button type="button" onClick={handleConnect} disabled={connecting}>
                    <Link2 className="w-5 h-5 mr-2" />
                    {connecting ? 'Abrindo o Bling...' : 'Conectar Bling'}
                </Button>
            )}
        </Card>
    );
}
