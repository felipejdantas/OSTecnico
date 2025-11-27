import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, ArrowLeft, Trash2 } from 'lucide-react';
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
    osNumber: z.string().optional(), // Allow editing OS number
    customerId: z.string().min(1, 'Selecione um cliente'),
    technicianId: z.string().min(1, 'Selecione um técnico'),
    equipment: z.string().min(3, 'Equipamento obrigatório'),
    serialNumber: z.string().optional(),
    problemDescription: z.string().min(10, 'Descreva o problema detalhadamente'),
    status: z.enum(['pendente', 'em_atendimento', 'concluido']),
    technicianObservation: z.string().optional(),
});

type OSForm = z.infer<typeof osSchema>;

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
    const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const sigPadRef = useRef<SignaturePadRef>(null);
    const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm<OSForm>({
        resolver: zodResolver(osSchema),
    });

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
            setValue('equipment', os.equipment);
            setValue('serialNumber', os.serial_number || '');
            setValue('problemDescription', os.problem_description);
            setValue('status', os.status);
            setValue('technicianObservation', os.technician_observation || '');

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
            const allPhotos = [...existingPhotos, ...newImageUrls];

            // Update OS
            const { error } = await supabase
                .from('service_orders')
                .update({
                    os_number: parseInt(data.osNumber || '0'),
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
                    photos: allPhotos,
                    status: data.status
                })
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) throw error;

            alert('Ordem de Serviço atualizada com sucesso!');
            navigate('/');

        } catch (error: any) {
            console.error('Error updating OS:', error);
            alert('Erro ao atualizar OS: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const removePhoto = (index: number) => {
        const newPhotos = [...existingPhotos];
        newPhotos.splice(index, 1);
        setExistingPhotos(newPhotos);
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
                            <h2 className="text-xl sm:text-2xl font-bold text-dark">Editar Ordem de Serviço</h2>
                            <p className="text-sm text-gray-500">Edite todas as informações da OS</p>
                        </div>
                    </div>
                    <Button type="submit" size="lg" className="touch-manipulation" disabled={isSubmitting}>
                        <Save className="w-5 h-5 mr-2" />
                        {isSubmitting ? 'Salvando...' : 'Salvar'}
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* Main Info */}
                    <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-4">Dados Principais</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-600">Número da OS</label>
                                    <Input type="number" {...register('osNumber')} />
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
                                </div>

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
                                </div>

                                <Input label="Equipamento / Modelo" {...register('equipment')} error={errors.equipment?.message} />
                                <Input label="Número de Série" {...register('serialNumber')} />

                                <div className="sm:col-span-2">
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">Descrição do Problema</label>
                                    <textarea
                                        {...register('problemDescription')}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[100px] text-sm sm:text-base"
                                    />
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
                            />
                        </Card>

                        <Card>
                            <h3 className="font-semibold text-base sm:text-lg mb-4">Fotos do Equipamento</h3>

                            {/* Existing Photos */}
                            {existingPhotos.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                    {existingPhotos.map((url, index) => (
                                        <div key={index} className="relative group">
                                            <img src={url} alt={`Foto ${index + 1}`} className="w-full h-24 object-cover rounded-lg" />
                                            <button
                                                type="button"
                                                onClick={() => removePhoto(index)}
                                                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <ImageUpload onImagesChange={setNewImages} />
                        </Card>
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
