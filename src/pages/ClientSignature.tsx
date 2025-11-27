import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Check, X, Minus } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SignaturePad, type SignaturePadRef } from '../components/SignaturePad';
import { supabase } from '../lib/supabase';

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

export default function ClientSignature() {
    const { token } = useParams<{ token: string }>();
    const [os, setOs] = useState<any>(null);
    const [customer, setCustomer] = useState<any>(null);
    const [cpf, setCpf] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const sigPadRef = useRef<SignaturePadRef>(null);

    useEffect(() => {
        if (token) {
            fetchOS();
        }
    }, [token]);

    const fetchOS = async () => {
        try {
            const { data, error } = await supabase
                .from('service_orders')
                .select(`
          *,
          customers (id, name, cpf, phone)
        `)
                .eq('signature_token', token)
                .single();

            if (error) throw error;

            if (data.client_signed_at) {
                setSuccess(true);
                return;
            }

            setOs(data);
            setCustomer(data.customers);
        } catch (error) {
            console.error('Error fetching OS:', error);
            setError('Ordem de serviço não encontrada ou link inválido.');
        }
    };

    const verifyCPF = () => {
        const cleanCPF = cpf.replace(/\D/g, '');
        const customerCPF = customer?.cpf?.replace(/\D/g, '');

        if (cleanCPF === customerCPF) {
            setIsVerified(true);
            setError('');
        } else {
            setError('CPF incorreto. Por favor, verifique e tente novamente.');
        }
    };

    const handleSubmit = async () => {
        if (!sigPadRef.current?.toDataURL()) {
            setError('Por favor, assine no campo acima.');
            return;
        }

        try {
            setIsSubmitting(true);

            // Convert signature to file
            const signatureData = sigPadRef.current.toDataURL();
            const res = await fetch(signatureData);
            const blob = await res.blob();
            const file = new File([blob], 'client-signature.png', { type: 'image/png' });

            // Upload signature
            const fileExt = 'png';
            const fileName = `client-${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('os-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('os-images').getPublicUrl(filePath);

            // Update OS with signature and change status
            const { error: updateError } = await supabase
                .from('service_orders')
                .update({
                    client_signature_url: urlData.publicUrl,
                    client_signed_at: new Date().toISOString(),
                    status: 'em_atendimento'
                })
                .eq('id', os.id);

            if (updateError) throw updateError;

            setSuccess(true);
        } catch (error: any) {
            console.error('Error submitting signature:', error);
            setError('Erro ao salvar assinatura: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-primary-green/10 to-primary-cyan/10 flex items-center justify-center p-4">
                <Card className="max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-dark mb-2">Assinatura Confirmada!</h2>
                    <p className="text-gray-600 mb-6">
                        Sua assinatura foi registrada com sucesso. A ordem de serviço está agora em atendimento.
                    </p>
                    <p className="text-sm text-gray-500">
                        Você pode fechar esta página.
                    </p>
                </Card>
            </div>
        );
    }

    if (error && !os) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-10 h-10 text-red-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-dark mb-2">Link Inválido</h2>
                    <p className="text-gray-600">{error}</p>
                </Card>
            </div>
        );
    }

    if (!os) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-green mx-auto"></div>
                    <p className="mt-4 text-gray-600">Carregando...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-green/5 to-primary-cyan/5 py-8 px-4">
            <div className="max-w-3xl mx-auto">
                {/* Logo */}
                <div className="text-center mb-8">
                    <img src="/logo.jpg" alt="Dantas Info" className="h-16 mx-auto mb-4" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-dark">Assinatura de Ordem de Serviço</h1>
                </div>

                {!isVerified ? (
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
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-lg"
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                    {error}
                                </div>
                            )}

                            <Button onClick={verifyCPF} size="lg" className="w-full">
                                Verificar CPF
                            </Button>
                        </div>
                    </Card>
                ) : (
                    <div className="space-y-6">
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
                                        <span className="font-medium">{customer?.name}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-100 pb-1">
                                        <span className="text-gray-600">Data:</span>
                                        <span className="font-medium">{new Date(os.created_at).toLocaleDateString()}</span>
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

                            {/* Checklists */}
                            <div className="border-t pt-4">
                                <h3 className="font-semibold text-lg text-dark mb-4">Checklist de Entrada</h3>
                                <ChecklistView title="Estado Físico" items={os.physical_condition} />
                                <ChecklistView title="Condição de Funcionamento" items={os.operating_condition} />
                                <ChecklistView title="Testes Técnicos" items={os.technical_tests} />
                            </div>

                            {/* Accessories */}
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

                            {/* Photos */}
                            {os.photos && os.photos.length > 0 && (
                                <div className="border-t pt-4">
                                    <h3 className="font-semibold text-gray-900 mb-2">Fotos do Equipamento</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {os.photos.map((url: string, index: number) => (
                                            <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                                                <img src={url} alt={`Foto ${index + 1}`} className="w-full h-24 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Card>

                        <Card>
                            <h2 className="text-xl font-bold text-dark mb-4">Sua Assinatura</h2>
                            <p className="text-gray-600 mb-4 text-sm">
                                Declaro que as informações acima conferem com o estado do equipamento entregue e autorizo a realização do serviço.
                            </p>
                            <SignaturePad ref={sigPadRef} />
                        </Card>

                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        <Button
                            onClick={handleSubmit}
                            size="lg"
                            className="w-full"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Salvando...' : 'Confirmar Assinatura'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
