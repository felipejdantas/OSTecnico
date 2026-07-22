import { useEffect, useRef, useState } from 'react';
import { Camera, Upload, X, Loader2, RotateCcw, Check } from 'lucide-react';
import { Button } from './ui/Button';
import { cn } from './ui/Button';
import { compressImages } from '../lib/imageCompression';

interface ImageUploadProps {
    onImagesChange: (files: File[]) => void;
    disabled?: boolean;
}

export function ImageUpload({ onImagesChange, disabled }: ImageUploadProps) {
    const [previews, setPreviews] = useState<string[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [isCompressing, setIsCompressing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fallbackCaptureInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // In-page camera: capturing the photo without ever leaving this page avoids
    // the native camera app suspending/reloading the tab on some Android devices,
    // which used to wipe the whole form and drop the photo before it could attach.
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
    const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    useEffect(() => {
        if (!capturedBlob) {
            setCapturedPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(capturedBlob);
        setCapturedPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [capturedBlob]);

    useEffect(() => {
        // Make sure the camera is released if the component unmounts mid-capture
        return () => {
            stream?.getTracks().forEach(track => track.stop());
        };
    }, [stream]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            await addFiles(newFiles);
        }
        e.target.value = '';
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

    const openCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false,
            });
            setStream(mediaStream);
            setCapturedBlob(null);
            setIsCameraOpen(true);
        } catch (error) {
            console.error('Camera unavailable, falling back to native capture:', error);
            fallbackCaptureInputRef.current?.click();
        }
    };

    const closeCamera = () => {
        stream?.getTracks().forEach(track => track.stop());
        setStream(null);
        setIsCameraOpen(false);
        setCapturedBlob(null);
    };

    const capturePhoto = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (blob) setCapturedBlob(blob);
        }, 'image/jpeg', 0.9);
    };

    const confirmCapture = async () => {
        if (!capturedBlob) return;
        const file = new File([capturedBlob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
        closeCamera();
        await addFiles([file]);
    };

    return (
        <div className="space-y-4">
            <div
                className={cn(
                    "border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-colors cursor-pointer",
                    isDragging ? "border-primary-green bg-primary-green/5" : "border-gray-200 hover:border-primary-green/50",
                    (isCompressing || disabled) && "opacity-50 pointer-events-none"
                )}
                onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (!disabled && e.dataTransfer.files) {
                        addFiles(Array.from(e.dataTransfer.files));
                    }
                }}
                onClick={() => !isCompressing && !disabled && fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple
                    accept="image/*"
                    disabled={disabled}
                    onChange={handleFileSelect}
                />
                {/* Only used if the in-page camera can't start (old browser, permission blocked, etc.) */}
                <input
                    type="file"
                    ref={fallbackCaptureInputRef}
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
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
                    onClick={openCamera}
                    disabled={isCompressing || disabled}
                >
                    <Camera className="w-6 h-6" />
                    <span className="text-xs">Tirar Foto</span>
                </Button>
            </div>

            {isCameraOpen && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col">
                    <canvas ref={canvasRef} className="hidden" />

                    <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                        {capturedPreviewUrl ? (
                            <img
                                src={capturedPreviewUrl}
                                alt="Foto capturada"
                                className="max-w-full max-h-full object-contain"
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="max-w-full max-h-full object-contain"
                            />
                        )}

                        <button
                            type="button"
                            onClick={closeCamera}
                            className="absolute top-4 right-4 p-2.5 bg-black/60 text-white rounded-full touch-manipulation"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="p-6 flex items-center justify-center gap-6 bg-black">
                        {capturedBlob ? (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="touch-manipulation border-white text-white hover:bg-white/10"
                                    onClick={() => setCapturedBlob(null)}
                                >
                                    <RotateCcw className="w-5 h-5 mr-2" />
                                    Tirar novamente
                                </Button>
                                <Button type="button" className="touch-manipulation" onClick={confirmCapture}>
                                    <Check className="w-5 h-5 mr-2" />
                                    Usar esta foto
                                </Button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={capturePhoto}
                                aria-label="Capturar foto"
                                className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 touch-manipulation active:scale-95 transition-transform"
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
