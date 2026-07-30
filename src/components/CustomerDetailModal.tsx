import { X, FileText, Edit2, Trash2 } from 'lucide-react';
import { Card } from './ui/Card';
import { DropdownMenu } from './ui/DropdownMenu';

type Customer = {
    id: string;
    name: string;
    person_type: string;
    cpf?: string | null;
    cnpj?: string | null;
    company_name?: string | null;
    trade_name?: string | null;
    state_registration?: string | null;
    municipal_registration?: string | null;
    phone?: string | null;
    email?: string | null;
    cep?: string | null;
    address?: string | null;
    number?: string | null;
    complement?: string | null;
};

interface Props {
    customer: Customer;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onViewHistory: () => void;
}

// A field's displayed value, or the same muted "not registered" placeholder
// the reference layout uses — never blank, so an empty field still reads as
// "checked, nothing there" instead of looking broken.
function Field({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <p className="text-xs text-gray-400">{label}:</p>
            <p className={value ? 'text-sm text-gray-800' : 'text-sm text-gray-400'}>{value || 'Não cadastrado'}</p>
        </div>
    );
}

export function CustomerDetailModal({ customer: c, onClose, onEdit, onDelete, onViewHistory }: Props) {
    const isJuridica = c.person_type === 'juridica';
    const hasAddress = !!(c.address || c.cep);

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <Card className="max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-6">
                    <h2 className="text-2xl font-bold text-dark">{c.trade_name || c.name}</h2>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <DropdownMenu
                            items={[
                                { label: 'Atualizar', icon: <Edit2 className="w-4 h-4" />, onClick: onEdit },
                                { label: 'Excluir', icon: <Trash2 className="w-4 h-4" />, onClick: onDelete, variant: 'danger' as const },
                            ]}
                            triggerClassName="rounded-full"
                        />
                        <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-4">
                        <div className="border border-gray-100 rounded-xl p-4">
                            <h3 className="font-semibold text-primary-cyan mb-3">Dados Cadastrais</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Nome" value={c.name} />
                                <Field label="Tipo de pessoa" value={isJuridica ? 'Pessoa Jurídica' : 'Pessoa Física'} />
                                <Field label={isJuridica ? 'CPF do Responsável' : 'CPF'} value={c.cpf} />
                                {isJuridica && <Field label="CNPJ" value={c.cnpj} />}
                                {isJuridica && <Field label="Razão Social" value={c.company_name} />}
                                {isJuridica && <Field label="Nome Fantasia" value={c.trade_name} />}
                                {isJuridica && <Field label="Inscrição Estadual" value={c.state_registration} />}
                                {isJuridica && <Field label="Inscrição Municipal" value={c.municipal_registration} />}
                            </div>
                        </div>

                        <div className="border border-gray-100 rounded-xl p-4">
                            <h3 className="font-semibold text-primary-cyan mb-3">Contatos</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Celular" value={c.phone} />
                                <Field label="E-mail" value={c.email} />
                            </div>
                        </div>

                        <div className="border border-gray-100 rounded-xl p-4">
                            <h3 className="font-semibold text-primary-cyan mb-3">Endereço</h3>
                            {hasAddress ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <Field label="Endereço" value={c.address} />
                                    </div>
                                    <Field label="Número" value={c.number} />
                                    <Field label="Complemento" value={c.complement} />
                                    <Field label="CEP" value={c.cep} />
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400">Não possui endereço cadastrado.</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <button
                            type="button"
                            onClick={onViewHistory}
                            className="w-full text-left border border-gray-100 rounded-xl p-4 hover:border-primary-cyan hover:bg-primary-cyan/5 transition-colors"
                        >
                            <h3 className="font-semibold text-primary-cyan mb-2 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Ordens de Serviço
                            </h3>
                            <p className="text-xs text-gray-500">
                                Veja o histórico de ordens de serviço e produtos utilizados por este cliente.
                            </p>
                        </button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
