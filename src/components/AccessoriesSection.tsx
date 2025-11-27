import { Card } from './ui/Card';

export type AccessoriesData = {
    fonte: boolean;
    cabo: boolean;
    mochila: boolean;
    outro: string;
};

type AccessoriesSectionProps = {
    value: AccessoriesData;
    onChange: (value: AccessoriesData) => void;
};

export default function AccessoriesSection({ value, onChange }: AccessoriesSectionProps) {
    const handleCheckboxChange = (field: 'fonte' | 'cabo' | 'mochila') => {
        onChange({
            ...value,
            [field]: !value[field],
        });
    };

    const handleOutroChange = (text: string) => {
        onChange({
            ...value,
            outro: text,
        });
    };

    return (
        <Card>
            <h3 className="font-semibold text-lg mb-4 text-primary-green">Acessórios Recebidos</h3>

            <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={value.fonte}
                        onChange={() => handleCheckboxChange('fonte')}
                        className="w-5 h-5 rounded border-gray-300 text-primary-green focus:ring-primary-green/50 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-dark group-hover:text-primary-green transition-colors">
                        Fonte
                    </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={value.cabo}
                        onChange={() => handleCheckboxChange('cabo')}
                        className="w-5 h-5 rounded border-gray-300 text-primary-green focus:ring-primary-green/50 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-dark group-hover:text-primary-green transition-colors">
                        Cabo
                    </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={value.mochila}
                        onChange={() => handleCheckboxChange('mochila')}
                        className="w-5 h-5 rounded border-gray-300 text-primary-green focus:ring-primary-green/50 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-dark group-hover:text-primary-green transition-colors">
                        Mochila
                    </span>
                </label>

                <div className="pt-2">
                    <label className="text-sm font-medium text-gray-600 mb-1 block">
                        Outro acessório
                    </label>
                    <input
                        type="text"
                        value={value.outro}
                        onChange={(e) => handleOutroChange(e.target.value)}
                        placeholder="Descreva outro acessório..."
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white"
                    />
                </div>
            </div>
        </Card>
    );
}
