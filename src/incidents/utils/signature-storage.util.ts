import * as fs from 'fs';
import * as path from 'path';

/**
 * Strips any leading '/uploads/signatures/', 'uploads/signatures/', '/uploads/', or 'uploads/'
 * prefixes from a stored signature filename.
 */
export function cleanSignaturePath(sig: string): string {
  if (!sig) return sig;
  if (sig.startsWith('data:image')) return sig;
  return sig
    .replace(/^\/?uploads\/signatures\//, '')
    .replace(/^\/?uploads\//, '');
}

/**
 * Saves a Base64 canvas signature string to disk as a PNG image file
 * and returns ONLY the filename (without 'uploads/' prefix).
 */
export function saveBase64Signature(base64Data: string, filenamePrefix: string): string {
  if (!base64Data) return base64Data;
  if (!base64Data.startsWith('data:image')) {
    return cleanSignaturePath(base64Data);
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
    // Return ONLY the filename itself
    return filename;
  } catch (error) {
    console.error('Error saving signature image file:', error);
    return base64Data;
  }
}
