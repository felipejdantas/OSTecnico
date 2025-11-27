import { useRef, forwardRef, useImperativeHandle } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from './ui/Button';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
    onEnd?: () => void;
}

export interface SignaturePadRef {
    clear: () => void;
    isEmpty: () => boolean;
    toDataURL: () => string;
}

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(({ onEnd }, ref) => {
    const sigCanvas = useRef<SignatureCanvas>(null);

    useImperativeHandle(ref, () => ({
        clear: () => sigCanvas.current?.clear(),
        isEmpty: () => sigCanvas.current?.isEmpty() ?? true,
        toDataURL: () => sigCanvas.current?.toDataURL() ?? '',
    }));

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="relative h-48 w-full bg-gray-50">
                <SignatureCanvas
                    ref={sigCanvas}
                    penColor="black"
                    canvasProps={{
                        className: 'absolute inset-0 w-full h-full',
                    }}
                    onEnd={onEnd}
                />
                <div className="absolute bottom-2 right-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => sigCanvas.current?.clear()}
                        className="bg-white/80 backdrop-blur-sm hover:bg-white"
                    >
                        <Eraser className="w-4 h-4 mr-2" />
                        Limpar
                    </Button>
                </div>
            </div>
            <div className="p-2 bg-gray-50 border-t border-gray-100 text-center text-xs text-gray-400">
                Assine acima
            </div>
        </div>
    );
});

SignaturePad.displayName = 'SignaturePad';

export { SignaturePad };
