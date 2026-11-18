/**
 * Downscales and JPEG-compresses oversized raster images inside a Puppeteer Page
 * right before `page.pdf()` is invoked.
 *
 * Why this is needed:
 * Uncompressed smartphone photos (4–12 MB each) embedded as base64 data URIs
 * inside small PDF thumbnails or full-page attachments cause Chromium's PDF
 * serializer to produce 50–100+ MB PDFs that take minutes to download.
 *
 * Sizing budgets (~250–300 DPI for A4 print):
 *  - Location floor maps (`alt="Location Map"`): max 1600px, JPEG q=0.82
 *  - Small thumbnails (CSS <= 220px): max 480px, JPEG q=0.78
 *  - Larger photos / full-page attachments: max 1280px, JPEG q=0.80
 *
 * Logos, SVGs, and digital signatures are left untouched to preserve crispness
 * and alpha transparency.
 */
export async function optimizePageImagesForPdf(page: any): Promise<void> {
  try {
    await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
      if (imgs.length === 0) return;

      // Ensure all images have finished loading before inspecting natural dimensions
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
          if (!src || src.startsWith('data:image/svg') || src.toLowerCase().endsWith('.svg')) {
            continue;
          }

          const alt = (img.getAttribute('alt') || '').toLowerCase();
          // Preserve crispness & transparency on corporate logos and signatures
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

            // Fill white background before JPEG encoding so transparent PNGs don't turn black
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tw, th);
            ctx.drawImage(img, 0, 0, tw, th);

            const candidate = canvas.toDataURL('image/jpeg', quality);
            // Keep candidate if it's smaller than original data URI or if we scaled dimensions down
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

      // Wait for all replaced data URIs to decode so Puppeteer renders every optimized image
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
    // Non-blocking safeguard: never fail PDF generation if image optimization throws
  }
}
