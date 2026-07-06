import { CheckCircle, Circle, XCircle } from 'lucide-react';
import { STATUS_STEPS, STATUS_CONFIG, type OrderStatus } from '../lib/orderStatus';

type HistoryEntry = { status: string; note: string | null; created_at: string };

type Props = {
    currentStatus: string;
    history: HistoryEntry[];
};

export function StatusTimeline({ currentStatus, history }: Props) {
    if (currentStatus === 'cancelado') {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                <p className="font-semibold text-red-700">Este atendimento foi cancelado.</p>
            </div>
        );
    }

    const currentIndex = STATUS_STEPS.indexOf(currentStatus as OrderStatus);
    const findDate = (status: string) => history.find(h => h.status === status)?.created_at;

    return (
        <div className="space-y-8">
            {/* Stepper */}
            <div className="flex items-start overflow-x-auto pb-2 -mx-1 px-1">
                {STATUS_STEPS.map((step, index) => {
                    const isDone = index < currentIndex;
                    const isCurrent = index === currentIndex;
                    const date = findDate(step);
                    return (
                        <div key={step} className="flex-1 min-w-[92px] flex flex-col items-center text-center relative">
                            {index > 0 && (
                                <div
                                    className={`absolute top-3 right-1/2 w-full h-0.5 ${index <= currentIndex ? 'bg-primary-cyan' : 'bg-gray-200'}`}
                                />
                            )}
                            <div
                                className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center ${isDone
                                        ? 'bg-primary-cyan text-white'
                                        : isCurrent
                                            ? 'bg-primary-cyan text-white ring-4 ring-primary-cyan/20'
                                            : 'bg-gray-200 text-gray-400'
                                    }`}
                            >
                                {isDone ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-3 h-3" />}
                            </div>
                            <span className={`mt-2 text-[11px] font-medium leading-tight ${isCurrent ? 'text-primary-cyan' : isDone ? 'text-dark' : 'text-gray-400'}`}>
                                {STATUS_CONFIG[step].shortLabel}
                            </span>
                            {date && (
                                <span className="text-[10px] text-gray-400">
                                    {new Date(date).toLocaleDateString('pt-BR')}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* History log */}
            <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Histórico de Atualizações</h4>
                {history.length === 0 ? (
                    <p className="text-sm text-gray-400">Nenhuma atualização registrada ainda.</p>
                ) : (
                    [...history].reverse().map((entry, i) => {
                        const cfg = STATUS_CONFIG[entry.status as OrderStatus];
                        return (
                            <div key={i} className="flex gap-3">
                                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${cfg?.dot || 'bg-gray-400'}`} />
                                <div>
                                    <p className="text-sm font-medium text-dark">{cfg?.label || entry.status}</p>
                                    {entry.note && <p className="text-xs text-gray-500">{entry.note}</p>}
                                    <p className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleString('pt-BR')}</p>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
