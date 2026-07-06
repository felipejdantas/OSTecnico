import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FileText, User, Calendar, Star, PenTool, FileDown, Edit, Copy, Trash2, MessageCircle, Mail } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { DropdownMenu } from '../components/ui/DropdownMenu';

import { supabase } from '../lib/supabase';
import { generateOSPDF } from '../lib/pdfGenerator';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { STATUS_STEPS, STATUS_CONFIG, getStatusConfig, changeOrderStatus, type OrderStatus } from '../lib/orderStatus';
import { buildTrackingLink, buildTrackingMessage, openWhatsApp, openEmail } from '../lib/shareLinks';

type ServiceOrder = {
    id: string;
    os_number: number;
    created_at: string;
    equipment: string;
    status: OrderStatus;
    customers: { name: string; phone: string | null; email: string | null } | null;
    technicians: { name: string } | null;
    is_pinned: boolean;
    signature_token: string;
    client_signed_at: string | null;
};

export default function Dashboard() {
    const { user } = useAuth();
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (user) fetchOrders();
    }, [user]);

    const fetchOrders = async () => {
        if (!user) return;

        try {
            const { data, error } = await supabase
                .from('service_orders')
                .select(`
          id,
          os_number,
          created_at,
          equipment,
          status,
          is_pinned,
          signature_token,
          client_signed_at,
          customers (name, phone, email),
          technicians (name)
        `)
                .eq('user_id', user.id)
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            setOrders((data as any) || []);
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const togglePin = async (id: string, currentPinned: boolean) => {
        try {
            const { error } = await supabase
                .from('service_orders')
                .update({
                    is_pinned: !currentPinned,
                    pinned_at: !currentPinned ? new Date().toISOString() : null
                })
                .eq('id', id);

            if (error) throw error;
            fetchOrders();
        } catch (error) {
            console.error('Error toggling pin:', error);
            toast.error('Erro ao fixar/desafixar OS');
        }
    };

    const copySignatureLink = (token: string) => {
        const link = `${window.location.origin}/assinar/${token}`;
        navigator.clipboard.writeText(link);
        toast.success('Link de assinatura copiado!');
    };

    const deleteOS = async (orderId: string, osNumber: number) => {
        if (!user || !confirm(`Tem certeza que deseja excluir a OS #${osNumber}?`)) return;

        try {
            const { error } = await supabase
                .from('service_orders')
                .delete()
                .eq('id', orderId)
                .eq('user_id', user.id);

            if (error) throw error;
            toast.success('OS excluída com sucesso!');
            fetchOrders();
        } catch (error: any) {
            console.error('Error deleting OS:', error);
            toast.error('Erro ao excluir OS: ' + error.message);
        }
    };

    const duplicateOS = async (orderId: string) => {
        if (!user || !confirm('Tem certeza que deseja duplicar esta OS?')) return;

        try {
            // 1. Fetch original OS data
            const { data: originalOS, error: fetchError } = await supabase
                .from('service_orders')
                .select('*')
                .eq('id', orderId)
                .eq('user_id', user.id)
                .single();

            if (fetchError) throw fetchError;

            // 2. Prepare new OS object
            // Explicitly destructure to remove system fields
            const {
                id,
                created_at,
                os_number,
                signature_token,
                client_signed_at,
                client_signature_url,
                is_pinned,
                pinned_at,
                updated_at, // If exists
                user_id, // Let the database assign the current user
                ...osData
            } = originalOS;

            // 3. Insert new OS
            const { error: insertError } = await supabase
                .from('service_orders')
                .insert([{
                    ...osData,
                    user_id: user.id,
                    status: 'pendente',
                    // Ensure arrays are copied correctly
                    physical_condition: osData.physical_condition || [],
                    operating_condition: osData.operating_condition || [],
                    technical_tests: osData.technical_tests || [],
                    photos: osData.photos || [],
                }]);

            if (insertError) throw insertError;

            toast.success('OS duplicada com sucesso!');
            fetchOrders();

        } catch (error: any) {
            console.error('Error duplicating OS:', error);
            toast.error('Erro ao duplicar OS: ' + (error.message || 'Erro desconhecido'));
        }
    };

    const exportPDF = async (orderId: string) => {
        if (!user) return;

        try {
            const { data, error } = await supabase
                .from('service_orders')
                .select(`
          *,
          customers (name, cpf, phone),
          technicians (name)
        `)
                .eq('id', orderId)
                .eq('user_id', user.id)
                .single();

            if (error) throw error;

            console.log('PDF Data:', data); // Debug log

            await generateOSPDF({
                os_number: data.os_number,
                created_at: data.created_at,
                customer: data.customers, // This should be an object {name, cpf, phone}
                technician: data.technicians, // This should be an object {name}
                equipment: data.equipment,
                serial_number: data.serial_number,
                problem_description: data.problem_description,
                physical_condition: data.physical_condition || [],
                operating_condition: data.operating_condition || [],
                technical_tests: data.technical_tests || [],
                accessories_received: data.accessories_received || { fonte: false, cabo: false, mochila: false, outro: '' },
                technician_observation: data.technician_observation,
                status: data.status,
                client_signed_at: data.client_signed_at,
                photos: data.photos || [], // Pass photos to PDF generator
            });
        } catch (error: any) {
            console.error('Error exporting PDF:', error);
            toast.error('Erro ao gerar PDF: ' + (error.message || 'Verifique o console para mais detalhes'));
        }
    };

    const quickChangeStatus = async (orderId: string, newStatus: OrderStatus) => {
        try {
            await changeOrderStatus(orderId, newStatus);
            toast.success('Status atualizado!');
            fetchOrders();
        } catch (error: any) {
            toast.error('Erro ao atualizar status: ' + error.message);
        }
    };

    const shareViaWhatsApp = (order: ServiceOrder) => {
        if (!order.customers?.phone) {
            toast.error('Cliente sem telefone cadastrado');
            return;
        }
        const link = buildTrackingLink(order.signature_token);
        const message = buildTrackingMessage(order.customers.name, order.os_number, link);
        openWhatsApp(order.customers.phone, message);
    };

    const shareViaEmail = (order: ServiceOrder) => {
        if (!order.customers?.email) {
            toast.error('Cliente sem e-mail cadastrado');
            return;
        }
        const link = buildTrackingLink(order.signature_token);
        const message = buildTrackingMessage(order.customers.name, order.os_number, link);
        openEmail(order.customers.email, order.os_number, message);
    };

    const stats = {
        total: orders.length,
        emAndamento: orders.filter(o => !['pronto', 'entregue', 'cancelado'].includes(o.status)).length,
        pronto: orders.filter(o => o.status === 'pronto').length,
        entregue: orders.filter(o => o.status === 'entregue').length,
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-dark">Dashboard</h2>
                    <p className="text-sm sm:text-base text-gray-500">Visão geral das ordens de serviço</p>
                </div>
                <Button onClick={() => navigate('/nova-os')}>
                    Nova Ordem de Serviço
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Card className="bg-gradient-to-br from-primary-cyan/10 to-primary-cyan/5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs sm:text-sm text-gray-600">Total de OS</p>
                            <p className="text-2xl sm:text-3xl font-bold text-primary-cyan">{stats.total}</p>
                        </div>
                        <FileText className="w-8 h-8 sm:w-10 sm:h-10 text-primary-cyan opacity-50" />
                    </div>
                </Card>

                <Card className="bg-gradient-to-br from-blue-100/50 to-blue-50/30">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs sm:text-sm text-gray-600">Em Andamento</p>
                            <p className="text-2xl sm:text-3xl font-bold text-blue-700">{stats.emAndamento}</p>
                        </div>
                        <FileText className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600 opacity-50" />
                    </div>
                </Card>

                <Card className="bg-gradient-to-br from-green-100/50 to-green-50/30">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs sm:text-sm text-gray-600">Prontos p/ Retirada</p>
                            <p className="text-2xl sm:text-3xl font-bold text-green-700">{stats.pronto}</p>
                        </div>
                        <FileText className="w-8 h-8 sm:w-10 sm:h-10 text-green-600 opacity-50" />
                    </div>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-100/50 to-emerald-50/30">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs sm:text-sm text-gray-600">Entregues</p>
                            <p className="text-2xl sm:text-3xl font-bold text-emerald-700">{stats.entregue}</p>
                        </div>
                        <FileText className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-600 opacity-50" />
                    </div>
                </Card>
            </div>

            {/* Orders List */}
            <Card>
                <h3 className="font-semibold text-lg mb-4">Ordens de Serviço Recentes</h3>

                {loading ? (
                    <p className="text-center text-gray-500 py-8">Carregando...</p>
                ) : orders.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Nenhuma ordem de serviço cadastrada</p>
                ) : (
                    <div className="space-y-3">
                        {orders.map((order) => {
                            const statusConfig = getStatusConfig(order.status);

                            return (
                                <div
                                    key={order.id}
                                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl hover:shadow-md transition-all ${order.is_pinned ? 'border-primary-cyan bg-primary-cyan/5' : 'border-gray-200'
                                        }`}
                                >
                                    <div className="flex items-start gap-4 flex-1 mb-3 sm:mb-0">
                                        <div className="w-12 h-12 rounded-full bg-primary-cyan/10 flex items-center justify-center flex-shrink-0">
                                            <FileText className="w-6 h-6 text-primary-cyan" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <span className="font-bold text-primary-cyan text-lg">OS #{order.os_number}</span>
                                                <select
                                                    value={order.status}
                                                    onChange={(e) => quickChangeStatus(order.id, e.target.value as OrderStatus)}
                                                    className={`px-2 py-0.5 rounded-full text-xs font-medium border-none cursor-pointer ${statusConfig.color}`}
                                                    title="Alterar status"
                                                >
                                                    {STATUS_STEPS.map(s => (
                                                        <option key={s} value={s}>{STATUS_CONFIG[s].shortLabel}</option>
                                                    ))}
                                                    <option value="cancelado">{STATUS_CONFIG.cancelado.shortLabel}</option>
                                                </select>
                                                {order.is_pinned && (
                                                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                                )}
                                                {order.client_signed_at && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                        Assinado
                                                    </span>
                                                )}
                                            </div>

                                            {/* Customer name highlighted */}
                                            <div className="flex items-center gap-2 mb-1">
                                                <User className="w-4 h-4 text-primary-cyan" />
                                                <span className="font-semibold text-dark text-base">{order.customers?.name || 'N/A'}</span>
                                            </div>

                                            <p className="text-sm text-gray-600 mb-1">{order.equipment}</p>

                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-center gap-2 flex-wrap">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => togglePin(order.id, order.is_pinned)}
                                            className="touch-manipulation min-w-[40px]"
                                            title="Fixar/Desafixar"
                                        >
                                            <Star className={`w-4 h-4 ${order.is_pinned ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                                        </Button>

                                        {!order.client_signed_at && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => copySignatureLink(order.signature_token)}
                                                className="touch-manipulation min-w-[40px]"
                                                title="Copiar link do cliente"
                                            >
                                                <PenTool className="w-4 h-4" />
                                            </Button>
                                        )}

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => shareViaWhatsApp(order)}
                                            className="touch-manipulation min-w-[40px] text-green-600 border-green-200 hover:bg-green-50"
                                            title="Enviar link por WhatsApp"
                                        >
                                            <MessageCircle className="w-4 h-4" />
                                        </Button>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => shareViaEmail(order)}
                                            className="touch-manipulation min-w-[40px]"
                                            title="Enviar link por e-mail"
                                        >
                                            <Mail className="w-4 h-4" />
                                        </Button>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => exportPDF(order.id)}
                                            className="touch-manipulation min-w-[40px]"
                                            title="Exportar PDF"
                                        >
                                            <FileDown className="w-4 h-4" />
                                        </Button>

                                        <DropdownMenu
                                            items={[
                                                {
                                                    label: 'Atualizar',
                                                    icon: <Edit className="w-4 h-4" />,
                                                    onClick: () => navigate(`/editar-os/${order.id}`),
                                                },
                                                {
                                                    label: 'Duplicar',
                                                    icon: <Copy className="w-4 h-4" />,
                                                    onClick: () => duplicateOS(order.id),
                                                },
                                                {
                                                    label: 'Excluir',
                                                    icon: <Trash2 className="w-4 h-4" />,
                                                    onClick: () => deleteOS(order.id, order.os_number),
                                                    variant: 'danger' as const,
                                                },
                                            ]}
                                            triggerClassName="min-w-[40px]"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            <div className="flex justify-end">
                <Button onClick={() => navigate('/nova-os')}>
                    Nova Ordem de Serviço
                </Button>
            </div>
        </div>
    );
}
