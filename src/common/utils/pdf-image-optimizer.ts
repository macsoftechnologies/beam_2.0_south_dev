import * as http from 'http';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { extname } from 'path';

interface ImageCompressionJob {
  id: number;
  type: 'file' | 'buffer';
  filePath?: string;
  buffer?: Buffer;
  mime: string;
  maxDim: number;
  quality: number;
}

const getMimeFromPath = (filePath: string): string => {
  const ext = extname(filePath).toLowerCase().replace('.', '');
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
};

const extractAttr = (tag: string, attrName: string): string => {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = tag.match(re);
  return (m && (m[1] ?? m[2])) || '';
};

const shouldSkipImageTag = (alt: string, src: string): boolean => {
  const altLower = alt.toLowerCase();
  if (
    altLower.includes('logo') ||
    altLower === 'nne' ||
    altLower === 'novo nordisk' ||
    altLower.includes('signature')
  ) {
    return true;
  }
  const srcLower = src.toLowerCase();
  if (srcLower.startsWith('data:image/svg') || srcLower.endsWith('.svg')) {
    return true;
  }
  return false;
};

const getTargetImageBudget = (
  alt: string,
  className: string,
  style: string,
): { maxDim: number; quality: number } => {
  const altLower = alt.toLowerCase();
  if (altLower === 'location map') {
    return { maxDim: 1600, quality: 0.82 };
  }

  const clsLower = className.toLowerCase();
  const isThumbClass =
    clsLower.includes('item-photo') || clsLower.includes('obs-photo');
  const widthMatch = style.match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)px/i);
  const isSmallCssWidth = widthMatch ? Number(widthMatch[1]) <= 220 : false;

  if (isThumbClass || isSmallCssWidth) {
    return { maxDim: 480, quality: 0.78 };
  }

  return { maxDim: 1280, quality: 0.8 };
};

/**
 * Downscales and JPEG-compresses oversized raster images already loaded inside a
 * Puppeteer Page (safety net for any remote HTTP/HTTPS images).
 */
export async function optimizePageImagesForPdf(page: any): Promise<void> {
  try {
    await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
      if (imgs.length === 0) return;

      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) {
                resolve();
                return;
              }
              const done = () => resolve();
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
              setTimeout(done, 4000);
            }),
        ),
      );

      const cache = new Map<string, string>();
      const updatedImgs: HTMLImageElement[] = [];

      for (const img of imgs) {
        try {
          const src = img.getAttribute('src') || '';
          if (
            !src ||
            src.startsWith('data:image/svg') ||
            src.toLowerCase().endsWith('.svg') ||
            src.startsWith('http://127.0.0.1:')
          ) {
            continue;
          }

          const alt = (img.getAttribute('alt') || '').toLowerCase();
          if (
            alt.includes('logo') ||
            alt === 'nne' ||
            alt === 'novo nordisk' ||
            alt.includes('signature')
          ) {
            continue;
          }

          const nw = img.naturalWidth || 0;
          const nh = img.naturalHeight || 0;
          if (!nw || !nh) continue;

          const rect = img.getBoundingClientRect();
          const isLocationMap = alt === 'location map';
          const isThumbnail =
            !isLocationMap &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.width <= 220 &&
            rect.height <= 220;

          const maxDim = isLocationMap ? 1600 : isThumbnail ? 480 : 1280;
          const quality = isLocationMap ? 0.82 : isThumbnail ? 0.78 : 0.8;

          const needsResize = nw > maxDim || nh > maxDim;
          const isHeavyDataUri = src.startsWith('data:') && src.length > 220_000;
          if (!needsResize && !isHeavyDataUri) {
            continue;
          }

          const cacheKey = `${src.length}:${src.slice(0, 64)}:${src.slice(-32)}:${maxDim}:${quality}`;
          let optimized = cache.get(cacheKey);

          if (!optimized) {
            const scale = Math.min(1, maxDim / Math.max(nw, nh));
            const tw = Math.max(1, Math.round(nw * scale));
            const th = Math.max(1, Math.round(nh * scale));

            const canvas = document.createElement('canvas');
            canvas.width = tw;
            canvas.height = th;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tw, th);
            ctx.drawImage(img, 0, 0, tw, th);

            const candidate = canvas.toDataURL('image/jpeg', quality);
            canvas.width = 1;
            canvas.height = 1;
            if (candidate && (!src.startsWith('data:') || candidate.length < src.length || needsResize)) {
              optimized = candidate;
              cache.set(cacheKey, optimized);
            }
          }

          if (optimized && optimized !== src) {
            img.src = optimized;
            updatedImgs.push(img);
          }
        } catch {
          // Cross-origin tainted canvas or unexpected image error — keep original safely
        }
      }

      if (updatedImgs.length > 0) {
        await Promise.all(
          updatedImgs.map(async (img) => {
            try {
              if (typeof img.decode === 'function') {
                await img.decode();
              }
            } catch {
              // Ignore decode errors
            }
          }),
        );
      }
    });
  } catch {
    // Non-blocking safeguard
  }
}

/**
 * Crash-proof, low-memory HTML-to-PDF renderer for reports with many high-resolution images.
 *
 * Solves two root failure modes on reports with 20–100+ smartphone photos:
 *  1. CDP WebSocket payload crash when calling `page.setContent(html)` with 100–300 MB of inline base64.
 *  2. Chromium renderer OOM crash from decoding dozens of 12 MP images simultaneously.
 *
 * How it works:
 *  - Extracts `pdf-local-file://...` markers and heavy inline `data:image/...;base64,...` images from HTML.
 *  - Serves raw images over an ephemeral `127.0.0.1` HTTP server and downscales them ONE AT A TIME
 *    via a single reused `<canvas>` in Puppeteer (~20–35 KB per thumbnail, freeing RAM between images).
 *  - Loads the lightweight report via `page.goto('http://127.0.0.1:<port>/report.html')` instead of
 *    sending raw base64 over CDP, then generates the PDF.
 */
export async function renderOptimizedHtmlToPdf(
  browser: any,
  html: string,
  pdfOptions: Record<string, any>,
  postLoadEvaluate?: (page: any) => Promise<void>,
): Promise<Buffer> {
  const jobs: ImageCompressionJob[] = [];
  const jobMap = new Map<string, number>();
  const rawJobsById = new Map<number, ImageCompressionJob>();
  const compressedBuffers = new Map<number, Buffer>();

  const PORT_TOKEN = '__PDF_OPT_PORT__';

  const rewrittenHtml = html.replace(/<img\b[^>]*>/gi, (imgTag) => {
    const srcMatch = imgTag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (!srcMatch) return imgTag;
    const rawSrc = srcMatch[1] ?? srcMatch[2] ?? '';
    if (!rawSrc) return imgTag;

    const alt = extractAttr(imgTag, 'alt');
    if (shouldSkipImageTag(alt, rawSrc)) return imgTag;

    const className = extractAttr(imgTag, 'class');
    const style = extractAttr(imgTag, 'style');
    const { maxDim, quality } = getTargetImageBudget(alt, className, style);

    let jobId: number | undefined;

    if (rawSrc.startsWith('pdf-local-file://')) {
      const filePath = decodeURIComponent(rawSrc.slice('pdf-local-file://'.length));
      if (!existsSync(filePath)) return imgTag;
      const dedupeKey = `file:${filePath}:${maxDim}:${quality}`;
      jobId = jobMap.get(dedupeKey);
      if (jobId === undefined) {
        jobId = jobs.length;
        const job: ImageCompressionJob = {
          id: jobId,
          type: 'file',
          filePath,
          mime: getMimeFromPath(filePath),
          maxDim,
          quality,
        };
        jobs.push(job);
        jobMap.set(dedupeKey, jobId);
        rawJobsById.set(jobId, job);
      }
    } else if (
      rawSrc.startsWith('data:image/') &&
      rawSrc.includes(';base64,') &&
      rawSrc.length > 140_000
    ) {
      const dedupeKey = `data:${rawSrc.length}:${rawSrc.slice(0, 64)}:${rawSrc.slice(-32)}:${maxDim}:${quality}`;
      jobId = jobMap.get(dedupeKey);
      if (jobId === undefined) {
        const commaIdx = rawSrc.indexOf('base64,');
        const mimeMatch = rawSrc.match(/^data:(image\/[^;]+);base64,/i);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const buffer = Buffer.from(rawSrc.slice(commaIdx + 7), 'base64');
        jobId = jobs.length;
        const job: ImageCompressionJob = {
          id: jobId,
          type: 'buffer',
          buffer,
          mime,
          maxDim,
          quality,
        };
        jobs.push(job);
        jobMap.set(dedupeKey, jobId);
        rawJobsById.set(jobId, job);
      }
    }

    if (jobId === undefined) return imgTag;

    const replacementUrl = `http://127.0.0.1:${PORT_TOKEN}/img/${jobId}.jpg`;
    return imgTag.replace(srcMatch[0], `src="${replacementUrl}"`);
  });

  let finalHtml = rewrittenHtml;

  const server = http.createServer((req, res) => {
    const reqUrl = (req.url || '').split('?')[0];

    if (reqUrl === '/compressor.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><body></body></html>');
      return;
    }

    if (reqUrl === '/report.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(finalHtml);
      return;
    }

    const rawMatch = reqUrl.match(/^\/raw\/(\d+)$/);
    if (rawMatch) {
      const id = Number(rawMatch[1]);
      const job = rawJobsById.get(id);
      if (!job) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': job.mime || 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
      });
      if (job.type === 'file' && job.filePath && existsSync(job.filePath)) {
        const stream = createReadStream(job.filePath);
        stream.on('error', () => {
          if (!res.headersSent) res.writeHead(404);
          res.end();
        });
        stream.pipe(res);
      } else if (job.buffer) {
        res.end(job.buffer);
      } else {
        res.end();
      }
      return;
    }

    const imgMatch = reqUrl.match(/^\/img\/(\d+)\.jpg$/);
    if (imgMatch) {
      const id = Number(imgMatch[1]);
      const compressed = compressedBuffers.get(id);
      if (compressed) {
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': compressed.length,
          'Access-Control-Allow-Origin': '*',
        });
        res.end(compressed);
        return;
      }
      const job = rawJobsById.get(id);
      if (job && job.type === 'file' && job.filePath && existsSync(job.filePath)) {
        res.writeHead(200, {
          'Content-Type': job.mime || 'image/jpeg',
          'Access-Control-Allow-Origin': '*',
        });
        createReadStream(job.filePath).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  finalHtml = rewrittenHtml.split(PORT_TOKEN).join(String(port));

  const page = await browser.newPage();

  try {
    // Step 1: Sequentially downscale & compress each unique heavy image (peak 1 decoded image in RAM)
    if (jobs.length > 0) {
      await page.goto(`http://127.0.0.1:${port}/compressor.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      for (const job of jobs) {
        try {
          const dataUrl: string | null = await page.evaluate(
            async ({ rawUrl, maxDim, quality }) => {
              return await new Promise<string | null>((resolve) => {
                const img = new Image();
                const timer = setTimeout(() => {
                  img.src = '';
                  resolve(null);
                }, 15000);

                img.onload = () => {
                  clearTimeout(timer);
                  try {
                    const nw = img.naturalWidth || 0;
                    const nh = img.naturalHeight || 0;
                    if (!nw || !nh) {
                      img.src = '';
                      resolve(null);
                      return;
                    }
                    const scale = Math.min(1, maxDim / Math.max(nw, nh));
                    const tw = Math.max(1, Math.round(nw * scale));
                    const th = Math.max(1, Math.round(nh * scale));

                    const canvas = document.createElement('canvas');
                    canvas.width = tw;
                    canvas.height = th;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                      img.src = '';
                      resolve(null);
                      return;
                    }
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, tw, th);
                    ctx.drawImage(img, 0, 0, tw, th);
                    const out = canvas.toDataURL('image/jpeg', quality);
                    canvas.width = 1;
                    canvas.height = 1;
                    img.src = '';
                    resolve(out);
                  } catch {
                    img.src = '';
                    resolve(null);
                  }
                };

                img.onerror = () => {
                  clearTimeout(timer);
                  img.src = '';
                  resolve(null);
                };

                img.src = rawUrl;
              });
            },
            {
              rawUrl: `http://127.0.0.1:${port}/raw/${job.id}`,
              maxDim: job.maxDim,
              quality: job.quality,
            },
          );

          if (dataUrl && dataUrl.includes('base64,')) {
            compressedBuffers.set(job.id, Buffer.from(dataUrl.split('base64,')[1], 'base64'));
          } else if (job.type === 'file' && job.filePath && existsSync(job.filePath)) {
            compressedBuffers.set(job.id, readFileSync(job.filePath));
          } else if (job.buffer) {
            compressedBuffers.set(job.id, job.buffer);
          }
        } catch {
          if (job.type === 'file' && job.filePath && existsSync(job.filePath)) {
            compressedBuffers.set(job.id, readFileSync(job.filePath));
          } else if (job.buffer) {
            compressedBuffers.set(job.id, job.buffer);
          }
        } finally {
          // Release raw input buffer immediately after this image is compressed
          job.buffer = undefined;
        }
      }
    }

    // Step 2: Load the lightweight HTML + compressed thumbnails via localhost HTTP (zero CDP payload bloat)
    await page.goto(`http://127.0.0.1:${port}/report.html`, {
      waitUntil: ['domcontentloaded', 'load'],
      timeout: 60000,
    });

    // Step 3: Run optional post-load DOM hook (e.g. Location Map subheader sanitizer)
    if (typeof postLoadEvaluate === 'function') {
      try {
        await postLoadEvaluate(page);
      } catch {
        // Non-blocking fallback
      }
    }

    // Step 4: Safety net for any remaining remote http/https images
    await optimizePageImagesForPdf(page);

    // Step 5: Generate PDF
    const pdfBytes = await page.pdf({
      timeout: 120000,
      ...pdfOptions,
    });

    return Buffer.from(pdfBytes);
  } finally {
    try {
      await page.close();
    } catch {
      // Ignore close errors
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    compressedBuffers.clear();
    rawJobsById.clear();
  }
}
