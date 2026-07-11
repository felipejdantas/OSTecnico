export function buildTrackingLink(token: string) {
    return `${window.location.origin}/assinar/${token}`;
}

export type TrackingMessageContext = 'approval' | 'signature' | 'tracking';

export function buildTrackingMessage(customerName: string, osNumber: number, link: string, context: TrackingMessageContext = 'tracking') {
    if (context === 'approval') {
        return `Olá ${customerName}! O orçamento da sua Ordem de Serviço #${osNumber} está pronto. Por favor, acesse o link para revisar e aprovar: ${link}`;
    }
    if (context === 'signature') {
        return `Olá ${customerName}! Por favor, acesse o link para revisar e assinar sua Ordem de Serviço #${osNumber}: ${link}`;
    }
    return `Olá ${customerName}! Você pode acompanhar o andamento da sua Ordem de Serviço #${osNumber} pelo link: ${link}`;
}

export function openWhatsApp(phone: string, message: string) {
    const digits = phone.replace(/\D/g, '');
    const withCountryCode = digits.startsWith('55') ? digits : `55${digits}`;
    window.open(`https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`, '_blank');
}

export function openEmail(email: string, osNumber: number, message: string) {
    const subject = `Acompanhe sua Ordem de Serviço #${osNumber}`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}
