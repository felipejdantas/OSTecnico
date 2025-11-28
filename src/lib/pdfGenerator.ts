import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ChecklistItem = {
    label: string;
    status: 'ok' | 'defect' | 'na';
    observation: string;
};

type AccessoriesData = {
    fonte: boolean;
    cabo: boolean;
    mochila: boolean;
    outro: string;
};

type OSData = {
    os_number: number;
    created_at: string;
    customer: { name: string; cpf?: string; phone?: string } | any;
    technician: { name: string } | any;
    equipment: string;
    serial_number?: string;
    problem_description: string;
    physical_condition: ChecklistItem[];
    operating_condition: ChecklistItem[];
    technical_tests: ChecklistItem[];
    accessories_received: AccessoriesData;
    technician_observation?: string;
    status: string;
    client_signed_at?: string;
    photos?: string[];
};

export async function generateOSPDF(osData: OSData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    // Brand Color (Blue #0099ff -> [0, 153, 255])
    const brandColor = [0, 153, 255] as [number, number, number];

    // Header with logo (if available)
    try {
        const logoImg = await loadImage('/logo-full.jpg');
        doc.addImage(logoImg.data, 'JPEG', 15, 10, 50, 20);
    } catch (error) {
        console.log('Logo not found, skipping');
    }

    // Company name
    doc.setFontSize(20);
    doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]); // Blue
    doc.setFont('helvetica', 'bold');
    doc.text('OSTECNICO', pageWidth - 15, 20, { align: 'right' });

    doc.setFontSize(12);
    doc.setTextColor(100); // Grey
    doc.setFont('helvetica', 'normal');
    doc.text('Ordem de Serviço', pageWidth - 15, 28, { align: 'right' });

    yPos = 40;

    // OS Number and Date
    doc.setFontSize(10);
    doc.setTextColor(0); // Black
    doc.setFont('helvetica', 'bold');
    doc.text(`OS Nº: ${osData.os_number || 'N/A'}`, 15, yPos);
    doc.text(`Data: ${osData.created_at ? new Date(osData.created_at).toLocaleDateString('pt-BR') : 'N/A'}`, pageWidth - 15, yPos, { align: 'right' });

    yPos += 10;

    // Customer and Technician Info
    // Ensure data exists to avoid blank fields
    // Debug: Log the data structure to understand what we're receiving
    console.log('PDF Generator - Customer data:', osData.customer);
    console.log('PDF Generator - Technician data:', osData.technician);

    // Handle both array and object formats from Supabase
    const customer = Array.isArray(osData.customer) ? osData.customer[0] : osData.customer;
    const technician = Array.isArray(osData.technician) ? osData.technician[0] : osData.technician;

    const customerName = customer?.name || 'N/A';
    const customerCpf = customer?.cpf || 'N/A';
    const customerPhone = customer?.phone || 'N/A';
    const technicianName = technician?.name || 'N/A';

    console.log('Extracted values:', { customerName, customerCpf, customerPhone, technicianName });

    autoTable(doc, {
        startY: yPos,
        head: [['Informações Principais', '']], // Add empty column to match body columns
        body: [
            ['Cliente', String(customerName || '')],
            ['CPF', String(customerCpf || '')],
            ['Telefone', String(customerPhone || '')],
            ['Técnico Responsável', String(technicianName || '')],
            ['Equipamento', String(osData.equipment || 'N/A')],
            ['Número de Série', String(osData.serial_number || 'N/A')],
            ['Status', getStatusLabel(osData.status)],
        ],
        theme: 'grid',
        headStyles: { fillColor: brandColor, textColor: 255 },
        styles: { fontSize: 9 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Problem Description
    doc.setFont('helvetica', 'bold');
    doc.text('Problema Relatado:', 15, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    const problemLines = doc.splitTextToSize(osData.problem_description || 'Não informado', pageWidth - 30);
    doc.text(problemLines, 15, yPos);
    yPos += problemLines.length * 5 + 10;

    // Accessories
    if (yPos > 250) {
        doc.addPage();
        yPos = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.text('Acessórios Recebidos:', 15, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    const accessories = [];
    if (osData.accessories_received?.fonte) accessories.push('Fonte');
    if (osData.accessories_received?.cabo) accessories.push('Cabo');
    if (osData.accessories_received?.mochila) accessories.push('Mochila');
    if (osData.accessories_received?.outro) accessories.push(osData.accessories_received.outro);
    doc.text(accessories.length > 0 ? accessories.join(', ') : 'Nenhum', 15, yPos);
    yPos += 10;

    // Checklists
    if (yPos > 240) {
        doc.addPage();
        yPos = 20;
    }

    // Physical Condition
    if (osData.physical_condition?.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [['Estado Físico', 'Status', 'Observação']],
            body: osData.physical_condition.map(item => [
                item.label,
                getStatusIcon(item.status),
                item.observation || '-'
            ]),
            theme: 'striped',
            headStyles: { fillColor: brandColor },
            styles: { fontSize: 8 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Operating Condition
    if (yPos > 240) {
        doc.addPage();
        yPos = 20;
    }

    if (osData.operating_condition?.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [['Condição de Funcionamento', 'Status', 'Observação']],
            body: osData.operating_condition.map(item => [
                item.label,
                getStatusIcon(item.status),
                item.observation || '-'
            ]),
            theme: 'striped',
            headStyles: { fillColor: brandColor },
            styles: { fontSize: 8 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Technical Tests
    if (yPos > 240) {
        doc.addPage();
        yPos = 20;
    }

    if (osData.technical_tests?.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [['Testes Técnicos Iniciais', 'Status', 'Observação']],
            body: osData.technical_tests.map(item => [
                item.label,
                getStatusIcon(item.status),
                item.observation || '-'
            ]),
            theme: 'striped',
            headStyles: { fillColor: brandColor },
            styles: { fontSize: 8 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Technician Observation
    if (osData.technician_observation) {
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.text('Observação do Técnico:', 15, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        const obsLines = doc.splitTextToSize(osData.technician_observation, pageWidth - 30);
        doc.text(obsLines, 15, yPos);
        yPos += obsLines.length * 5 + 10;
    }

    // Photos
    if (osData.photos && osData.photos.length > 0) {
        doc.addPage();
        yPos = 20;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
        doc.text('Fotos do Equipamento:', 15, yPos);
        yPos += 15;

        const photoWidth = 80;
        const photoHeight = 60;
        const gap = 10;
        let xPos = 15;

        for (const photoUrl of osData.photos) {
            try {
                // Ensure we're using a proxy or the url is accessible
                // For Supabase public URLs, they should be accessible directly if CORS is configured
                const photoImg = await loadImage(photoUrl);

                if (xPos + photoWidth > pageWidth - 15) {
                    xPos = 15;
                    yPos += photoHeight + gap;
                }

                if (yPos + photoHeight > doc.internal.pageSize.getHeight() - 20) {
                    doc.addPage();
                    yPos = 20;
                    xPos = 15;
                }

                // Add image to PDF preserving aspect ratio
                const maxWidth = 80;
                const maxHeight = 60;

                let finalWidth = maxWidth;
                let finalHeight = maxHeight;
                const ratio = photoImg.width / photoImg.height;

                if (ratio > maxWidth / maxHeight) {
                    // Wider than box
                    finalHeight = maxWidth / ratio;
                } else {
                    // Taller than box
                    finalWidth = maxHeight * ratio;
                }

                // Center the image in the box
                const xOffset = (maxWidth - finalWidth) / 2;
                const yOffset = (maxHeight - finalHeight) / 2;

                doc.addImage(photoImg.data, 'JPEG', xPos + xOffset, yPos + yOffset, finalWidth, finalHeight);
                xPos += maxWidth + gap;
            } catch (error) {
                console.error('Error loading photo for PDF:', error);
                // Draw a placeholder if image fails
                doc.setDrawColor(200);
                doc.rect(xPos, yPos, photoWidth, photoHeight);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text('Erro ao carregar imagem', xPos + 5, yPos + photoHeight / 2);
                xPos += photoWidth + gap;
            }
        }
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
            `Página ${i} de ${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    // Save PDF
    doc.save(`OS_${osData.os_number || '000'}_${(osData.customer?.name || 'cliente').replace(/\s/g, '_')}.pdf`);
}

function getStatusIcon(status: string): string {
    switch (status) {
        case 'ok':
            return 'OK';
        case 'defect':
            return 'Defeito';
        case 'na':
            return 'N/V'; // Não Verificado
        default:
            return 'N/V';
    }
}

function getStatusLabel(status: string): string {
    switch (status) {
        case 'pendente':
            return 'Pendente';
        case 'em_atendimento':
            return 'Em Atendimento';
        case 'concluido':
            return 'Concluído';
        default:
            return status;
    }
}

function loadImage(url: string): Promise<{ data: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous'; // Critical for loading images from other domains (Supabase)

        const timeout = setTimeout(() => {
            reject(new Error('Image load timed out'));
        }, 5000); // 5 second timeout

        img.onload = () => {
            clearTimeout(timeout);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve({
                    data: canvas.toDataURL('image/jpeg', 0.9), // 0.9 quality
                    width: img.width,
                    height: img.height
                });
            } else {
                reject(new Error('Could not get canvas context'));
            }
        };
        img.onerror = (e) => {
            clearTimeout(timeout);
            reject(e);
        };
        img.src = url;
    });
}
