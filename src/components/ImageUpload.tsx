import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { cn } from './ui/Button';
import { compressImages } from '../lib/imageCompression';

interface ImageUploadProps {
    onImagesChange: (files: File[]) => void;
}

export function ImageUpload({ onImagesChange }: ImageUploadProps) {
    const [previews, setPreviews] = useState<string[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [isCompressing, setIsCompressing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            await addFiles(newFiles);
        }
    };

    const addFiles = async (newFiles: File[]) => {
        setIsCompressing(true);
        try {
            // Compress images
            const compressedFiles = await compressImages(newFiles);

            // Create previews
            const newPreviews = compressedFiles.map(file => URL.createObjectURL(file));

            // Update state
            const updatedFiles = [...files, ...compressedFiles];
            const updatedPreviews = [...previews, ...newPreviews];

            setFiles(updatedFiles);
            setPreviews(updatedPreviews);
            onImagesChange(updatedFiles);
        } catch (error) {
            console.error('Error processing images:', error);
        } finally {
            setIsCompressing(false);
        }
    };

    const removeImage = (index: number) => {
        const updatedPreviews = previews.filter((_, i) => i !== index);
        const updatedFiles = files.filter((_, i) => i !== index);

        setPreviews(updatedPreviews);
        setFiles(updatedFiles);
        onImagesChange(updatedFiles);
    };

    return (
        <div className="space-y-4">
            <div
                className={cn(
                    "border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-colors cursor-pointer",
                    isDragging ? "border-primary-green bg-primary-green/5" : "border-gray-200 hover:border-primary-green/50",
                    isCompressing && "opacity-50 pointer-events-none"
                )}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files) {
                        addFiles(Array.from(e.dataTransfer.files));
                    }
                }}
                onClick={() => !isCompressing && fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple
                    accept="image/*"
                    onChange={handleFileSelect}
                    capture="environment"
                />

                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
                        {isCompressing ? (
                            <Loader2 className="w-6 h-6 animate-spin text-primary-green" />
                        ) : (
                            <Upload className="w-6 h-6" />
                        )}
                    </div>
                    <div>
                        <span className="font-semibold text-primary-green">
                            {isCompressing ? 'Comprimindo...' : 'Clique para enviar'}
                        </span>
                        {!isCompressing && <span> ou arraste e solte</span>}
                    </div>
                    <p className="text-xs">PNG, JPG (serão comprimidas automaticamente)</p>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {previews.map((src, index) => (
                    <div key={index} className="relative aspect-square rounded-xl overflow-hidden group">
                        <img src={src} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                        <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-2 right-2 p-1.5 bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                            {(files[index]?.size / 1024).toFixed(0)}KB
                        </div>
                    </div>
                ))}

                <Button
                    type="button"
                    variant="outline"
                    className="h-full min-h-[100px] flex flex-col gap-2 border-dashed touch-manipulation"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressing}
                >
                    <Camera className="w-6 h-6" />
                    <span className="text-xs">Tirar Foto</span>
                </Button>
            </div>
        </div>
    );
}
