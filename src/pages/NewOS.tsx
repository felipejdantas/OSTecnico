import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { ImageUpload } from '../components/ImageUpload';
import { SignaturePad, type SignaturePadRef } from '../components/SignaturePad';
import ChecklistSection, { type ChecklistItem } from '../components/ChecklistSection';
import AccessoriesSection, { type AccessoriesData } from '../components/AccessoriesSection';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const osSchema = z.object({
    osNumber: z.string().optional(), // Allow manual OS number
    customerId: z.string().min(1, 'Selecione um cliente'),
    technicianId: z.string().min(1, 'Selecione um técnico'),
    equipment: z.string().min(3, 'Equipamento obrigatório'),
    serialNumber: z.string().optional(),
    problemDescription: z.string().min(10, 'Descreva o problema detalhadamente'),
    status: z.enum(['pendente', 'em_atendimento', 'concluido']),
    technicianObservation: z.string().optional(),
});

type OSForm = z.infer<typeof osSchema>;

// Checklist items based on provided images
const PHYSICAL_CONDITION_ITEMS = [
    'Tampa superior',
    'Moldura da tela',
    'Tela',
    'Teclado',
    'Touchpad',
    'Dobradiças',
    'Carcaça inferior',
    'Parafusos faltando',
    'Portas USB',
    'Porta HDMI / VGA',
    'Porta de áudio (P2)',
];

const OPERATING_CONDITION_ITEMS = [
    'Liga normalmente',
    'Bateria carrega',
    'Bateria segura carga',
    'Bateria estufada',
    'Desempenho lento/travando',
    'Wi-Fi funciona',
    'Bluetooth funciona',
    'Som',
    'Webcam',
];

const TECHNICAL_TESTS_ITEMS = [
    'Fonte funcionando',
    'Tensão correta',
    'RAM',
    'SSD/HD (SMART)',
    'Temperatura normal BIOS',
    'Cooler funcionando',
];

export default function NewOS() {
    const { user } = useAuth();
    const [physicalCondition, setPhysicalCondition] = useState<ChecklistItem[]>(
        PHYSICAL_CONDITION_ITEMS.map(label => ({ label, status: 'na', observation: '' }))
    );
    const [operatingCondition, setOperatingCondition] = useState<ChecklistItem[]>(
        OPERATING_CONDITION_ITEMS.map(label => ({ label, status: 'na', observation: '' }))
    );
    const [technicalTests, setTechnicalTests] = useState<ChecklistItem[]>(
        TECHNICAL_TESTS_ITEMS.map(label => ({ label, status: 'na', observation: '' }))
    );
    const [accessories, setAccessories] = useState<AccessoriesData>({
        fonte: false,
        cabo: false,
        mochila: false,
        outro: '',
    });

    const [customers, setCustomers] = useState<any[]>([]);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [images, setImages] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const sigPadRef = useRef<SignaturePadRef>(null);
    const { register, handleSubmit, formState: { errors }, reset } = useForm<OSForm>({
        resolver: zodResolver(osSchema),
        defaultValues: {
            status: 'pendente'
        }
    });

    useEffect(() => {
        if (user) fetchData();
    }, [user]);

    const fetchData = async () => {
        if (!user) return;

        const { data: customersData } = await supabase.from('customers').select('*').eq('user_id', user.id).order('name');
        const { data: techniciansData } = await supabase.from('technicians').select('*').eq('user_id', user.id).order('name');

        if (customersData) setCustomers(customersData);
        if (techniciansData) setTechnicians(techniciansData);
    };

    const uploadFile = async (file: File) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('os-images')
            .upload(filePath, file);

        if (uploadError) {
            throw uploadError;
        }

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

            // Upload Images
            const imageUrls = await Promise.all(images.map(uploadFile));

            // Upload Signature
            let signatureUrl = null;
            const signatureData = sigPadRef.current?.toDataURL();
            if (signatureData) {
                const res = await fetch(signatureData);
                const blob = await res.blob();
                const file = new File([blob], 'signature.png', { type: 'image/png' });
                signatureUrl = await uploadFile(file);
            }

            // Save OS
            const osData: any = {
                user_id: user.id,
                customer_id: data.customerId,
                technician_id: data.technicianId,
                equipment: data.equipment,
                serial_number: data.serialNumber,
                problem_description: data.problemDescription,
                physical_condition: physicalCondition,
                operating_condition: operatingCondition,
                technical_tests: technicalTests,
                accessories_received: accessories,
                technician_observation: data.technicianObservation,
                signature_url: signatureUrl,
                photos: imageUrls,
                status: data.status
            };

            // Add OS number if provided
            if (data.osNumber && data.osNumber.trim() !== '') {
                osData.os_number = parseInt(data.osNumber);
            }

            const { error } = await supabase.from('service_orders').insert([osData]);

            if (error) throw error;

            alert('Ordem de Serviço criada com sucesso!');

            // Reset form
            reset();
            setPhysicalCondition(PHYSICAL_CONDITION_ITEMS.map(label => ({ label, status: 'na', observation: '' })));
            setOperatingCondition(OPERATING_CONDITION_ITEMS.map(label => ({ label, status: 'na', observation: '' })));
            setTechnicalTests(TECHNICAL_TESTS_ITEMS.map(label => ({ label, status: 'na', observation: '' })));
            setAccessories({ fonte: false, cabo: false, mochila: false, outro: '' });
            setImages([]);
            sigPadRef.current?.clear();

        } catch (error: any) {
            console.error('Error submitting OS:', error);
            alert('Erro ao criar OS: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6 pb-20">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-dark">Nova Ordem de Serviço</h2>
                        <p className="text-sm sm:text-base text-gray-500">Preencha os dados de entrada do equipamento</p>
                    </div>
                    <div className="flex items-end gap-4">
                        <div className="text-left sm:text-right">
                            <label className="text-xs sm:text-sm text-gray-400 block mb-1">Nº OS</label>
                            <Input
                                type="number"
                                {...register('osNumber')}
                                placeholder="Auto"
                                className="w-24 text-center font-mono font-bold"
                            />
                        </div>
                        <Button type="submit" size="lg" className="touch-manipulation" disabled={isSubmitting}>
                            <Save className="w-5 h-5 mr-2" />
                            {isSubmitting ? 'Salvando...' : 'Gerar OS'}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* Main Info */}
                    <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-4">Dados Principais</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-600">Cliente</label>
                                    <select
                                        {...register('customerId')}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm sm:text-base"
                                    >
                                        <option value="">Selecione...</option>
                                        {customers.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    {errors.customerId && <p className="text-xs text-red-500">{errors.customerId.message}</p>}
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-600">Técnico Responsável</label>
                                    <select
                                        {...register('technicianId')}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm sm:text-base"
                                    >
                                        <option value="">Selecione...</option>
                                        {technicians.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                    {errors.technicianId && <p className="text-xs text-red-500">{errors.technicianId.message}</p>}
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-600">Status</label>
                                    <select
                                        {...register('status')}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm sm:text-base"
                                    >
                                        <option value="pendente">Pendente</option>
                                        <option value="em_atendimento">Em Atendimento</option>
                                        <option value="concluido">Concluído</option>
                                    </select>
                                    {errors.status && <p className="text-xs text-red-500">{errors.status.message}</p>}
                                </div>

                                <Input label="Equipamento / Modelo" {...register('equipment')} error={errors.equipment?.message} />
                                <Input label="Número de Série" {...register('serialNumber')} />

                                <div className="sm:col-span-2">
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">Descrição do Problema</label>
                                    <textarea
                                        {...register('problemDescription')}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[100px] text-sm sm:text-base"
                                        placeholder="Descreva o defeito relatado pelo cliente..."
                                    />
                                    {errors.problemDescription && <p className="text-xs text-red-500">{errors.problemDescription.message}</p>}
                                </div>
                            </div>
                        </Card>

                        <AccessoriesSection value={accessories} onChange={setAccessories} />

                        <ChecklistSection
                            title="1. Estado Físico"
                            items={physicalCondition}
                            onUpdate={setPhysicalCondition}
                        />

                        <ChecklistSection
                            title="2. Condição de Funcionamento"
                            items={operatingCondition}
                            onUpdate={setOperatingCondition}
                        />

                        <ChecklistSection
                            title="3. Testes Técnicos Iniciais"
                            items={technicalTests}
                            onUpdate={setTechnicalTests}
                        />

                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-4 text-primary-green">Observação do Técnico</h3>
                            <textarea
                                {...register('technicianObservation')}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[120px] text-sm sm:text-base"
                                placeholder="Observações adicionais do técnico sobre o equipamento ou serviço..."
                            />
                        </Card>

                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-4">Fotos do Equipamento</h3>
                            <ImageUpload onImagesChange={setImages} />
                        </Card>

                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-4">Assinatura do Cliente</h3>
                            <SignaturePad ref={sigPadRef} />
                        </Card>
                    </div>

                    {/* Sidebar Info - Removed Button from here */}
                </div>

                {/* Bottom Action Bar */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 lg:static lg:bg-transparent lg:border-none lg:p-0 mt-6 z-20">
                    <div className="max-w-7xl mx-auto flex justify-end">
                        <Button type="submit" size="lg" className="w-full sm:w-auto min-w-[200px] touch-manipulation shadow-xl lg:shadow-none" disabled={isSubmitting}>
                            <Save className="w-5 h-5 mr-2" />
                            {isSubmitting ? 'Salvando...' : 'Gerar Ordem de Serviço'}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}
