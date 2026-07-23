import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, ArrowLeft, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { WarrantyBadge } from '../components/WarrantyBadge';
import { ImageUpload } from '../components/ImageUpload';
import { ImageViewer } from '../components/ImageViewer';

import ChecklistSection, { type ChecklistItem } from '../components/ChecklistSection';
import AccessoriesSection, { type AccessoriesData } from '../components/AccessoriesSection';
import ServiceOrderItemsSection, { type OrderItem } from '../components/ServiceOrderItemsSection';
import ServiceOrderServicesSection, { type OrderServiceLine } from '../components/ServiceOrderServicesSection';
import OrderBudgetSummary from '../components/OrderBudgetSummary';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { STATUS_STEPS, STATUS_CONFIG, getStatusConfig } from '../lib/orderStatus';
import type { DiscountType } from '../lib/orderFinance';
import { EQUIPMENT_TYPES } from './NewOS';

const osSchema = z.object({
    osNumber: z.string().optional(), // Allow editing OS number
    customerId: z.string().min(1, 'Selecione um cliente'),
    technicianId: z.string().min(1, 'Selecione um técnico'),
    equipmentType: z.string().optional(),
    brand: z.string().optional(),
    equipment: z.string().min(2, 'Modelo obrigatório'),
    serialNumber: z.string().optional(),
    problemDescription: z.string().min(10, 'Descreva o problema detalhadamente'),
    status: z.string(),
    technicianObservation: z.string().optional(),
    entryDate: z.string().min(1, 'Informe a data de entrada'),
    estimatedCompletionDate: z.string().optional(),
    completedDate: z.string().optional(),
    billingDate: z.string().optional(),
    warrantyDays: z.coerce.number().int('Deve ser um número inteiro').min(0, 'Valor inválido').optional(),
    warrantyNotes: z.string().optional(),
});

type OSFormInput = z.input<typeof osSchema>;
type OSForm = z.output<typeof osSchema>;

// Checklist items (same as NewOS)
const PHYSICAL_CONDITION_ITEMS = [
    'Tampa superior', 'Moldura da tela', 'Tela', 'Teclado', 'Touchpad', 'Dobradiças',
    'Carcaça inferior', 'Parafusos faltando', 'Portas USB', 'Porta HDMI / VGA', 'Porta de áudio (P2)',
];

const OPERATING_CONDITION_ITEMS = [
    'Liga normalmente', 'Bateria carrega', 'Bateria segura carga', 'Bateria estufada',
    'Desempenho lento/travando', 'Wi-Fi funciona', 'Bluetooth funciona', 'Som', 'Webcam',
];

const TECHNICAL_TESTS_ITEMS = [
    'Fonte funcionando', 'Tensão correta', 'RAM', 'SSD/HD (SMART)', 'Temperatura normal BIOS', 'Cooler funcionando',
];

export default function EditOS() {
    const { user } = useAuth();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);

    // State for checklists and accessories
    const [physicalCondition, setPhysicalCondition] = useState<ChecklistItem[]>([]);
    const [operatingCondition, setOperatingCondition] = useState<ChecklistItem[]>([]);
    const [technicalTests, setTechnicalTests] = useState<ChecklistItem[]>([]);
    const [accessories, setAccessories] = useState<AccessoriesData>({
        fonte: false, cabo: false, mochila: false, outro: '',
    });

    const [customers, setCustomers] = useState<any[]>([]);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [newImages, setNewImages] = useState<File[]>([]);
    const [existingPhotos, setExistingPhotos] = useState<{ url: string; date?: string }[]>([]);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [serviceLines, setServiceLines] = useState<OrderServiceLine[]>([]);
    const [discountType, setDiscountType] = useState<DiscountType>('fixed');
    const [discountValue, setDiscountValue] = useState(0);
    const [freight, setFreight] = useState(0);
    const [urgencyFee, setUrgencyFee] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [originalStatus, setOriginalStatus] = useState<string>('');

    // const sigPadRef = useRef<SignaturePadRef>(null);
    const { register, handleSubmit, control, formState: { errors }, setValue, watch } = useForm<OSFormInput, any, OSForm>({
        resolver: zodResolver(osSchema),
    });

    const watchedCompletedDate = watch('completedDate');
    const watchedWarrantyDays = watch('warrantyDays') as number | undefined;
    const watchedStatus = watch('status');
    // Once an OS is finished (pronto/entregue), everything except the status field itself
    // becomes read-only, to avoid accidental edits to a job that's already done. Changing
    // the status back is the only way to unlock it again.
    const isLocked = watchedStatus === 'pronto' || watchedStatus === 'entregue';

    useEffect(() => {
        if (user) fetchData();
    }, [id, user]);

    const fetchData = async () => {
        if (!user) return;

        try {
            // Fetch Customers and Technicians
            const { data: customersData } = await supabase.from('customers').select('*').eq('user_id', user.id).order('name');
            const { data: techniciansData } = await supabase.from('technicians').select('*').eq('user_id', user.id).order('name');

            if (customersData) setCustomers(customersData);
            if (techniciansData) setTechnicians(techniciansData);

            // Fetch OS Data
            const { data: os, error } = await supabase
                .from('service_orders')
                .select('*')
                .eq('id', id)
                .eq('user_id', user.id)
                .single();

            if (error) throw error;

            // Populate Form
            setValue('osNumber', os.os_number.toString());
            setValue('customerId', os.customer_id);
            setValue('technicianId', os.technician_id);
            setValue('equipmentType', os.equipment_type || '');
            setValue('brand', os.brand || '');
            setValue('equipment', os.equipment);
            setValue('serialNumber', os.serial_number || '');
            setValue('problemDescription', os.problem_description);
            setValue('status', os.status);
            setValue('technicianObservation', os.technician_observation || '');
            setValue('entryDate', os.entry_date || '');
            setValue('estimatedCompletionDate', os.estimated_completion_date || '');
            setValue('completedDate', os.completed_date || '');
            setValue('billingDate', os.billing_date || '');
            setValue('warrantyDays', os.warranty_days ?? undefined);
            setValue('warrantyNotes', os.warranty_notes || '');
            setOriginalStatus(os.status);
            setDiscountType((os.discount_type as DiscountType) || 'fixed');
            setDiscountValue(os.discount_value || 0);
            setFreight(os.freight || 0);
            setUrgencyFee(os.urgency_fee || 0);

            // Fetch parts/products used on this OS
            const { data: orderItems } = await supabase
                .from('service_order_items')
                .select('*')
                .eq('service_order_id', id);
            setItems((orderItems || []).map(i => ({
                id: i.id,
                product_id: i.product_id,
                product_name: i.product_name,
                quantity: i.quantity,
                unit_price: i.unit_price,
            })));

            // Fetch services performed on this OS
            const { data: orderServices } = await supabase
                .from('service_order_services')
                .select('*')
                .eq('service_order_id', id);
            setServiceLines((orderServices || []).map(s => ({
                id: s.id,
                service_id: s.service_id,
                service_name: s.service_name,
                description: s.description || '',
                quantity: s.quantity,
                price: s.price,
            })));

            // Populate Checklists (handle if null/empty by using defaults)
            setPhysicalCondition(os.physical_condition || PHYSICAL_CONDITION_ITEMS.map(label => ({ label, status: 'na', observation: '' })));
            setOperatingCondition(os.operating_condition || OPERATING_CONDITION_ITEMS.map(label => ({ label, status: 'na', observation: '' })));
            setTechnicalTests(os.technical_tests || TECHNICAL_TESTS_ITEMS.map(label => ({ label, status: 'na', observation: '' })));
            setAccessories(os.accessories_received || { fonte: false, cabo: false, mochila: false, outro: '' });

            // Populate Photos
            setExistingPhotos(os.photos || []);

        } catch (error) {
            console.error('Error fetching data:', error);
            alert('Erro ao carregar dados da OS.');
            navigate('/');
        } finally {
            setLoading(false);
        }
    };

    const uploadFile = async (file: File) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('os-images')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('os-images').getPublicUrl(filePath);
        return data.publicUrl;
    };

    const onSubmit = async (data: OSForm) => {
        if (!user) {
            alert('Erro: Usuário não autenticado');
            return;
        }

        try {
            setIsSubmitting(true);

            // Upload New Images
            const newImageUrls = await Promise.all(newImages.map(uploadFile));
            const uploadDate = new Date().toISOString();
            const allPhotos = [...existingPhotos, ...newImageUrls.map(url => ({ url, date: uploadDate }))];

            // Update OS
            const { error } = await supabase
                .from('service_orders')
                .update({
                    os_number: parseInt(data.osNumber || '0'),
                    customer_id: data.customerId,
                    technician_id: data.technicianId,
                    equipment_type: data.equipmentType,
                    brand: data.brand,
                    equipment: data.equipment,
                    serial_number: data.serialNumber,
                    problem_description: data.problemDescription,
                    physical_condition: physicalCondition,
                    operating_condition: operatingCondition,
                    technical_tests: technicalTests,
                    accessories_received: accessories,
                    technician_observation: data.technicianObservation,
                    photos: allPhotos,
                    status: data.status,
                    entry_date: data.entryDate,
                    estimated_completion_date: data.estimatedCompletionDate || null,
                    completed_date: data.completedDate || null,
                    billing_date: data.billingDate || null,
                    warranty_days: data.warrantyDays ?? null,
                    warranty_notes: data.warrantyNotes || null,
                    discount_type: discountType,
                    discount_value: discountValue,
                    freight: freight,
                    urgency_fee: urgencyFee,
                })
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) throw error;

            // Log the transition on the timeline the client sees, only when it actually changed
            if (data.status !== originalStatus) {
                await supabase.from('status_history').insert([{ service_order_id: id, status: data.status }]);
            }

            alert('Ordem de Serviço atualizada com sucesso!');
            navigate('/');

        } catch (error: any) {
            console.error('Error updating OS:', error);
            alert('Erro ao atualizar OS: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };



    if (loading) return <div className="flex justify-center p-8">Carregando...</div>;

    return (
        <div className="space-y-4 sm:space-y-6 pb-20">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" type="button" onClick={() => navigate('/')}>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Voltar
                        </Button>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xl sm:text-2xl font-bold text-dark">Editar Ordem de Serviço</h2>
                                <WarrantyBadge completedDate={watchedCompletedDate} warrantyDays={watchedWarrantyDays} />
                            </div>
                            <p className="text-sm text-gray-500">Edite todas as informações da OS</p>
                        </div>
                    </div>
                    <Button type="submit" size="lg" className="touch-manipulation" disabled={isSubmitting}>
                        <Save className="w-5 h-5 mr-2" />
                        {isSubmitting ? 'Salvando...' : 'Salvar'}
                    </Button>
                </div>

                {isLocked && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                        <Lock className="w-4 h-4 flex-shrink-0" />
                        OS finalizada ({getStatusConfig(watchedStatus).label}) — edição bloqueada para evitar mudanças acidentais. Para editar novamente, altere o status abaixo.
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* Main Info */}
                    <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-4">Dados Principais</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-600">Número da OS</label>
                                    <Input type="number" disabled={isLocked} {...register('osNumber')} />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-600">Status</label>
                                    <select
                                        {...register('status')}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm sm:text-base"
                                    >
                                        {STATUS_STEPS.map(status => (
                                            <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>
                                        ))}
                                        <option value="cancelado">{STATUS_CONFIG.cancelado.label}</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-600">Cliente</label>
                                    <Controller
                                        name="customerId"
                                        control={control}
                                        render={({ field }) => (
                                            <SearchableSelect
                                                value={field.value || ''}
                                                onChange={field.onChange}
                                                placeholder="Buscar por nome, CPF/CNPJ..."
                                                error={errors.customerId?.message}
                                                disabled={isLocked}
                                                options={customers.map(c => ({
                                                    value: c.id,
                                                    label: c.name,
                                                    sublabel: c.cpf || c.cnpj || c.phone || undefined,
                                                }))}
                                            />
                                        )}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-600">Técnico Responsável</label>
                                    <select
                                        {...register('technicianId')}
                                        disabled={isLocked}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                                    >
                                        <option value="">Selecione...</option>
                                        {technicians.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <Input label="Data de Entrada" type="date" disabled={isLocked} {...register('entryDate')} error={errors.entryDate?.message} />
                                <Input label="Previsão de Conclusão" type="date" disabled={isLocked} {...register('estimatedCompletionDate')} />
                                <Input label="Data de Finalização" type="date" disabled={isLocked} {...register('completedDate')} />
                                <div>
                                    <Input label="Data de Faturamento" type="date" disabled={isLocked} {...register('billingDate')} />
                                    <p className="text-xs text-gray-400 mt-1">
                                        Em qual dia essa OS deve contar no Fluxo de Caixa. Deixe em branco para usar a Data de Finalização.
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-4">Informações do Equipamento</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-600">Tipo de Equipamento</label>
                                    <select
                                        {...register('equipmentType')}
                                        disabled={isLocked}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                                    >
                                        <option value="">Selecione...</option>
                                        {EQUIPMENT_TYPES.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                                <Input label="Marca" disabled={isLocked} {...register('brand')} placeholder="Ex: Dell, Acer, Samsung..." />
                                <Input label="Modelo" disabled={isLocked} {...register('equipment')} error={errors.equipment?.message} placeholder="Ex: Inspiron 15 P66F" />
                                <Input label="Número de Série" disabled={isLocked} {...register('serialNumber')} />

                                <div className="sm:col-span-2">
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">Descrição do Problema</label>
                                    <textarea
                                        {...register('problemDescription')}
                                        disabled={isLocked}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[100px] text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                                    />
                                </div>
                            </div>
                        </Card>

                        <AccessoriesSection value={accessories} onChange={setAccessories} disabled={isLocked} />

                        <ChecklistSection
                            title="1. Estado Físico"
                            items={physicalCondition}
                            onUpdate={setPhysicalCondition}
                            disabled={isLocked}
                        />

                        <ChecklistSection
                            title="2. Condição de Funcionamento"
                            items={operatingCondition}
                            onUpdate={setOperatingCondition}
                            disabled={isLocked}
                        />

                        <ChecklistSection
                            title="3. Testes Técnicos Iniciais"
                            items={technicalTests}
                            onUpdate={setTechnicalTests}
                            disabled={isLocked}
                        />

                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-4 text-primary-green">Observação do Técnico</h3>
                            <textarea
                                {...register('technicianObservation')}
                                disabled={isLocked}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[120px] text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                            />
                        </Card>

                        <Card>
                            <div className="flex items-center gap-2 mb-4 flex-wrap">
                                <h3 className="font-semibold text-base sm:text-lg">Garantia</h3>
                                <WarrantyBadge completedDate={watchedCompletedDate} warrantyDays={watchedWarrantyDays} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Input
                                    label="Dias de Garantia"
                                    type="number"
                                    disabled={isLocked}
                                    {...register('warrantyDays')}
                                    error={errors.warrantyDays?.message}
                                    placeholder="Ex: 90"
                                />
                                <div className="sm:col-span-2">
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">Observação da Garantia</label>
                                    <textarea
                                        {...register('warrantyNotes')}
                                        disabled={isLocked}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[80px] text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                                        placeholder="Ex: garantia cobre apenas a peça trocada, não cobre mau uso..."
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                                A contagem da garantia começa na "Data de Finalização" acima.
                            </p>
                        </Card>

                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-4">Fotos do Equipamento</h3>

                            {/* Existing Photos */}
                            {existingPhotos.length > 0 && (
                                <div className="mb-4">
                                    <h4 className="text-sm font-medium text-gray-700 mb-2">Fotos Salvas</h4>
                                    <ImageViewer images={existingPhotos} />
                                    <p className="text-xs text-gray-500 mt-2">Clique em uma foto para visualizar em tela cheia</p>
                                </div>
                            )}

                            <ImageUpload onImagesChange={setNewImages} disabled={isLocked} />
                        </Card>

                        <ServiceOrderItemsSection orderId={id} items={items} onChange={setItems} disabled={isLocked} />

                        <ServiceOrderServicesSection orderId={id} lines={serviceLines} onChange={setServiceLines} disabled={isLocked} />

                        <OrderBudgetSummary
                            itemsTotal={items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)}
                            servicesTotal={serviceLines.reduce((sum, l) => sum + l.quantity * l.price, 0)}
                            discountType={discountType}
                            discountValue={discountValue}
                            freight={freight}
                            urgencyFee={urgencyFee}
                            onDiscountTypeChange={setDiscountType}
                            onDiscountValueChange={setDiscountValue}
                            onFreightChange={setFreight}
                            onUrgencyFeeChange={setUrgencyFee}
                            disabled={isLocked}
                        />
                    </div>

                    {/* Sidebar Info - Removed Button from here */}
                </div>

                {/* Bottom Action Bar */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 lg:static lg:bg-transparent lg:border-none lg:p-0 mt-6 z-20">
                    <div className="max-w-7xl mx-auto flex justify-end">
                        <Button type="submit" size="lg" className="w-full sm:w-auto min-w-[200px] touch-manipulation shadow-xl lg:shadow-none" disabled={isSubmitting}>
                            <Save className="w-5 h-5 mr-2" />
                            {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}
