export class PCFParser {
    async parse(buffer) {
        const view = new DataView(buffer);
        const header = this.parseHeader(view);
        const tables = this.parseTables(view, header);
        
        return {
            properties: tables.properties,
            metrics: tables.metrics,
            bitmaps: tables.bitmaps,
            encodings: tables.encodings
        };
    }
    
    async convertToBDF(pcfFont) {
        // Convert PCF data structure to BDF format
        let bdf = 'STARTFONT 2.1\n';
        
        // Add font properties
        bdf += `FONT ${pcfFont.properties.fontName}\n`;
        bdf += `SIZE ${pcfFont.properties.pointSize} 75 75\n`;
        
        // Add character data
        for (const [encoding, glyph] of Object.entries(pcfFont.encodings)) {
            const metrics = pcfFont.metrics[glyph.index];
            const bitmap = pcfFont.bitmaps[glyph.index];
            
            bdf += `STARTCHAR char${encoding}\n`;
            bdf += `ENCODING ${encoding}\n`;
            bdf += `BBX ${metrics.width} ${metrics.height} ${metrics.xOffset} ${metrics.yOffset}\n`;
            bdf += 'BITMAP\n';
            
            // Convert bitmap data to hex strings
            for (const row of bitmap) {
                bdf += row.toString(16).padStart(2, '0') + '\n';
            }
            
            bdf += 'ENDCHAR\n';
        }
        
        bdf += 'ENDFONT\n';
        return bdf;
    }
} 