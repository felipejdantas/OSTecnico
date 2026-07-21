import imageCompression from 'browser-image-compression';

/**
 * Compresses an image file to a target size between ~350-700KB, sharp enough
 * to zoom into equipment defects/serial numbers. Storage impact is negligible:
 * the whole bucket was only ~5.7MB total before this change.
 * @param file - The image file to compress
 * @returns Promise<File> - The compressed image file
 */
export async function compressImage(file: File): Promise<File> {
    const options = {
        maxSizeMB: 0.5, // 500KB target
        maxWidthOrHeight: 1920, // Full HD - enough detail to zoom into defects
        useWebWorker: true,
        initialQuality: 0.85,
    };

    try {
        let compressedFile = await imageCompression(file, options);

        // If file is still small, there's room for more quality
        if (compressedFile.size < 350 * 1024) {
            const higherQualityOptions = {
                ...options,
                initialQuality: 0.92,
            };
            compressedFile = await imageCompression(file, higherQualityOptions);
        }

        // If file is too large, compress more aggressively
        if (compressedFile.size > 700 * 1024) {
            const lowerQualityOptions = {
                ...options,
                maxSizeMB: 0.45,
                initialQuality: 0.75,
            };
            compressedFile = await imageCompression(file, lowerQualityOptions);
        }

        console.log(`Image compressed: ${(file.size / 1024).toFixed(2)}KB → ${(compressedFile.size / 1024).toFixed(2)}KB`);

        return compressedFile;
    } catch (error) {
        console.error('Error compressing image:', error);
        return file; // Return original if compression fails
    }
}

/**
 * Compresses multiple image files
 * @param files - Array of image files to compress
 * @returns Promise<File[]> - Array of compressed image files
 */
export async function compressImages(files: File[]): Promise<File[]> {
    return Promise.all(files.map(file => compressImage(file)));
}
