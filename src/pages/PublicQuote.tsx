import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Calendar } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { PublicBudget } from '../components/PublicBudget';
import { supabase } from '../lib/supabase';

export default function PublicQuote() {
    const { token } = useParams<{ token: string }>();
    const [quote, setQuote] = useState<any>(null);
    const [notFound, setNotFound] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [error, setError] = useState('');

    const fetchQuote = useCallback(async () => {
        if (!token) return;
        const { data, error } = await supabase.rpc('get_public_quote', { p_token: token });
        if (error || !data || data.length === 0) {
            setNotFound(true);
            return;
        }
        setQuote(data[0]);
    }, [token]);

    useEffect(() => {
        fetchQuote();
    }, [fetchQuote]);

    const approveQuote = async () => {
        if (!token) return;
        try {
            setIsApproving(true);
            const { data: success, error } = await supabase.rpc('approve_public_quote', { p_token: token });
            if (error) throw error;
            if (!success) {
                setError('Não foi possível aprovar o orçamento. Recarregue a página e tente novamente.');
                return;
            }
            await fetchQuote();
        } catch (err: any) {
            console.error('Error approving quote:', err);
            setError('Erro ao aprovar orçamento: ' + err.message);
        } finally {
            setIsApproving(false);
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
                    <p className="text-gray-600">Orçamento não encontrado ou link inválido.</p>
                </Card>
            </div>
        );
    }

    if (!quote) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-cyan mx-auto"></div>
                    <p className="mt-4 text-gray-600">Carregando...</p>
                </div>
            </div>
        );
    }

    const isConverted = quote.status === 'convertido';
    const isRejected = quote.status === 'recusado';

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-cyan/5 to-primary-green/5 py-8 px-4">
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="text-center mb-2">
                    <img src="/logo-full.jpg" alt="Dantas Info" className="h-16 mx-auto mb-4" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-dark">Orçamento</h1>
                    <p className="text-gray-500 mt-1">Orçamento #{quote.quote_number}{quote.customer_name ? ` · ${quote.customer_name}` : ''}</p>
                </div>

                <Card>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b pb-4 mb-4">
                        <div>
                            <h2 className="font-bold text-lg text-dark">{quote.company_name || 'Prestador de Serviço'}</h2>
                            {quote.company_cnpj && <p className="text-xs text-gray-500">CNPJ: {quote.company_cnpj}</p>}
                            {quote.company_address && <p className="text-xs text-gray-500 mt-0.5">{quote.company_address}</p>}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0">
                            <Calendar className="w-3.5 h-3.5" /> {new Date(quote.quote_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </div>
                    </div>

                    {quote.equipment && (
                        <p className="text-sm text-gray-700 mb-2"><span className="font-medium">Equipamento:</span> {quote.equipment}</p>
                    )}
                    {quote.notes && (
                        <p className="text-sm text-gray-700 whitespace-pre-line mb-2"><span className="font-medium">Observações:</span> {quote.notes}</p>
                    )}
                    {quote.valid_until && (
                        <p className="text-sm text-gray-500">Válido até {new Date(quote.valid_until + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                    )}
                </Card>

                {isConverted && (
                    <Card className="bg-green-50 border-green-200 flex items-center gap-3">
                        <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
                        <div>
                            <p className="font-semibold text-green-700">Este orçamento já foi confirmado e está em andamento.</p>
                            <p className="text-sm text-green-600">Qualquer dúvida, entre em contato com a assistência.</p>
                        </div>
                    </Card>
                )}

                {isRejected && (
                    <Card className="bg-gray-50 border-gray-200 text-sm text-gray-600">
                        Este orçamento foi marcado como recusado. Entre em contato caso queira revisá-lo.
                    </Card>
                )}

                <PublicBudget
                    items={quote.items || []}
                    services={quote.services || []}
                    discountType={quote.discount_type || 'fixed'}
                    discountValue={quote.discount_value || 0}
                    freight={quote.other_costs || 0}
                    urgencyFee={0}
                    budgetApprovedAt={quote.approved_at}
                    canApprove={!isConverted && !isRejected}
                    isApproving={isApproving}
                    onApprove={approveQuote}
                    pixKey={quote.company_pix_key}
                    bankDetails={quote.company_bank_details}
                    companyPhone={quote.company_phone}
                    warrantyDays={quote.company_warranty_days}
                    warrantyText={quote.company_warranty_text}
                />

                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}
