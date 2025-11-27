import { X, ZoomIn } from 'lucide-react';
import { useState } from 'react';

interface ImageViewerProps {
    images: string[];
    initialIndex?: number;
}

export function ImageViewer({ images, initialIndex = 0 }: ImageViewerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    const openViewer = (index: number) => {
        setCurrentIndex(index);
        setIsOpen(true);
    };

    const closeViewer = () => setIsOpen(false);

    const nextImage = () => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
    };

    const prevImage = () => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    if (images.length === 0) return null;

    return (
        <>
            {/* Thumbnail Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {images.map((url, index) => (
                    <div
                        key={index}
                        className="relative group cursor-pointer"
                        onClick={() => openViewer(index)}
                    >
                        <img
                            src={url}
                            alt={`Foto ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <ZoomIn className="w-6 h-6 text-white" />
                        </div>
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
                            src={images[currentIndex]}
                            alt={`Foto ${currentIndex + 1}`}
                            className="max-w-full max-h-[90vh] object-contain rounded-lg"
                        />

                        {/* Navigation */}
                        {images.length > 1 && (
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
                                    {currentIndex + 1} / {images.length}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
