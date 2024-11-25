import { Utils } from './utils.js';

export class ImageProcessor {
// imageProcessor.js
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
