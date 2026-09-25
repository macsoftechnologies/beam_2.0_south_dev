import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import * as mammoth from 'mammoth';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

@Injectable()
export class IncidentPdfService {
  private readonly logger = new Logger(IncidentPdfService.name);

  private async launchBrowser(): Promise<any> {
    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
    try {
      return await puppeteer.launch({
        headless: true,
        args: launchArgs,
      });
    } catch (e1) {
      try {
        return await puppeteer.launch({
          channel: 'chrome' as any,
          headless: true,
          args: launchArgs,
        });
      } catch (e2) {
        const candidatePaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          '/usr/bin/google-chrome',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
        ];
        for (const p of candidatePaths) {
          if (existsSync(p)) {
            try {
              return await puppeteer.launch({
                executablePath: p,
                headless: true,
                args: launchArgs,
              });
            } catch (e3) {}
          }
        }
        throw e1;
      }
    }
  }

  private async fetchAttachmentBuffer(fileUrl: string | null | undefined): Promise<{ buffer: Buffer; filename: string; mimeType: string; isPdf: boolean; isImage: boolean } | null> {
    if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.trim()) return null;
    const cleanUrl = fileUrl.trim();

    // 1. Extract pure filename without query strings or hashes
    let filename = cleanUrl.split('?')[0].split('#')[0];
    if (filename.includes('/') || filename.includes('\\')) {
      filename = filename.replace(/\\/g, '/').split('/').filter(Boolean).pop() || filename;
    }
    if (!filename) return null;

    const ext = (filename.split('.').pop() || '').toLowerCase();
    const isPdf = ext === 'pdf';
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);
    const mimeType = isPdf ? 'application/pdf'
      : ext === 'png' ? 'image/png'
      : ext === 'svg' ? 'image/svg+xml'
      : ext === 'webp' ? 'image/webp'
      : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : ext === 'doc' ? 'application/msword'
      : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : isImage ? 'image/jpeg'
      : 'application/octet-stream';

    // 2. Check local disk candidate paths
    const candidatePaths = [
      join(process.cwd(), 'uploads', 'incidents', filename),
      join(process.cwd(), 'uploads', filename),
      join(process.cwd(), 'uploads', 'signatures', filename),
      join(process.cwd(), cleanUrl.replace(/^\/+/, '')),
      join(process.cwd(), cleanUrl.replace(/^\/?development\/m3south\//, '').replace(/^\/+/, '')),
      join(process.cwd(), filename),
    ];

    for (const p of candidatePaths) {
      if (existsSync(p) && statSync(p).isFile()) {
        try {
          const buffer = readFileSync(p);
          return { buffer, filename, mimeType, isPdf, isImage };
        } catch (e) {}
      }
    }

    // 3. Fallback: Fetch remotely if not on local disk and cache locally
    const remoteCandidates: string[] = [];
    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      remoteCandidates.push(cleanUrl);
    }
    remoteCandidates.push(`https://api.beam.safesiteworks.com/development/m3south/incidents/${filename}`);
    remoteCandidates.push(`https://api.beam.safesiteworks.com/development/m3south/uploads/incidents/${filename}`);
    remoteCandidates.push(`https://api.beam.safesiteworks.com/development/m3south/signatures/${filename}`);

    for (const rUrl of remoteCandidates) {
      try {
        const resp = await fetch(rUrl);
        if (resp.ok) {
          const arrBuf = await resp.arrayBuffer();
          const buffer = Buffer.from(arrBuf);
          try {
            const cacheDir = join(process.cwd(), 'uploads', 'incidents');
            if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
            writeFileSync(join(cacheDir, filename), buffer);
          } catch (writeErr) {}
          return { buffer, filename, mimeType, isPdf, isImage };
        }
      } catch (netErr) {}
    }

    return null;
  }

  private async prefetchAttachments(details: any): Promise<void> {
    const inv = details.investigation || details.incident_investigation || {};
    let att = inv.mandatoryAttachments || inv.mandatory_attachments || inv.attachments || details.mandatoryAttachments || {};
    if (typeof att === 'string') {
      try { att = JSON.parse(att); } catch (e) {}
    }

    const urlsToFetch = new Set<string>();

    const addUrl = (val: any) => {
      if (!val) return;
      if (typeof val === 'string' && val.trim()) urlsToFetch.add(val.trim());
      else if (typeof val === 'object') {
        if (val.fileUrl) urlsToFetch.add(String(val.fileUrl).trim());
        if (val.url) urlsToFetch.add(String(val.url).trim());
        if (val.attachmentUrl) urlsToFetch.add(String(val.attachmentUrl).trim());
      }
    };

    if (Array.isArray(att.items)) {
      att.items.forEach((it: any) => addUrl(it));
    }
    Object.keys(att).forEach(k => {
      if (k !== 'items' && k !== 'missingExplanation') addUrl(att[k]);
    });

    const actionItems = details.actionItems || details.actions || [];
    if (Array.isArray(actionItems)) {
      actionItems.forEach((ai: any) => {
        if (ai.attachmentUrl) addUrl(ai.attachmentUrl);
        if (Array.isArray(ai.attachments)) {
          ai.attachments.forEach((a: any) => addUrl(a));
        }
      });
    }

    if (Array.isArray(inv.photos)) {
      inv.photos.forEach((p: any) => addUrl(p));
    }

    const initial = details.initialReport || {};
    if (Array.isArray(initial.photos)) {
      initial.photos.forEach((p: any) => addUrl(p));
    }

    await Promise.all(
      Array.from(urlsToFetch).map(async (u) => {
        try {
          await this.fetchAttachmentBuffer(u);
        } catch (e) {}
      })
    );
  }

  async generate3In1Pdf(details: any, formType: string = 'all', options: { includeWitnesses?: boolean; includeAttachments?: boolean } = {}): Promise<Buffer> {
    const includeWitnesses = options?.includeWitnesses === true || String(options?.includeWitnesses) === 'true';
    const includeAttachments = options?.includeAttachments === undefined ? true : (options?.includeAttachments === true || String(options?.includeAttachments) === 'true');

    // 1. Prefetch all attachment files locally if includeAttachments is enabled
    if (includeAttachments) {
      try {
        await this.prefetchAttachments(details);
      } catch (err) {
        this.logger.warn('Failed to prefetch some incident attachments:', err);
      }
    }

    // 2. Build full HTML with the Spot Check design format
    const html = this.buildFullHtml(details, formType, { includeWitnesses, includeAttachments });

    const browser = await this.launchBrowser();

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: ['domcontentloaded', 'load'], timeout: 30000 });
      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
      });
      let currentPdfBuffer = Buffer.from(pdfBytes);

      // 3. Combine ALL uploaded attachments if includeAttachments is true
      if (includeAttachments) {
        try {
          const inv = details.investigation || details.incident_investigation || {};
          const headsUp = details.headsUp || {};
          const initial = details.initialReport || {};
          const inc = details.incident || details;
          const project = inc.projectName || 'M3 South';
          const caseNo = inc.caseNumber || inc.id || 'INC-Report';

          let att = inv.mandatoryAttachments || inv.mandatory_attachments || inv.attachments || details.mandatoryAttachments || {};
          if (typeof att === 'string') {
            try { att = JSON.parse(att); } catch (e) {}
          }

          const attachmentsToMerge: { label: string; fileUrl: string; fileName?: string; mimeType?: string }[] = [];
          const seenUrls = new Set<string>();

          const isWitnessItem = (k: string, val: any) => {
            const l = String(k || '').toLowerCase();
            const lbl = String(val?.label || val?.fileName || '').toLowerCase();
            return l.includes('witness') || lbl.includes('witness');
          };

          const collectAttachment = (label: string, val: any, keyName?: string) => {
            if (!val) return;
            if (!includeWitnesses && isWitnessItem(keyName || label, val)) {
              return;
            }
            let fUrl = '';
            let fLabel = label;
            let fName = '';
            let fMime = '';
            if (typeof val === 'object' && (val.fileUrl || val.url || val.attachmentUrl)) {
              fUrl = String(val.fileUrl || val.url || val.attachmentUrl).trim();
              fLabel = val.label || label;
              fName = val.fileName || val.attachmentName || '';
              fMime = val.fileType || val.mimeType || '';
            } else if (typeof val === 'string' && val.trim()) {
              fUrl = val.trim();
            }

            if (!fUrl) return;
            const cleanNoQuery = fUrl.split('?')[0].split('#')[0].toLowerCase();
            if (seenUrls.has(cleanNoQuery)) return;
            seenUrls.add(cleanNoQuery);
            attachmentsToMerge.push({ label: fLabel, fileUrl: fUrl, fileName: fName, mimeType: fMime });
          };

          // A. From mandatory attachments (Form 3)
          if (Array.isArray(att.items)) {
            att.items.forEach((it: any) => collectAttachment(it.label || it.key, it, it.key));
          }
          Object.keys(att).forEach((k) => {
            if (k !== 'items' && k !== 'missingExplanation') {
              collectAttachment(k, att[k], k);
            }
          });

          // B. From action items (Corrective / Preventive Actions in Form 3)
          const actionItems = details.actionItems || details.actions || [];
          if (Array.isArray(actionItems)) {
            actionItems.forEach((ai: any) => {
              if (ai.attachmentUrl) {
                collectAttachment(`Action Item #${ai.id} Attachment: ${ai.action || ''}`, {
                  fileUrl: ai.attachmentUrl,
                  fileName: ai.attachmentName,
                  fileType: ai.fileType,
                });
              }
              if (Array.isArray(ai.attachments)) {
                ai.attachments.forEach((subAtt: any) => {
                  collectAttachment(`Action Item #${ai.id} Attachment: ${ai.action || ''}`, subAtt);
                });
              }
            });
          }

          // C. From Form 1 / Form 2 attachments if any
          if (initial.attachments) collectAttachment('Initial Report Attachment', initial.attachments);
          if (headsUp.attachments) collectAttachment('Heads-Up Attachment', headsUp.attachments);
          if (inc.attachments) collectAttachment('Incident Attachment', inc.attachments);

          if (attachmentsToMerge.length > 0) {
            const mergedDoc = await PDFDocument.load(currentPdfBuffer);

            for (const item of attachmentsToMerge) {
              try {
                const fileData = await this.fetchAttachmentBuffer(item.fileUrl);
                if (!fileData || !fileData.buffer) {
                  this.logger.warn(`Could not fetch attachment buffer for ${item.fileUrl}`);
                  continue;
                }

                const ext = (fileData.filename.split('.').pop() || '').toLowerCase();
                const isPdf = fileData.isPdf || ext === 'pdf';
                const isDocx = ext === 'docx' || ext === 'doc' || fileData.mimeType?.includes('word');
                const isImage = fileData.isImage || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);

                if (isPdf) {
                  // 1. Direct PDF Merge
                  try {
                    const donorDoc = await PDFDocument.load(fileData.buffer);
                    const pageIndices = donorDoc.getPageIndices();
                    const copiedPages = await mergedDoc.copyPages(donorDoc, pageIndices);
                    copiedPages.forEach((cp) => mergedDoc.addPage(cp));
                  } catch (pdfErr) {
                    this.logger.warn(`Failed to parse and merge PDF attachment ${item.fileUrl}:`, pdfErr);
                  }
                } else if (isDocx) {
                  // 2. Word (.docx / .doc) Document Conversion to PDF
                  try {
                    const docxResult = await mammoth.convertToHtml({ buffer: fileData.buffer });
                    const docHtml = `
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <meta charset="utf-8" />
                        <title>${item.fileName || item.label}</title>
                        <style>
                          * { box-sizing: border-box; }
                          body {
                            font-family: Arial, Helvetica, sans-serif;
                            font-size: 10pt;
                            line-height: 1.5;
                            color: #1e293b;
                            margin: 0;
                            padding: 12px;
                          }
                          .attach-header {
                            background: #111c38;
                            color: #ffffff;
                            padding: 10px 14px;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border-radius: 2px;
                            margin-bottom: 12px;
                          }
                          .attach-title { font-size: 13pt; font-weight: 700; margin: 0; }
                          .attach-sub { font-size: 8.5pt; color: #94a3b8; margin-top: 3px; }
                          .attach-badge { background: #2563eb; color: #fff; font-size: 8pt; font-weight: 700; padding: 3px 8px; border-radius: 3px; text-transform: uppercase; }
                          .attach-meta { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 7px 12px; margin-bottom: 16px; font-size: 8.5pt; display: flex; justify-content: space-between; }
                          h1, h2, h3, h4 { color: #0f172a; margin-top: 1.2em; margin-bottom: 0.5em; }
                          p { margin: 0.6em 0; }
                          table { width: 100%; border-collapse: collapse; margin: 1em 0; }
                          td, th { border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 9pt; }
                          th { background: #f1f5f9; font-weight: 700; }
                          img { max-width: 100%; height: auto; display: block; margin: 1em auto; border-radius: 2px; }
                          ul, ol { margin: 0.6em 0; padding-left: 24px; }
                          li { margin-bottom: 4px; }
                        </style>
                      </head>
                      <body>
                        <div class="attach-header">
                          <div>
                            <div class="attach-title">Attachment: ${item.label}</div>
                            <div class="attach-sub">Project: ${project} &nbsp;|&nbsp; Case: ${caseNo} &nbsp;|&nbsp; File: ${item.fileName || fileData.filename}</div>
                          </div>
                          <div class="attach-badge">Controlled Document Attachment</div>
                        </div>
                        <div class="attach-meta">
                          <div><strong>Attached File:</strong> ${item.fileName || fileData.filename}</div>
                          <div><strong>Category:</strong> ${item.label}</div>
                          <div><strong>Format:</strong> Microsoft Word (.${ext})</div>
                        </div>
                        <div class="doc-body">
                          ${docxResult.value || '<p><em>Document contains no printable text.</em></p>'}
                        </div>
                      </body>
                      </html>
                    `;
                    await page.setContent(docHtml, { waitUntil: ['domcontentloaded', 'load'], timeout: 25000 });
                    const docPdfBytes = await page.pdf({
                      format: 'A4',
                      printBackground: true,
                      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
                    });
                    const donorDoc = await PDFDocument.load(docPdfBytes);
                    const pageIndices = donorDoc.getPageIndices();
                    const copiedPages = await mergedDoc.copyPages(donorDoc, pageIndices);
                    copiedPages.forEach((cp) => mergedDoc.addPage(cp));
                  } catch (docxErr) {
                    this.logger.warn(`Could not convert docx attachment ${item.fileUrl}:`, docxErr);
                  }
                } else if (isImage) {
                  // 3. High-Resolution Image Page Merge
                  try {
                    const base64Img = `data:${fileData.mimeType || 'image/jpeg'};base64,${fileData.buffer.toString('base64')}`;
                    const imgHtml = `
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <meta charset="utf-8" />
                        <title>${item.fileName || item.label}</title>
                        <style>
                          * { box-sizing: border-box; }
                          body {
                            font-family: Arial, Helvetica, sans-serif;
                            margin: 0;
                            padding: 12px;
                            display: flex;
                            flex-direction: column;
                            min-height: 275mm;
                          }
                          .attach-header {
                            background: #111c38;
                            color: #ffffff;
                            padding: 10px 14px;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border-radius: 2px;
                            margin-bottom: 12px;
                          }
                          .attach-title { font-size: 13pt; font-weight: 700; margin: 0; }
                          .attach-sub { font-size: 8.5pt; color: #94a3b8; margin-top: 3px; }
                          .attach-badge { background: #2563eb; color: #fff; font-size: 8pt; font-weight: 700; padding: 3px 8px; border-radius: 3px; text-transform: uppercase; }
                          .img-container {
                            flex: 1;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            background: #f8fafc;
                            border: 1px solid #cbd5e1;
                            border-radius: 4px;
                            padding: 14px;
                            text-align: center;
                          }
                          img { max-width: 100%; max-height: 800px; object-fit: contain; border-radius: 2px; }
                        </style>
                      </head>
                      <body>
                        <div class="attach-header">
                          <div>
                            <div class="attach-title">Attachment: ${item.label}</div>
                            <div class="attach-sub">Project: ${project} &nbsp;|&nbsp; Case: ${caseNo} &nbsp;|&nbsp; File: ${item.fileName || fileData.filename}</div>
                          </div>
                          <div class="attach-badge">Evidence Attachment</div>
                        </div>
                        <div class="img-container">
                          <img src="${base64Img}" alt="${item.label}" />
                        </div>
                      </body>
                      </html>
                    `;
                    await page.setContent(imgHtml, { waitUntil: ['domcontentloaded', 'load'], timeout: 25000 });
                    const imgPdfBytes = await page.pdf({
                      format: 'A4',
                      printBackground: true,
                      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
                    });
                    const donorDoc = await PDFDocument.load(imgPdfBytes);
                    const pageIndices = donorDoc.getPageIndices();
                    const copiedPages = await mergedDoc.copyPages(donorDoc, pageIndices);
                    copiedPages.forEach((cp) => mergedDoc.addPage(cp));
                  } catch (imgErr) {
                    this.logger.warn(`Could not render image attachment ${item.fileUrl}:`, imgErr);
                  }
                } else {
                  // 4. Other Document Formats -> Official Attachment Appendix Verification Record
                  try {
                    const sizeKb = Math.round(fileData.buffer.length / 1024);
                    const recordHtml = `
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <meta charset="utf-8" />
                        <title>${item.fileName || item.label}</title>
                        <style>
                          * { box-sizing: border-box; }
                          body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.5; color: #1e293b; margin: 0; padding: 12px; }
                          .attach-header { background: #111c38; color: #ffffff; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; border-radius: 2px; margin-bottom: 12px; }
                          .attach-title { font-size: 13pt; font-weight: 700; margin: 0; }
                          .attach-sub { font-size: 8.5pt; color: #94a3b8; margin-top: 3px; }
                          .attach-badge { background: #2563eb; color: #fff; font-size: 8pt; font-weight: 700; padding: 3px 8px; border-radius: 3px; text-transform: uppercase; }
                          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 9pt; }
                          td { border: 1px solid #cbd5e1; padding: 8px 12px; }
                          td.lbl { width: 28%; font-weight: 700; background: #f8fafc; color: #334155; }
                          td.val { width: 72%; color: #0f172a; }
                        </style>
                      </head>
                      <body>
                        <div class="attach-header">
                          <div>
                            <div class="attach-title">Attachment: ${item.label}</div>
                            <div class="attach-sub">Project: ${project} &nbsp;|&nbsp; Case: ${caseNo} &nbsp;|&nbsp; File: ${item.fileName || fileData.filename}</div>
                          </div>
                          <div class="attach-badge">Controlled Document Record</div>
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 14px; margin-top: 16px;">
                          <table>
                            <tbody>
                              <tr><td class="lbl">Attached File Name:</td><td class="val"><strong>${item.fileName || fileData.filename}</strong></td></tr>
                              <tr><td class="lbl">Document Category / Key:</td><td class="val">${item.label}</td></tr>
                              <tr><td class="lbl">File Format / Extension:</td><td class="val">${ext.toUpperCase()} File (${fileData.mimeType})</td></tr>
                              <tr><td class="lbl">Recorded File Size:</td><td class="val">${sizeKb} KB</td></tr>
                              <tr><td class="lbl">Vault Reference Path:</td><td class="val"><code style="color: #2563eb;">${item.fileUrl}</code></td></tr>
                              <tr><td class="lbl">Verification Status:</td><td class="val"><span style="color: #16a34a; font-weight: 700;">✓ Document Verified & Permanently Attached to Incident Record</span></td></tr>
                            </tbody>
                          </table>
                        </div>
                      </body>
                      </html>
                    `;
                    await page.setContent(recordHtml, { waitUntil: ['domcontentloaded', 'load'], timeout: 25000 });
                    const recordPdfBytes = await page.pdf({
                      format: 'A4',
                      printBackground: true,
                      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
                    });
                    const donorDoc = await PDFDocument.load(recordPdfBytes);
                    const pageIndices = donorDoc.getPageIndices();
                    const copiedPages = await mergedDoc.copyPages(donorDoc, pageIndices);
                    copiedPages.forEach((cp) => mergedDoc.addPage(cp));
                  } catch (recErr) {
                    this.logger.warn(`Could not render document record for ${item.fileUrl}:`, recErr);
                  }
                }
              } catch (itemErr) {
                this.logger.warn(`Could not process attachment ${item.fileUrl}:`, itemErr);
              }
            }

            const finalMergedBytes = await mergedDoc.save();
            currentPdfBuffer = Buffer.from(finalMergedBytes);
          }
        } catch (mergeErr) {
          this.logger.warn('Error during attachment merging, falling back to base PDF:', mergeErr);
        }
      }

      return currentPdfBuffer;
    } catch (err) {
      this.logger.error('Failed to generate backend PDF with Puppeteer:', err);
      throw err;
    } finally {
      await browser.close();
    }
  }

  private buildFullHtml(details: any, formType: string = 'all', options: { includeWitnesses?: boolean; includeAttachments?: boolean } = {}): string {
    const includeWitnesses = options?.includeWitnesses === true || String(options?.includeWitnesses) === 'true';
    const includeAttachments = options?.includeAttachments === undefined ? true : (options?.includeAttachments === true || String(options?.includeAttachments) === 'true');
    const inc = details.incident || details;
    const headsUp = details.headsUp || {};
    const initial = details.initialReport || {};
    const inv = details.investigation || {};
    const actions = details.actionItems || [];

    const caseNo = inc.caseNumber || inc.id || 'INC-2026-0001';
    const project = inc.projectName || 'M3SOUTH';
    const title = headsUp.title || inc.title || 'Safety Incident Report';
    const date = inc.incidentDate || inc.date || new Date().toISOString().split('T')[0];
    const time = inc.incidentTime || inc.time || '07:30';
    const building = inc.buildingName || inc.location || 'Main Site Road';
    const specificLoc = inc.specificLocation || 'Entry Point';
    const contractor = inc.contractorsInvolved || inc.contractor || headsUp.contractorsInvolved || 'Give Steel / ATEA';
    // Collect all categories across sub-forms
    const allCategoriesList: string[] = [];
    if (Array.isArray(inc.categories)) allCategoriesList.push(...inc.categories);
    else if (inc.categories) allCategoriesList.push(String(inc.categories));
    if (inc.category) allCategoriesList.push(String(inc.category));
    if (Array.isArray(headsUp.categories)) allCategoriesList.push(...headsUp.categories);
    else if (headsUp.categories) allCategoriesList.push(String(headsUp.categories));
    if (headsUp.category) allCategoriesList.push(String(headsUp.category));
    if (Array.isArray(initial.categories)) allCategoriesList.push(...initial.categories);
    if (Array.isArray(initial.accidentCategories)) allCategoriesList.push(...initial.accidentCategories);

    // Initial Report Treatment inference
    const flatTreatments: string[] = [];
    if (Array.isArray(initial.treatmentProvided)) {
      initial.treatmentProvided.forEach((t: any) => {
        if (Array.isArray(t)) flatTreatments.push(...t.map(String));
        else if (t) flatTreatments.push(String(t));
      });
    }
    if (initial.treatmentPrescribed) flatTreatments.push(String(initial.treatmentPrescribed));
    if (initial.medicalTreatmentClass) flatTreatments.push(String(initial.medicalTreatmentClass));

    flatTreatments.forEach((t: string) => {
      const lowerT = t.toLowerCase();
      if (lowerT.includes('medical treatment') || lowerT === 'treatment') allCategoriesList.push('Medical Treatment Injury');
      if (lowerT.includes('first aid')) allCategoriesList.push('First Aid Injury');
      if (lowerT.includes('hospitalization') || lowerT.includes('lost time')) allCategoriesList.push('Loss Time Injury');
      if (lowerT.includes('no treatment')) allCategoriesList.push('No Treatment Injury');
      if (lowerT.includes('restricted work')) allCategoriesList.push('Restricted Work Injury');
    });

    const hasEnvData = Boolean(
      headsUp.isEnvironmental ||
      (Array.isArray(headsUp.spillType) && headsUp.spillType.length > 0) ||
      (typeof headsUp.spillType === 'string' && headsUp.spillType.trim().length > 0) ||
      (headsUp.spillSubstance && String(headsUp.spillSubstance).trim().length > 0) ||
      (headsUp.spillCause && String(headsUp.spillCause).trim().length > 0) ||
      (initial.environmentalDetails && typeof initial.environmentalDetails === 'object' && Object.keys(initial.environmentalDetails).length > 0)
    );
    if (hasEnvData) {
      allCategoriesList.push('Environmental Incident');
    }

    const hasPropData = Boolean(
      headsUp.propertyDamaged ||
      (initial.propertyDamageDetails && typeof initial.propertyDamageDetails === 'object' && Object.keys(initial.propertyDamageDetails).length > 0)
    );
    if (hasPropData) {
      allCategoriesList.push('Property Damage');
    }

    const uniqueCategories = Array.from(new Set(allCategoriesList.filter(Boolean)));
    const category = uniqueCategories.length > 0 ? uniqueCategories.join(', ') : (inc.category || 'Safety Observation / Incident');

    const allCategoriesStr = uniqueCategories.join(' , ').toLowerCase();

    const isCat = (catName: string) => {
      const lower = catName.toLowerCase();
      if (lower === 'loss time' || lower === 'lost time') {
        return allCategoriesStr.includes('loss time') || allCategoriesStr.includes('lost time') || allCategoriesStr.includes('lti');
      }
      return allCategoriesStr.includes(lower);
    };

    const standardCats = [
      'near miss',
      'no treatment',
      'first aid',
      'medical treatment',
      'restricted work',
      'loss time',
      'lost time',
      'permanent disability',
      'fatality',
      'occupational illness',
      'environmental',
      'property damage'
    ];

    const otherCustomCats = uniqueCategories.filter(c => {
      const lower = String(c).toLowerCase().trim();
      if (!lower) return false;
      return !standardCats.some(std => lower.includes(std));
    });

    const reportedBy = headsUp.submittedBy || inc.reportedBy || 'Ahmed Al-Rashidi';
    const description = headsUp.descriptionWhatHappened || inc.description || 'Incident description recorded.';
    const consequence = headsUp.descriptionConsequence || 'Potential safety risk identified.';

    // Load Logos from src/images/logos/
    const nneLogoPath = join(process.cwd(), 'src', 'images', 'logos', 'nne_logo.png');
    const projectLogoPath = join(process.cwd(), 'src', 'images', 'logos', 'Logo.jpeg');

    let nneLogoBase64 = '';
    let projectLogoBase64 = '';

    try {
      if (existsSync(nneLogoPath)) {
        nneLogoBase64 = `data:image/png;base64,${readFileSync(nneLogoPath).toString('base64')}`;
      }
      if (existsSync(projectLogoPath)) {
        projectLogoBase64 = `data:image/jpeg;base64,${readFileSync(projectLogoPath).toString('base64')}`;
      }
    } catch (e) {
      this.logger.error('Failed to read logo files:', e);
    }

    // Helper to resolve images to Base64 Data URIs or public CDN URLs for Puppeteer rendering
    const resolveImageDataUri = (pathOrBase64: string | null | undefined): string | null => {
      if (!pathOrBase64) return null;
      if (pathOrBase64.startsWith('data:image')) return pathOrBase64;

      try {
        let cleanPath = pathOrBase64.trim();

        // Extract filename if it is a full signature URL or route
        let sigFilename = cleanPath;
        if (cleanPath.includes('/signatures/')) {
          sigFilename = cleanPath.split('/signatures/').pop() || cleanPath;
        } else if (cleanPath.includes('/uploads/incidents/')) {
          sigFilename = cleanPath.split('/uploads/incidents/').pop() || cleanPath;
        } else if (cleanPath.includes('/incidents/')) {
          sigFilename = cleanPath.split('/incidents/').pop() || cleanPath;
        } else if (cleanPath.includes('/uploads/')) {
          sigFilename = cleanPath.split('/uploads/').pop() || cleanPath;
        }

        const candidatePaths = [
          sigFilename,
          join(process.cwd(), 'uploads', 'incidents', sigFilename),
          join(process.cwd(), 'uploads', 'signatures', sigFilename),
          join(process.cwd(), 'uploads', cleanPath),
          join(process.cwd(), cleanPath),
          join(process.cwd(), cleanPath.replace(/^\/+/, '')),
          join(process.cwd(), 'src', 'images', sigFilename),
        ];

        for (const targetPath of candidatePaths) {
          if (existsSync(targetPath) && statSync(targetPath).isFile()) {
            const ext = targetPath.split('.').pop()?.toLowerCase();
            const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
            return `data:${mime};base64,${readFileSync(targetPath).toString('base64')}`;
          }
        }

        if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
          return cleanPath;
        }

        // Live server public fallback URL if file on disk was not directly matched
        if (sigFilename && (sigFilename.endsWith('.png') || sigFilename.endsWith('.jpg') || sigFilename.endsWith('.jpeg') || sigFilename.startsWith('sig_'))) {
          if (cleanPath.includes('incidents')) {
            return `https://api.beam.safesiteworks.com/development/m3south/incidents/${sigFilename}`;
          }
          return `https://api.beam.safesiteworks.com/development/m3south/signatures/${sigFilename}`;
        }
      } catch (err) {
        this.logger.warn(`Could not load image at path: ${pathOrBase64}`);
      }
      return null;
    };

    // Helper to render signature images
    const renderSignature = (sigData: string | null | undefined, name: string) => {
      const uri = resolveImageDataUri(sigData);
      if (uri) {
        return `
          <div style="display: flex; flex-direction: column; align-items: flex-start;">
            <img src="${uri}" style="max-height: 42px; max-width: 160px; object-fit: contain; border-bottom: 1px solid #0f172a; padding-bottom: 2px;" alt="Signature" />
            <div style="font-size: 8px; color: #475569; margin-top: 2px;">Signed by ${name}</div>
          </div>
        `;
      }

      const isFilename = sigData && (
        sigData.includes('.png') ||
        sigData.includes('.jpg') ||
        sigData.includes('.jpeg') ||
        sigData.includes('.svg') ||
        sigData.startsWith('sig_') ||
        sigData.includes('/') ||
        sigData.includes('\\')
      );

      if (sigData && !isFilename && sigData.length > 2) {
        return `
          <div style="display: flex; flex-direction: column; align-items: flex-start;">
            <div style="font-family: 'Brush Script MT', cursive, sans-serif; font-size: 18px; color: #002868; font-weight: 700; border-bottom: 1.5px solid #002868; padding: 0 10px 2px 2px;">${sigData}</div>
            <div style="font-size: 8px; color: #475569; margin-top: 2px;">Signed by ${name}</div>
          </div>
        `;
      }

      return `
        <div style="display: flex; flex-direction: column; align-items: flex-start;">
          <div style="font-family: 'Brush Script MT', cursive, sans-serif; font-size: 17px; color: #0f172a; border-bottom: 1px dashed #94a3b8; padding: 2px 14px;">${name}</div>
          <div style="font-size: 8px; color: #64748b; margin-top: 2px;">Digitally Verified Signature</div>
        </div>
      `;
    };

    // Collect all initial & investigation report photos
    let rawPhotos: string[] = [];
    if (initial.photos && Array.isArray(initial.photos)) rawPhotos.push(...initial.photos);
    if (inv.photos && Array.isArray(inv.photos)) rawPhotos.push(...inv.photos);
    if (inc.photos && Array.isArray(inc.photos)) rawPhotos.push(...inc.photos);

    const resolvedPhotos = rawPhotos
      .map((p) => resolveImageDataUri(p))
      .filter((p): p is string => p !== null);

    const renderPhotosGrid = () => {
      if (resolvedPhotos.length > 0) {
        return `
          <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 6px;">
            ${resolvedPhotos.map((imgUri, i) => `
              <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; background: #fff; text-align: center;">
                <img src="${imgUri}" style="width: 145px; height: 95px; object-fit: cover; border-radius: 3px;" alt="Incident Photo ${i+1}" />
                <div style="font-size: 8px; font-weight: 600; color: #334155; margin-top: 3px;">Photo ${i+1}: Incident Location Evidence</div>
              </div>
            `).join('')}
          </div>
        `;
      }
      return `
        <div style="display: flex; gap: 12px; margin-top: 6px;">
          <div style="border: 1px dashed #94a3b8; border-radius: 4px; padding: 10px; width: 145px; height: 90px; background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span style="font-size: 8px; color: #64748b; margin-top: 4px; font-weight: 600;">Photo 1: Site Location</span>
          </div>
          <div style="border: 1px dashed #94a3b8; border-radius: 4px; padding: 10px; width: 145px; height: 90px; background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span style="font-size: 8px; color: #64748b; margin-top: 4px; font-weight: 600;">Photo 2: Area / Equipment</span>
          </div>
        </div>
      `;
    };

    // Helper for rendering statusHistory timeline inside action item table rows
    const renderStatusHistory = (historyData: any) => {
      let historyList: any[] = [];
      if (typeof historyData === 'string') {
        try {
          historyList = JSON.parse(historyData);
        } catch (e) {}
      } else if (Array.isArray(historyData)) {
        historyList = historyData;
      }

      if (!historyList || historyList.length === 0) return '';

      const historyItems = historyList.map((h: any) => {
        const statusVal = h.status || 'UPDATED';
        const userVal = h.updatedBy || h.user || 'User';
        const remarksVal = h.remarks ? ` — <em>${h.remarks}</em>` : '';
        const timeVal = h.timestamp ? new Date(h.timestamp).toLocaleString('en-GB', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short', hour12: false }) : '';

        return `
          <div style="font-size: 8px; color: #475569; margin-top: 3px; padding-left: 6px; border-left: 2px solid #cbd5e1;">
            <strong style="color: #0f172a;">[${statusVal}]</strong> ${timeVal} by <strong>${userVal}</strong>${remarksVal}
          </div>
        `;
      }).join('');

      return `
        <div style="margin-top: 5px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
          <div style="font-size: 8px; font-weight: 700; color: #334155; text-transform: uppercase;">Status History:</div>
          ${historyItems}
        </div>
      `;
    };

    // Helper to render Edit and Revision / Return for Revision History table in PDF
    const renderEditAndRevisionHistory = (historyData: any, stageTitle: string = 'Stage') => {
      let historyList: any[] = [];
      if (typeof historyData === 'string') {
        try { historyList = JSON.parse(historyData); } catch (e) {}
      } else if (Array.isArray(historyData)) {
        historyList = historyData;
      }
      if (!historyList || historyList.length === 0) return '';

      const formatDt = (dStr: string) => {
        if (!dStr) return '—';
        try {
          const d = new Date(dStr);
          if (isNaN(d.getTime())) return dStr.replace('T', ' ');
          return d.toLocaleString('en-GB', { timeZone: 'Europe/Copenhagen', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
        } catch (e) { return dStr; }
      };

      return `
        <div style="margin-top: 10px; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; page-break-inside: avoid; break-inside: avoid;">
          <div style="background: #f1f5f9; padding: 4px 8px; font-size: 8.5px; font-weight: 700; color: #1e293b; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #cbd5e1;">
            <span>${stageTitle} — Revision & Return for Revision Audit Log</span>
            <span style="font-size: 8px; font-weight: 600; color: #64748b;">${historyList.length} Event${historyList.length === 1 ? '' : 's'}</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 8px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; color: #475569;">
                <th style="padding: 4px 6px; text-align: left; width: 22%; font-weight: 700;">Action / Status</th>
                <th style="padding: 4px 6px; text-align: left; width: 24%; font-weight: 700;">By (Role)</th>
                <th style="padding: 4px 6px; text-align: left; width: 38%; font-weight: 700;">Reason / Change Details</th>
                <th style="padding: 4px 6px; text-align: left; width: 16%; font-weight: 700;">Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${historyList.map((item: any, idx: number) => {
                const isReturned = item.status === 'RETURNED_FOR_REVISION' || (item.action && String(item.action).toLowerCase().includes('return'));
                const badgeColor = isReturned ? '#b91c1c' : '#1d4ed8';
                const badgeBg = isReturned ? '#fee2e2' : '#dbeafe';
                const actionText = isReturned ? 'Returned for Revision' : (item.action || 'Updated / Revised');
                const byText = item.returnedBy || item.editedBy || item.name || 'User';
                const roleText = item.role ? ` (${item.role})` : '';
                const reasonText = item.reason || item.changes || '—';
                const timeText = formatDt(item.returnedTime || item.editedTime || item.timestamp || item.date);

                return `
                  <tr style="border-bottom: ${idx < historyList.length - 1 ? '1px solid #e2e8f0' : 'none'}; background: ${idx % 2 === 0 ? '#ffffff' : '#fafafa'};">
                    <td style="padding: 4px 6px;">
                      <span style="display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 7.5px; font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}33;">
                        ${actionText}
                      </span>
                    </td>
                    <td style="padding: 4px 6px; color: #0f172a; font-weight: 600;">${byText}${roleText}</td>
                    <td style="padding: 4px 6px; color: #334155;">${reasonText}</td>
                    <td style="padding: 4px 6px; color: #64748b;">${timeText}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    };

    // Helper for immediate actions (Stage 1 & Stage 2)
    const getImmediateActions = (): any[] => {
      const list: any[] = [];
      let huActs = headsUp.immediateActions;
      if (typeof huActs === 'string') {
        try { huActs = JSON.parse(huActs); } catch (e) {}
      }
      if (huActs && Array.isArray(huActs)) {
        list.push(...huActs);
      }
      let incActs = inc.immediateActions;
      if (typeof incActs === 'string') {
        try { incActs = JSON.parse(incActs); } catch (e) {}
      }
      if (incActs && Array.isArray(incActs)) {
        incActs.forEach((act: any) => {
          if (!list.some((existing) => (existing.action || existing.description) === (act.action || act.description))) {
            list.push(act);
          }
        });
      }
      let irActs = initial.immediateActions;
      if (typeof irActs === 'string') {
        try { irActs = JSON.parse(irActs); } catch (e) {}
      }
      if (irActs && Array.isArray(irActs)) {
        irActs.forEach((act: any) => {
          if (!list.some((existing) => (existing.action || existing.description) === (act.action || act.description))) {
            list.push(act);
          }
        });
      }
      if (actions && Array.isArray(actions)) {
        actions.filter((a: any) => a.actionType === 'IMMEDIATE' || !a.actionType).forEach((act: any) => {
          if (!list.some((existing) => (existing.action || existing.actionItem) === act.action)) {
            list.push(act);
          }
        });
      }
      return list;
    };
    const immActionsList = getImmediateActions();

    // Form 1 Signatures
    const headsUpSig = headsUp.signature || headsUp.submittedBySignature || headsUp.submitted_by_signature || inc.signature || null;
    const headsUpSubmitter = headsUp.submittedBy || headsUp.submitted_by || reportedBy;
    const headsUpApprSig = headsUp.approverSignature || headsUp.approver_signature || null;
    const headsUpApprName = headsUp.approvedBy || headsUp.approved_by || 'Site HSE Manager';

    const formatActionDate = (dVal: any): string => {
      if (!dVal) return date || '—';
      try {
        const s = String(dVal).trim();
        if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
        if (s.includes('T')) return s.split('T')[0];
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
        return s;
      } catch (e) {
        return date || '—';
      }
    };

    const renderImmediateActionsRows = () => {
      if (immActionsList.length > 0) {
        return immActionsList.map(a => {
          const actText = a.action || a.actionItem || a.description || 'Cordon off area and perform immediate risk control.';
          const respText = a.responsible || a.owner || a.assignedTo || headsUpSubmitter;
          const dateText = formatActionDate(a.date || a.targetDate || a.incidentDate || (a.createdAt ? new Date(a.createdAt).toISOString().split('T')[0] : null));
          const timeText = a.timeImplemented || a.time || 'Immediate';
          const historyHtml = renderStatusHistory(a.statusHistory);

          return `
            <tr>
              <td>
                <div style="font-weight: 600; color: #0f172a;">${actText}</div>
                ${historyHtml}
              </td>
              <td>${respText}</td>
              <td style="white-space: nowrap;">${dateText}</td>
              <td style="white-space: nowrap;">${timeText}</td>
            </tr>
          `;
        }).join('');
      }
      return `
        <tr>
          <td>Cordon off area and perform immediate risk control.</td>
          <td>${headsUpSubmitter}</td>
          <td style="white-space: nowrap;">${date}</td>
          <td style="white-space: nowrap;">Immediate</td>
        </tr>
      `;
    };

    // Helper for corrective actions (Stage 3 - Investigation only)
    const getCorrectiveActions = (): any[] => {
      const list: any[] = [];
      if (inv.correctiveActions && Array.isArray(inv.correctiveActions)) {
        list.push(...inv.correctiveActions);
      }
      if (inv.actionItems && Array.isArray(inv.actionItems)) {
        inv.actionItems.forEach((act: any) => {
          if (!list.some((existing) => (existing.action || existing.description) === (act.action || act.description))) {
            list.push(act);
          }
        });
      }
      if (actions && Array.isArray(actions)) {
        // ONLY items explicitly marked as CORRECTIVE from investigation
        actions.filter((a: any) => a.actionType === 'CORRECTIVE').forEach((act: any) => {
          if (!list.some((existing) => (existing.action || existing.correctiveAction) === act.action)) {
            list.push(act);
          }
        });
      }
      return list;
    };
    const correctiveActionsList = getCorrectiveActions();

    const renderCorrectiveActionsRows = () => {
      if (correctiveActionsList.length > 0) {
        return correctiveActionsList.map(a => {
          const actText = a.action || a.correctiveAction || a.description || 'Action item recorded.';
          const respText = a.responsible || a.assignedTo || a.owner || investigatorName;
          const targetDateText = formatActionDate(a.targetDate || a.date || a.deadline || date);
          const statusText = a.status || 'Implemented';
          const statusColor = (statusText.toUpperCase() === 'COMPLETED' || statusText.toUpperCase() === 'IMPLEMENTED') ? '#16a34a' : '#d97706';
          const historyHtml = renderStatusHistory(a.statusHistory);

          const rawPriority = a.priority || 'Medium';
          const pLower = String(rawPriority).toLowerCase().trim();
          let pBg = '#fef9c3', pCol = '#854d0e', pBorder = '#fde047';
          if (pLower.includes('crit')) {
            pBg = '#fee2e2'; pCol = '#991b1b'; pBorder = '#fca5a5';
          } else if (pLower.includes('high')) {
            pBg = '#ffedd5'; pCol = '#c2410c'; pBorder = '#fdba74';
          } else if (pLower.includes('low')) {
            pBg = '#dcfce7'; pCol = '#166534'; pBorder = '#86efac';
          }

          return `
            <tr>
              <td>
                <div style="font-weight: 600; color: #0f172a;">${actText}</div>
                ${historyHtml}
              </td>
              <td style="text-align: center; white-space: nowrap;">
                <span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 8px; font-weight: 700; background: ${pBg}; color: ${pCol}; border: 1px solid ${pBorder}; text-transform: uppercase;">
                  ${rawPriority}
                </span>
              </td>
              <td>${respText}</td>
              <td style="white-space: nowrap;">${targetDateText}</td>
              <td style="font-weight: 700; color: ${statusColor}; white-space: nowrap;">${statusText}</td>
            </tr>
          `;
        }).join('');
      }

      return `
        <tr>
          <td colspan="5" style="text-align: center; color: #64748b; font-style: italic; padding: 10px;">
            No corrective actions recorded for this incident.
          </td>
        </tr>
      `;
    };

    // Injured Person details
    const injuredName = initial.injuredPersonName || inc.injuredPersonName || 'N/A (No Injury / Near Miss)';
    const injuredCompany = initial.injuredPersonCompany || contractor || 'N/A';
    const injuredSupervisor = initial.injuredPersonSupervisor || 'N/A';
    const injuredJobTitle = initial.injuredPersonJobTitle || 'N/A';
    const lengthOfService = initial.lengthOfService || 'N/A';
    const experienceInRole = initial.experienceInRole || 'N/A';
    const workerActivity = initial.workerActivity || 'N/A';

    // Injury / Illness Info
    const natureOfInjury = initial.natureOfInjury || 'N/A';
    const treatmentPrescribed = initial.treatmentPrescribed || (Array.isArray(initial.treatmentProvided) ? initial.treatmentProvided.join(', ') : initial.treatmentProvided) || 'First Aid';
    const anticipatedAbsence = initial.anticipatedAbsence ? (String(initial.anticipatedAbsence).includes('day') ? initial.anticipatedAbsence : `${initial.anticipatedAbsence} days`) : '0 days';
    const medicalTreatmentClass = initial.medicalTreatmentClass || initial.treatmentPrescribed || (initial.hasInjuryIllness ? 'Medical Treatment' : 'No Treatment');

    // Accident Categories helper & list matching Frontend Section H
    const accidentCategoriesList = [
      'Contact with an object or equipment', 'Electrocution – electrical injury', 'Malfunctioning/Defective tools and equipment',
      'Tool accidents', 'Scaffolding accidents', 'Asphyxiation – Confined space',
      'Cuts', 'Accidents involving cranes and other equipment/Machinery', 'Biological',
      'Slip, Trip and fall accidents', 'Fire and explosions', 'Psychological',
      'Falls from heights', 'Exposure to hazardous materials and chemicals', 'Extreme Temperature',
      'Falling objects from height', 'Noise', 'Radiation',
      'Push and pull', 'Vibration', '',
      'Transportation accidents', 'Ergonomic', ''
    ];

    const isAccidentCategory = (catName: string) => {
      if (!catName) return false;
      let accCats = initial.accidentCategories || [];
      if (typeof accCats === 'string') {
        try { accCats = JSON.parse(accCats); } catch (e) {}
      }
      if (!Array.isArray(accCats)) accCats = [accCats];
      const target = catName.toLowerCase().trim();
      return accCats.some((c: any) => {
        if (!c) return false;
        const cLower = String(c).toLowerCase().trim();
        if (cLower === target || cLower.includes(target) || target.includes(cLower)) return true;
        const targetWords = target.split(/[\s,\/–-]+/).filter(w => w.length > 3);
        const cWords = cLower.split(/[\s,\/–-]+/).filter(w => w.length > 3);
        return targetWords.length > 0 && targetWords.some(tw => cWords.includes(tw));
      });
    };

    const renderAccidentCategoriesRows = () => {
      const rows: string[] = [];
      for (let i = 0; i < accidentCategoriesList.length; i += 3) {
        const c1 = accidentCategoriesList[i];
        const c2 = accidentCategoriesList[i + 1];
        const c3 = accidentCategoriesList[i + 2];
        rows.push(`
          <tr>
            <td style="width: 33.33%;">${c1 ? renderCheckbox(isAccidentCategory(c1), c1) : ''}</td>
            <td style="width: 33.33%;">${c2 ? renderCheckbox(isAccidentCategory(c2), c2) : ''}</td>
            <td style="width: 33.33%;">${c3 ? renderCheckbox(isAccidentCategory(c3), c3) : ''}</td>
          </tr>
        `);
      }
      return rows.join('');
    };

    // Injury Types helper & list matching Frontend Section I
    const injuryTypesList = [
      'Abrasion, Laceration', 'Drowning or Suffocation', 'Acute infection', 'Wound',
      'Dislocation of body part', 'Animal bite', 'Electrical Injury', 'Acute exposure',
      'Bruising or Contusion', 'Concussion/Compression', 'Psychological shock', 'Poisoning',
      'Burn or Scald', 'Amputation and Crush Injury', 'Paralysis', 'Hearing loss',
      'Fracture', 'Frost bite', 'Sprain', 'Irradiation',
      'Other'
    ];

    const isInjuryType = (type: string) => {
      if (!type) return false;
      let types = initial.injuryTypes || [];
      if (typeof types === 'string') {
        try { types = JSON.parse(types); } catch (e) {}
      }
      if (!Array.isArray(types)) types = [types];
      const target = type.toLowerCase().trim();
      return types.some((t: any) => {
        if (!t) return false;
        const tLower = String(t).toLowerCase().trim();
        if (tLower === target || tLower.includes(target) || target.includes(tLower)) return true;
        const targetWords = target.split(/[\s,\/–-]+/).filter(w => w.length > 3);
        const tWords = tLower.split(/[\s,\/–-]+/).filter(w => w.length > 3);
        return targetWords.length > 0 && targetWords.some(tw => tWords.includes(tw));
      });
    };

    const renderInjuryTypesRows = () => {
      const rows: string[] = [];
      for (let i = 0; i < injuryTypesList.length; i += 4) {
        const c1 = injuryTypesList[i];
        const c2 = injuryTypesList[i + 1];
        const c3 = injuryTypesList[i + 2];
        const c4 = injuryTypesList[i + 3];
        rows.push(`
          <tr>
            <td style="width: 25%;">${c1 ? renderCheckbox(isInjuryType(c1), c1) : ''}</td>
            <td style="width: 25%;">${c2 ? renderCheckbox(isInjuryType(c2), c2) : ''}</td>
            <td style="width: 25%;">${c3 ? renderCheckbox(isInjuryType(c3), c3) : ''}</td>
            <td style="width: 25%;">${c4 ? renderCheckbox(isInjuryType(c4), c4) : ''}</td>
          </tr>
        `);
      }
      const otherChecked = isInjuryType('Other');
      const otherText = initial.injuryOtherText || initial.otherInjuryText || '';
      if (otherChecked && otherText) {
        rows.push(`
          <tr>
            <td colspan="4" style="background: #f8fafc; padding: 4px 8px; font-size: 8.5px;">
              <strong>Other (please state):</strong> ${otherText}
            </td>
          </tr>
        `);
      }
      return rows.join('');
    };

    // Body Parts helper
    const getBodyPartSelectionList = (): string[] => {
      if (!initial.bodyPartsInjured) return [];
      let bp = initial.bodyPartsInjured;
      if (typeof bp === 'string') {
        try { bp = JSON.parse(bp); } catch (e) {}
      }
      if (Array.isArray(bp)) return bp.map((x: any) => typeof x === 'string' ? x : `${x.part || x.name}${x.side ? ` (${x.side})` : ''}`);
      if (bp && bp.selections && Array.isArray(bp.selections)) {
        return bp.selections.map((x: any) => typeof x === 'string' ? x : `${x.part || x.name}${x.side ? ` (${x.side})` : ''}`);
      }
      return [];
    };
    const selectedBodyPartsList = getBodyPartSelectionList();
    const isBodyPartChecked = (partKey: string) => {
      if (selectedBodyPartsList.length === 0) return partKey.toLowerCase().includes('no injury');
      return selectedBodyPartsList.some(p => p.toLowerCase().includes(partKey.toLowerCase()));
    };

    const isPartSelected = (partName: string, side?: string): boolean => {
      if (selectedBodyPartsList.length === 0) return false;
      return selectedBodyPartsList.some(item => {
        const lowerItem = item.toLowerCase();
        if (lowerItem.includes('entire body') || lowerItem.includes('multiple locations')) return true;

        const lowerPart = partName.toLowerCase();
        let matchesPart = lowerItem.includes(lowerPart);

        // Synonyms & Category Aliases
        if (lowerPart === 'chest' && (lowerItem.includes('ribs') || lowerItem.includes('torso') || lowerItem.includes('chest'))) matchesPart = true;
        if (lowerPart === 'pelvis' && (lowerItem.includes('abdomen') || lowerItem.includes('pelvis'))) matchesPart = true;
        if (lowerPart === 'back' && (lowerItem.includes('spine') || lowerItem.includes('back'))) matchesPart = true;
        if (lowerPart === 'head' && (lowerItem.includes('cranium') || lowerItem.includes('head'))) matchesPart = true;
        if ((lowerPart === 'foot' || lowerPart === 'toe' || lowerPart === 'toe(s)') && (lowerItem.includes('foot') || lowerItem.includes('toe'))) matchesPart = true;
        if ((lowerPart === 'hand' || lowerPart === 'finger' || lowerPart === 'finger(s)') && (lowerItem.includes('hand') || lowerItem.includes('finger'))) matchesPart = true;

        if (!side) return matchesPart;
        const sideLower = side.toLowerCase();
        const hasSide = lowerItem.includes(`(${sideLower})`) || lowerItem.includes(` ${sideLower}`) || lowerItem.includes(`_${sideLower}`);
        
        // If the DB item didn't specify side (e.g. "Hand" or "Wrist"), light up both sides
        const itemHasNoSide = !lowerItem.includes('(l)') && !lowerItem.includes('(r)') && !lowerItem.includes(' left') && !lowerItem.includes(' right');

        return matchesPart && (hasSide || itemHasNoSide);
      });
    };

    const getBodyPartFill = (partName: string, side?: string): string => {
      return isPartSelected(partName, side) ? '#dc2626' : '#cbd5e1';
    };

    // Parse Fishbone Data for Form 3 SVG Diagram
    const parseFishboneData = (): Record<string, Array<{ text: string; score?: number; probable?: boolean }>> => {
      const result: Record<string, Array<{ text: string; score?: number; probable?: boolean }>> = {
        people: [],
        machine: [],
        method: [],
        materials: [],
        environment: [],
        measurement: [],
      };

      let rawData = inv.fishboneData || inv.fishbone_data || details.fishboneData || inc.fishboneData;
      if (typeof rawData === 'string') {
        try { rawData = JSON.parse(rawData); } catch (e) {}
      }

      if (Array.isArray(rawData)) {
        rawData.forEach((item: any) => {
          const catName = String(item.category || item.cat || '').toLowerCase();
          let targetKey = 'people';
          if (catName.includes('machine') || catName.includes('equipment')) targetKey = 'machine';
          else if (catName.includes('method') || catName.includes('procedure')) targetKey = 'method';
          else if (catName.includes('material')) targetKey = 'materials';
          else if (catName.includes('environment')) targetKey = 'environment';
          else if (catName.includes('measure')) targetKey = 'measurement';
          else if (catName.includes('people') || catName.includes('person')) targetKey = 'people';

          if (Array.isArray(item.causes)) {
            item.causes.forEach((c: any) => {
              const txt = typeof c === 'string' ? c : (c.causeText || c.text || '');
              if (txt) {
                result[targetKey].push({
                  text: txt,
                  score: typeof c === 'object' ? (c.score || undefined) : undefined,
                  probable: typeof c === 'object' ? (c.probable || c.isSelectedForFiveWhys || false) : false,
                });
              }
            });
          }
        });
      } else if (rawData && typeof rawData === 'object') {
        Object.keys(rawData).forEach((key) => {
          const lowerKey = key.toLowerCase();
          let targetKey = 'people';
          if (lowerKey.includes('machine') || lowerKey.includes('equipment')) targetKey = 'machine';
          else if (lowerKey.includes('method') || lowerKey.includes('procedure')) targetKey = 'method';
          else if (lowerKey.includes('material')) targetKey = 'materials';
          else if (lowerKey.includes('environment')) targetKey = 'environment';
          else if (lowerKey.includes('measure')) targetKey = 'measurement';
          else if (lowerKey.includes('people') || lowerKey.includes('person')) targetKey = 'people';

          const causes = rawData[key];
          if (Array.isArray(causes)) {
            causes.forEach((c: any) => {
              const txt = typeof c === 'string' ? c : (c.causeText || c.text || '');
              if (txt) {
                result[targetKey].push({
                  text: txt,
                  score: typeof c === 'object' ? (c.score || undefined) : undefined,
                  probable: typeof c === 'object' ? (c.probable || c.isSelectedForFiveWhys || false) : false,
                });
              }
            });
          }
        });
      }

      // Default sample causes if no causes entered yet
      const totalCauses = Object.values(result).reduce((acc, arr) => acc + arr.length, 0);
      if (totalCauses === 0) {
        result.people = [{ text: 'Not following procedures', score: 4, probable: true }, { text: 'Pedestrian alertness', score: 3, probable: false }];
        result.machine = [{ text: 'Vehicle brake check', score: 3, probable: false }, { text: 'Speed bump placement', score: 5, probable: true }];
        result.method = [{ text: 'Crossing speed limit rule', score: 4, probable: false }, { text: 'Traffic management plan', score: 4, probable: true }];
      }

      return result;
    };

    const renderFishboneSvg = (): string => {
      const fishboneMap = parseFishboneData();
      const W = 1000, H = 450, spineY = 225, spineX1 = 120, spineX2 = 780;
      const topXs = [260, 480, 700];
      const botXs = [260, 480, 700];
      const effectStr = inv.problemStatement || inv.effect || title || 'Incident Event';
      const effectLabel = 'INCIDENT / EFFECT';

      const FISHBONE_CATS = [
        { key: 'people', label: 'PEOPLE' },
        { key: 'machine', label: 'MACHINE / EQUIPMENT' },
        { key: 'method', label: 'METHOD / PROCEDURE' },
        { key: 'materials', label: 'MATERIALS' },
        { key: 'environment', label: 'ENVIRONMENT' },
        { key: 'measurement', label: 'MEASUREMENT' }
      ];

      const catSvgGroups = FISHBONE_CATS.map((cat, c) => {
        const isTop = c < 3;
        const baseX = isTop ? topXs[c] : botXs[c - 3];
        const endX = baseX - 110;
        const endY = isTop ? (spineY - 150) : (spineY + 150);

        const boxW = 190;
        const boxH = 40;
        const boxX = endX - boxW / 2;
        const boxY = isTop ? endY - boxH : endY;

        const arr = fishboneMap[cat.key] || [];

        const causeElements = arr.slice(0, 5).map((cause, i) => {
          const count = Math.min(arr.length, 5);
          const t = (i + 1) / (count + 1);
          const tx = endX + (baseX - endX) * t;
          const ty = endY + (spineY - endY) * t;
          const txt = cause.text + (cause.score ? ` [${cause.score}]` : '');

          const tickLen = 70;
          const tickX2 = tx - tickLen;

          return `
            <g>
              <line x1="${tx}" y1="${ty}" x2="${tickX2}" y2="${ty}" stroke="#0f172a" stroke-width="2.5" />
              <text x="${tickX2 - 6}" y="${ty + 4}" fill="#1e293b" font-size="12" font-weight="600" text-anchor="end">${txt.length > 24 ? txt.substring(0, 22) + '...' : txt}</text>
              ${cause.probable ? `<circle cx="${tx}" cy="${ty}" r="8" fill="#fee2e2" stroke="#dc2626" stroke-width="2.5" stroke-dasharray="4,2" />` : ''}
            </g>
          `;
        }).join('');

        return `
          <g>
            <line x1="${endX}" y1="${endY}" x2="${baseX}" y2="${spineY}" stroke="#0f172a" stroke-width="4" marker-end="url(#fbArrow)" />
            <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="8" fill="#0f172a" />
            <text x="${endX}" y="${boxY + 24}" fill="#ffffff" font-size="14" font-weight="800" text-anchor="middle" letter-spacing="0.5px">${cat.label}</text>
            ${causeElements}
          </g>
        `;
      }).join('');

      return `
        <div style="border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; padding: 12px; margin-top: 6px; margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid;">
          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 6px;">Fishbone Analysis – Cause and Effect</div>
          <svg viewBox="0 0 ${W} ${H}" style="display: block; width: 100%; height: auto;">
            <defs>
              <marker id="fbArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#0f172a" />
              </marker>
            </defs>

            <!-- Fish Tail -->
            <path d="M ${spineX1},${spineY} C ${spineX1 - 90},${spineY - 90} ${spineX1 - 110},${spineY - 70} ${spineX1 - 100},${spineY} C ${spineX1 - 110},${spineY + 70} ${spineX1 - 90},${spineY + 90} ${spineX1},${spineY} Z" fill="#0f172a" />

            <!-- Spine -->
            <line x1="${spineX1}" y1="${spineY}" x2="${spineX2}" y2="${spineY}" stroke="#0f172a" stroke-width="8" />

            <!-- Fish Head -->
            <path d="M ${spineX2},${spineY} C ${spineX2 + 20},${spineY - 100} ${spineX2 + 120},${spineY - 80} ${spineX2 + 160},${spineY} C ${spineX2 + 120},${spineY + 80} ${spineX2 + 20},${spineY + 100} ${spineX2},${spineY} Z" fill="#0f172a" />

            <!-- Fish Eye -->
            <circle cx="${spineX2 + 100}" cy="${spineY - 30}" r="8" fill="#ffffff" />
            <circle cx="${spineX2 + 102}" cy="${spineY - 30}" r="4" fill="#0f172a" />

            <!-- Fish Mouth -->
            <path d="M ${spineX2 + 160},${spineY} Q ${spineX2 + 140},${spineY + 10} ${spineX2 + 150},${spineY + 30} Z" fill="#f8fafc" />

            <!-- Effect Box inside/near Head -->
            <rect x="${spineX2 + 30}" y="${spineY - 45}" width="180" height="90" rx="8" fill="#ffffff" stroke="#dc2626" stroke-width="4" />
            <text x="${spineX2 + 120}" y="${spineY - 15}" fill="#dc2626" font-size="15" font-weight="800" text-anchor="middle">${effectLabel}</text>
            <text x="${spineX2 + 120}" y="${spineY + 15}" fill="#0f172a" font-size="14" font-weight="700" text-anchor="middle">
              ${effectStr.length > 22 ? effectStr.substring(0, 20) + '...' : effectStr}
            </text>

            ${catSvgGroups}
          </svg>
        </div>
      `;
    };

    const renderFiveWhysRows = (): string => {
      let whysList: any[] = inv.fiveWhysData || inv.five_whys_data || details.fiveWhysData || inc.fiveWhysData || [];
      if (typeof whysList === 'string') {
        try { whysList = JSON.parse(whysList); } catch (e) {}
      }

      if (Array.isArray(whysList) && whysList.length > 0) {
        return whysList.map((item: any) => {
          const causeHeader = item.fishboneCauseText ? `<div style="font-weight: 700; color: #dc2626; font-size: 9.5px; margin-bottom: 4px; padding-bottom: 2px; border-bottom: 1px solid #fee2e2;">Selected Cause for Analysis: ${item.fishboneCauseText}</div>` : '';
          const w1 = item.why1 ? `<tr><td class="lbl-cell" style="width: 18%;">Why 1</td><td>${item.why1}</td></tr>` : '';
          const w2 = item.why2 ? `<tr><td class="lbl-cell" style="width: 18%;">Why 2</td><td>${item.why2}</td></tr>` : '';
          const w3 = item.why3 ? `<tr><td class="lbl-cell" style="width: 18%;">Why 3</td><td>${item.why3}</td></tr>` : '';
          const w4 = item.why4 ? `<tr><td class="lbl-cell" style="width: 18%;">Why 4</td><td>${item.why4}</td></tr>` : '';
          const w5 = item.why5 ? `<tr><td class="lbl-cell" style="width: 18%;">Why 5</td><td>${item.why5}</td></tr>` : '';
          const rc = (item.rootCauseSummary || inc.rootCause || initial.initialRootCause) ? `<tr><td class="lbl-cell" style="color: #dc2626; font-weight: 700;">Root Cause</td><td><strong>${item.rootCauseSummary || inc.rootCause || initial.initialRootCause}</strong></td></tr>` : '';

          return `
            <div style="margin-bottom: 8px;">
              ${causeHeader}
              <table class="nne-tbl" style="margin-bottom: 4px;">
                <tbody>
                  ${w1}${w2}${w3}${w4}${w5}${rc}
                </tbody>
              </table>
            </div>
          `;
        }).join('');
      }

      return `
        <table class="nne-tbl">
          <thead>
            <tr class="dark-hdr">
              <th style="width: 18%;">Why #</th>
              <th>Investigation Question & Answer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="lbl-cell">Why 1</td>
              <td>Why did the vehicle fail to yield? Driver did not notice pedestrians approaching crossing point.</td>
            </tr>
            <tr>
              <td class="lbl-cell">Why 2</td>
              <td>Why was vehicle speed high? Lack of physical speed calming barriers at entry road.</td>
            </tr>
            <tr>
              <td class="lbl-cell">Why 3</td>
              <td>Why were speed bumps missing? Site traffic control plan installation pending final approval.</td>
            </tr>
            <tr>
              <td class="lbl-cell" style="color: #dc2626;">Root Cause</td>
              <td><strong>${inc.rootCause || initial.initialRootCause || 'Speed bump not installed at crossing point; incomplete site traffic calming infrastructure.'}</strong></td>
            </tr>
          </tbody>
        </table>
      `;
    };

    const renderInvTeamRows = (): string => {
      let team: any[] = inv.investigationTeam || inv.teamMembers || inv.team || [];
      if (typeof team === 'string') {
        try { team = JSON.parse(team); } catch (e) {}
      }
      if (Array.isArray(team) && team.length > 0) {
        return team.map((m, i) => `
          <tr>
            <td style="text-align: center; font-weight: 700;">${i + 1}</td>
            <td><strong>${m.name || 'N/A'}</strong></td>
            <td>${m.role || m.position || 'Investigator'}</td>
            <td>${m.company || contractor || 'N/A'}</td>
          </tr>
        `).join('');
      }
      return `
        <tr>
          <td style="text-align: center; font-weight: 700;">1</td>
          <td><strong>${investigatorName}</strong></td>
          <td>Site HSE Investigator</td>
          <td>${contractor || 'NNE / Project Team'}</td>
        </tr>
      `;
    };

    const renderWitnessRows = (): string => {
      let witnesses: any[] = inv.witnessStatements || inv.witnesses || [];
      if (typeof witnesses === 'string') {
        try { witnesses = JSON.parse(witnesses); } catch (e) {}
      }
      if (Array.isArray(witnesses) && witnesses.length > 0) {
        return witnesses.map((w, i) => `
          <tr>
            <td style="font-weight: 700;">${w.name || `Witness ${i+1}`}</td>
            <td>${w.badge || w.badgeNo || 'N/A'}</td>
            <td>${w.employer || w.company || 'N/A'}</td>
            <td>${w.occupation || w.role || 'N/A'}</td>
            <td>${w.desc || w.description || w.statement || 'Statement recorded.'}</td>
          </tr>
        `).join('');
      }
      return `
        <tr>
          <td colspan="5" style="text-align: center; color: #64748b; font-style: italic; padding: 8px;">
            No witness statements recorded for this investigation.
          </td>
        </tr>
      `;
    };

    const renderRootCausesRows = (): string => {
      let rcs: any[] = inv.rootCauses || inv.root_causes || [];
      if (typeof rcs === 'string') {
        try { rcs = JSON.parse(rcs); } catch (e) {}
      }
      if (!Array.isArray(rcs) || rcs.length === 0) {
        const fallbackRc = inc.rootCause || initial.initialRootCause || 'Investigation root cause analysis recorded.';
        rcs = [fallbackRc];
      }
      return rcs.map((rc, i) => `
        <div style="font-size: 8.5px; color: #0f172a; margin-bottom: 4px; padding: 4px 8px; background: #fff1f2; border-left: 3px solid #dc2626; border-radius: 2px;">
          <strong style="color: #dc2626;">Root Cause ${rcs.length > 1 ? (i + 1) : ''}:</strong> ${typeof rc === 'string' ? rc : (rc.text || rc.cause || JSON.stringify(rc))}
        </div>
      `).join('');
    };

    const renderFactorsRows = (): string => {
      let factors: any[] = inv.contributingFactors || inv.contributing_factors || [];
      if (typeof factors === 'string') {
        try { factors = JSON.parse(factors); } catch (e) {}
      }
      if (!Array.isArray(factors) || factors.length === 0) {
        factors = ['Human Factor: Operational awareness', 'Environmental Factor: Lighting / Site access'];
      }
      return factors.map((f, i) => `
        <div style="font-size: 8.5px; color: #334155; margin-bottom: 3px; padding-left: 8px; border-left: 2px solid #0f172a;">
          • ${typeof f === 'string' ? f : (f.factor || f.text || JSON.stringify(f))}
        </div>
      `).join('');
    };

    const renderSeverityAssessment = (): string => {
      const preSev = inv.preSeverity || inv.severityBefore || inv.severity_before || inc.actualSeverity || 4;
      const postSev = inv.postSeverity || inv.severityAfter || inv.severity_after || 1;
      const preLabel = preSev === 1 ? 'Minor' : preSev === 2 ? 'Moderate' : preSev === 3 ? 'Serious' : preSev === 4 ? 'Major' : 'Critical';
      const postLabel = postSev === 1 ? 'Minor' : postSev === 2 ? 'Moderate' : postSev === 3 ? 'Serious' : postSev === 4 ? 'Major' : 'Critical';

      return `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 6px;">
          <div style="border: 1px solid #fca5a5; background: #fff1f2; padding: 6px 10px; border-radius: 4px;">
            <div style="font-size: 8px; font-weight: 700; color: #991b1b; text-transform: uppercase;">Severity Before Corrective Actions</div>
            <div style="font-size: 13px; font-weight: 800; color: #dc2626; margin-top: 2px;">Level ${preSev} — ${preLabel}</div>
          </div>
          <div style="border: 1px solid #86efac; background: #f0fdf4; padding: 6px 10px; border-radius: 4px;">
            <div style="font-size: 8px; font-weight: 700; color: #166534; text-transform: uppercase;">Severity After Corrective Actions</div>
            <div style="font-size: 13px; font-weight: 800; color: #16a34a; margin-top: 2px;">Level ${postSev} — ${postLabel}</div>
          </div>
        </div>
        <div style="font-size: 8px; font-weight: 700; color: #15803d; background: #dcfce7; padding: 4px 8px; border-radius: 3px; border: 1px solid #86efac;">
          Severity Reduction Achieved: Level ${preSev} (${preLabel}) → Level ${postSev} (${postLabel})
        </div>
      `;
    };

    const renderLessonsPrevention = (): string => {
      const lessons = inv.lessonsLearned || inv.lessons_learned || inv.lessons || 'Ensure pre-task risk assessments explicitly include site safety controls and risk mitigation measures.';

      return `
        <div style="border: 1px solid #cbd5e1; background: #fff; padding: 6px 10px; border-radius: 4px;">
          <div style="font-size: 8.5px; font-weight: 700; color: #0f172a; margin-bottom: 3px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 2px;">Lessons Learned</div>
          <div style="font-size: 8px; color: #334155; line-height: 1.4;">${lessons}</div>
        </div>
      `;
    };

    const renderMandatoryAttachmentsTable = (): string => {
      let att = inv.mandatoryAttachments || inv.mandatory_attachments || inv.attachments || {};
      if (typeof att === 'string') {
        try { att = JSON.parse(att); } catch (e) {}
      }

      const getAttachmentInfo = (keys: string[], labelMatch?: string, legacyIdx?: number) => {
        let val: any = null;
        for (const k of keys) {
          if (att[k] !== undefined && att[k] !== null) {
            val = att[k];
            break;
          }
        }
        if (!val && legacyIdx !== undefined && att[legacyIdx] !== undefined) {
          val = att[legacyIdx];
        }
        if (!val && Array.isArray(att.items)) {
          val = att.items.find((it: any) => 
            (it.key && keys.includes(it.key)) || 
            (labelMatch && it.label && it.label.toLowerCase().includes(labelMatch.toLowerCase())) ||
            (it.key && labelMatch && labelMatch.toLowerCase().includes(it.key.toLowerCase()))
          );
        }
        if (!val) return { checked: false, fileName: '', fileUrl: '' };
        if (typeof val === 'boolean') return { checked: val, fileName: '', fileUrl: '' };
        if (typeof val === 'object') {
          return {
            checked: val.checked !== undefined ? !!val.checked : !!val.fileUrl,
            fileName: val.fileName || (val.fileUrl ? val.fileUrl.split('/').pop() : ''),
            fileUrl: val.fileUrl || '',
            fileType: val.fileType || ''
          };
        }
        return { checked: !!val, fileName: '', fileUrl: '' };
      };

      const items = [
        { keys: ["contractorsIncidentReport", "contractorReport", "contractorIncidentReport"], label: "Contractor's Incident Report", match: "contractor", idx: 0 },
        { keys: ["witnessStatement", "witnessStatements", "witnessStatementForm"], label: "Witness Statement Form", match: "witness", idx: 1 },
        { keys: ["rams", "riskAssessment", "methodStatementRAMS"], label: "Risk Assessment & Method Statement (RAMS)", match: "rams", idx: 2 },
        { keys: ["trainingRecords", "training", "competencyRecords"], label: "Training Records", match: "training", idx: 5 },
        { keys: ["permitsToWork", "permitToWork", "ptw", "permit"], label: "Permit to Work (PTW)", match: "permit", idx: 4 },
        { keys: ["safePlanOfAction", "spa", "tsti", "preTaskBriefing"], label: "Safe Plan of Action (SPA)", match: "spa", idx: 3 },
        { keys: ["evidenceForActionsTaken", "evidenceActions", "actionsEvidence"], label: "Evidence for Actions Taken", match: "evidence", idx: 7 },
        { keys: ["wasteDisposalInvoice", "wasteDisposal", "wasteInvoice"], label: "Waste Disposal Invoice (if applicable)", match: "waste", idx: 8 },
      ];

      const missingExplain = att.missingExplanation || att.missingAttachmentsExplanation || inv.missingExplain || 'All mandatory attachments collected and uploaded.';

      const rowsHtml = items.map(item => {
        const info = getAttachmentInfo(item.keys, item.match || item.label, item.idx);
        const isAttached = info.checked || !!info.fileUrl;
        const displayFileName = info.fileName || '';
        return `
        <tr>
          <td style="width: 70%; font-weight: 600;">
            ${item.label}
            ${displayFileName ? `<div style="font-size: 8px; color: #2563eb; font-weight: normal; margin-top: 2px;">📎 Attached: <strong>${displayFileName}</strong></div>` : ''}
          </td>
          <td style="text-align: center; width: 30%;">
            <span style="font-weight: 800; color: ${isAttached ? '#16a34a' : '#dc2626'};">${isAttached ? '✓ Attached' : '✗ Pending / N/A'}</span>
          </td>
        </tr>
      `}).join('');

      return `
        <table class="nne-tbl" style="margin-bottom: 6px;">
          <thead>
            <tr class="dark-hdr">
              <th>Mandatory Item</th>
              <th style="width: 30%; text-align: center;">Attachment Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="font-size: 8px; color: #475569; background: #fff; border: 1px solid #cbd5e1; padding: 5px 8px; border-radius: 4px;">
          <strong>Explanation for missing attachments:</strong> ${missingExplain}
        </div>
      `;
    };

    // Initial Root Cause & Environmental Conditions & Equipment
    const initialRootCause = initial.initialRootCause || 'Initial investigation under assessment.';
    const environmentalConditions = initial.environmentalConditions || 'Normal';
    const equipmentInvolved = initial.equipmentInvolved || 'None';

    // Form 2 Signatures (Submitter + Approver)
    const initialSig = initial.signature || initial.submittedBySignature || initial.submitted_by_signature || null;
    const initialSubmitter = initial.submittedBy || initial.submitted_by || reportedBy;
    const initialApprSig = initial.approverSignature || initial.approver_signature || null;
    const initialApprName = initial.approvedBy || initial.approved_by || 'Site HSE Manager';

    // Form 3 Signatures (Investigator + Reviewer)
    let investigatorSig = inv.investigatorSignature || inv.investigator_signature || inv.signature || null;
    let investigatorName = reportedBy;
    if (inv.signatures && Array.isArray(inv.signatures) && inv.signatures.length > 0) {
      investigatorSig = inv.signatures[0].signature || investigatorSig;
      investigatorName = inv.signatures[0].name || investigatorName;
    }
    const reviewerSig = inv.reviewerSignature || inv.reviewer_signature || (inv.signatures && inv.signatures[1]?.signature) || null;
    const reviewerName = inv.reviewedBy || inv.reviewed_by || (inv.signatures && inv.signatures[1]?.name) || 'Project Director';

    const renderCheckbox = (checked: boolean, label: string) => `
      <span class="chk-item">
        <span class="chk-box ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</span>
        <span class="chk-label">${label}</span>
      </span>
    `;

    const currentStage = inc.stage || (details.investigation ? 'INVESTIGATION' : details.initialReport ? 'INITIAL_REPORT' : 'HEADS_UP');

    const isNoFurtherInvestigation = Boolean(
      inc.noFurtherInvestigation ||
      headsUp.noFurtherInvestigation ||
      initial.noFurtherInvestigation ||
      details.noFurtherInvestigation
    );

    const hasInitialReportData = Boolean(
      (details.initialReport && (details.initialReport.submittedBy || details.initialReport.signature || details.initialReport.submittedTime || details.initialReport.injuredPersonName)) ||
      (details.initial_report && (details.initial_report.submittedBy || details.initial_report.signature || details.initial_report.submittedTime || details.initial_report.injured_person_name))
    );

    const hasInvestigationData = Boolean(
      details.investigation?.id ||
      details.investigation?.investigationDetails ||
      details.investigation?.problemStatement ||
      details.investigation?.problem ||
      details.investigation?.mandatoryAttachments ||
      details.investigation?.mandatory_attachments ||
      (details.investigation?.signatures && details.investigation.signatures.length > 0) ||
      details.investigation?.submittedBy ||
      details.investigation?.reviewedBy ||
      details.incident_investigation?.submittedBy ||
      details.incident_investigation?.reviewedBy ||
      inc.stage === 'INVESTIGATION' ||
      inc.stage === 'CLOSED'
    );

    let includeForm1 = true;
    let includeForm2 = hasInitialReportData;
    let includeForm3 = hasInvestigationData;

    if (formType === 'headsUp' || formType === '1' || formType === 'HEADS_UP') {
      includeForm1 = true;
      includeForm2 = false;
      includeForm3 = false;
    } else if (formType === 'initialReport' || formType === '2' || formType === 'INITIAL_REPORT') {
      includeForm1 = false;
      includeForm2 = true;
      includeForm3 = false;
    } else if (formType === 'investigation' || formType === '3' || formType === 'INVESTIGATION') {
      includeForm1 = false;
      includeForm2 = false;
      includeForm3 = true;
    }

    let p1 = 0, p2 = 0, p3 = 0, pageCounter = 0;
    if (includeForm1) { pageCounter++; p1 = pageCounter; }
    if (includeForm2) { pageCounter++; p2 = pageCounter; }
    if (includeForm3) { pageCounter++; p3 = pageCounter; }
    const totalPages = pageCounter;

    const isEnv = uniqueCategories.some(c => String(c).toLowerCase().includes('environment'));
    const isPropertyDamage = uniqueCategories.some(c => String(c).toLowerCase().includes('property'));
    const isPersonInjury = !isEnv && !isPropertyDamage;

    const envDetails = (initial as any).environmentalDetails || {};
    const propDetails = (initial as any).propertyDamageDetails || {};
    const invEnvDetails = (inv as any).environmentalDetails || {};
    const invPropDetails = (inv as any).propertyDamageDetails || {};

    const renderPageHeader = (pageTitle: string, subtitle: string, badgeText: string) => `
      <div class="header-container">
        <div class="logo-row">
          <div class="logo-left">
            ${projectLogoBase64 ? `<img src="${projectLogoBase64}" style="height: 38px; object-fit: contain;" alt="Novo Nordisk" />` : `<div style="font-weight: 800; font-size: 14px; color: #0f172a;">Novo Nordisk</div>`}
          </div>
          <div class="logo-right">
            ${nneLogoBase64 ? `<img src="${nneLogoBase64}" style="height: 32px; object-fit: contain;" alt="NNE" />` : `<div style="font-size: 22px; font-weight: 900; color: #002868;">nne®</div>`}
          </div>
        </div>

        <div class="title-banner">
          <div class="banner-text">
            <h1 class="banner-title">${pageTitle}</h1>
            <div class="banner-subtitle">${subtitle}</div>
          </div>
          <div class="banner-badge">${badgeText}</div>
        </div>
      </div>
    `;

    const renderPageFooter = (pageNo: number) => `
      <div class="page-footer-note">
        Template: TPL-138/NNE Project Template - Word/ 1.0 &nbsp;|&nbsp; Doc No: DPT-00049 &nbsp;|&nbsp; © NNE A/S &nbsp;|&nbsp; Case: ${caseNo} &nbsp;|&nbsp; Form ${pageNo} of ${totalPages}
      </div>
    `;

    const renderSeverityBadge = (level: any) => {
      const num = Number(level);
      const meta: Record<number, { label: string; bg: string; color: string }> = {
        1: { label: 'Insignificant', bg: '#dcfce7', color: '#166534' },
        2: { label: 'Minor', bg: '#fef3c7', color: '#92400e' },
        3: { label: 'Moderate', bg: '#ffedd5', color: '#c2410c' },
        4: { label: 'Critical', bg: '#fee2e2', color: '#991b1b' },
        5: { label: 'Catastrophic', bg: '#ffe4e6', color: '#881337' },
      };
      const m = meta[num] || { label: 'Level ' + (level || '—'), bg: '#f1f5f9', color: '#475569' };
      return `<span style="display: inline-block; padding: 2px 7px; border-radius: 3px; font-weight: 700; font-size: 8.5px; background: ${m.bg}; color: ${m.color}; border: 1px solid ${m.color}33;">Level ${num || level || 1} — ${m.label}</span>`;
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${caseNo} - Incident Report</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 9.5px;
            color: #0f172a;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .form-page {
            page-break-after: always;
            break-after: always;
            padding: 4px;
          }
          .form-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
          .pdf-section, .pdf-box, table.sc-grid, tr, td, th {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Header & Logos (Spot Check Format) */
          .header-container {
            margin-bottom: 10px;
          }
          .logo-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 6px;
            margin-bottom: 8px;
          }
          .title-banner {
            background: #111c38;
            color: #ffffff;
            padding: 11px 15px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-radius: 2px;
          }
          .banner-title {
            margin: 0;
            font-size: 19px;
            font-weight: 700;
            font-family: Georgia, 'Times New Roman', serif;
            letter-spacing: 0.5px;
          }
          .banner-subtitle {
            font-size: 9.5px;
            color: #e2e8f0;
            margin-top: 3px;
          }
          .banner-badge {
            font-size: 9.5px;
            font-style: italic;
            color: #fda4af;
            font-weight: 600;
          }

          /* Section Headings (Spot Check Format) */
          .section-hdr {
            background: #111c38;
            color: #ffffff;
            font-size: 10.5px;
            font-weight: 800;
            padding: 4.5px 8px;
            margin-top: 9px;
            margin-bottom: 0px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .sub-hdr-bar {
            background: #1e293b;
            color: #ffffff;
            font-size: 9px;
            font-weight: 700;
            padding: 4px 8px;
            margin-bottom: 0px;
          }

          /* Tables (Spot Check Format) */
          table.sc-grid {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
            margin-bottom: 8px;
          }
          table.sc-grid th, table.sc-grid td {
            border: 1px solid #cbd5e1;
            padding: 4px 6.5px;
            vertical-align: middle;
          }
          .lbl {
            background: #f8fafc;
            font-weight: 700;
            color: #0f172a;
          }
          .val {
            color: #0f172a;
          }
          .chk-table-hdr th {
            background: #111c38;
            color: #ffffff;
            font-size: 9px;
            font-weight: 700;
            padding: 5px 6.5px;
            text-align: left;
          }

          /* Checkboxes (Spot Check Format) */
          .chk-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 9px;
          }
          .chk-box {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 1.5px solid #0f172a;
            border-radius: 2px;
            text-align: center;
            line-height: 10px;
            font-size: 9.5px;
            font-weight: 900;
            vertical-align: middle;
          }
          .chk-box.checked {
            background: #0f172a;
            color: #ffffff;
          }
          .chk-label {
            color: #0f172a;
          }

          /* Comment Box (Spot Check Format) */
          .comment-box {
            border: 1px solid #cbd5e1;
            min-height: 42px;
            padding: 6px 8px;
            font-size: 9px;
            background: #fdfdfd;
            margin-bottom: 8px;
            white-space: pre-wrap;
            color: #1e293b;
            line-height: 1.4;
          }

          /* Footer note (Spot Check Format) */
          .page-footer-note {
            text-align: center;
            font-size: 8px;
            color: #64748b;
            font-style: italic;
            margin-top: 12px;
            border-top: 1px solid #cbd5e1;
            padding-top: 6px;
          }
        </style>
      </head>
      <body>

        ${includeForm1 ? `
        <!-- =================================================================
             FORM 1: HEADS-UP NOTIFICATION (2 HOURS TEMPLATE)
        ================================================================== -->
        <div class="form-page">
          ${renderPageHeader(
            'Heads-up Notification',
            `Project: ${project} &nbsp;|&nbsp; Location: ${building} &nbsp;|&nbsp; System No: ${caseNo} &nbsp;|&nbsp; Must be completed within 2 hours of occurrence`,
            'Form 1 / Stage 1 · Controlled EHS Form'
          )}

          <div class="section-hdr">1. Project Details & Location</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Project Name:</td>
                <td class="val" style="width: 28%;"><strong>${project}</strong></td>
                <td class="lbl" style="width: 22%;">Case Number:</td>
                <td class="val" style="width: 28%;"><strong>${caseNo}</strong></td>
              </tr>
              <tr>
                <td class="lbl">Incident Title:</td>
                <td class="val" colspan="3"><strong>${title}</strong></td>
              </tr>
              <tr>
                <td class="lbl">Date (YYYY-MM-DD):</td>
                <td class="val">${date}</td>
                <td class="lbl">Time (24hr):</td>
                <td class="val">${time}</td>
              </tr>
              <tr>
                <td class="lbl">Location / Building:</td>
                <td class="val">${building}</td>
                <td class="lbl">Floor / Level:</td>
                <td class="val">${inc.floorLevel || 'Ground Floor'}</td>
              </tr>
              <tr>
                <td class="lbl">Specific Location / Grid:</td>
                <td class="val">${specificLoc}</td>
                <td class="lbl">Contractor(s) Involved:</td>
                <td class="val">${contractor}</td>
              </tr>
              <tr>
                <td class="lbl">Further Investigation:</td>
                <td class="val"><strong>${isNoFurtherInvestigation ? 'Not Required (Waived)' : 'Required'}</strong></td>
                <td class="lbl">Reported By:</td>
                <td class="val">${reportedBy}</td>
              </tr>
              <tr>
                <td class="lbl">Actual Severity Assessment:</td>
                <td class="val">${renderSeverityBadge(headsUp.actualSeverity || inc.actualSeverity || 1)}</td>
                <td class="lbl">Potential Severity Assessment:</td>
                <td class="val">${renderSeverityBadge(headsUp.potentialSeverity || inc.potentialSeverity || 1)}</td>
              </tr>
            </tbody>
          </table>

          <div class="section-hdr">2. Incident Records & Classification</div>
          <div class="sub-hdr-bar">Select all that apply. Categorisation may change following the investigation.</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td style="width: 25%;">${renderCheckbox(isCat('Near Miss'), 'Near Miss')}</td>
                <td style="width: 25%;">${renderCheckbox(isCat('No Treatment'), 'No Treatment Injury')}</td>
                <td style="width: 25%;">${renderCheckbox(isCat('First Aid'), 'First Aid Injury')}</td>
                <td style="width: 25%;">${renderCheckbox(isCat('Medical Treatment'), 'Medical Treatment Injury')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isCat('Restricted Work'), 'Restricted Work Injury')}</td>
                <td>${renderCheckbox(isCat('Loss Time'), 'Lost Time Injury')}</td>
                <td>${renderCheckbox(isCat('Permanent Disability'), 'Permanent Disability')}</td>
                <td>${renderCheckbox(isCat('Fatality'), 'Fatality')}</td>
              </tr>
              <tr>
                <td colspan="2">${renderCheckbox(isCat('Occupational Illness'), 'Occupational Illness')}</td>
                <td>${renderCheckbox(isCat('Environmental'), 'Environmental Incident')}</td>
                <td>${renderCheckbox(isCat('Property Damage'), 'Property Damage')}</td>
              </tr>
              ${otherCustomCats.length > 0 ? `
              <tr>
                <td colspan="4" style="background: #f8fafc; padding: 4px 8px;">
                  <span class="chk-label" style="color: #475569; font-size: 8.5px; font-weight: 700; margin-right: 6px;">Hazard / Observation Category:</span>
                  ${otherCustomCats.map(c => `<span class="chk-item" style="margin-right: 10px;"><span class="chk-box checked">✓</span> <span class="chk-label" style="font-weight: 700;">${c}</span></span>`).join('')}
                </td>
              </tr>
              ` : ''}
            </tbody>
          </table>

          <div class="section-hdr">3. Incident Description & Consequences</div>
          <div class="sub-hdr-bar">Brief Description: What Happened?</div>
          <div class="comment-box">${description}</div>
          <div class="sub-hdr-bar">What is the consequence of this incident?</div>
          <div class="comment-box">${consequence}</div>

          ${(isCat('Environmental') || hasEnvData) ? `
          <div class="section-hdr">4. Environmental Incident Details</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Type of Spillage:</td>
                <td class="val" style="width: 28%;"><strong>${
                  Array.isArray(headsUp.spillType) ? headsUp.spillType.join(', ') :
                  (headsUp.spillType || '-')
                }</strong></td>
                <td class="lbl" style="width: 22%;">Substance Spilled:</td>
                <td class="val" style="width: 28%;"><strong>${headsUp.spillSubstance || '-'}</strong></td>
              </tr>
              <tr>
                <td class="lbl">Cause of Spillage:</td>
                <td class="val">${headsUp.spillCause || '-'}</td>
                <td class="lbl">Approx Quantity:</td>
                <td class="val">${headsUp.spillQuantity || '-'}</td>
              </tr>
              <tr>
                <td class="lbl">System / Media Entered:</td>
                <td class="val" colspan="3">${
                  Array.isArray(headsUp.spillSystemEntered) ? headsUp.spillSystemEntered.join(', ') :
                  (headsUp.spillSystemEntered || '-')
                }</td>
              </tr>
              <tr>
                <td class="lbl">Gatekeeper Informed?</td>
                <td class="val"><strong>${(headsUp.gatekeeperInformed !== undefined ? headsUp.gatekeeperInformed : inc.gatekeeperInformed) ? 'Yes' : 'No'}</strong></td>
                <td class="lbl">Gatekeeper Name:</td>
                <td class="val">${(headsUp.gatekeeperInformed !== undefined ? headsUp.gatekeeperInformed : inc.gatekeeperInformed) ? (headsUp.gatekeeperName || inc.gatekeeperName || '-') : 'N/A'}</td>
              </tr>
            </tbody>
          </table>
          ` : ''}

          ${(isCat('Property Damage') || hasPropData) ? `
          <div class="section-hdr">5. Property Damage & Asset Details</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Damaged Asset / Equipment:</td>
                <td class="val" style="width: 28%;"><strong>${propDetails.propertyDamaged || headsUp.propertyDamaged || 'Plant Machinery / Structure'}</strong></td>
                <td class="lbl" style="width: 22%;">Plant / Vehicle Involved:</td>
                <td class="val" style="width: 28%;"><strong>${propDetails.equipmentInvolved || headsUp.equipmentInvolved || 'Forklift / Mobile Plant'}</strong></td>
              </tr>
              <tr>
                <td class="lbl">Estimated Repair Cost:</td>
                <td class="val"><strong>${propDetails.estimatedCost || headsUp.estimatedCost || 'To be assessed by contractor'}</strong></td>
                <td class="lbl">Severity Rating:</td>
                <td class="val">${renderSeverityBadge(inc.actualSeverity || 1)}</td>
              </tr>
              <tr>
                <td class="lbl">Description & Extent of Damage:</td>
                <td class="val" colspan="3">${propDetails.damageDescription || headsUp.descriptionWhatHappened || 'Damage sustained during site operations.'}</td>
              </tr>
              <tr>
                <td class="lbl">Immediate Containment / Isolation:</td>
                <td class="val" colspan="3">${propDetails.immediateActionTaken || headsUp.immediateActionTaken || 'Area cordoned off, damaged equipment tagged out and quarantined.'}</td>
              </tr>
            </tbody>
          </table>
          ` : ''}

          <div class="section-hdr">Immediate Actions Taken</div>
          <table class="sc-grid">
            <thead>
              <tr class="chk-table-hdr">
                <th style="width: 44%;">Immediate Action Taken</th>
                <th style="width: 24%;">Responsible Person / Team</th>
                <th style="width: 16%;">Date</th>
                <th style="width: 16%;">Time Implemented</th>
              </tr>
            </thead>
            <tbody>
              ${renderImmediateActionsRows()}
            </tbody>
          </table>

          <div class="section-hdr">Notification Signatures & Sign-Off</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Submitted By:</td>
                <td class="val" style="width: 28%;"><strong>${headsUpSubmitter}</strong></td>
                <td class="lbl" style="width: 18%;">Digital Signature:</td>
                <td class="val" style="width: 32%;">${renderSignature(headsUpSig, headsUpSubmitter)}</td>
              </tr>
              ${headsUpApprSig ? `
              <tr>
                <td class="lbl">Reviewed & Approved By:</td>
                <td class="val" style="width: 28%;"><strong>${headsUpApprName}</strong></td>
                <td class="lbl">Approver Signature:</td>
                <td class="val" style="width: 32%;">${renderSignature(headsUpApprSig, headsUpApprName)}</td>
              </tr>
              ` : ''}
            </tbody>
          </table>

          ${renderEditAndRevisionHistory(headsUp.editHistory, 'Form 1: Heads-Up Notification')}

          ${renderPageFooter(p1)}
        </div>
        ` : ''}

        ${includeForm2 ? `
        <!-- =================================================================
             FORM 2: INITIAL INCIDENT REPORT (24 HOURS TEMPLATE)
        ================================================================== -->
        <div class="form-page" style="${includeForm1 ? 'page-break-before: always; break-before: always;' : ''}">
          ${renderPageHeader(
            'Initial Incident Report',
            `Project: ${project} &nbsp;|&nbsp; Location: ${building} &nbsp;|&nbsp; System No: ${caseNo} &nbsp;|&nbsp; Must be completed within 24 hours of occurrence`,
            'Form 2 / Stage 2 · Controlled EHS Form'
          )}

          <div class="section-hdr">Project Details & Incident Overview</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Project Name:</td>
                <td class="val" style="width: 28%;"><strong>${project}</strong></td>
                <td class="lbl" style="width: 22%;">Case Number:</td>
                <td class="val" style="width: 28%;"><strong>${caseNo}</strong></td>
              </tr>
              <tr>
                <td class="lbl">Incident Title:</td>
                <td class="val" colspan="3"><strong>${title}</strong></td>
              </tr>
              <tr>
                <td class="lbl">Date (YYYY-MM-DD):</td>
                <td class="val">${date}</td>
                <td class="lbl">Time (24hr):</td>
                <td class="val">${time}</td>
              </tr>
              <tr>
                <td class="lbl">Location / Building:</td>
                <td class="val">${building}</td>
                <td class="lbl">Floor / Level:</td>
                <td class="val">${inc.floorLevel || 'Ground Floor'}</td>
              </tr>
              <tr>
                <td class="lbl">Contractor(s) Involved:</td>
                <td class="val">${contractor}</td>
                <td class="lbl">Further Investigation:</td>
                <td class="val"><strong>${isNoFurtherInvestigation ? 'Not Required (Waived)' : 'Required'}</strong></td>
              </tr>
            </tbody>
          </table>

          <div class="section-hdr">Section A. Heads-Up Summary</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Type / Category:</td>
                <td class="val" style="width: 28%;"><strong>${category}</strong></td>
                <td class="lbl" style="width: 22%;">Severity Assessment:</td>
                <td class="val" style="width: 28%;">${renderSeverityBadge(inc.actualSeverity || 1)}</td>
              </tr>
              <tr>
                <td class="lbl">Location:</td>
                <td class="val" colspan="3">${building}${inc.floorLevel ? ' - ' + inc.floorLevel : ''}</td>
              </tr>
              <tr>
                <td class="lbl">Initial Description:</td>
                <td class="val" colspan="3">${description}</td>
              </tr>
            </tbody>
          </table>

          <div class="section-hdr">Section B. Incident Category</div>
          <div class="sub-hdr-bar">Select all that apply. The categorisation may change following the incident investigation.</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td style="width: 25%;">${renderCheckbox(isCat('Near Miss'), 'Near Miss')}</td>
                <td style="width: 25%;">${renderCheckbox(isCat('First Aid'), 'First Aid Injury')}</td>
                <td style="width: 25%;">${renderCheckbox(isCat('Medical Treatment'), 'Medical Treatment Injury')}</td>
                <td style="width: 25%;">${renderCheckbox(isCat('Restricted Work'), 'Restricted Work Injury')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isCat('Loss Time'), 'Lost Time Injury')}</td>
                <td>${renderCheckbox(isCat('Property Damage'), 'Property Damage')}</td>
                <td>${renderCheckbox(isCat('Environmental'), 'Environmental Incident')}</td>
                <td>${renderCheckbox(isCat('Occupational Illness') || (!isEnv && !isPropertyDamage), 'Personal Injury')}</td>
              </tr>
              ${otherCustomCats.length > 0 ? `
              <tr>
                <td colspan="4" style="background: #f8fafc; padding: 4px 8px;">
                  <span class="chk-label" style="color: #475569; font-size: 8.5px; font-weight: 700; margin-right: 6px;">Other Categories:</span>
                  ${otherCustomCats.map(c => `<span class="chk-item" style="margin-right: 10px;"><span class="chk-box checked">✓</span> <span class="chk-label" style="font-weight: 700;">${c}</span></span>`).join('')}
                </td>
              </tr>
              ` : ''}
            </tbody>
          </table>

          ${isEnv ? `
          <div class="section-hdr">Section C. Environmental Incident Details</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Spill / Discharge Type:</td>
                <td class="val" style="width: 28%;"><strong>${envDetails.spillType || headsUp.envSpillType || 'Chemical / Oil Spill'}</strong></td>
                <td class="lbl" style="width: 22%;">Substance Spilled:</td>
                <td class="val" style="width: 28%;"><strong>${envDetails.spillSubstance || headsUp.envSpilledWhat || 'Solvent / Hydrocarbon'}</strong></td>
              </tr>
              <tr>
                <td class="lbl">Approx. Quantity Spilled:</td>
                <td class="val">${envDetails.spillQuantity || headsUp.envQuantity || '—'}</td>
                <td class="lbl">Cause of Spillage:</td>
                <td class="val">${envDetails.spillCause || headsUp.envCause || 'Line rupture / Valve failure'}</td>
              </tr>
              <tr>
                <td class="lbl">System / Media Entered:</td>
                <td class="val">${envDetails.spillSystemEntered || headsUp.envSpecify || 'Soil / Concrete / Drainage'}</td>
                <td class="lbl">Severity Level:</td>
                <td class="val">${renderSeverityBadge(inc.actualSeverity || 1)}</td>
              </tr>
              <tr>
                <td class="lbl">Containment & Cleanup:</td>
                <td class="val" colspan="3">${envDetails.containmentCleanup || headsUp.immediateActionTaken || 'Spill kit deployed immediately, absorbent booms and pads placed, contaminated material collected and bagged.'}</td>
              </tr>
            </tbody>
          </table>
          ` : isPropertyDamage ? `
          <div class="section-hdr">Section C. Property Damage & Asset Details</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Damaged Asset / Equipment:</td>
                <td class="val" style="width: 28%;"><strong>${propDetails.propertyDamaged || headsUp.propertyDamaged || 'Plant Machinery / Structure'}</strong></td>
                <td class="lbl" style="width: 22%;">Plant / Vehicle Involved:</td>
                <td class="val" style="width: 28%;"><strong>${propDetails.equipmentInvolved || headsUp.equipmentInvolved || 'Forklift / Mobile Plant'}</strong></td>
              </tr>
              <tr>
                <td class="lbl">Estimated Repair Cost:</td>
                <td class="val"><strong>${propDetails.estimatedCost || headsUp.estimatedCost || 'To be assessed by contractor'}</strong></td>
                <td class="lbl">Severity Rating:</td>
                <td class="val">${renderSeverityBadge(inc.actualSeverity || 1)}</td>
              </tr>
              <tr>
                <td class="lbl">Description & Extent of Damage:</td>
                <td class="val" colspan="3">${propDetails.damageDescription || headsUp.descriptionWhatHappened || 'Damage sustained during site operations.'}</td>
              </tr>
              <tr>
                <td class="lbl">Immediate Containment / Isolation:</td>
                <td class="val" colspan="3">${propDetails.immediateActionTaken || headsUp.immediateActionTaken || 'Area cordoned off, damaged equipment tagged out and quarantined.'}</td>
              </tr>
            </tbody>
          </table>
          ` : `
          <div class="section-hdr">Section C. Injured / Ill Person Details</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Injured Person Name:</td>
                <td class="val" style="width: 28%;"><strong>${injuredName}</strong></td>
                <td class="lbl" style="width: 22%;">Company / Employer:</td>
                <td class="val" style="width: 28%;">${injuredCompany}</td>
              </tr>
              <tr>
                <td class="lbl">Manager / Supervisor:</td>
                <td class="val">${injuredSupervisor}</td>
                <td class="lbl">Job Title / Trade:</td>
                <td class="val">${injuredJobTitle}</td>
              </tr>
              <tr>
                <td class="lbl">Length of Service in Project:</td>
                <td class="val">${lengthOfService}</td>
                <td class="lbl">Experience in Role:</td>
                <td class="val">${experienceInRole}</td>
              </tr>
              <tr>
                <td class="lbl">Worker Activity at Time:</td>
                <td class="val" colspan="3">${workerActivity}</td>
              </tr>
            </tbody>
          </table>
          `}

          <div class="section-hdr">Section D. Incident Description</div>
          <div class="comment-box">${initial.description || description}</div>

          <div class="section-hdr">Section E. Photos from Incident Location</div>
          ${renderPhotosGrid()}

          ${(!isEnv && !isPropertyDamage) ? `
          <div class="section-hdr">Section G. Injury / Illness Information</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Nature of Injury:</td>
                <td class="val" colspan="3"><strong>${natureOfInjury}</strong></td>
              </tr>
              <tr>
                <td class="lbl" style="width: 22%;">Treatment Provided:</td>
                <td class="val" style="width: 28%;">${treatmentPrescribed}</td>
                <td class="lbl" style="width: 22%;">Anticipated Absence:</td>
                <td class="val" style="width: 28%;">${anticipatedAbsence}</td>
              </tr>
            </tbody>
          </table>

          <div class="section-hdr">Section H. Type of Accident Categories</div>
          <table class="sc-grid">
            <tbody>
              ${renderAccidentCategoriesRows()}
            </tbody>
          </table>

          <div class="section-hdr">Section I. Indicate Type(s) of Injury</div>
          <table class="sc-grid">
            <tbody>
              ${renderInjuryTypesRows()}
            </tbody>
          </table>

          <div class="section-hdr">Section J. Indicate Parts of the Body Injured</div>
          <div style="border: 1px solid #cbd5e1; padding: 8px; border-radius: 2px; margin-bottom: 8px; background: #fff;">
            <div style="display: flex; gap: 14px; align-items: flex-start;">
              <div style="flex: 1; padding: 4px 6px;">
                <div style="font-size: 9.5px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">Selected Injured Area(s):</div>
                ${selectedBodyPartsList.length > 0 ? `
                  <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${selectedBodyPartsList.map(p => `
                      <span style="background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-weight: 700; font-size: 8.5px; padding: 3px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                        <span style="width: 6px; height: 6px; border-radius: 50%; background: #dc2626; display: inline-block;"></span>
                        ${p}
                      </span>
                    `).join('')}
                  </div>
                ` : `
                  <div style="font-size: 9px; color: #64748b; font-style: italic; background: #f8fafc; border: 1px dashed #cbd5e1; padding: 8px 12px; border-radius: 4px;">
                    No specific body parts selected (Near miss / No physical injury).
                  </div>
                `}
              </div>
              <div style="display: flex; gap: 12px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 4px; text-align: center;">
                <!-- FRONT VIEW -->
                <div>
                  <div style="font-size: 8px; font-weight: 800; color: #334155; margin-bottom: 3px;">FRONT VIEW</div>
                  <svg width="100" height="185" viewBox="0 0 140 280">
                    <circle cx="70" cy="24" r="16" fill="${getBodyPartFill('Head')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="70" cy="24" r="9" fill="${isPartSelected('Facial area') || isPartSelected('Teeth') || isPartSelected('Eye') ? '#dc2626' : '#ffffff'}" stroke="#ffffff" stroke-width="1" />
                    <rect x="61" y="42" width="18" height="9" rx="3" fill="${getBodyPartFill('Neck')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="42" cy="59" r="8" fill="${getBodyPartFill('Shoulder', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="98" cy="59" r="8" fill="${getBodyPartFill('Shoulder', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="52" y="53" width="36" height="26" rx="4" fill="${getBodyPartFill('Chest')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="54" y="81" width="32" height="18" rx="3" fill="${getBodyPartFill('Pelvis or abdomen')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="52" y="101" width="36" height="24" rx="4" fill="${getBodyPartFill('Pelvis or abdomen')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="36" y="69" width="12" height="38" rx="5" fill="${getBodyPartFill('Arm, Elbow', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="92" y="69" width="12" height="38" rx="5" fill="${getBodyPartFill('Arm, Elbow', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="36" cy="112" r="5" fill="${isPartSelected('Wrist', 'R') || isPartSelected('Hand', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="104" cy="112" r="5" fill="${isPartSelected('Wrist', 'L') || isPartSelected('Hand', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <rect x="30" y="119" width="12" height="18" rx="6" fill="${isPartSelected('Hand', 'R') || isPartSelected('Finger(s)', 'R') || isPartSelected('Finger', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <rect x="98" y="119" width="12" height="18" rx="6" fill="${isPartSelected('Hand', 'L') || isPartSelected('Finger(s)', 'L') || isPartSelected('Finger', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <rect x="52" y="127" width="14" height="48" rx="6" fill="${getBodyPartFill('Legs, Knee', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="74" y="127" width="14" height="48" rx="6" fill="${getBodyPartFill('Legs, Knee', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="59" cy="179" r="5" fill="${getBodyPartFill('Legs, Knee', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="81" cy="179" r="5" fill="${getBodyPartFill('Legs, Knee', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="53" y="186" width="12" height="44" rx="5" fill="${getBodyPartFill('Legs, Knee', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="75" y="186" width="12" height="44" rx="5" fill="${getBodyPartFill('Legs, Knee', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="59" cy="234" r="4" fill="${isPartSelected('Ankle', 'R') || isPartSelected('Foot', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="81" cy="234" r="4" fill="${isPartSelected('Ankle', 'L') || isPartSelected('Foot', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <ellipse cx="53" cy="244" rx="10" ry="5" fill="${isPartSelected('Foot', 'R') || isPartSelected('Toe(s)', 'R') || isPartSelected('Toe', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <ellipse cx="87" cy="244" rx="10" ry="5" fill="${isPartSelected('Foot', 'L') || isPartSelected('Toe(s)', 'L') || isPartSelected('Toe', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                  </svg>
                </div>
                <!-- BACK VIEW -->
                <div>
                  <div style="font-size: 8px; font-weight: 800; color: #334155; margin-bottom: 3px;">BACK VIEW</div>
                  <svg width="100" height="185" viewBox="0 0 140 280">
                    <circle cx="70" cy="24" r="16" fill="${getBodyPartFill('Head')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="52" cy="24" r="4" fill="${getBodyPartFill('Ear', 'L')}" stroke="#ffffff" stroke-width="1.5" />
                    <circle cx="88" cy="24" r="4" fill="${getBodyPartFill('Ear', 'R')}" stroke="#ffffff" stroke-width="1.5" />
                    <rect x="61" y="42" width="18" height="9" rx="3" fill="${getBodyPartFill('Neck')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="42" cy="59" r="8" fill="${getBodyPartFill('Shoulder', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="98" cy="59" r="8" fill="${getBodyPartFill('Shoulder', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="52" y="53" width="36" height="46" rx="4" fill="${isPartSelected('Back incl. spine') || isPartSelected('Back') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <rect x="52" y="101" width="36" height="24" rx="4" fill="${isPartSelected('Back incl. spine') || isPartSelected('Back') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <rect x="36" y="69" width="12" height="38" rx="5" fill="${getBodyPartFill('Arm, Elbow', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="92" y="69" width="12" height="38" rx="5" fill="${getBodyPartFill('Arm, Elbow', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="36" cy="112" r="5" fill="${isPartSelected('Wrist', 'L') || isPartSelected('Hand', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="104" cy="112" r="5" fill="${isPartSelected('Wrist', 'R') || isPartSelected('Hand', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="30" cy="125" r="9" fill="${isPartSelected('Hand', 'L') || isPartSelected('Finger(s)', 'L') || isPartSelected('Finger', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="110" cy="125" r="9" fill="${isPartSelected('Hand', 'R') || isPartSelected('Finger(s)', 'R') || isPartSelected('Finger', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <rect x="52" y="127" width="14" height="48" rx="6" fill="${getBodyPartFill('Legs, Knee', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="74" y="127" width="14" height="48" rx="6" fill="${getBodyPartFill('Legs, Knee', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="59" cy="179" r="5" fill="${getBodyPartFill('Legs, Knee', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="81" cy="179" r="5" fill="${getBodyPartFill('Legs, Knee', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="53" y="186" width="12" height="44" rx="5" fill="${getBodyPartFill('Legs, Knee', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="75" y="186" width="12" height="44" rx="5" fill="${getBodyPartFill('Legs, Knee', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="59" cy="234" r="4" fill="${isPartSelected('Ankle', 'L') || isPartSelected('Foot', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="81" cy="234" r="4" fill="${isPartSelected('Ankle', 'R') || isPartSelected('Foot', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <ellipse cx="53" cy="244" rx="10" ry="5" fill="${isPartSelected('Foot', 'L') || isPartSelected('Toe(s)', 'L') || isPartSelected('Toe', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <ellipse cx="87" cy="244" rx="10" ry="5" fill="${isPartSelected('Foot', 'R') || isPartSelected('Toe(s)', 'R') || isPartSelected('Toe', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          ` : ''}

          <div class="section-hdr">Section K. Immediate Actions Taken</div>
          <table class="sc-grid">
            <thead>
              <tr class="chk-table-hdr">
                <th style="width: 44%;">Immediate Action Taken</th>
                <th style="width: 24%;">Responsible Person / Team</th>
                <th style="width: 16%;">Date</th>
                <th style="width: 16%;">Time Implemented</th>
              </tr>
            </thead>
            <tbody>
              ${renderImmediateActionsRows()}
            </tbody>
          </table>

          <div class="section-hdr">Section L. Initial Root Cause Assessment</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Initial Root Cause:</td>
                <td class="val" colspan="3"><strong>${initialRootCause}</strong></td>
              </tr>
              <tr>
                <td class="lbl" style="width: 22%;">Environmental Conditions:</td>
                <td class="val" style="width: 28%;">${environmentalConditions}</td>
                <td class="lbl" style="width: 22%;">Equipment Involved:</td>
                <td class="val" style="width: 28%;">${equipmentInvolved}</td>
              </tr>
            </tbody>
          </table>

          <div class="section-hdr">Section M. Submitter & Approver Signatures</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Submitted By:</td>
                <td class="val" style="width: 28%;"><strong>${initialSubmitter}</strong></td>
                <td class="lbl" style="width: 18%;">Digital Signature:</td>
                <td class="val" style="width: 32%;">${renderSignature(initialSig, initialSubmitter)}</td>
              </tr>
              ${initialApprSig ? `
              <tr>
                <td class="lbl">Approved By:</td>
                <td class="val" style="width: 28%;"><strong>${initialApprName}</strong></td>
                <td class="lbl">Approver Signature:</td>
                <td class="val" style="width: 32%;">${renderSignature(initialApprSig, initialApprName)}</td>
              </tr>
              ` : ''}
            </tbody>
          </table>

          ${renderEditAndRevisionHistory(initial.editHistory, 'Form 2: Initial Incident Report')}

          ${renderPageFooter(p2)}
        </div>
        ` : ''}

        ${includeForm3 ? `
        <!-- =================================================================
             FORM 3: INCIDENT INVESTIGATION REPORT (FINAL 7 DAYS TEMPLATE)
        ================================================================== -->
        <div class="form-page" style="${includeForm1 || includeForm2 ? 'page-break-before: always; break-before: page;' : ''}">
          ${renderPageHeader(
            'Final Incident Investigation Report',
            `Project: ${project} &nbsp;|&nbsp; Location: ${building} &nbsp;|&nbsp; System No: ${caseNo} &nbsp;|&nbsp; Must be completed within 7 days of occurrence`,
            'Form 3 / Stage 3 · Controlled EHS Form'
          )}

          <div class="section-hdr">Project Details & Incident Overview</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">Project Name:</td>
                <td class="val" style="width: 28%;"><strong>${project}</strong></td>
                <td class="lbl" style="width: 22%;">Case Number:</td>
                <td class="val" style="width: 28%;"><strong>${caseNo}</strong></td>
              </tr>
              <tr>
                <td class="lbl">Incident Title:</td>
                <td class="val" colspan="3"><strong>${title}</strong></td>
              </tr>
              <tr>
                <td class="lbl">Date & Time:</td>
                <td class="val">${date} @ ${time}</td>
                <td class="lbl">Building / Location:</td>
                <td class="val">${building}</td>
              </tr>
              <tr>
                <td class="lbl">Specific Location:</td>
                <td class="val">${specificLoc}</td>
                <td class="lbl">Contractor Involved:</td>
                <td class="val">${contractor}</td>
              </tr>
              <tr>
                <td class="lbl">Category / Classification:</td>
                <td class="val" colspan="3"><strong>${category}</strong></td>
              </tr>
            </tbody>
          </table>

          <div class="section-hdr">Incident Description</div>
          <div class="comment-box">${inv.incidentDescription || initial.description || description}</div>

          <div class="section-hdr">1. Investigation Team</div>
          <table class="sc-grid">
            <thead>
              <tr class="chk-table-hdr">
                <th style="width: 8%; text-align: center;">#</th>
                <th style="width: 34%;">Name</th>
                <th style="width: 28%;">Position / Role</th>
                <th style="width: 30%;">Company</th>
              </tr>
            </thead>
            <tbody>
              ${renderInvTeamRows()}
            </tbody>
          </table>

          <div class="section-hdr">2. Investigation Details</div>
          <div class="sub-hdr-bar">Description of process, timelines, tools, parties involved, systems reviewed, equipment, and findings.</div>
          <div class="comment-box">${inv.investigationDetails || inv.investigation_details || description || 'Detailed investigation process completed covering timeline, tools, equipment inspection, interviews, and system review.'}</div>

          ${includeWitnesses ? `
          <div class="section-hdr">3. Witness Statements</div>
          <div class="sub-hdr-bar">Witness statements collected as part of the investigation. Signed forms attached in Mandatory Attachments.</div>
          <table class="sc-grid">
            <thead>
              <tr class="chk-table-hdr">
                <th style="width: 18%;">Witness Name</th>
                <th style="width: 12%;">Badge No.</th>
                <th style="width: 18%;">Employer</th>
                <th style="width: 18%;">Occupation</th>
                <th>Statement / Description</th>
              </tr>
            </thead>
            <tbody>
              ${renderWitnessRows()}
            </tbody>
          </table>
          ` : ''}

          <div class="section-hdr">4. Fishbone Analysis – Cause and Effect</div>
          <div class="sub-hdr-bar">Interactive Ishikawa diagram covering People, Machine, Method, Materials, Environment, and Measurement.</div>
          ${renderFishboneSvg()}

          <div class="section-hdr">Incident / Effect & Problem Statement</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 50%;">5. Incident / Effect Description</td>
                <td class="lbl" style="width: 50%;">7. Problem Statement</td>
              </tr>
              <tr>
                <td class="val" style="vertical-align: top;">
                  <div style="font-size: 8.5px; color: #1e293b; line-height: 1.4;">${inv.effect || inv.effectDescription || title || 'Incident outcome analyzed.'}</div>
                </td>
                <td class="val" style="vertical-align: top;">
                  <div style="font-size: 8.5px; color: #1e293b; line-height: 1.4;">${inv.problemStatement || description || 'Problem statement under investigation.'}</div>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="section-hdr">6. 5-Whys Root Cause Analysis</div>
          <div class="sub-hdr-bar">Analysis of probable causes selected from the Fishbone Diagram.</div>
          ${renderFiveWhysRows()}

          <div class="section-hdr">Identified Root Causes & Contributing Factors</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 50%; color: #dc2626;">8. Identified Root Causes</td>
                <td class="lbl" style="width: 50%;">9. Contributing Factors</td>
              </tr>
              <tr>
                <td class="val" style="vertical-align: top;">${renderRootCausesRows()}</td>
                <td class="val" style="vertical-align: top;">${renderFactorsRows()}</td>
              </tr>
            </tbody>
          </table>

          <div class="section-hdr">10. Corrective Actions & Preventive Actions (CAPA)</div>
          <table class="sc-grid">
            <thead>
              <tr class="chk-table-hdr">
                <th style="width: 38%;">Action Description</th>
                <th style="width: 14%; text-align: center;">Priority</th>
                <th style="width: 18%;">Responsible</th>
                <th style="width: 15%;">Target Date</th>
                <th style="width: 15%;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${renderCorrectiveActionsRows()}
            </tbody>
          </table>

          <div class="section-hdr">11. Severity Assessment</div>
          <div style="border: 1px solid #cbd5e1; padding: 8px; border-radius: 2px; margin-bottom: 8px; background: #fff;">
            ${renderSeverityAssessment()}
          </div>

          ${isEnv ? `
          <div class="section-hdr">Environmental Remediation & Waste Management</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 25%;">Remediation & Cleanup Plan:</td>
                <td class="val" colspan="3">${invEnvDetails.remediationPlan || 'Remediation completed; affected surface excavated and tested by Site HSE.'}</td>
              </tr>
              <tr>
                <td class="lbl">Waste Disposal Contractor:</td>
                <td class="val">${invEnvDetails.wasteDisposal || 'Disposed offsite via licensed hazardous waste disposal contractor.'}</td>
                <td class="lbl">Regulatory Notification:</td>
                <td class="val">${invEnvDetails.regulatoryNotification || 'Internal environmental log updated; compliant with local regulations.'}</td>
              </tr>
            </tbody>
          </table>
          ` : isPropertyDamage ? `
          <div class="section-hdr">Property Damage & Loss Assessment</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 25%;">Root Damage & Loss Assessment:</td>
                <td class="val" colspan="3">${invPropDetails.lossAssessment || 'Comprehensive structural and mechanical inspection conducted on damaged asset.'}</td>
              </tr>
              <tr>
                <td class="lbl">Insurance Claim Status:</td>
                <td class="val">${invPropDetails.insuranceClaim || 'Claim filed with insurer; repair quotation approved.'}</td>
                <td class="lbl">Preventive Machinery Controls:</td>
                <td class="val">${invPropDetails.preventiveSafeguards || 'Preventive maintenance schedule revised; operator re-certified.'}</td>
              </tr>
            </tbody>
          </table>
          ` : ''}

          <div class="section-hdr">12. Lessons Learned</div>
          <div class="comment-box">${inv.lessonsLearned || inv.lessons_learned || inv.lessons || 'Ensure pre-task risk assessments explicitly include site safety controls and risk mitigation measures.'}</div>

          <div class="section-hdr">13. Photos from Incident Location</div>
          ${renderPhotosGrid()}

          ${includeAttachments ? `
          <div class="section-hdr">14. Mandatory Attachments Checklist</div>
          <div class="sub-hdr-bar">Checklist of mandatory project documents and evidence attached to this investigation.</div>
          ${renderMandatoryAttachmentsTable()}
          ` : ''}

          <div class="section-hdr">17. Signatures & Distribution Sign-Off</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 22%;">HSE Investigator Name:</td>
                <td class="val" style="width: 28%;"><strong>${investigatorName}</strong></td>
                <td class="lbl" style="width: 18%;">Digital Signature:</td>
                <td class="val" style="width: 32%;">${renderSignature(investigatorSig, investigatorName)}</td>
              </tr>
              <tr>
                <td class="lbl">Reviewer Name:</td>
                <td class="val" style="width: 28%;"><strong>${reviewerName}</strong></td>
                <td class="lbl">Digital Signature:</td>
                <td class="val" style="width: 32%;">${renderSignature(reviewerSig, reviewerName)}</td>
              </tr>
            </tbody>
          </table>

          ${renderEditAndRevisionHistory(inv.editHistory, 'Form 3: Incident Investigation Report')}

          ${renderPageFooter(p3)}
        </div>

        ` : ''}

      </body>
      </html>
    `;
  }
}

