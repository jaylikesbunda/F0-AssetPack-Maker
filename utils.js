class Utils {
    static async resizeImage(file, maxWidth, maxHeight) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // Create canvas at target dimensions
                const canvas = document.createElement('canvas');
                canvas.width = maxWidth;
                canvas.height = maxHeight;
                const ctx = canvas.getContext('2d');
                
                // Configure for pixel-perfect scaling
                ctx.imageSmoothingEnabled = false;
                ctx.mozImageSmoothingEnabled = false;
                ctx.webkitImageSmoothingEnabled = false;
                ctx.msImageSmoothingEnabled = false;
                
                // Calculate scaling while preserving aspect ratio
                const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
                const scaledWidth = Math.floor(img.width * scale);
                const scaledHeight = Math.floor(img.height * scale);
                
                // Center the image
                const x = Math.floor((maxWidth - scaledWidth) / 2);
                const y = Math.floor((maxHeight - scaledHeight) / 2);
                
                // Clear with transparency
                ctx.clearRect(0, 0, maxWidth, maxHeight);
                
                // Draw with pixel-perfect scaling
                ctx.drawImage(img, 0, 0, img.width, img.height, x, y, scaledWidth, scaledHeight);
                
                canvas.toBlob((blob) => {
                    resolve({
                        blob,
                        width: maxWidth,
                        height: maxHeight,
                        dataUrl: canvas.toDataURL('image/png', 1.0)
                    });
                }, 'image/png', 1.0);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    static generateMetaFile(width, height, frameRate, frameCount) {
        // Format: [int32 width] + [int32 height] + [int32 frame_rate] + [int32 frame_count]
        const buffer = new ArrayBuffer(16);
        const view = new Int32Array(buffer);
        view[0] = width;
        view[1] = height;
        view[2] = frameRate;
        view[3] = frameCount;
        return buffer;
    }

    static async createZipFile(packName, assets) {
        const zip = new JSZip();
        const packFolder = zip.folder(packName);
        
        // Handle animations
        if (assets.animations.length > 0) {
            const animsFolder = packFolder.folder('Anims');
            
            // Create manifest.txt first
            let manifest = '';
            for (const [name, anim] of assets.animations) {
                manifest += `Name: ${name}\n`;
            }
            animsFolder.file('manifest.txt', manifest);
            
            // Process each animation
            for (const [name, anim] of assets.animations) {
                const animFolder = animsFolder.folder(name);
                
                // Create meta.txt with EXACT format matching Python
                const meta = `Width: ${anim.frames[0].width}
Height: ${anim.frames[0].height}
Frames: ${anim.frames.length}
Duration: ${anim.frameRate || 30}
Min butthurt: 0
Max butthurt: 14
Min level: ${anim.minLevel || 1}
Max level: ${anim.maxLevel || 30}
Weight: ${anim.weight || 3}`;
                animFolder.file('meta.txt', meta.replace(/\r\n/g, '\n'));  // Ensure LF line endings
                
                // Add frames with correct naming
                for (let i = 0; i < anim.frames.length; i++) {
                    const frameData = await this.convertToXBM(anim.frames[i]);
                    animFolder.file(`frame_${i.toString().padStart(2, '0')}.bm`, frameData);
                }
            }
        }
        
        // Handle icons
        if (assets.icons.length > 0) {
            const iconsFolder = packFolder.folder('Icons');
            
            for (const [name, icon] of assets.icons) {
                const category = icon.category || 'Default';
                const categoryFolder = iconsFolder.folder(category);
                
                if (!Array.isArray(icon.frames)) {
                    // Static icon (.bmx format)
                    const bmxData = await this.convertToBMX(icon.image);
                    
                    // Verify BMX before adding to zip
                    const verification = this.verifyBMXFormat(bmxData);
                    if (!verification.valid) {
                        console.error(`Invalid BMX for ${name}: ${verification.error}`);
                        continue;
                    }
                    
                    const iconName = name.includes('x') ? name : `${name}_${icon.image.width}x${icon.image.height}`;
                    categoryFolder.file(`${iconName}.bmx`, bmxData);
                }
            }
        }
        
        return await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
    }

    static async convertToMonochrome(image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        
        // Draw image
        ctx.drawImage(await createImageBitmap(image.blob), 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Convert to 1-bit monochrome
        const buffer = new Uint8Array(Math.ceil(imageData.width * imageData.height / 8));
        for (let i = 0; i < imageData.data.length; i += 4) {
            const brightness = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
            const pixel = brightness > 127 ? 1 : 0;
            const bufferIndex = Math.floor(i / 32);
            const bitIndex = (i / 4) % 8;
            buffer[bufferIndex] |= pixel << (7 - bitIndex);
        }
        
        return buffer;
    }

    static createBMXFile(icon) {
        const headerSize = 8; // 2 int32s for width and height
        const buffer = new Uint8Array(headerSize + icon.meta.byteLength);
        const view = new DataView(buffer.buffer);
        
        // Write header
        view.setInt32(0, icon.image.width, true);
        view.setInt32(4, icon.image.height, true);
        
        // Copy meta data
        buffer.set(new Uint8Array(icon.meta), headerSize);
        
        return buffer;
    }

    static async previewMonochrome(imgElement) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = imgElement.naturalWidth;
                canvas.height = imgElement.naturalHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                
                // Disable smoothing
                ctx.imageSmoothingEnabled = false;
                ctx.mozImageSmoothingEnabled = false;
                ctx.webkitImageSmoothingEnabled = false;
                ctx.msImageSmoothingEnabled = false;
                
                // Draw image
                ctx.drawImage(imgElement, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                // Convert to strict 1-bit monochrome using luminance
                for (let i = 0; i < imageData.data.length; i += 4) {
                    const r = imageData.data[i];
                    const g = imageData.data[i + 1];
                    const b = imageData.data[i + 2];
                    // Use proper luminance formula
                    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
                    const value = luminance > 127 ? 255 : 0;
                    
                    imageData.data[i] = value;     // R
                    imageData.data[i + 1] = value; // G
                    imageData.data[i + 2] = value; // B
                    // Alpha channel remains unchanged
                }
                
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL('image/png', 1.0));
            } catch (error) {
                reject(error);
            }
        });
    }

    static async resizeImageWithCanvas(imageSource, targetWidth, targetHeight, preserveAspectRatio = false, applyMonochrome = false) {
        return new Promise(async (resolve, reject) => {
            try {
                // Create temporary canvas for the original image
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                
                // Create the output canvas
                const outCanvas = document.createElement('canvas');
                outCanvas.width = targetWidth;
                outCanvas.height = targetHeight;
                const ctx = outCanvas.getContext('2d');

                // Load the image
                const img = new Image();
                img.onload = () => {
                    // Set temp canvas to original image size
                    tempCanvas.width = img.naturalWidth;
                    tempCanvas.height = img.naturalHeight;
                    
                    // Draw original image to temp canvas
                    tempCtx.drawImage(img, 0, 0);
                    
                    // Disable all smoothing
                    ctx.imageSmoothingEnabled = false;
                    ctx.mozImageSmoothingEnabled = false;
                    ctx.webkitImageSmoothingEnabled = false;
                    ctx.msImageSmoothingEnabled = false;

                    // Clear output canvas
                    ctx.clearRect(0, 0, targetWidth, targetHeight);

                    if (preserveAspectRatio) {
                        const scale = Math.min(targetWidth / img.naturalWidth, targetHeight / img.naturalHeight);
                        const scaledWidth = Math.floor(img.naturalWidth * scale);
                        const scaledHeight = Math.floor(img.naturalHeight * scale);
                        const x = Math.floor((targetWidth - scaledWidth) / 2);
                        const y = Math.floor((targetHeight - scaledHeight) / 2);
                        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x, y, scaledWidth, scaledHeight);
                    } else {
                        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, targetWidth, targetHeight);
                    }

                    // Get the resized pixel data
                    const resizedData = ctx.getImageData(0, 0, targetWidth, targetHeight);
                    
                    // Apply monochrome conversion only if requested
                    if (applyMonochrome) {
                        for (let i = 0; i < resizedData.data.length; i += 4) {
                            const r = resizedData.data[i];
                            const g = resizedData.data[i + 1];
                            const b = resizedData.data[i + 2];
                            const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
                            const value = luminance > 127 ? 255 : 0;
                            
                            resizedData.data[i] = value;     // R
                            resizedData.data[i + 1] = value; // G
                            resizedData.data[i + 2] = value; // B
                            // Alpha channel remains unchanged
                        }
                        ctx.putImageData(resizedData, 0, 0);
                    }

                    outCanvas.toBlob((blob) => {
                        resolve({
                            blob,
                            width: targetWidth,
                            height: targetHeight,
                            dataUrl: outCanvas.toDataURL('image/png', 1.0),
                            originalWidth: img.naturalWidth,
                            originalHeight: img.naturalHeight
                        });
                    }, 'image/png', 1.0);
                };

                img.onerror = () => reject(new Error('Failed to load image'));

                if (imageSource instanceof Blob) {
                    img.src = URL.createObjectURL(imageSource);
                } else {
                    img.src = imageSource;
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    static async convertToXBM(image) {
        // First get image data like before
        const imgElement = await this.getImageElement(image);
        const width = imgElement.width;
        const height = imgElement.height;
        
        // Calculate buffer size correctly
        const bufferSize = Math.ceil((width * height) / 8);
        const buffer = new Uint8Array(bufferSize);
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;
        
        // Draw and get image data
        ctx.drawImage(imgElement, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Process pixels using single-dimensional approach
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixelIndex = (y * width + x);
                const i = pixelIndex * 4;
                
                // Use PIL's grayscale formula
                const gray = (imageData.data[i] * 299 + 
                            imageData.data[i + 1] * 587 + 
                            imageData.data[i + 2] * 114) / 1000;
                
                // Invert and set bits
                if (gray < 128) {
                    const byteIndex = Math.floor(pixelIndex / 8);
                    const bitIndex = pixelIndex % 8;
                    buffer[byteIndex] |= (1 << bitIndex);
                }
            }
        }

        // Clean up
        if (imgElement instanceof ImageBitmap) {
            imgElement.close();
        }

        return buffer;
    }

    static verifyBMXFormat(buffer) {
        try {
            if (!(buffer instanceof Uint8Array)) {
                throw new Error('Invalid buffer type');
            }

            // Check minimum size (8 bytes header + 1 byte compression flag + at least 1 byte data)
            if (buffer.length < 10) {
                throw new Error('BMX file too small');
            }

            // Verify header structure
            const view = new DataView(buffer.buffer);
            const width = view.getInt32(0, true);   // Little endian
            const height = view.getInt32(4, true);  // Little endian

            // Validate dimensions (Flipper Zero constraints)
            if (width <= 0 || width > 128 || height <= 0 || height > 64) {
                throw new Error(`Invalid dimensions: ${width}x${height}`);
            }

            // Verify compression flag (0x00 for uncompressed, 0x01 for compressed)
            const compressionFlag = buffer[8];
            if (compressionFlag !== 0x00 && compressionFlag !== 0x01) {
                throw new Error(`Invalid compression flag: ${compressionFlag}`);
            }

            // Calculate expected data size
            const expectedDataSize = Math.ceil(width * height / 8);
            const actualDataSize = buffer.length - 9;  // Subtract header and flag

            // For uncompressed data
            if (compressionFlag === 0x00 && actualDataSize !== expectedDataSize) {
                throw new Error(`Invalid data size for uncompressed BMX: ${actualDataSize} vs expected ${expectedDataSize}`);
            }

            return {
                valid: true,
                width,
                height,
                compressed: compressionFlag === 0x01,
                dataSize: actualDataSize
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }

    static async convertToBMX(image) {
        try {
            // Get dimensions from the actual image data
            const imgElement = await this.getImageElement(image);
            const width = imgElement.width;
            const height = imgElement.height;

            console.log('Converting to BMX:', { width, height });  // Debug log

            // Convert to XBM using same dimensions
            const xbmData = await this.convertToXBM({ width, height, image: imgElement });
            
            // Use consistent size calculation
            const dataSize = Math.ceil((width * height) / 8);  // Match XBM calculation
            
            // Verify XBM data size
            if (xbmData.length !== dataSize) {
                console.error('Size mismatch:', {
                    xbmLength: xbmData.length,
                    calculatedSize: dataSize,
                    dimensions: `${width}x${height}`,
                    calculation: `ceil((${width} * ${height}) / 8) = ${dataSize}`
                });
                throw new Error(`XBM data size mismatch: ${xbmData.length} vs expected ${dataSize}`);
            }
            
            // Create BMX with verified sizes
            const headerSize = 8;
            const flagSize = 1;
            const result = new Uint8Array(headerSize + flagSize + dataSize);
            
            // Write header
            const view = new DataView(result.buffer);
            view.setInt32(0, width, true);
            view.setInt32(4, height, true);
            result[8] = 0x00;  // Uncompressed
            result.set(xbmData, 9);
            
            // Verify final BMX
            const verification = this.verifyBMXFormat(result);
            if (!verification.valid) {
                throw new Error(`Invalid BMX generated: ${verification.error}`);
            }
            
            return result;
        } catch (error) {
            console.error('BMX conversion error:', error);
            throw error;
        }
    }

    static async processImageToBitmap(image) {
        try {
            // Create canvas with proper dimensions
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            
            if (!ctx) {
                throw new Error('Failed to get canvas context');
            }

            // Get proper image data
            let imgElement;
            try {
                imgElement = await this.getImageElement(image);
                canvas.width = imgElement.width;
                canvas.height = imgElement.height;
            } catch (e) {
                throw new Error(`Failed to process image: ${e.message}`);
            }

            // Configure canvas for pixel-perfect rendering
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(imgElement, 0, 0);

            // Process image data with error handling
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { width, height } = imageData;
            
            // Calculate proper buffer size
            const rowSize = Math.ceil(width / 8);
            const bufferSize = rowSize * height;
            const buffer = new Uint8Array(bufferSize);

            // Enhanced pixel processing with bounds checking
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    
                    if (i + 2 >= imageData.data.length) {
                        throw new Error('Image data buffer overflow');
                    }

                    // Improved brightness calculation with gamma correction
                    const r = imageData.data[i] / 255;
                    const g = imageData.data[i + 1] / 255;
                    const b = imageData.data[i + 2] / 255;
                    
                    // sRGB to linear conversion for better monochrome results
                    const brightness = Math.pow(0.2126 * r + 0.7152 * g + 0.0722 * b, 1/2.2);
                    
                    if (brightness > 0.5) {  // Threshold with proper gamma
                        const byteIndex = y * rowSize + Math.floor(x / 8);
                        const bitIndex = 7 - (x % 8);  // MSB first
                        buffer[byteIndex] |= (1 << bitIndex);
                    }
                }
            }

            // Clean up
            if (imgElement instanceof ImageBitmap) {
                imgElement.close();
            }

            return new Uint8Array([0x00, ...buffer]);
        } catch (error) {
            console.error('Bitmap processing error:', error);
            throw error;
        }
    }

    static async getImageElement(image) {
        if (image instanceof ImageBitmap) {
            return image;
        } else if (image instanceof Blob) {
            return await createImageBitmap(image);
        } else if (image.blob) {
            return await createImageBitmap(image.blob);
        } else if (image.originalBlob) {
            return await createImageBitmap(image.originalBlob);
        } else if (image.image instanceof ImageBitmap) {
            return image.image;
        }
        throw new Error('Invalid image format');
    }

    static async createAnimatedIconMeta(width, height, frameRate, frameCount) {
        const buffer = new ArrayBuffer(16);  // 4 int32s
        const view = new DataView(buffer);
        view.setInt32(0, width, true);      // Little endian
        view.setInt32(4, height, true);     // Little endian
        view.setInt32(8, frameRate, true);  // Little endian
        view.setInt32(12, frameCount, true); // Little endian
        return new Uint8Array(buffer);
    }

    static ICON_CATEGORIES = {
        Passport: {
            width: 46,
            height: 49,
            required: true
        },
        RFID: {
            width: 97,
            height: 61,
            required: true
        },
        Animations: {
            width: 128,
            height: 64,
            required: true
        },
        // Add other categories as needed
        Default: {
            width: 128,
            height: 64,
            required: false
        }
    };

    static validateIconSize(category, width, height) {
        const spec = this.ICON_CATEGORIES[category] || this.ICON_CATEGORIES.Default;
        if (!spec.required) return true;
        return width === spec.width && height === spec.height;
    }

    static generateIconName(originalName, category) {
        // Remove extension and clean up name
        const baseName = originalName.replace(/\.[^/.]+$/, '');
        const cleanName = baseName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        
        // Add category-specific prefixes
        switch(category) {
            case 'Passport':
                return `passport_${cleanName}`;
            case 'SubGhz':
                return `subghz_${cleanName}`;
            case 'RFID':
                return `rfid_${cleanName}`;
            case 'iButton':
                return `ibutton_${cleanName}`;
            default:
                return cleanName;
        }
    }
}

// imageProcessor.js
class ImageProcessor {
    constructor() {
        this.animations = new Map();
        this.icons = new Map();
        this.recommendedSizes = {
            'Passport': { width: 46, height: 49 },
            'RFID': { width: 97, height: 61 },
            'Animations': { width: 128, height: 64 },
            'SubGhz': { width: 128, height: 64 },
            'iButton': { width: 128, height: 64 }
        };
    }

    async addAnimation(files, name) {
        const frames = [];
        for (const file of files) {
            const processed = await Utils.resizeImage(file, 128, 64);
            frames.push(processed);
        }

        this.animations.set(name, {
            frames,
            frameRate: 5,
            minLevel: 1,
            maxLevel: 30,
            weight: 1,
            currentFrame: 0,
            isPlaying: false,
            meta: this.createAnimationMeta(frames[0].width, frames[0].height, frames.length)
        });

        return frames[0].dataUrl;
    }

    async addIcon(name, file, category = 'Animations') {
        if (!file) return;

        try {
            const recommendedSize = this.recommendedSizes[category];
            
            // Process the image first
            const processed = await Utils.resizeImageWithCanvas(
                file, 
                recommendedSize.width, 
                recommendedSize.height,
                false,
                false
            );
            
            // Don't modify the name here - use the one provided
            const finalName = name;  // Remove the category prefix logic

            this.icons.set(finalName, {
                image: {
                    blob: processed.blob,
                    width: processed.width,
                    height: processed.height,
                    originalWidth: processed.originalWidth,
                    originalHeight: processed.originalHeight,
                    dataUrl: processed.dataUrl,
                    originalBlob: file,
                    originalDataUrl: processed.dataUrl
                },
                category: category,
                meta: this.createIconMeta(processed.width, processed.height)
            });
            
            return processed.dataUrl;
        } catch (error) {
            console.error('Error adding icon:', error);
            throw error;
        }
    }

    createAnimationMeta(width, height, frameCount) {
        return {
            width,
            height,
            frameCount,
            duration: 0,
            manifest: {
                minLevel: 1,
                maxLevel: 30,
                weight: 1
            }
        };
    }

    updateAnimationMetadata(name, metadata) {
        const animation = this.animations.get(name);
        if (animation) {
            animation.frameRate = metadata.frameRate;
            animation.minLevel = metadata.minLevel;
            animation.maxLevel = metadata.maxLevel;
            animation.weight = metadata.weight;
        }
    }

    createIconMeta(width, height) {
        return Utils.generateMetaFile(width, height, 0, 1);
    }

    removeAnimation(name) {
        this.animations.delete(name);
    }

    removeIcon(name) {
        this.icons.delete(name);
    }

    getAnimations() {
        return Array.from(this.animations.entries());
    }
    
    getIcons() {
        return Array.from(this.icons.entries());
    }
    
    renameAnimation(oldName, newName) {
        const animation = this.animations.get(oldName);
        if (animation) {
            this.animations.delete(oldName);
            this.animations.set(newName, animation);
        }
    }
    
    renameIcon(oldName, newName) {
        const icon = this.icons.get(oldName);
        if (icon) {
            this.icons.delete(oldName);
            this.icons.set(newName, icon);
        }
    }
    
    updateAnimationFrameRate(name, frameRate) {
        const animation = this.animations.get(name);
        if (animation) {
            animation.frameRate = Math.max(1, parseInt(frameRate) || 30);
        }
    }
    
    async resizeIcon(name, width, height, applyMonochrome = false) {
        const icon = this.icons.get(name);
        if (!icon) return null;

        try {
            // Always use the original file for resizing
            const processed = await Utils.resizeImageWithCanvas(
                icon.image.originalBlob, 
                width, 
                height, 
                false, 
                applyMonochrome
            );
            
            this.icons.set(name, {
                ...icon,  // Preserve ALL icon data including category
                image: {
                    ...icon.image, // Preserve original data
                    blob: processed.blob,
                    width: processed.width,
                    height: processed.height,
                    dataUrl: processed.dataUrl
                },
                meta: this.createIconMeta(width, height)
            });

            return processed.dataUrl;
        } catch (error) {
            console.error('Error resizing icon:', error);
            throw error;
        }
    }

    async addFramesToAnimation(name, files) {
        const animation = this.animations.get(name);
        if (!animation) return;

        for (const file of files) {
            const processed = await Utils.resizeImage(file, animation.frames[0].width, animation.frames[0].height);
            animation.frames.push(processed);
        }
        animation.meta.frameCount = animation.frames.length;
    }

    deleteFrame(name, frameIndex) {
        const animation = this.animations.get(name);
        if (!animation || animation.frames.length <= 1) return;

        animation.frames.splice(frameIndex, 1);
        animation.meta.frameCount = animation.frames.length;
    }

    reorderFrames(name, fromIndex, toIndex) {
        const animation = this.animations.get(name);
        if (!animation) return;

        const frame = animation.frames.splice(fromIndex, 1)[0];
        animation.frames.splice(toIndex, 0, frame);
    }

    updateIconCategory(name, category) {
        const icon = this.icons.get(name);
        if (icon) {
            icon.category = category;
        }
    }

    updateIconName(oldName, newName) {
        const icon = this.icons.get(oldName);
        if (icon) {
            this.icons.set(newName, icon);
            this.icons.delete(oldName);
        }
    }
}
