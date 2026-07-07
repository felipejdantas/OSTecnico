import { supabase } from './supabase';

export type OrderStatus =
    | 'recebido'
    | 'em_diagnostico'
    | 'aguardando_aprovacao'
    | 'aguardando_peca'
    | 'em_reparo'
    | 'pronto'
    | 'entregue'
    | 'cancelado';

type StatusConfig = {
    label: string;
    shortLabel: string;
    color: string;
    dot: string;
    clientMessage: string;
};

export const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
    recebido: {
        label: 'Recebido',
        shortLabel: 'Recebido',
        color: 'bg-gray-100 text-gray-700',
        dot: 'bg-gray-400',
        clientMessage: 'Seu equipamento foi recebido em nossa assistência.',
    },
    em_diagnostico: {
        label: 'Em Diagnóstico',
        shortLabel: 'Diagnóstico',
        color: 'bg-blue-100 text-blue-700',
        dot: 'bg-blue-500',
        clientMessage: 'Nosso técnico está analisando o equipamento.',
    },
    aguardando_aprovacao: {
        label: 'Aguardando Aprovação do Orçamento',
        shortLabel: 'Orçamento',
        color: 'bg-amber-100 text-amber-700',
        dot: 'bg-amber-500',
        clientMessage: 'Enviamos um orçamento e aguardamos sua aprovação.',
    },
    aguardando_peca: {
        label: 'Aguardando Peça',
        shortLabel: 'Aguard. Peça',
        color: 'bg-orange-100 text-orange-700',
        dot: 'bg-orange-500',
        clientMessage: 'Estamos aguardando a chegada de uma peça para continuar o reparo.',
    },
    em_reparo: {
        label: 'Em Reparo',
        shortLabel: 'Em Reparo',
        color: 'bg-cyan-100 text-cyan-700',
        dot: 'bg-cyan-500',
        clientMessage: 'Seu equipamento está em reparo.',
    },
    pronto: {
        label: 'Pronto para Retirada',
        shortLabel: 'Pronto',
        color: 'bg-green-100 text-green-700',
        dot: 'bg-green-500',
        clientMessage: 'Seu equipamento está pronto para retirada!',
    },
    entregue: {
        label: 'Entregue',
        shortLabel: 'Entregue',
        color: 'bg-emerald-100 text-emerald-700',
        dot: 'bg-emerald-600',
        clientMessage: 'Equipamento entregue. Obrigado pela confiança!',
    },
    cancelado: {
        label: 'Cancelado',
        shortLabel: 'Cancelado',
        color: 'bg-red-100 text-red-700',
        dot: 'bg-red-500',
        clientMessage: 'O atendimento foi cancelado.',
    },
};

// Linear order used for the client-facing progress stepper (cancelado is shown separately).
export const STATUS_STEPS: OrderStatus[] = [
    'recebido',
    'em_diagnostico',
    'aguardando_aprovacao',
    'aguardando_peca',
    'em_reparo',
    'pronto',
    'entregue',
];

export function getStatusConfig(status: string): StatusConfig {
    return STATUS_CONFIG[status as OrderStatus] ?? STATUS_CONFIG.recebido;
}

/**
 * Updates a service order's status and appends the change to status_history
 * in one place, so every status change (Dashboard quick action, EditOS save)
 * produces a consistent timeline the client can follow on their tracking link.
 */
export async function changeOrderStatus(orderId: string, newStatus: OrderStatus, note?: string) {
    const updates: { status: OrderStatus; completed_date?: string } = { status: newStatus };

    // Auto-fill the completion date the first time an order reaches "pronto"/"entregue",
    // without clobbering a date the technician may have already set manually.
    if (newStatus === 'pronto' || newStatus === 'entregue') {
        const { data: existing } = await supabase
            .from('service_orders')
            .select('completed_date')
            .eq('id', orderId)
            .single();
        if (!existing?.completed_date) {
            updates.completed_date = new Date().toISOString().slice(0, 10);
        }
    }

    const { error: updateError } = await supabase
        .from('service_orders')
        .update(updates)
        .eq('id', orderId);

    if (updateError) throw updateError;

    const { error: historyError } = await supabase
        .from('status_history')
        .insert([{ service_order_id: orderId, status: newStatus, note: note || null }]);

    if (historyError) throw historyError;
}
