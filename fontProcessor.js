import { BDFParser } from './fontUtils/bdfParser.js';
import { PCFParser } from './fontUtils/pcfParser.js';
import { U8g2Converter } from './fontUtils/u8g2Converter.js';

export class FontProcessor {
    constructor() {
        if (typeof opentype === 'undefined') {
            throw new Error('opentype.js library not loaded');
        }
        
        this.fonts = new Map();
        this.recommendedSizes = {
            Small: { width: 5, height: 8 },
            Medium: { width: 6, height: 10 },
            Large: { width: 8, height: 12 }
        };
        this.supportedFormats = {
            '.u8f': 'U8g2 Binary Font',
            '.c': 'U8g2 C Source',
            '.bdf': 'Bitmap Distribution Format',
            '.pcf': 'Portable Compiled Format',
            '.ttf': 'TrueType Font'
        };
    }

    async addFont(name, file) {
        try {
            console.log('Processing font file:', { name, type: file.name });
            const fontData = await this.processFont(file);
            console.log('Font data processed:', { dataLength: fontData.length });
            
            this.fonts.set(name, {
                data: fontData,
                originalFile: file,
                name: name
            });
            
            return 'success'; // Preview URL no longer needed
        } catch (error) {
            console.error('Error in FontProcessor.addFont:', error);
            throw error;
        }
    }

    async processFont(file) {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        console.log('Processing font:', { 
            extension: ext, 
            fileSize: file.size,
            fileName: file.name 
        });
        
        try {
            let result;
            switch (ext) {
                case '.ttf':
                    result = await this.processTTFFile(file);
                    console.log('TTF processing complete:', { 
                        resultSize: result.length,
                        resultType: result.constructor.name
                    });
                    return result;
                case '.c':
                    return await this.processCFile(file);
                case '.u8f':
                    return await this.processU8FFile(file);
                case '.bdf':
                    return await this.processBDFFile(file);
                case '.pcf':
                    return await this.processPCFFile(file);
                default:
                    throw new Error('Unsupported font format');
            }
        } catch (error) {
            console.error('Font processing error:', error);
            throw error;
        }
    }

    async processCFile(file) {
        const text = await file.text();
        // Extract font data between U8G2_FONT_SECTION markers
        const match = text.match(/U8G2_FONT_SECTION\("([^"]+)"\)/);
        if (!match) {
            throw new Error('Invalid font file format: U8G2_FONT_SECTION not found');
        }

        // Convert the extracted string to binary data
        const fontData = this.decodeUnicodeEscape(match[1]);
        return fontData;
    }

    async processU8FFile(file) {
        return await file.arrayBuffer();
    }

    async processBDFFile(file) {
        const text = await file.text();
        const parser = new BDFParser();
        const bdfFont = await parser.parse(text);
        
        // Convert BDF to U8g2 format
        const converter = new U8g2Converter();
        return converter.convertFromBDF(bdfFont);
    }

    async processPCFFile(file) {
        const buffer = await file.arrayBuffer();
        const parser = new PCFParser();
        const pcfFont = await parser.parse(buffer);
        
        // Convert PCF to BDF first, then to U8g2
        const bdfData = await parser.convertToBDF(pcfFont);
        const converter = new U8g2Converter();
        return converter.convertFromBDF(bdfData);
    }

    async processTTFFile(file) {
        try {
            console.log('Starting TTF processing');
            const buffer = await file.arrayBuffer();
            console.log('File loaded as ArrayBuffer:', { size: buffer.byteLength });
            
            const font = await opentype.parse(buffer);
            console.log('OpenType parsing complete:', { 
                glyphCount: font.glyphs.length,
                unitsPerEm: font.unitsPerEm
            });
            
            // Convert TTF to bitmap format with error handling
            const bitmapData = await this.convertTTFtoBitmap(font);
            console.log('Bitmap conversion complete:', {
                glyphCount: bitmapData?.glyphs?.length,
                size: bitmapData?.size
            });
            
            if (!bitmapData || !bitmapData.glyphs || bitmapData.glyphs.length === 0) {
                throw new Error('Failed to generate bitmap data from TTF');
            }
            
            const converter = new U8g2Converter();
            const result = converter.convertFromBitmap(bitmapData);
            console.log('U8G2 conversion complete:', {
                resultSize: result.length,
                resultType: result.constructor.name
            });
            
            return result;
        } catch (error) {
            console.error('TTF processing error:', error);
            throw new Error(`TTF processing failed: ${error.message}`);
        }
    }

    async convertTTFtoBitmap(font, size = 16) {
        if (!font || !font.charToGlyph) {
            throw new Error('Invalid font object');
        }

        const glyphs = [];
        const scale = 1 / font.unitsPerEm * size;
        let maxWidth = 0;
        let maxHeight = 0;

        // Process each character in the basic Latin range
        for (let charCode = 32; charCode < 127; charCode++) {
            try {
                const glyph = font.charToGlyph(String.fromCharCode(charCode));
                if (!glyph) continue;

                const width = Math.ceil(glyph.advanceWidth * scale);
                const height = size;
                
                maxWidth = Math.max(maxWidth, width);
                maxHeight = Math.max(maxHeight, height);
                
                // Create canvas for rendering with error checking
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    throw new Error('Failed to get canvas context');
                }
                
                // Draw glyph onto canvas
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.fillStyle = '#000000';
                glyph.draw(ctx, 0, height, size);
                
                // Convert canvas to monochrome bitmap
                const imageData = ctx.getImageData(0, 0, width, height);
                
                // Correct buffer allocation based on bytes per row
                const bytesPerRow = Math.ceil(width / 8);
                const buffer = new Uint8Array(bytesPerRow * height);
                
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const pixelIndex = (y * width + x) * 4;
                        const brightness = (imageData.data[pixelIndex] + imageData.data[pixelIndex + 1] + imageData.data[pixelIndex + 2]) / 3;
                        const pixel = brightness > 127 ? 1 : 0;
                        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
                        const bitIndex = 7 - (x % 8);
                        buffer[byteIndex] |= pixel << bitIndex;
                    }
                }

                glyphs.push({
                    charCode,
                    width,
                    height,
                    bitmap: buffer
                });
            } catch (err) {
                console.warn(`Failed to process character ${charCode}:`, err);
                continue; // Skip problematic characters instead of failing
            }
        }

        if (glyphs.length === 0) {
            throw new Error('No valid glyphs could be processed');
        }

        return {
            glyphs,
            size,
            ascent: Math.ceil(Math.abs(font.ascender * scale)),
            descent: Math.ceil(Math.abs(font.descender * scale)),
            maxWidth,
            maxHeight
        };
    }

    decodeUnicodeEscape(str) {
        // Convert Unicode escape sequences to binary data
        return new TextEncoder().encode(
            str.replace(/\\u([0-9a-fA-F]{4})/g, 
                (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        );
    }

    getFonts() {
        return Array.from(this.fonts.entries());
    }

    removeFont(name) {
        const result = this.fonts.delete(name);
        console.log(`Removed font ${name}: ${result}`);
        return result;
    }

    convertToMonochrome(imageData) {
        const buffer = new Uint8Array(Math.ceil(imageData.width * imageData.height / 8));
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const i = (y * imageData.width + x) * 4;
                const brightness = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
                const bit = brightness > 127 ? 1 : 0;
                const byteIndex = Math.floor((y * imageData.width + x) / 8);
                const bitIndex = 7 - ((y * imageData.width + x) % 8);
                buffer[byteIndex] |= bit << bitIndex;
            }
        }
        return buffer;
    }

    validateFont(font) {
        // Basic validation of font data
        if (!font || !font.properties || !font.chars) {
            throw new Error('Invalid font format: missing required properties');
        }

        // Check for required font metrics
        if (!font.properties.boundingBox) {
            throw new Error('Invalid font format: missing bounding box information');
        }

        // Verify character data
        if (font.chars.size === 0) {
            throw new Error('Invalid font: no character data found');
        }

        return true;
    }

    async parseU8G2Font(fontData) {
        console.log('Starting U8G2 font parsing:', { 
            type: fontData instanceof Uint8Array ? 'Uint8Array' : 'ArrayBuffer',
            length: fontData.length || fontData.byteLength 
        });
        
        const buffer = fontData instanceof Uint8Array ? fontData.buffer : fontData;
        const view = new DataView(buffer);
        
        try {
            // Parse header
            console.log('Parsing font header...');
            const font = {
                properties: {
                    boundingBox: {
                        width: view.getUint8(1),
                        height: view.getUint8(2),
                        xOffset: view.getInt8(3),
                        yOffset: view.getInt8(4)
                    },
                    ascent: view.getUint8(5),
                    descent: view.getUint8(6),
                    lineSpacing: view.getUint8(7)
                },
                chars: new Map()
            };
            
            console.log('Font header parsed:', font.properties);
            
            let offset = 23;  // Skip header
            let glyphCount = 0;
            
            // Parse glyphs
            while (offset + 5 < buffer.byteLength) {
                try {
                    const charCode = view.getUint8(offset++);
                    const width = view.getUint8(offset++);
                    const height = view.getUint8(offset++);
                    const xOffset = view.getInt8(offset++);
                    const yOffset = view.getInt8(offset++);
                    
                    console.log(`Parsing glyph ${glyphCount++}:`, {
                        charCode,
                        char: String.fromCharCode(charCode),
                        dimensions: { width, height },
                        offset: { x: xOffset, y: yOffset }
                    });
                    
                    // Calculate bitmap size with proper byte alignment
                    const bytesPerRow = Math.ceil(width / 8);
                    const bitmapSize = bytesPerRow * height;
                    
                    // Check if we have enough data left
                    if (offset + bitmapSize > buffer.byteLength) {
                        console.warn('Incomplete bitmap data for char:', charCode);
                        break;
                    }
                    
                    const bitmap = new Uint8Array(buffer, offset, bitmapSize);
                    offset += bitmapSize;
                    
                    font.chars.set(charCode, {
                        bbox: { width, height, xOffset, yOffset },
                        bitmap: new Uint8Array(bitmap)
                    });
                } catch (error) {
                    console.warn('Error parsing glyph:', error);
                    break;
                }
            }
            
            console.log('Font parsing complete:', {
                totalGlyphs: font.chars.size,
                bytesProcessed: offset
            });
            
            return font;
        } catch (error) {
            console.error('Font parsing error:', error);
            throw error;
        }
    }

    async drawPreviewText(ctx, fontData, text, x, y, scale = 1) {
        const font = await this.parseU8G2Font(fontData);
        let currentX = x;
        
        console.log('Drawing text with font:', {
            metrics: font.properties,
            charsAvailable: Array.from(font.chars.keys())
        });
        
        for (const char of text) {
            const charCode = char.charCodeAt(0);
            const glyph = font.chars.get(charCode);
            
            if (glyph) {
                // Add character code to glyph data for debugging
                const glyphWithChar = {
                    ...glyph,
                    charCode: charCode,
                    char: char
                };
                
                await this.drawGlyphBitmap(ctx, glyphWithChar, currentX, y, scale);
                currentX += (glyph.bbox.width + 1) * scale;
            } else {
                console.warn(`Missing glyph for character: ${char} (${charCode})`);
            }
        }
    }

    validateFontData(fontData, type) {
        if (!fontData) {
            throw new Error('No font data provided');
        }
        
        if (type === 'TTF') {
            if (!fontData.unitsPerEm || !fontData.ascender || !fontData.descender) {
                throw new Error('Invalid TTF metrics');
            }
        } else if (type === 'U8G2') {
            if (fontData.length < 23) {
                throw new Error('Invalid U8G2 font data (too small)');
            }
            
            const view = new DataView(fontData.buffer);
            if (view.getUint8(0) !== 0) {
                throw new Error('Invalid U8G2 font format');
            }
        }
        
        return true;
    }
} 