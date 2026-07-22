import { useState } from 'react';
import { Check, X, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from './ui/Card';
import { cn } from './ui/Button';

export type ChecklistItemStatus = 'ok' | 'defect' | 'na';

export type ChecklistItem = {
    label: string;
    status: ChecklistItemStatus;
    observation: string;
};

type ChecklistSectionProps = {
    title: string;
    items: ChecklistItem[];
    onUpdate: (items: ChecklistItem[]) => void;
    disabled?: boolean;
};

export default function ChecklistSection({ title, items, onUpdate, disabled }: ChecklistSectionProps) {
    const [isOpen, setIsOpen] = useState(false);

    const updateItem = (index: number, field: 'status' | 'observation', value: string) => {
        const newItems = [...items];
        if (field === 'status') {
            newItems[index].status = value as ChecklistItemStatus;
        } else {
            newItems[index].observation = value;
        }
        onUpdate(newItems);
    };

    const defectCount = items.filter(i => i.status === 'defect').length;
    const checkedCount = items.filter(i => i.status !== 'na').length;

    return (
        <Card className="mb-4">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full"
            >
                <h3 className="font-semibold text-lg text-primary-green">{title}</h3>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                        {checkedCount}/{items.length} preenchidos
                        {defectCount > 0 && <span className="text-red-500 font-medium"> · {defectCount} defeito{defectCount > 1 ? 's' : ''}</span>}
                    </span>
                    {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </div>
            </button>
            {isOpen && (
            <div className="space-y-3 mt-4">
                {items.map((item, index) => (
                    <div key={index} className="border-b border-gray-100 pb-3 last:border-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                            <span className="text-sm font-medium text-dark flex-1">{item.label}</span>

                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => updateItem(index, 'status', 'ok')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed",
                                        item.status === 'ok'
                                            ? "bg-green-500 text-white shadow-sm"
                                            : "bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-600"
                                    )}
                                >
                                    <Check className="w-3 h-3" />
                                    OK
                                </button>

                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => updateItem(index, 'status', 'defect')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed",
                                        item.status === 'defect'
                                            ? "bg-red-500 text-white shadow-sm"
                                            : "bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600"
                                    )}
                                >
                                    <X className="w-3 h-3" />
                                    Defeito
                                </button>

                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => updateItem(index, 'status', 'na')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed",
                                        item.status === 'na'
                                            ? "bg-gray-500 text-white shadow-sm"
                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    )}
                                >
                                    <HelpCircle className="w-3 h-3" />
                                    N/V
                                </button>
                            </div>
                        </div>

                        <input
                            type="text"
                            disabled={disabled}
                            placeholder="Obs..."
                            value={item.observation}
                            onChange={(e) => updateItem(index, 'observation', e.target.value)}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                    </div>
                ))}
            </div>
            )}
        </Card>
    );
}
