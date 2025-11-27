import { Check, X, HelpCircle } from 'lucide-react';
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
};

export default function ChecklistSection({ title, items, onUpdate }: ChecklistSectionProps) {
    const updateItem = (index: number, field: 'status' | 'observation', value: string) => {
        const newItems = [...items];
        if (field === 'status') {
            newItems[index].status = value as ChecklistItemStatus;
        } else {
            newItems[index].observation = value;
        }
        onUpdate(newItems);
    };

    return (
        <Card className="mb-4">
            <h3 className="font-semibold text-lg mb-4 text-primary-green">{title}</h3>
            <div className="space-y-3">
                {items.map((item, index) => (
                    <div key={index} className="border-b border-gray-100 pb-3 last:border-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                            <span className="text-sm font-medium text-dark flex-1">{item.label}</span>

                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => updateItem(index, 'status', 'ok')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1",
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
                                    onClick={() => updateItem(index, 'status', 'defect')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1",
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
                                    onClick={() => updateItem(index, 'status', 'na')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1",
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
                            placeholder="Obs..."
                            value={item.observation}
                            onChange={(e) => updateItem(index, 'observation', e.target.value)}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-gray-50"
                        />
                    </div>
                ))}
            </div>
        </Card>
    );
}
