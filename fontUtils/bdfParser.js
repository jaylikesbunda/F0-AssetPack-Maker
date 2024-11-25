export class BDFParser {
    async parse(text) {
        const lines = text.split('\n');
        const font = {
            properties: {},
            chars: new Map()
        };
        
        let currentChar = null;
        let bitmapData = [];
        
        for (const line of lines) {
            const [command, ...args] = line.trim().split(' ');
            
            switch (command) {
                case 'FONTBOUNDINGBOX':
                    font.properties.boundingBox = {
                        width: parseInt(args[0]),
                        height: parseInt(args[1]),
                        xOffset: parseInt(args[2]),
                        yOffset: parseInt(args[3])
                    };
                    break;
                    
                case 'STARTCHAR':
                    currentChar = {
                        name: args[0],
                        bitmap: []
                    };
                    break;
                    
                case 'ENCODING':
                    if (currentChar) {
                        currentChar.code = parseInt(args[0]);
                    }
                    break;
                    
                case 'BBX':
                    if (currentChar) {
                        currentChar.bbox = {
                            width: parseInt(args[0]),
                            height: parseInt(args[1]),
                            xOffset: parseInt(args[2]),
                            yOffset: parseInt(args[3])
                        };
                    }
                    break;
                    
                case 'BITMAP':
                    bitmapData = [];
                    break;
                    
                case 'ENDCHAR':
                    if (currentChar) {
                        currentChar.bitmap = bitmapData;
                        font.chars.set(currentChar.code, currentChar);
                        currentChar = null;
                    }
                    break;
                    
                default:
                    if (currentChar && bitmapData !== null) {
                        // Parse hex bitmap data
                        if (/^[0-9A-Fa-f]+$/.test(line.trim())) {
                            bitmapData.push(parseInt(line.trim(), 16));
                        }
                    }
            }
        }
        
        return font;
    }
} 