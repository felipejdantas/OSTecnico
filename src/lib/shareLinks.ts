export function buildTrackingLink(token: string) {
    return `${window.location.origin}/assinar/${token}`;
}

export function buildTrackingMessage(customerName: string, osNumber: number, link: string) {
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
