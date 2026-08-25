import * as fs from 'fs';
import * as path from 'path';

/**
 * Saves a Base64 canvas signature string to disk as a PNG image file
 * and returns the relative static upload path.
 */
export function saveBase64Signature(base64Data: string, filenamePrefix: string): string {
  if (!base64Data || !base64Data.startsWith('data:image')) {
    return base64Data; // Return as-is if already a file URL or path
  }

  try {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'signatures');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const matches = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return base64Data;
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const imageBuffer = Buffer.from(matches[2], 'base64');
    const filename = `${filenamePrefix}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, imageBuffer);
    return `/uploads/signatures/${filename}`;
  } catch (error) {
    console.error('Error saving signature image file:', error);
    return base64Data; // Fallback to raw base64 string
  }
}
