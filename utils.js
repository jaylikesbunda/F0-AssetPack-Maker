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
        // Add JSZip to the HTML file
        const zip = new JSZip();
        const root = zip.folder(packName);
        
        if (assets.animations.length > 0) {
            const animsFolder = root.folder('Anims');
            for (const [name, anim] of assets.animations) {
                const animFolder = animsFolder.folder(name);
                
                // Add frames
                for (let i = 0; i < anim.frames.length; i++) {
                    const frame = anim.frames[i];
                    const frameData = await this.convertToMonochrome(frame);
                    animFolder.file(`frame_${i}.bm`, frameData);
                }
                
                // Add meta.txt
                const meta = `Width: ${anim.meta.width}
Height: ${anim.meta.height}
Frames: ${anim.frames.length}
Duration: ${1000 / anim.frameRate * anim.frames.length}`;
                animFolder.file('meta.txt', meta);
            }
            
            // Add manifest.txt
            const manifest = assets.animations.map(([name, anim]) => 
                `Name: ${name}
Min butthurt: 0
Max butthurt: 13
Min level: ${anim.minLevel}
Max level: ${anim.maxLevel}
Weight: ${anim.weight}`
            ).join('\n\n');
            animsFolder.file('manifest.txt', manifest);
        }
        
        if (assets.icons.length > 0) {
            const iconsFolder = root.folder('Icons');
            for (const [name, icon] of assets.icons) {
                const categoryFolder = iconsFolder.folder(icon.category);
                const iconData = await this.convertToMonochrome(icon.image);
                categoryFolder.file(`${name}.bmx`, this.createBMXFile(icon));
            }
        }
        
        return await zip.generateAsync({type: 'blob'});
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
            frameRate: 30,
            minLevel: 1,
            maxLevel: 30,
            weight: 1,
            currentFrame: 0,
            isPlaying: false,
            meta: this.createAnimationMeta(frames[0].width, frames[0].height, frames.length)
        });

        return frames[0].dataUrl;
    }

    async addIcon(name, file, width, height) {
        try {
            // Store original file for future resizing
            const originalProcessed = await Utils.resizeImageWithCanvas(file, width, height);
            
            this.icons.set(name, {
                image: {
                    blob: originalProcessed.blob,
                    width: originalProcessed.width,
                    height: originalProcessed.height,
                    originalWidth: originalProcessed.originalWidth,
                    originalHeight: originalProcessed.originalHeight,
                    dataUrl: originalProcessed.dataUrl,
                    originalBlob: file, // Store the original file
                    originalDataUrl: originalProcessed.dataUrl // Store the original processed dataUrl
                },
                meta: this.createIconMeta(width, height)
            });
            
            return originalProcessed.dataUrl;
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
}
