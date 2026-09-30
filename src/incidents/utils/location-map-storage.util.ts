import * as fs from 'fs';
import * as path from 'path';

/**
 * Saves a Base64 canvas location map snapshot to disk as a JPG/PNG image file in uploads/location-maps
 * and returns the clean relative path `/location-maps/${filename}`.
 * If already a URL or clean filename, normalizes to `/location-maps/...`.
 */
export function saveBase64LocationMap(base64OrUrl: string, filenamePrefix: string): string {
  if (!base64OrUrl) return base64OrUrl;
  if (!base64OrUrl.startsWith('data:image')) {
    if (base64OrUrl.startsWith('http://') || base64OrUrl.startsWith('https://')) return base64OrUrl;
    const clean = base64OrUrl
      .replace(/^\/?uploads\/location-maps\//, '')
      .replace(/^\/?location-maps\//, '')
      .replace(/^\/?uploads\//, '');
    return `/location-maps/${clean}`;
  }

  try {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'location-maps');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const matches = base64OrUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return base64OrUrl;
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const imageBuffer = Buffer.from(matches[2], 'base64');
    const filename = `${filenamePrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, imageBuffer);
    return `/location-maps/${filename}`;
  } catch (error) {
    console.error('Error saving location map snapshot file:', error);
    return base64OrUrl;
  }
}
