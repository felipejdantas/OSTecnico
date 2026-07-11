import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getStatusConfig } from './orderStatus';
import { calculateOrderTotal, formatCurrency, type DiscountType } from './orderFinance';

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

type OrderItemRow = { product_name: string; quantity: number; unit_price: number };
type OrderServiceRow = { service_name: string; description?: string | null; quantity: number; price: number };
type PhotoEntry = string | { url: string; date?: string | null };

type CompanyInfo = {
    company_name?: string;
    cnpj?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    pix_key?: string | null;
    bank_details?: string | null;
    warranty_days?: number | null;
    warranty_text?: string | null;
    terms_text?: string | null;
};

type CustomerInfo = {
    name: string;
    cpf?: string;
    phone?: string;
    email?: string;
    address?: string;
    number?: string;
    cnpj?: string;
    company_name?: string;
    trade_name?: string;
    state_registration?: string;
    municipal_registration?: string;
} | any;

type OSData = {
    os_number: number;
    created_at: string;
    entry_date?: string | null;
    estimated_completion_date?: string | null;
    completed_date?: string | null;
    customer: CustomerInfo;
    technician: { name: string } | any;
    brand?: string | null;
    equipment_type?: string | null;
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
    client_signature_url?: string;
    photos?: PhotoEntry[];
    items?: OrderItemRow[];
    services?: OrderServiceRow[];
    discount_type?: DiscountType;
    discount_value?: number;
    freight?: number;
    urgency_fee?: number;
    company?: CompanyInfo;
};

const brandColor = [0, 153, 255] as [number, number, number];

export async function generateOSPDF(osData: OSData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    const customer = Array.isArray(osData.customer) ? osData.customer[0] : osData.customer;
    const technician = Array.isArray(osData.technician) ? osData.technician[0] : osData.technician;
    const company = osData.company;

    const ensureSpace = (needed: number) => {
        if (yPos + needed > pageHeight - 22) {
            doc.addPage();
            yPos = 20;
        }
    };

    // ---- Header: logo + company block ----
    try {
        const logoImg = await loadImage('/logo-full.jpg');
        doc.addImage(logoImg.data, 'JPEG', 15, 10, 50, 20);
    } catch (error) {
        console.log('Logo not found, skipping');
    }

    doc.setFontSize(18);
    doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text((company?.company_name || 'OSTECNICO').toUpperCase(), pageWidth - 15, 18, { align: 'right' });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text('Ordem de Serviço', pageWidth - 15, 24, { align: 'right' });

    let headerY = 30;
    doc.setFontSize(8);
    const companyLines = [
        company?.cnpj && `CNPJ: ${company.cnpj}`,
        company?.address,
        [company?.phone, company?.email].filter(Boolean).join('  ·  '),
    ].filter(Boolean) as string[];
    for (const line of companyLines) {
        const wrapped = doc.splitTextToSize(line, 100);
        doc.text(wrapped, pageWidth - 15, headerY, { align: 'right' });
        headerY += wrapped.length * 4;
    }

    yPos = Math.max(38, headerY + 4);
    doc.setDrawColor(220);
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 8;

    // ---- Title bar: OS number + equipment type + date ----
    const formatDate = (d?: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : null;

    doc.setFillColor(240, 240, 240);
    doc.rect(15, yPos, pageWidth - 30, osData.equipment_type ? 16 : 11, 'F');
    doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(`OS Nº ${osData.os_number || 'N/A'}`, 18, yPos + 7);
    if (osData.equipment_type) {
        doc.setTextColor(100);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(osData.equipment_type, 18, yPos + 13);
    }
    doc.setTextColor(100);
    doc.setFontSize(9);
    doc.text(
        `Data: ${osData.created_at ? new Date(osData.created_at).toLocaleDateString('pt-BR') : 'N/A'}`,
        pageWidth - 18,
        yPos + 7,
        { align: 'right' }
    );
    yPos += (osData.equipment_type ? 16 : 11) + 8;

    // ---- Client block (full width) ----
    const clientLines = [
        `Cliente: ${customer?.trade_name || customer?.company_name || customer?.name || 'N/A'}`,
        customer?.company_name && customer?.trade_name && `Razão Social: ${customer.company_name}`,
        customer?.cnpj && `CNPJ: ${customer.cnpj}`,
        customer?.state_registration && `Inscrição Estadual: ${customer.state_registration}`,
        customer?.municipal_registration && `Inscrição Municipal: ${customer.municipal_registration}`,
        customer?.cpf && `CPF: ${customer.cpf}`,
        customer?.phone && `Telefone: ${customer.phone}`,
        customer?.email && `E-mail: ${customer.email}`,
        customer?.address && `Endereço: ${customer.address}${customer?.number ? `, ${customer.number}` : ''}`,
    ].filter(Boolean) as string[];
    yPos = drawInfoBlock(doc, 15, yPos, pageWidth - 30, clientLines) + 6;

    // ---- Informações Básicas (gray bar + 2-column grid) ----
    ensureSpace(40);
    yPos = drawSectionBar(doc, 15, pageWidth - 30, yPos, 'Informações Básicas');
    const basicFields: [string, string][] = [
        ['Marca', osData.brand || '-'],
        ['Modelo', osData.equipment || '-'],
        ['Equipamento', osData.equipment_type || '-'],
        ['Defeito', osData.problem_description || 'Não informado'],
    ];
    yPos = drawFieldGrid(doc, 15, yPos, (pageWidth - 30 - 10) / 2, basicFields);

    const extraLines = [
        osData.serial_number && `Número de Série: ${osData.serial_number}`,
        `Técnico Responsável: ${technician?.name || 'N/A'}`,
        `Status: ${getStatusLabel(osData.status)}`,
        osData.entry_date && `Data de Entrada: ${formatDate(osData.entry_date)}`,
        osData.estimated_completion_date && `Previsão de Conclusão: ${formatDate(osData.estimated_completion_date)}`,
        osData.completed_date && `Concluído em: ${formatDate(osData.completed_date)}`,
    ].filter(Boolean) as string[];
    yPos = drawInfoBlock(doc, 15, yPos, pageWidth - 30, extraLines) + 6;

    // ---- Observações (technician's freeform notes) ----
    if (osData.technician_observation) {
        ensureSpace(20);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Observações:', 15, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const obsLines = doc.splitTextToSize(osData.technician_observation, pageWidth - 30);
        doc.text(obsLines, 15, yPos);
        yPos += obsLines.length * 5 + 8;
    }

    // ---- Accessories ----
    ensureSpace(15);
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

    // ---- Checklist: only problems, to keep it emphatic ----
    ensureSpace(15);
    const checklistGroups: [string, ChecklistItem[]][] = [
        ['Estado Físico', osData.physical_condition],
        ['Condição de Funcionamento', osData.operating_condition],
        ['Testes Técnicos', osData.technical_tests],
    ];
    const anyDefect = checklistGroups.some(([, items]) => (items || []).some(i => i.status === 'defect'));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text('Problemas Identificados no Checklist', 15, yPos);
    yPos += 6;

    if (!anyDefect) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0, 128, 0);
        doc.text('Nenhum problema identificado no checklist de entrada.', 15, yPos);
        doc.setTextColor(0);
        yPos += 10;
    } else {
        for (const [title, items] of checklistGroups) {
            const defects = (items || []).filter(i => i.status === 'defect');
            if (defects.length === 0) continue;
            ensureSpace(20);
            autoTable(doc, {
                startY: yPos,
                head: [[title, 'Observação']],
                body: defects.map(item => [item.label, item.observation || '-']),
                theme: 'striped',
                headStyles: { fillColor: [220, 53, 69] },
                styles: { fontSize: 8 },
            });
            yPos = (doc as any).lastAutoTable.finalY + 8;
        }
    }

    // ---- Services performed ----
    if (osData.services && osData.services.length > 0) {
        ensureSpace(25);
        yPos = drawSectionBar(doc, 15, pageWidth - 30, yPos, 'Serviços');
        autoTable(doc, {
            startY: yPos,
            head: [['Descrição', 'Qtd', 'Preço', 'Total']],
            body: osData.services.map(s => [
                s.description ? `${s.service_name}\n${s.description}` : s.service_name,
                String(s.quantity),
                formatCurrency(s.price),
                formatCurrency(s.quantity * s.price),
            ]),
            theme: 'striped',
            headStyles: { fillColor: brandColor },
            styles: { fontSize: 8 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // ---- Parts used ----
    if (osData.items && osData.items.length > 0) {
        ensureSpace(25);
        yPos = drawSectionBar(doc, 15, pageWidth - 30, yPos, 'Peças');
        autoTable(doc, {
            startY: yPos,
            head: [['Descrição', 'Qtd', 'Preço Unit.', 'Total']],
            body: osData.items.map(i => [
                i.product_name,
                String(i.quantity),
                formatCurrency(i.unit_price),
                formatCurrency(i.quantity * i.unit_price),
            ]),
            theme: 'striped',
            headStyles: { fillColor: brandColor },
            styles: { fontSize: 8 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // ---- Financial summary ----
    const itemsTotal = (osData.items || []).reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    const servicesTotal = (osData.services || []).reduce((sum, s) => sum + s.quantity * s.price, 0);
    const hasFinance = itemsTotal > 0 || servicesTotal > 0 || (osData.freight || 0) > 0 || (osData.urgency_fee || 0) > 0 || (osData.discount_value || 0) > 0;

    if (hasFinance) {
        const { subtotal, discountAmount, total } = calculateOrderTotal({
            itemsTotal,
            servicesTotal,
            discountType: osData.discount_type || 'fixed',
            discountValue: osData.discount_value || 0,
            freight: osData.freight || 0,
            urgencyFee: osData.urgency_fee || 0,
        });

        ensureSpace(30);
        const financeRows: string[][] = [['Subtotal', formatCurrency(subtotal)]];
        if (discountAmount > 0) financeRows.push(['Desconto', `- ${formatCurrency(discountAmount)}`]);
        if ((osData.freight || 0) > 0) financeRows.push(['Frete', formatCurrency(osData.freight || 0)]);
        if ((osData.urgency_fee || 0) > 0) financeRows.push(['Taxa de Urgência', formatCurrency(osData.urgency_fee || 0)]);
        financeRows.push(['Total', formatCurrency(total)]);

        autoTable(doc, {
            startY: yPos,
            head: [['Resumo Financeiro', '']],
            body: financeRows,
            theme: 'grid',
            headStyles: { fillColor: brandColor, textColor: 255 },
            styles: { fontSize: 9 },
            didParseCell: (data) => {
                if (data.row.index === financeRows.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                }
            },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // ---- Payment & warranty info ----
    if (company?.pix_key || company?.bank_details || company?.warranty_text || company?.warranty_days) {
        if (company?.pix_key || company?.bank_details) {
            ensureSpace(25);
            yPos = drawSectionBar(doc, 15, pageWidth - 30, yPos, 'Pagamento');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(0);
            if (company?.pix_key) {
                doc.text(`PIX: ${company.pix_key}`, 15, yPos);
                yPos += 5;
            }
            if (company?.bank_details) {
                const bankLines = doc.splitTextToSize(company.bank_details, pageWidth - 30);
                doc.text(bankLines, 15, yPos);
                yPos += bankLines.length * 5;
            }
            yPos += 5;
        }
        if (company?.warranty_text || company?.warranty_days) {
            ensureSpace(20);
            yPos = drawSectionBar(doc, 15, pageWidth - 30, yPos, 'Garantia');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(0);
            doc.text(`Condições da garantia${company?.warranty_days ? ` (${company.warranty_days} dias)` : ''}:`, 15, yPos);
            yPos += 5;
            doc.setFont('helvetica', 'normal');
            if (company?.warranty_text) {
                const warrantyLines = doc.splitTextToSize(company.warranty_text, pageWidth - 30);
                doc.text(warrantyLines, 15, yPos);
                yPos += warrantyLines.length * 5;
            }
            yPos += 5;
        }
    }

    // ---- Client signature (before photos) ----
    if (osData.client_signature_url) {
        ensureSpace(45);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Assinatura do Cliente:', 15, yPos);
        yPos += 4;
        try {
            const sigImg = await loadImage(osData.client_signature_url);
            const sigHeight = 25;
            const sigWidth = Math.min(70, sigHeight * (sigImg.width / sigImg.height));
            doc.addImage(sigImg.data, 'PNG', 15, yPos, sigWidth, sigHeight);
            yPos += sigHeight + 2;
        } catch (error) {
            console.error('Error loading signature image:', error);
            yPos += 25;
        }
        doc.setDrawColor(150);
        doc.line(15, yPos, 90, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(customer?.name || '', 15, yPos);
        if (osData.client_signed_at) {
            doc.setFontSize(8);
            doc.setTextColor(120);
            doc.text(`Assinado em ${new Date(osData.client_signed_at).toLocaleString('pt-BR')}`, 15, yPos + 4);
            doc.setTextColor(0);
        }
        yPos += 12;
    }

    // ---- Photos, each tagged with its date ----
    const photos = (osData.photos || []).map(p => (typeof p === 'string' ? { url: p } : p));
    if (photos.length > 0) {
        doc.addPage();
        yPos = 20;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
        doc.text('Fotos do Equipamento:', 15, yPos);
        yPos += 12;

        const photoWidth = 80;
        const photoHeight = 60;
        const gap = 10;
        let xPos = 15;

        for (const photo of photos) {
            try {
                const photoImg = await loadImage(photo.url);

                if (xPos + photoWidth > pageWidth - 15) {
                    xPos = 15;
                    yPos += photoHeight + 14;
                }

                if (yPos + photoHeight + 8 > pageHeight - 20) {
                    doc.addPage();
                    yPos = 20;
                    xPos = 15;
                }

                let finalWidth = photoWidth;
                let finalHeight = photoHeight;
                const ratio = photoImg.width / photoImg.height;

                if (ratio > photoWidth / photoHeight) {
                    finalHeight = photoWidth / ratio;
                } else {
                    finalWidth = photoHeight * ratio;
                }

                const xOffset = (photoWidth - finalWidth) / 2;
                const yOffset = (photoHeight - finalHeight) / 2;

                doc.addImage(photoImg.data, 'JPEG', xPos + xOffset, yPos + yOffset, finalWidth, finalHeight);

                if (photo.date) {
                    doc.setFontSize(7);
                    doc.setTextColor(120);
                    doc.text(new Date(photo.date).toLocaleDateString('pt-BR'), xPos + photoWidth / 2, yPos + photoHeight + 5, { align: 'center' });
                    doc.setTextColor(0);
                }

                xPos += photoWidth + gap;
            } catch (error) {
                console.error('Error loading photo for PDF:', error);
                doc.setDrawColor(200);
                doc.rect(xPos, yPos, photoWidth, photoHeight);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text('Erro ao carregar imagem', xPos + 5, yPos + photoHeight / 2);
                doc.setTextColor(0);
                xPos += photoWidth + gap;
            }
        }
    }

    // ---- Custom service clause (written by the shop, not auto-generated) ----
    if (company?.terms_text) {
        doc.addPage();
        yPos = 20;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
        doc.text('Cláusula de Serviço', 15, yPos);
        yPos += 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0);
        const termsLines = doc.splitTextToSize(company.terms_text, pageWidth - 30);
        doc.text(termsLines, 15, yPos);
    }

    // ---- Footer on every page ----
    const pageCount = doc.getNumberOfPages();
    const footerParts = [
        company?.company_name,
        company?.cnpj && `CNPJ: ${company.cnpj}`,
        company?.address,
        [company?.phone, company?.email].filter(Boolean).join(' · '),
    ].filter(Boolean) as string[];

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(220);
        doc.line(15, pageHeight - 18, pageWidth - 15, pageHeight - 18);
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.setFont('helvetica', 'normal');
        doc.text(footerParts.join('  |  '), 15, pageHeight - 13);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 13, { align: 'right' });
    }

    // Save PDF
    doc.save(`OS_${osData.os_number || '000'}_${(customer?.name || 'cliente').replace(/\s/g, '_')}.pdf`);
}

function drawSectionBar(doc: jsPDF, x: number, width: number, y: number, title: string): number {
    doc.setFillColor(240, 240, 240);
    doc.rect(x, y, width, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(title.toUpperCase(), x + 3, y + 5);
    doc.setTextColor(0);
    return y + 7 + 5;
}

function drawFieldGrid(doc: jsPDF, x: number, y: number, colWidth: number, fields: [string, string][]): number {
    let curY = y;
    for (let i = 0; i < fields.length; i += 2) {
        const rowFields = fields.slice(i, i + 2);
        const wrappedPerCol = rowFields.map(([, value]) => doc.splitTextToSize(value || '-', colWidth - 4));
        const maxLines = Math.max(...wrappedPerCol.map(w => w.length));

        rowFields.forEach(([label], idx) => {
            const colX = x + idx * (colWidth + 10);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(120);
            doc.text(label.toUpperCase(), colX, curY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(30);
            doc.text(wrappedPerCol[idx], colX, curY + 4.5);
        });
        curY += 4.5 + maxLines * 4.5 + 3;
    }
    doc.setTextColor(0);
    return curY + 2;
}

function drawInfoBlock(doc: jsPDF, x: number, y: number, maxWidth: number, lines: string[]): number {
    let curY = y;
    doc.setFontSize(9);
    for (const [index, line] of lines.entries()) {
        doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
        doc.setTextColor(index === 0 ? 0 : 90);
        const wrapped = doc.splitTextToSize(line, maxWidth);
        doc.text(wrapped, x, curY);
        curY += wrapped.length * 4.5;
    }
    doc.setTextColor(0);
    return curY;
}

function getStatusLabel(status: string): string {
    return getStatusConfig(status).label;
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
