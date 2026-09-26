import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { SpotCheck } from '../entities/spot-check.entity';

@Injectable()
export class SpotCheckPdfService {
  private readonly logger = new Logger(SpotCheckPdfService.name);

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

  /**
   * Generates official printable PDF for a Spot Check record matching the exact form design
   * and merges all attached PDF documents at the end of the form.
   */
  async generateSpotCheckPdf(spotCheck: SpotCheck, includeAttachments: boolean = true): Promise<Buffer> {
    const html = this.buildHtml(spotCheck, includeAttachments);

    const browser = await this.launchBrowser();

    let basePdfBuffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: ['domcontentloaded', 'load'], timeout: 30000 });
      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
      });
      basePdfBuffer = Buffer.from(pdfBytes);
    } catch (err) {
      this.logger.error('Failed to generate Spot Check PDF with Puppeteer:', err);
      throw err;
    } finally {
      await browser.close();
    }

    // Merge attached PDF documents directly after the Spot Check form if includeAttachments is true
    if (includeAttachments) {
      try {
        const attachmentsList = this.parseJsonField<any[]>(spotCheck.attachments, []);
        const pdfAttachments: { fileName: string; bytes: Buffer }[] = [];

      for (const att of attachmentsList) {
        if (!att) continue;
        const fileType = String(att.fileType || '').toLowerCase();
        const fileName = String(att.fileName || '').toLowerCase();
        const previewUrl = String(att.previewUrl || att.fileUrl || att.url || '').trim();

        const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf') || previewUrl.startsWith('data:application/pdf') || previewUrl.toLowerCase().endsWith('.pdf');
        if (!isPdf) continue;

        let pdfBytes: Buffer | null = null;

        // Case 1: Base64 Data URI
        if (previewUrl.startsWith('data:application/pdf') || previewUrl.startsWith('data:;base64,') || (previewUrl.startsWith('data:') && previewUrl.includes('base64,'))) {
          try {
            const base64Content = previewUrl.split('base64,')[1];
            if (base64Content) {
              pdfBytes = Buffer.from(base64Content, 'base64');
            }
          } catch (e) {
            this.logger.warn(`Could not parse base64 PDF attachment: ${att.fileName}`, e);
          }
        }

        // Case 2: File on disk
        if (!pdfBytes && previewUrl && !previewUrl.startsWith('http://') && !previewUrl.startsWith('https://')) {
          let cleanPath = previewUrl;
          let filename = cleanPath;
          if (cleanPath.includes('/uploads/')) {
            filename = cleanPath.split('/uploads/').pop() || cleanPath;
          }

          const candidatePaths = [
            filename,
            join(process.cwd(), 'uploads', 'spot-checks', filename),
            join(process.cwd(), 'uploads', filename),
            join(process.cwd(), cleanPath),
            join(process.cwd(), cleanPath.replace(/^\/+/, '')),
          ];

          for (const p of candidatePaths) {
            if (existsSync(p) && statSync(p).isFile()) {
              try {
                pdfBytes = readFileSync(p);
                break;
              } catch (e) {
                this.logger.warn(`Failed reading PDF file at ${p}:`, e);
              }
            }
          }
        }

        // Case 3: Remote URL
        if (!pdfBytes && (previewUrl.startsWith('http://') || previewUrl.startsWith('https://'))) {
          try {
            const res = await fetch(previewUrl);
            if (res.ok) {
              const arrayBuf = await res.arrayBuffer();
              pdfBytes = Buffer.from(arrayBuf);
            }
          } catch (e) {
            this.logger.warn(`Could not fetch remote PDF attachment at ${previewUrl}:`, e);
          }
        }

        if (pdfBytes && pdfBytes.length > 0) {
          pdfAttachments.push({ fileName: att.fileName || 'Attachment.pdf', bytes: pdfBytes });
        }
      }

      if (pdfAttachments.length > 0) {
        const mergedDoc = await PDFDocument.load(basePdfBuffer);

        for (const item of pdfAttachments) {
          try {
            const donorDoc = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
            const pageIndices = donorDoc.getPageIndices();
            const copiedPages = await mergedDoc.copyPages(donorDoc, pageIndices);
            copiedPages.forEach((cp) => mergedDoc.addPage(cp));
            this.logger.log(`Merged attached PDF "${item.fileName}" (${pageIndices.length} page(s)) into Spot Check export.`);
          } catch (donorErr) {
            this.logger.warn(`Could not merge PDF attachment "${item.fileName}":`, donorErr);
          }
        }

        const finalMergedBytes = await mergedDoc.save();
        return Buffer.from(finalMergedBytes);
      }
    } catch (mergeErr) {
      this.logger.warn('Error during Spot Check PDF attachment merging, falling back to base form PDF:', mergeErr);
    }
    }

    return basePdfBuffer;
  }

  private parseJsonField<T>(val: any, fallback: T): T {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    }
    return val as T;
  }

  private formatDate(dateStr?: string | Date | null): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toISOString().split('T')[0];
    } catch {
      return String(dateStr);
    }
  }

  private buildHtml(sc: SpotCheck, includeAttachments: boolean = true): string {
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

    const resolveImageDataUri = (pathOrBase64: string | null | undefined): string | null => {
      if (!pathOrBase64) return null;
      if (pathOrBase64.startsWith('data:image')) return pathOrBase64;

      try {
        const cleanPath = pathOrBase64.trim();
        let filename = cleanPath;
        if (cleanPath.includes('/uploads/')) {
          filename = cleanPath.split('/uploads/').pop() || cleanPath;
        }

        const candidatePaths = [
          filename,
          join(process.cwd(), 'uploads', 'spot-checks', filename),
          join(process.cwd(), 'uploads', filename),
          join(process.cwd(), cleanPath),
          join(process.cwd(), cleanPath.replace(/^\/+/, '')),
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
      } catch (err) {
        this.logger.warn(`Could not load image at path: ${pathOrBase64}`);
      }
      return null;
    };

    const renderSignature = (sigData: string | null | undefined, name: string) => {
      const uri = resolveImageDataUri(sigData);
      if (uri) {
        return `
          <div style="display: flex; flex-direction: column; align-items: flex-start; justify-content: center; min-height: 48px;">
            <img src="${uri}" style="max-height: 44px; max-width: 170px; object-fit: contain;" alt="Signature" />
          </div>
        `;
      }
      if (sigData && sigData.length > 2 && !sigData.includes('/') && !sigData.includes('\\')) {
        return `
          <div style="font-family: 'Brush Script MT', cursive, sans-serif; font-size: 20px; color: #002868; font-weight: 700; padding: 4px 8px;">
            ${sigData}
          </div>
        `;
      }
      return `
        <div style="font-family: 'Brush Script MT', cursive, sans-serif; font-size: 18px; color: #334155; padding: 4px 8px;">
          ${name || 'Digitally Signed'}
        </div>
      `;
    };

    const highRiskList = this.parseJsonField<string[]>(sc.highRiskActivities, []);
    const keyTopicsList = this.parseJsonField<string[]>(sc.keyTopics, []);
    const correctiveActionsList = this.parseJsonField<any[]>(sc.correctiveActions, []);
    const attachmentsList = this.parseJsonField<any[]>(sc.attachments, []);

    const isHighRiskChecked = (key: string) => highRiskList.some(item => item.toLowerCase().trim() === key.toLowerCase().trim());
    const isTopicChecked = (key: string) => keyTopicsList.some(item => item.toLowerCase().trim() === key.toLowerCase().trim());

    const renderCheckbox = (checked: boolean, label: string) => `
      <span class="chk-item">
        <span class="chk-box ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</span>
        <span class="chk-label">${label}</span>
      </span>
    `;

    const renderCheckTd = (val: string | undefined | null, target: 'Yes' | 'No' | 'N/A') => {
      const isChecked = String(val || '').toLowerCase().trim() === target.toLowerCase().trim();
      return `<td class="center-td"><span class="chk-box ${isChecked ? 'checked' : ''}">${isChecked ? '✓' : ''}</span></td>`;
    };

    const refNo = sc.spotCheckRef || `SC-${sc.id}`;
    const dateFormatted = this.formatDate(sc.date || sc.createdTime);
    const timeFormatted = sc.time || '';
    const locFormatted = sc.location || (sc.buildingName ? `${sc.buildingName} ${sc.floorLevel || ''}` : '');

    // Header component
    const renderPageHeader = () => `
      <div class="header-container">
        <div class="logo-row">
          <div class="logo-left">
            ${projectLogoBase64 ? `<img src="${projectLogoBase64}" style="height: 38px; object-fit: contain;" alt="Novo Nordisk" />` : `<div style="font-weight: 800; font-size: 14px;">Novo Nordisk</div>`}
          </div>
          <div class="logo-right">
            ${nneLogoBase64 ? `<img src="${nneLogoBase64}" style="height: 32px; object-fit: contain;" alt="NNE" />` : `<div style="font-size: 22px; font-weight: 900; color: #002868;">nne®</div>`}
          </div>
        </div>

        <div class="title-banner">
          <div class="banner-text">
            <h1 class="banner-title">Spot Check</h1>
            <div class="banner-subtitle">Permit, controls and toolbox talk verification</div>
          </div>
        </div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${refNo} - Spot Check</title>
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
          .pdf-page {
            padding: 4px;
            page-break-after: always;
            break-after: always;
          }
          .pdf-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }

          /* Header & Logos */
          .header-container {
            margin-bottom: 12px;
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
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .banner-title {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            font-family: Georgia, 'Times New Roman', serif;
            letter-spacing: 0.5px;
          }
          .banner-subtitle {
            font-size: 9.5px;
            color: #e2e8f0;
            margin-top: 4px;
          }
          .banner-badge {
            font-size: 9.5px;
            font-style: italic;
            color: #fda4af;
            font-weight: 600;
          }

          /* Section Headings */
          .section-hdr {
            background: #111c38;
            color: #ffffff;
            font-size: 11px;
            font-weight: 800;
            padding: 5px 8px;
            margin-top: 10px;
            margin-bottom: 0px;
            letter-spacing: 0.5px;
          }
          .sub-hdr-bar {
            background: #1e293b;
            color: #ffffff;
            font-size: 9.5px;
            font-weight: 700;
            padding: 4px 8px;
          }

          /* Tables */
          table.sc-grid {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
            margin-bottom: 8px;
          }
          table.sc-grid th, table.sc-grid td {
            border: 1px solid #cbd5e1;
            padding: 4.5px 7px;
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
          .center-td {
            text-align: center;
            width: 42px;
          }

          /* Checkboxes */
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

          .chk-table-hdr th {
            background: #111c38;
            color: #ffffff;
            font-size: 9.5px;
            font-weight: 700;
            padding: 5px 6px;
          }

          .instructions-text {
            font-size: 8.5px;
            color: #475569;
            font-style: italic;
            margin: 4px 0 6px 0;
          }

          .comment-box {
            border: 1px solid #cbd5e1;
            min-height: 48px;
            padding: 6px 8px;
            font-size: 9px;
            background: #fdfdfd;
            margin-bottom: 8px;
            white-space: pre-wrap;
          }

          .page-footer-note {
            text-align: center;
            font-size: 8.5px;
            font-style: italic;
            color: #64748b;
            margin-top: 14px;
          }
        </style>
      </head>
      <body>

        <!-- ==========================================
             PAGE 1: GENERAL INFO & 1 | PERMIT TO WORK
        =========================================== -->
        <div class="pdf-page">
          ${renderPageHeader()}

          <div class="section-hdr">GENERAL INFORMATION</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 18%;">Project Name</td>
                <td class="val" style="width: 32%;">${sc.projectName || sc.workPackage || 'M3SOUTH'}</td>
                <td class="lbl" style="width: 18%;">Spot check ref.</td>
                <td class="val" style="width: 32%;"><b>${refNo}</b></td>
              </tr>
              <tr>
                <td class="lbl">Date</td>
                <td class="val">${dateFormatted}</td>
                <td class="lbl">Time</td>
                <td class="val">${timeFormatted}</td>
              </tr>
              <tr>
                <td class="lbl">Location</td>
                <td class="val" colspan="3">${locFormatted}</td>
              </tr>
              <tr>
                <td class="lbl">Activity / Task name</td>
                <td class="val"><b>${sc.activityName || '-'}</b></td>
                <td class="lbl">Company involved</td>
                <td class="val"><b>${sc.companyInvolved || '-'}</b></td>
              </tr>
              <tr>
                <td class="lbl">Permit ID</td>
                <td class="val">${sc.permitId || '-'}</td>
                <td class="lbl">RAMS / SPA ID</td>
                <td class="val">${sc.ramsId || '-'}</td>
              </tr>
            </tbody>
          </table>

          <div class="instructions-text">
            Instructions: Tick one response for each checkpoint. Use N/A only when the checkpoint does not apply. Record relevant facts in the comments field.
          </div>

          <div class="section-hdr">PERMIT TO WORK (PTW)</div>
          
          <div class="sub-hdr-bar">High-risk activities included</div>
          <table class="sc-grid" style="margin-bottom: 0;">
            <tbody>
              <tr>
                <td style="width: 33.3%;">${renderCheckbox(isHighRiskChecked('Hot work'), 'Hot work')}</td>
                <td style="width: 33.3%;">${renderCheckbox(isHighRiskChecked('Working on electrical systems'), 'Working on electrical systems')}</td>
                <td style="width: 33.3%;">${renderCheckbox(isHighRiskChecked('Hazardous substances / chemicals'), 'Hazardous substances / chemicals')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isHighRiskChecked('Pressure testing of equipment'), 'Pressure testing of equipment')}</td>
                <td>${renderCheckbox(isHighRiskChecked('Working at height'), 'Working at height')}</td>
                <td>${renderCheckbox(isHighRiskChecked('Working in confined spaces'), 'Working in confined spaces')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isHighRiskChecked('Working in ATEX area'), 'Working in ATEX area')}</td>
                <td>${renderCheckbox(isHighRiskChecked('Securing facilities (LOTO)'), 'Securing facilities (LOTO)')}</td>
                <td>${renderCheckbox(isHighRiskChecked('Excavation works'), 'Excavation works')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isHighRiskChecked('Using crane or lifting equipment'), 'Using crane or lifting equipment')}</td>
                <td colspan="2">${renderCheckbox(isHighRiskChecked('N/A'), 'N/A')}</td>
              </tr>
              <tr>
                <td class="lbl">If Hot Work:</td>
                <td colspan="2">
                  <div style="display: flex; gap: 24px;">
                    ${renderCheckbox(sc.ifHotWork === 'High Risk - Open Flame', 'High Risk - Open Flame')}
                    ${renderCheckbox(sc.ifHotWork === 'Low Risk - Spark Spreading', 'Low Risk - Spark Spreading')}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <table class="sc-grid" style="margin-top: 6px;">
            <thead>
              <tr class="chk-table-hdr">
                <th style="text-align: left;">Checkpoint</th>
                <th style="width: 42px; text-align: center;">Yes</th>
                <th style="width: 42px; text-align: center;">No</th>
                <th style="width: 42px; text-align: center;">N/A</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Does the description of work, including scope, location and times, match the work performed?</td>
                ${renderCheckTd(sc.chk1_2, 'Yes')}
                ${renderCheckTd(sc.chk1_2, 'No')}
                ${renderCheckTd(sc.chk1_2, 'N/A')}
              </tr>
              <tr>
                <td>Are the PTW and RAMS valid for the work performed?</td>
                ${renderCheckTd(sc.chk1_3, 'Yes')}
                ${renderCheckTd(sc.chk1_3, 'No')}
                ${renderCheckTd(sc.chk1_3, 'N/A')}
              </tr>
              <tr>
                <td>Are key risks controlled? Consider barriers, signage and whether controls are working as planned and coordinated.</td>
                ${renderCheckTd(sc.chk1_4, 'Yes')}
                ${renderCheckTd(sc.chk1_4, 'No')}
                ${renderCheckTd(sc.chk1_4, 'N/A')}
              </tr>
              <tr>
                <td>Do workers know the emergency plan? Consider contact information, medical centre, alarm / muster arrangements and rescue / emergency arrangements.</td>
                ${renderCheckTd(sc.chk1_5, 'Yes')}
                ${renderCheckTd(sc.chk1_5, 'No')}
                ${renderCheckTd(sc.chk1_5, 'N/A')}
              </tr>
              <tr>
                <td>Is correct task-specific PPE in use, in proper condition and worn properly?</td>
                ${renderCheckTd(sc.chk1_6, 'Yes')}
                ${renderCheckTd(sc.chk1_6, 'No')}
                ${renderCheckTd(sc.chk1_6, 'N/A')}
              </tr>
              <tr>
                <td>Is supervision present? Is the responsible person named on the PTW overseeing the work?</td>
                ${renderCheckTd(sc.chk1_7, 'Yes')}
                ${renderCheckTd(sc.chk1_7, 'No')}
                ${renderCheckTd(sc.chk1_7, 'N/A')}
              </tr>
              <tr>
                <td>Is the area orderly and safe? Consider clear access / egress, housekeeping and unblocked exits.</td>
                ${renderCheckTd(sc.chk1_8, 'Yes')}
                ${renderCheckTd(sc.chk1_8, 'No')}
                ${renderCheckTd(sc.chk1_8, 'N/A')}
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ==========================================
             PAGE 2: COMMUNICATION / TOOLBOX TALK & 3 | SUMMARY
        =========================================== -->
        <div class="pdf-page">
          <div class="section-hdr">COMMUNICATION / TOOLBOX TALK</div>
          <table class="sc-grid" style="margin-top: 4px;">
            <thead>
              <tr class="chk-table-hdr">
                <th style="text-align: left;">Checkpoint</th>
                <th style="width: 42px; text-align: center;">Yes</th>
                <th style="width: 42px; text-align: center;">No</th>
                <th style="width: 100px; text-align: center;">N/A / Comments</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Has a Toolbox Talk / pre-start briefing been held?</td>
                ${renderCheckTd(sc.chk2_1, 'Yes')}
                ${renderCheckTd(sc.chk2_1, 'No')}
                <td class="center-td">${sc.chk2_1 === 'N/A' ? renderCheckbox(true, 'N/A') : renderCheckbox(false, 'N/A')}</td>
              </tr>
            </tbody>
          </table>

          <div class="instructions-text">
            If YES, complete the items below. If NO, complete the explanation box below.
          </div>

          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 20%;">Date of briefing</td>
                <td class="val" colspan="3">${this.formatDate(sc.briefingDate)}</td>
              </tr>
              <tr>
                <td class="lbl">Conducted by</td>
                <td class="val">${sc.conductedBy || '-'}</td>
                <td class="lbl">Number of participants</td>
                <td class="val">${sc.participants || '-'}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-weight: 700; font-size: 9.5px; margin: 6px 0 3px 0;">Key topics covered</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td style="width: 50%;">${renderCheckbox(isTopicChecked('PPE'), 'PPE')}</td>
                <td style="width: 50%;">${renderCheckbox(isTopicChecked('Site hazards'), 'Site hazards')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isTopicChecked('Task-specific risks'), 'Task-specific risks')}</td>
                <td>${renderCheckbox(isTopicChecked('Recent accidents'), 'Recent accidents')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isTopicChecked('Emergency procedures'), 'Emergency procedures')}</td>
                <td>${renderCheckbox(isTopicChecked('Permit To Work content'), 'Permit To Work content')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isTopicChecked('Risk Assessment Method Statement content'), 'Risk Assessment Method Statement content')}</td>
                <td>${renderCheckbox(Boolean(sc.otherTopic), `Other topics: ${sc.otherTopic || '__________________________'}`)}</td>
              </tr>
            </tbody>
          </table>

          <table class="sc-grid" style="margin-top: 4px;">
            <thead>
              <tr class="chk-table-hdr">
                <th style="text-align: left;">Checkpoint</th>
                <th style="width: 42px; text-align: center;">Yes</th>
                <th style="width: 42px; text-align: center;">No</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Have all workers confirmed understanding of the PTW and RAMS requirements?</td>
                ${renderCheckTd(sc.chk2_1_5, 'Yes')}
                ${renderCheckTd(sc.chk2_1_5, 'No')}
              </tr>
            </tbody>
          </table>

          <div style="font-weight: 700; font-size: 9.5px; margin: 6px 0 2px 0;">
            If NO, explain why the Toolbox Talk / pre-start briefing was not held
          </div>
          <div class="comment-box">
            ${sc.explainNoBriefing || ''}
          </div>

          <div class="section-hdr">SUMMARY</div>
          <table class="sc-grid" style="margin-top: 4px;">
            <thead>
              <tr class="chk-table-hdr">
                <th style="text-align: left;">Checkpoint</th>
                <th style="width: 42px; text-align: center;">Yes</th>
                <th style="width: 42px; text-align: center;">No</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Was the activity in compliance?</td>
                ${renderCheckTd(sc.chk3_2, 'Yes')}
                ${renderCheckTd(sc.chk3_2, 'No')}
              </tr>
            </tbody>
          </table>

          <div style="font-weight: 700; font-size: 9.5px; margin: 6px 0 2px 0;">
            Safety issue traceability, if activity is not compliant
          </div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 25%;">Safety issue created?</td>
                <td style="width: 25%;">
                  ${renderCheckbox(sc.safetyIssueCreated === 'Yes', 'Yes')} &nbsp;&nbsp;
                  ${renderCheckbox(sc.safetyIssueCreated === 'No', 'No')}
                </td>
                <td class="lbl" style="width: 25%;">Safety issue / SPOT ref.</td>
                <td class="val" style="width: 25%;">${sc.safetyIssueRef || '-'}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-weight: 700; font-size: 9.5px; margin: 6px 0 2px 0;">Findings / comments</div>
          <div class="comment-box">
            ${sc.findings || ''}
          </div>


        </div>

        <!-- ==========================================
             PAGE 3: 3 | SUMMARY - SIGNATURES AND EVIDENCE
        =========================================== -->
        <div class="pdf-page">
          <div class="section-hdr">SUMMARY - SIGNATURES AND EVIDENCE</div>
          
          <div style="font-weight: 700; font-size: 9.5px; margin: 8px 0 4px 0;">Foreman / Supervisor Details</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 18%;">Name</td>
                <td class="val" style="width: 32%;">${sc.foremanName || '-'}</td>
                <td class="lbl" style="width: 18%;">Company</td>
                <td class="val" style="width: 32%;">${sc.foremanCompany || '-'}</td>
              </tr>
              <tr>
                <td class="lbl">Signature</td>
                <td class="val">
                  ${renderSignature(sc.foremanSignature, sc.foremanName || 'Foreman')}
                </td>
                <td class="lbl">Date</td>
                <td class="val">${this.formatDate(sc.foremanDate)}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-weight: 700; font-size: 9.5px; margin: 12px 0 4px 0;">
            Photographs and attachments <span style="color: #be123c; font-weight: normal;">(required)</span>
          </div>
          <table class="sc-grid">
            <thead>
              <tr class="chk-table-hdr">
                <th style="width: 42px; text-align: center;">No.</th>
                <th style="text-align: left;">Description / reference</th>
                <th style="width: 140px; text-align: center;">Attached</th>
              </tr>
            </thead>
            <tbody>
              ${attachmentsList && attachmentsList.length > 0 ? (
                attachmentsList.map((att, idx) => {
                  const isAttached = att.attached === 'Yes' || Boolean(att.fileName) || Boolean(att.previewUrl);
                  return `
                    <tr>
                      <td class="lbl" style="text-align: center;"><b>${idx + 1}</b></td>
                      <td>
                        <b>${att.desc || att.description || `Attachment ${idx + 1}`}</b>
                        ${att.fileName ? `<div style="font-size: 8.5px; color: #475569; margin-top: 2px;">File: ${att.fileName} ${att.fileSize ? `(${att.fileSize})` : ''}</div>` : ''}
                      </td>
                      <td style="text-align: center;">
                        ${renderCheckbox(isAttached, 'Yes')} &nbsp;
                        ${renderCheckbox(!isAttached, 'N/A')}
                      </td>
                    </tr>
                  `;
                }).join('')
              ) : `
                <tr>
                  <td class="lbl" style="text-align: center;"><b>1</b></td>
                  <td>&nbsp;</td>
                  <td style="text-align: center;">${renderCheckbox(false, 'Yes')} &nbsp; ${renderCheckbox(true, 'N/A')}</td>
                </tr>
                <tr>
                  <td class="lbl" style="text-align: center;"><b>2</b></td>
                  <td>&nbsp;</td>
                  <td style="text-align: center;">${renderCheckbox(false, 'Yes')} &nbsp; ${renderCheckbox(true, 'N/A')}</td>
                </tr>
                <tr>
                  <td class="lbl" style="text-align: center;"><b>3</b></td>
                  <td>&nbsp;</td>
                  <td style="text-align: center;">${renderCheckbox(false, 'Yes')} &nbsp; ${renderCheckbox(true, 'N/A')}</td>
                </tr>
              `}
            </tbody>
          </table>

          <!-- Photo Gallery if base64/image attachments exist -->
          ${(() => {
            const photosWithImage = attachmentsList.filter(a => a.previewUrl && (a.fileType?.startsWith('image/') || a.previewUrl.startsWith('data:image')));
            if (photosWithImage.length === 0) return '';
            return `
              <div style="margin-top: 10px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; background: #f8fafc;">
                <div style="font-weight: 700; font-size: 9px; color: #0f172a; margin-bottom: 6px;">Attached Photographs Evidence:</div>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                  ${photosWithImage.map((p, i) => `
                    <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; background: #ffffff; text-align: center;">
                      <img src="${p.previewUrl}" style="width: 140px; height: 95px; object-fit: cover; border-radius: 3px;" alt="Photo ${i+1}" />
                      <div style="font-size: 8px; font-weight: 600; color: #334155; margin-top: 3px;">${p.desc || p.fileName || `Photo ${i+1}`}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          })()}

          <div style="font-weight: 700; font-size: 9.5px; margin: 12px 0 4px 0;">Spot check performed by</div>
          <table class="sc-grid">
            <tbody>
              <tr>
                <td class="lbl" style="width: 18%;">Name</td>
                <td class="val" style="width: 32%;">${sc.inspectorName || sc.createdByUserName || 'Safety Inspector'}</td>
                <td class="lbl" style="width: 18%;">Company / function</td>
                <td class="val" style="width: 32%;">${sc.inspectorCompany || 'NNE'}</td>
              </tr>
              <tr>
                <td class="lbl">Signature</td>
                <td class="val">
                  ${renderSignature(sc.inspectorSignature, sc.inspectorName || 'Inspector')}
                </td>
                <td class="lbl">Date</td>
                <td class="val">${this.formatDate(sc.inspectorDate || sc.createdTime)}</td>
              </tr>
            </tbody>
          </table>

          <div class="page-footer-note">
            Retain the completed paper form and associated evidence in accordance with the applicable project filing process.
          </div>
        </div>

      </body>
      </html>
    `;
  }
}
