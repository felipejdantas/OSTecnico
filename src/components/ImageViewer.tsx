import { X, ZoomIn } from 'lucide-react';
import { useState } from 'react';

export type PhotoEntry = string | { url: string; date?: string | null };

interface ImageViewerProps {
    images: PhotoEntry[];
    initialIndex?: number;
}

function normalize(entry: PhotoEntry): { url: string; date?: string | null } {
    return typeof entry === 'string' ? { url: entry } : entry;
}

export function ImageViewer({ images, initialIndex = 0 }: ImageViewerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    const photos = images.map(normalize);

    const openViewer = (index: number) => {
        setCurrentIndex(index);
        setIsOpen(true);
    };

    const closeViewer = () => setIsOpen(false);

    const nextImage = () => {
        setCurrentIndex((prev) => (prev + 1) % photos.length);
    };

    const prevImage = () => {
        setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    };

    if (photos.length === 0) return null;

    return (
        <>
            {/* Thumbnail Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {photos.map((photo, index) => (
                    <div key={index} className="flex flex-col gap-1">
                        <div
                            className="relative group cursor-pointer"
                            onClick={() => openViewer(index)}
                        >
                            <img
                                src={photo.url}
                                alt={`Foto ${index + 1}`}
                                className="w-full h-24 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                <ZoomIn className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        {photo.date && (
                            <span className="text-[11px] text-gray-400 text-center">
                                {new Date(photo.date).toLocaleDateString('pt-BR')}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Full Screen Modal */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
                    onClick={closeViewer}
                >
                    <button
                        onClick={closeViewer}
                        className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
                        aria-label="Fechar"
                    >
                        <X className="w-8 h-8" />
                    </button>

                    <div className="relative max-w-5xl max-h-full" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={photos[currentIndex].url}
                            alt={`Foto ${currentIndex + 1}`}
                            className="max-w-full max-h-[90vh] object-contain rounded-lg"
                        />

                        {photos[currentIndex].date && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                                {new Date(photos[currentIndex].date!).toLocaleDateString('pt-BR')}
                            </div>
                        )}

                        {/* Navigation */}
                        {photos.length > 1 && (
                            <>
                                <button
                                    onClick={prevImage}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white p-3 rounded-full transition-colors"
                                    aria-label="Anterior"
                                >
                                    ←
                                </button>
                                <button
                                    onClick={nextImage}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white p-3 rounded-full transition-colors"
                                    aria-label="Próxima"
                                >
                                    →
                                </button>
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                                    {currentIndex + 1} / {photos.length}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
