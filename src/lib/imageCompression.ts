import imageCompression from 'browser-image-compression';

/**
 * Compresses an image file to a target size between 200-350KB
 * @param file - The image file to compress
 * @returns Promise<File> - The compressed image file
 */
export async function compressImage(file: File): Promise<File> {
    const options = {
        maxSizeMB: 0.3, // 300KB max target
        maxWidthOrHeight: 1280, // HD resolution is enough for reports
        useWebWorker: true,
        initialQuality: 0.8,
    };

    try {
        let compressedFile = await imageCompression(file, options);

        // If file is still too small, try with higher quality
        if (compressedFile.size < 200 * 1024) {
            const higherQualityOptions = {
                ...options,
                initialQuality: 0.9,
                maxSizeMB: 0.3,
            };
            compressedFile = await imageCompression(file, higherQualityOptions);
        }

        // If file is too large, compress more aggressively
        if (compressedFile.size > 350 * 1024) {
            const lowerQualityOptions = {
                ...options,
                maxSizeMB: 0.25,
                initialQuality: 0.7,
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
