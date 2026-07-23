import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FileUp, Undo2, FileSpreadsheet, Package, AlertTriangle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/orderFinance';

type Product = { id: string; name: string; unit: string; stock_quantity: number };
type Supplier = { id: string; name: string; document: string | null };

type ParsedHeader = {
    number: string;
    series: string;
    issueDate: string;
    supplierCnpj: string;
    supplierName: string;
    supplierPhone: string;
    supplierAddress: string;
};

type ParsedItem = {
    originalName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    productId: string; // real product id, or the '__new__' sentinel
    newName: string;
    suggestedProductId?: string;
    suggestedProductName?: string;
};

const NEW_PRODUCT = '__new__';

function normalizeDoc(doc: string) {
    return doc.replace(/\D/g, '');
}

function getText(parent: Element | Document, tag: string) {
    return parent.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
}

// Loose normalization so "SSD ADATA SU650 240GB SATA" and "SSD Adata 240GB" are
// recognized as the same product despite differing punctuation/accents/wording.
function normalizeName(text: string) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Word-overlap (Jaccard) similarity, with a boost for plain substring containment —
// good enough to flag likely duplicates without a real fuzzy-matching library.
function nameSimilarity(a: string, b: string): number {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.9;
    const wordsA = new Set(na.split(' '));
    const wordsB = new Set(nb.split(' '));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size > 0 ? intersection.length / union.size : 0;
}

function findSimilarProduct(name: string, products: Product[]): Product | null {
    let best: { product: Product; score: number } | null = null;
    for (const p of products) {
        const score = nameSimilarity(name, p.name);
        if (score > (best?.score ?? 0)) best = { product: p, score };
    }
    return best && best.score >= 0.4 ? best.product : null;
}

export default function ImportNFe() {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [imports, setImports] = useState<any[]>([]);

    const [fileName, setFileName] = useState('');
    const [header, setHeader] = useState<ParsedHeader | null>(null);
    const [matchedSupplierId, setMatchedSupplierId] = useState<string | null>(null);
    const [items, setItems] = useState<ParsedItem[]>([]);
    const [totalValue, setTotalValue] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (user) fetchAll();
    }, [user]);

    const fetchAll = async () => {
        if (!user) return;
        const [{ data: productsData }, { data: suppliersData }] = await Promise.all([
            supabase.from('products').select('id, name, unit, stock_quantity').eq('user_id', user.id).order('name'),
            supabase.from('suppliers').select('id, name, document').eq('user_id', user.id).order('name'),
        ]);
        if (productsData) setProducts(productsData);
        if (suppliersData) setSuppliers(suppliersData);
        await fetchImports();
    };

    const fetchImports = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('nfe_imports')
            .select('id, nfe_number, nfe_series, issue_date, total_value, xml_filename, created_at, suppliers (name)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);
        setImports(data || []);
    };

    const resetForm = () => {
        setFileName('');
        setHeader(null);
        setMatchedSupplierId(null);
        setItems([]);
        setTotalValue(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleFile = async (file: File) => {
        try {
            const text = await file.text();
            const doc = new DOMParser().parseFromString(text, 'application/xml');
            if (doc.getElementsByTagName('parsererror')[0]) {
                toast.error('XML inválido ou corrompido.');
                return;
            }

            const ide = doc.getElementsByTagName('ide')[0];
            const emit = doc.getElementsByTagName('emit')[0];
            const detNodes = Array.from(doc.getElementsByTagName('det'));

            if (!ide || !emit || detNodes.length === 0) {
                toast.error('Não foi possível reconhecer esse arquivo como uma NF-e.');
                return;
            }

            const enderEmit = emit.getElementsByTagName('enderEmit')[0];
            const dhEmi = getText(ide, 'dhEmi') || getText(ide, 'dEmi');
            const issueDate = dhEmi ? dhEmi.slice(0, 10) : new Date().toISOString().slice(0, 10);

            const addressParts = enderEmit
                ? [
                    [getText(enderEmit, 'xLgr'), getText(enderEmit, 'nro')].filter(Boolean).join(', '),
                    getText(enderEmit, 'xBairro'),
                    [getText(enderEmit, 'xMun'), getText(enderEmit, 'UF')].filter(Boolean).join('/'),
                ].filter(Boolean).join(' - ')
                : '';

            const total = doc.getElementsByTagName('ICMSTot')[0];
            const parsedItems: ParsedItem[] = detNodes.map(det => {
                const prod = det.getElementsByTagName('prod')[0];
                const originalName = getText(prod, 'xProd');
                const exactMatch = products.find(p => normalizeName(p.name) === normalizeName(originalName));
                const suggestion = !exactMatch ? findSimilarProduct(originalName, products) : null;
                return {
                    originalName,
                    unit: (getText(prod, 'uCom') || 'un').toLowerCase(),
                    quantity: parseFloat(getText(prod, 'qCom')) || 1,
                    unitPrice: parseFloat(getText(prod, 'vUnCom')) || 0,
                    productId: exactMatch ? exactMatch.id : NEW_PRODUCT,
                    newName: originalName,
                    suggestedProductId: suggestion?.id,
                    suggestedProductName: suggestion?.name,
                };
            });

            const cnpj = getText(emit, 'CNPJ');
            const matchedSupplier = cnpj ? suppliers.find(s => s.document && normalizeDoc(s.document) === normalizeDoc(cnpj)) : undefined;

            setHeader({
                number: getText(ide, 'nNF'),
                series: getText(ide, 'serie'),
                issueDate,
                supplierCnpj: cnpj,
                supplierName: getText(emit, 'xNome'),
                supplierPhone: getText(emit, 'fone'),
                supplierAddress: addressParts,
            });
            setMatchedSupplierId(matchedSupplier?.id || null);
            setItems(parsedItems);
            setTotalValue(total ? parseFloat(getText(total, 'vNF')) || 0 : parsedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
            setFileName(file.name);
        } catch (error) {
            console.error('Error parsing NF-e XML:', error);
            toast.error('Erro ao ler o arquivo XML.');
        }
    };

    const updateItem = (index: number, patch: Partial<ParsedItem>) => {
        setItems(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    };

    const itemsTotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

    const handleConfirm = async () => {
        if (!user || !header) return;
        setIsSubmitting(true);
        try {
            let supplierId = matchedSupplierId;
            if (!supplierId) {
                const { data: newSupplier, error } = await supabase
                    .from('suppliers')
                    .insert([{
                        user_id: user.id,
                        name: header.supplierName || 'Fornecedor NF-e',
                        phone: header.supplierPhone || null,
                        document: header.supplierCnpj || null,
                        address: header.supplierAddress || null,
                    }])
                    .select('id')
                    .single();
                if (error) throw error;
                supplierId = newSupplier.id;
            }

            const { data: importRow, error: importError } = await supabase
                .from('nfe_imports')
                .insert([{
                    user_id: user.id,
                    nfe_number: header.number || null,
                    nfe_series: header.series || null,
                    supplier_id: supplierId,
                    issue_date: header.issueDate,
                    total_value: totalValue,
                    xml_filename: fileName,
                }])
                .select('id')
                .single();
            if (importError) throw importError;

            for (const item of items) {
                let productId = item.productId;
                if (productId === NEW_PRODUCT) {
                    const { data: newProduct, error: productError } = await supabase
                        .from('products')
                        .insert([{
                            user_id: user.id,
                            name: item.newName || item.originalName,
                            unit: item.unit || 'un',
                            cost_price: item.unitPrice,
                            sale_price: item.unitPrice,
                        }])
                        .select('id')
                        .single();
                    if (productError) throw productError;
                    productId = newProduct.id;
                } else {
                    await supabase.from('products').update({ cost_price: item.unitPrice }).eq('id', productId);
                }

                const { error: movError } = await supabase.from('stock_movements').insert([{
                    user_id: user.id,
                    product_id: productId,
                    type: 'entrada',
                    quantity: Math.round(item.quantity) || 1,
                    note: `NF-e ${header.number}${header.supplierName ? ' - ' + header.supplierName : ''}`,
                    nfe_import_id: importRow.id,
                }]);
                if (movError) throw movError;
            }

            const { error: cashError } = await supabase.from('cash_entries').insert([{
                user_id: user.id,
                entry_date: header.issueDate,
                type: 'saida',
                category: 'Compra de Mercadoria (NF-e)',
                amount: totalValue,
                description: `NF-e ${header.number}${header.series ? '/' + header.series : ''}`,
                related_party: header.supplierName || null,
                source: 'nfe',
                nfe_import_id: importRow.id,
            }]);
            if (cashError) throw cashError;

            toast.success('NF-e importada! Estoque e Fluxo de Caixa atualizados.');
            resetForm();
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao importar NF-e: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUndo = async (imp: any) => {
        if (!confirm(`Desfazer a importação da NF-e ${imp.nfe_number}? O estoque será revertido e o lançamento no Fluxo de Caixa será removido.`)) return;
        try {
            const { error } = await supabase.from('nfe_imports').delete().eq('id', imp.id);
            if (error) throw error;
            toast.success('Importação desfeita!');
            fetchAll();
        } catch (error: any) {
            toast.error('Erro ao desfazer importação: ' + error.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-cyan/10 flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="w-6 h-6 text-primary-cyan" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-dark">Importar NF-e</h2>
                    <p className="text-gray-500">Suba o XML da nota de compra para lançar estoque e saída no caixa direto, sem passar por Pedido de Compra</p>
                </div>
            </div>

            {!header && (
                <Card>
                    <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-200 rounded-xl py-12 cursor-pointer hover:border-primary-cyan/50 hover:bg-primary-cyan/5 transition-colors">
                        <FileUp className="w-8 h-8 text-gray-400" />
                        <span className="text-sm text-gray-600 font-medium">Clique para selecionar o arquivo XML da NF-e</span>
                        <span className="text-xs text-gray-400">Apenas o XML — o certificado digital não é necessário aqui</span>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xml,text/xml,application/xml"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFile(file);
                            }}
                        />
                    </label>
                </Card>
            )}

            {header && (
                <>
                    <Card>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-base sm:text-lg">Dados da Nota</h3>
                            <span className="text-xs text-gray-400">{fileName}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input label="Número" value={header.number} onChange={(e) => setHeader({ ...header, number: e.target.value })} />
                            <Input label="Série" value={header.series} onChange={(e) => setHeader({ ...header, series: e.target.value })} />
                            <Input label="Data de Emissão" type="date" value={header.issueDate} onChange={(e) => setHeader({ ...header, issueDate: e.target.value })} />
                            <Input label="Valor Total da Nota (R$)" type="number" step="0.01" value={totalValue} onChange={(e) => setTotalValue(parseFloat(e.target.value) || 0)} />
                        </div>

                        <div className="mt-4 p-3 rounded-xl bg-gray-50 text-sm">
                            {matchedSupplierId ? (
                                <p className="text-gray-700">
                                    Fornecedor encontrado: <span className="font-semibold">{suppliers.find(s => s.id === matchedSupplierId)?.name}</span>
                                </p>
                            ) : (
                                <>
                                    <p className="text-gray-700 mb-2">Fornecedor não cadastrado — será criado automaticamente:</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <Input label="Nome" value={header.supplierName} onChange={(e) => setHeader({ ...header, supplierName: e.target.value })} />
                                        <Input label="CNPJ" value={header.supplierCnpj} onChange={(e) => setHeader({ ...header, supplierCnpj: e.target.value })} />
                                    </div>
                                </>
                            )}
                        </div>
                    </Card>

                    <Card>
                        <h3 className="font-semibold text-base sm:text-lg mb-4 flex items-center gap-2">
                            <Package className="w-5 h-5 text-primary-cyan" />
                            Itens da Nota
                        </h3>
                        <div className="space-y-3">
                            {items.map((item, index) => (
                                <div key={index} className="p-3 bg-gray-50 rounded-xl space-y-2">
                                    <p className="text-xs text-gray-400">Descrição na nota: {item.originalName}</p>
                                    <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                                        <div className="flex-1 min-w-0">
                                            <label className="text-xs text-gray-500 mb-1 block">Produto</label>
                                            <SearchableSelect
                                                value={item.productId}
                                                onChange={(value) => updateItem(index, { productId: value })}
                                                options={[
                                                    { value: NEW_PRODUCT, label: `+ Criar novo produto: "${item.originalName}"` },
                                                    ...products.map(p => ({ value: p.id, label: p.name, sublabel: `Estoque: ${p.stock_quantity} ${p.unit}` })),
                                                ]}
                                            />
                                        </div>
                                        <div className="w-full sm:w-24">
                                            <label className="text-xs text-gray-500 mb-1 block">Quantidade</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={item.quantity}
                                                onChange={(e) => updateItem(index, { quantity: parseFloat(e.target.value) || 1 })}
                                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm text-center"
                                            />
                                        </div>
                                        <div className="w-full sm:w-28">
                                            <label className="text-xs text-gray-500 mb-1 block">Preço Unit. (R$)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                value={item.unitPrice}
                                                onChange={(e) => updateItem(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white text-sm text-center"
                                            />
                                        </div>
                                    </div>
                                    {item.productId === NEW_PRODUCT && item.suggestedProductId && (
                                        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                            <span>Parecido com "{item.suggestedProductName}", já cadastrado.</span>
                                            <button
                                                type="button"
                                                onClick={() => updateItem(index, { productId: item.suggestedProductId! })}
                                                className="underline font-medium hover:text-amber-700"
                                            >
                                                Usar este produto
                                            </button>
                                        </div>
                                    )}
                                    {item.productId === NEW_PRODUCT && (
                                        <Input
                                            label="Nome do novo produto"
                                            value={item.newName}
                                            onChange={(e) => updateItem(index, { newName: e.target.value })}
                                        />
                                    )}
                                </div>
                            ))}
                            <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold text-dark">
                                <span>Total dos itens</span>
                                <span>{formatCurrency(itemsTotal)}</span>
                            </div>
                        </div>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                        <Button type="button" onClick={handleConfirm} disabled={isSubmitting}>
                            {isSubmitting ? 'Importando...' : 'Confirmar Importação'}
                        </Button>
                    </div>
                </>
            )}

            <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-base sm:text-lg">Importações Recentes</h3>
                </div>
                <div className="p-4 space-y-3">
                    {imports.length === 0 ? (
                        <p className="text-center text-gray-500 py-6">Nenhuma NF-e importada ainda</p>
                    ) : (
                        imports.map(imp => (
                            <div key={imp.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl text-sm">
                                <div className="min-w-0">
                                    <div className="font-medium text-dark">NF-e {imp.nfe_number}{imp.nfe_series ? `/${imp.nfe_series}` : ''} · {imp.suppliers?.name || 'N/A'}</div>
                                    <div className="text-xs text-gray-500">
                                        {new Date(imp.issue_date + 'T00:00:00').toLocaleDateString('pt-BR')} · {formatCurrency(imp.total_value)}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleUndo(imp)}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-manipulation flex-shrink-0"
                                    title="Desfazer importação"
                                >
                                    <Undo2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
