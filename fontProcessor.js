export class FontProcessor {
    constructor() {
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
            // Convert font file to U8F format
            const fontData = await this.processFont(file);
            
            this.fonts.set(name, {
                data: fontData,
                originalFile: file,
                name: name
            });

            return URL.createObjectURL(new Blob([fontData]));
        } catch (error) {
            throw new Error(`Failed to process font: ${error.message}`);
        }
    }

    async processFont(file) {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        
        switch (ext) {
            case '.c':
                return await this.processCFile(file);
            case '.u8f':
                return await this.processU8FFile(file);
            case '.bdf':
                return await this.processBDFFile(file);
            case '.pcf':
                return await this.processPCFFile(file);
            case '.ttf':
                return await this.processTTFFile(file);
            default:
                throw new Error('Unsupported font format');
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
        // TODO: Implement BDF conversion
        throw new Error('BDF support coming soon');
    }

    async processPCFFile(file) {
        // TODO: Implement PCF conversion
        throw new Error('PCF support coming soon');
    }

    async processTTFFile(file) {
        // TODO: Implement TTF conversion
        throw new Error('TTF support coming soon');
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
        this.fonts.delete(name);
    }
} 