import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Check, X, Minus } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SignaturePad, type SignaturePadRef } from '../components/SignaturePad';
import { ImageViewer } from '../components/ImageViewer';
import { StatusTimeline } from '../components/StatusTimeline';
import { supabase } from '../lib/supabase';
import { getStatusConfig } from '../lib/orderStatus';

// Helper component for checklist items
const ChecklistView = ({ title, items }: { title: string, items: any[] }) => {
    if (!items || items.length === 0) return null;
    return (
        <div className="mb-4">
            <h4 className="font-medium text-gray-700 mb-2">{title}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((item: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded-lg">
                        {item.status === 'ok' && <Check className="w-4 h-4 text-green-500" />}
                        {item.status === 'defect' && <X className="w-4 h-4 text-red-500" />}
                        {item.status === 'na' && <Minus className="w-4 h-4 text-gray-400" />}
                        <span className="text-gray-700">{item.label}</span>
                        {item.observation && (
                            <span className="text-xs text-gray-500 italic ml-auto">({item.observation})</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

type HistoryEntry = { status: string; note: string | null; created_at: string };

export default function ClientSignature() {
    const { token } = useParams<{ token: string }>();
    const [os, setOs] = useState<any>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [cpf, setCpf] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [notFound, setNotFound] = useState(false);
    const [justSigned, setJustSigned] = useState(false);
    const sigPadRef = useRef<SignaturePadRef>(null);

    const fetchOrder = useCallback(async () => {
        if (!token) return null;
        const { data, error } = await supabase.rpc('get_public_order', { p_token: token });

        if (error || !data || data.length === 0) {
            setNotFound(true);
            return null;
        }

        const order = data[0];
        setOs(order);
        return order;
    }, [token]);

    const fetchHistory = useCallback(async () => {
        if (!token) return;
        const { data } = await supabase.rpc('get_public_order_history', { p_token: token });
        setHistory(data || []);
    }, [token]);

    useEffect(() => {
        (async () => {
            const order = await fetchOrder();
            if (order) await fetchHistory();
        })();
    }, [fetchOrder, fetchHistory]);

    // Live-update the tracking page whenever the shop posts a new status update
    useEffect(() => {
        if (!os?.id) return;

        const channel = supabase
            .channel(`status-history-${os.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'status_history', filter: `service_order_id=eq.${os.id}` },
                async () => {
                    await fetchOrder();
                    await fetchHistory();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [os?.id]);

    const verifyCPF = async () => {
        if (!token) return;
        setIsVerifying(true);
        setError('');
        try {
            const { data, error } = await supabase.rpc('verify_order_cpf', { p_token: token, p_cpf: cpf });
            if (error) throw error;
            if (data) {
                setIsVerified(true);
            } else {
                setError('CPF incorreto. Por favor, verifique e tente novamente.');
            }
        } catch (err) {
            setError('Não foi possível verificar o CPF. Tente novamente.');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleSubmit = async () => {
        if (!token || !os) return;
        if (!sigPadRef.current?.toDataURL() || sigPadRef.current.isEmpty()) {
            setError('Por favor, assine no campo acima.');
            return;
        }

        try {
            setIsSubmitting(true);
            setError('');

            const signatureData = sigPadRef.current.toDataURL();
            const res = await fetch(signatureData);
            const blob = await res.blob();
            const file = new File([blob], 'client-signature.png', { type: 'image/png' });

            const filePath = `client-${crypto.randomUUID()}.png`;
            const { error: uploadError } = await supabase.storage.from('os-images').upload(filePath, file);
            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('os-images').getPublicUrl(filePath);

            const { data: success, error: signError } = await supabase.rpc('sign_public_order', {
                p_token: token,
                p_cpf: cpf,
                p_signature_url: urlData.publicUrl,
            });

            if (signError) throw signError;
            if (!success) {
                setError('Não foi possível confirmar a assinatura. Verifique o CPF e tente novamente.');
                return;
            }

            setJustSigned(true);
            await fetchOrder();
            await fetchHistory();
        } catch (err: any) {
            console.error('Error submitting signature:', err);
            setError('Erro ao salvar assinatura: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (notFound) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-10 h-10 text-red-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-dark mb-2">Link Inválido</h2>
                    <p className="text-gray-600">Ordem de serviço não encontrada ou link inválido.</p>
                </Card>
            </div>
        );
    }

    if (!os) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-cyan mx-auto"></div>
                    <p className="mt-4 text-gray-600">Carregando...</p>
                </div>
            </div>
        );
    }

    const needsSignature = !os.client_signed_at;
    const statusConfig = getStatusConfig(os.status);

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-cyan/5 to-primary-green/5 py-8 px-4">
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Logo / Header */}
                <div className="text-center mb-2">
                    <img src="/logo-full.jpg" alt="Dantas Info" className="h-16 mx-auto mb-4" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-dark">Acompanhe sua Ordem de Serviço</h1>
                    <p className="text-gray-500 mt-1">OS #{os.os_number} · {os.customer_name}</p>
                </div>

                {justSigned && (
                    <Card className="bg-green-50 border-green-200 flex items-center gap-3">
                        <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
                        <div>
                            <p className="font-semibold text-green-700">Assinatura confirmada!</p>
                            <p className="text-sm text-green-600">Acompanhe abaixo o andamento do seu equipamento.</p>
                        </div>
                    </Card>
                )}

                {needsSignature && !justSigned && (
                    !isVerified ? (
                        <Card>
                            <h2 className="text-xl font-bold text-dark mb-4">Verificação de Identidade</h2>
                            <p className="text-gray-600 mb-6">
                                Para assinar a ordem de serviço, por favor confirme seu CPF.
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">CPF</label>
                                    <input
                                        type="text"
                                        value={cpf}
                                        onChange={(e) => setCpf(e.target.value)}
                                        placeholder="000.000.000-00"
                                        maxLength={14}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 bg-white text-lg"
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                        {error}
                                    </div>
                                )}

                                <Button onClick={verifyCPF} size="lg" className="w-full" disabled={isVerifying}>
                                    {isVerifying ? 'Verificando...' : 'Verificar CPF'}
                                </Button>
                            </div>
                        </Card>
                    ) : (
                        <Card>
                            <h2 className="text-xl font-bold text-dark mb-4">Sua Assinatura</h2>
                            <p className="text-gray-600 mb-4 text-sm">
                                Declaro que as informações abaixo conferem com o estado do equipamento entregue e autorizo a realização do serviço.
                            </p>
                            <SignaturePad ref={sigPadRef} />

                            {error && (
                                <div className="p-3 mt-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                    {error}
                                </div>
                            )}

                            <Button onClick={handleSubmit} size="lg" className="w-full mt-4" disabled={isSubmitting}>
                                {isSubmitting ? 'Salvando...' : 'Confirmar Assinatura'}
                            </Button>
                        </Card>
                    )
                )}

                {/* Current status */}
                <Card className={statusConfig.color.replace('text-', 'border-').split(' ')[0] + ' border'}>
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Status Atual</p>
                    <p className="text-2xl font-bold text-dark">{statusConfig.label}</p>
                    <p className="text-sm text-gray-600 mt-1">{statusConfig.clientMessage}</p>
                </Card>

                {/* Timeline */}
                <Card>
                    <StatusTimeline currentStatus={os.status} history={history} />
                </Card>

                {/* OS Details */}
                <Card>
                    <h2 className="text-xl font-bold text-dark mb-4 border-b pb-2">Detalhes da Ordem de Serviço</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div className="space-y-3 text-sm">
                            <h3 className="font-semibold text-gray-900">Informações Gerais</h3>
                            <div className="flex justify-between border-b border-gray-100 pb-1">
                                <span className="text-gray-600">Nº OS:</span>
                                <span className="font-bold text-primary-cyan">#{os.os_number}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-1">
                                <span className="text-gray-600">Cliente:</span>
                                <span className="font-medium">{os.customer_name}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-1">
                                <span className="text-gray-600">Data:</span>
                                <span className="font-medium">{new Date(os.created_at).toLocaleDateString('pt-BR')}</span>
                            </div>
                        </div>

                        <div className="space-y-3 text-sm">
                            <h3 className="font-semibold text-gray-900">Equipamento</h3>
                            <div className="flex justify-between border-b border-gray-100 pb-1">
                                <span className="text-gray-600">Modelo:</span>
                                <span className="font-medium">{os.equipment}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-1">
                                <span className="text-gray-600">Série:</span>
                                <span className="font-medium">{os.serial_number || 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mb-6">
                        <h3 className="font-semibold text-gray-900 mb-2">Descrição do Problema</h3>
                        <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700">
                            {os.problem_description}
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <h3 className="font-semibold text-lg text-dark mb-4">Checklist de Entrada</h3>
                        <ChecklistView title="Estado Físico" items={os.physical_condition} />
                        <ChecklistView title="Condição de Funcionamento" items={os.operating_condition} />
                        <ChecklistView title="Testes Técnicos" items={os.technical_tests} />
                    </div>

                    {os.accessories_received && (
                        <div className="border-t pt-4 mb-4">
                            <h3 className="font-semibold text-gray-900 mb-2">Acessórios Recebidos</h3>
                            <div className="flex flex-wrap gap-2">
                                {os.accessories_received.fonte && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Fonte</span>}
                                {os.accessories_received.cabo && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Cabo de Força</span>}
                                {os.accessories_received.mochila && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Mochila/Case</span>}
                                {os.accessories_received.outro && <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">{os.accessories_received.outro}</span>}
                            </div>
                        </div>
                    )}

                    {os.photos && os.photos.length > 0 && (
                        <div className="border-t pt-4">
                            <h3 className="font-semibold text-gray-900 mb-2">Fotos do Equipamento</h3>
                            <ImageViewer images={os.photos} />
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
