export class U8g2Converter {
    convertFromBDF(bdfFont) {
        const header = this.createU8G2Header(bdfFont);
        const glyphData = this.convertGlyphs(bdfFont);
        
        return new Uint8Array([...header, ...glyphData]);
    }
    
    convertFromBitmap(bitmapFont) {
        console.log('Starting bitmap conversion:', {
            size: bitmapFont.size,
            glyphCount: bitmapFont.glyphs.length
        });
        
        // Create header with proper metrics
        const header = new Uint8Array(23);
        header[0] = 0x00;  // Format identifier
        header[1] = bitmapFont.maxWidth || bitmapFont.size;  // Max glyph width
        header[2] = bitmapFont.maxHeight || bitmapFont.size;  // Max glyph height
        header[3] = 0;  // X offset
        header[4] = -bitmapFont.descent;  // Y offset
        header[5] = bitmapFont.size - bitmapFont.descent;  // Ascent
        header[6] = bitmapFont.descent;  // Descent
        header[7] = Math.ceil(bitmapFont.size * 0.15);  // Line spacing
        
        console.log('Creating font header:', {
            maxWidth: header[1],
            maxHeight: header[2],
            ascent: header[5],
            descent: header[6],
            lineSpacing: header[7]
        });
        
        const glyphData = this.convertBitmapGlyphs(bitmapFont);
        console.log('Glyphs converted:', {
            dataSize: glyphData.length,
            glyphCount: bitmapFont.glyphs.length
        });
        
        return new Uint8Array([...header, ...glyphData]);
    }
    
    createU8G2Header(font) {
        // U8g2 font header format
        const header = new Uint8Array(23);
        header[0] = 0x00; // Format identifier
        header[1] = font.properties.boundingBox.width;
        header[2] = font.properties.boundingBox.height;
        // ... additional header data ...
        return header;
    }
    
    convertGlyphs(font) {
        const glyphData = [];
        
        for (const [code, char] of font.chars) {
            // Convert each glyph to U8g2 format
            const glyphHeader = [
                code, // Character code
                char.bbox.width,
                char.bbox.height,
                char.bbox.xOffset,
                char.bbox.yOffset
            ];
            
            // Convert bitmap data
            const bitmap = this.convertBitmapToU8G2Format(char.bitmap);
            glyphData.push(...glyphHeader, ...bitmap);
        }
        
        return glyphData;
    }
    
    convertBitmapGlyphs(bitmapFont) {
        const glyphData = [];
        
        for (const glyph of bitmapFont.glyphs) {
            // Calculate proper byte alignment
            const bytesPerRow = Math.ceil(glyph.width / 8);
            const totalBytes = bytesPerRow * glyph.height;
            
            console.log('Processing glyph:', {
                char: String.fromCharCode(glyph.charCode),
                width: glyph.width,
                height: glyph.height,
                bytesPerRow,
                totalBytes
            });
            
            // Add glyph header with proper alignment
            const glyphHeader = [
                glyph.charCode,
                glyph.width,
                glyph.height,
                0,  // X offset
                -glyph.height  // Y offset
            ];
            
            // Convert bitmap data
            const bitmapBytes = new Uint8Array(totalBytes);
            
            // **Removed vertical inversion**
            for (let y = 0; y < glyph.height; y++) {
                for (let x = 0; x < glyph.width; x++) {
                    // **Direct mapping without inversion**
                    const srcY = y;
                    const srcByte = Math.floor(x / 8);
                    const srcBit = 7 - (x % 8);
                    const srcIndex = srcY * Math.ceil(glyph.width / 8) + srcByte;
                    
                    // Check if the bit is set in the source bitmap
                    if ((glyph.bitmap[srcIndex] & (1 << srcBit)) !== 0) {
                        const destByte = Math.floor(x / 8);
                        const destBit = x % 8;  // Maintain bit order
                        const destIndex = y * bytesPerRow + destByte;
                        bitmapBytes[destIndex] |= (1 << (7 - destBit));  // Maintain MSB first
                        
                        // Debug log
                        console.log(`Setting bit: Y=${y}, X=${x}, ByteIndex=${destIndex}, Bit=${7 - destBit}`);
                    }
                }
            }
            
            glyphData.push(...glyphHeader, ...Array.from(bitmapBytes));
        }
        
        return glyphData;
    }
} 