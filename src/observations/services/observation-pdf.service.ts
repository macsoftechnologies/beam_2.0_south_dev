import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { Observation, ObservationType, ObservationStatus } from '../entities/observation.entity';
import { ObservationActionLog } from '../entities/observation-action-log.entity';

@Injectable()
export class ObservationPdfService {
  private readonly logger = new Logger(ObservationPdfService.name);

  private async launchBrowser(): Promise<any> {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ];

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
        try {
          return await puppeteer.launch({
            channel: 'msedge' as any,
            headless: true,
            args: launchArgs,
          });
        } catch (e3) {
          const candidatePaths = [
            process.env.PUPPETEER_EXECUTABLE_PATH,
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
          ].filter(Boolean) as string[];

          for (const p of candidatePaths) {
            if (existsSync(p)) {
              try {
                return await puppeteer.launch({
                  executablePath: p,
                  headless: true,
                  args: launchArgs,
                });
              } catch (e4) {}
            }
          }
          throw e1;
        }
      }
    }
  }

  /**
   * Generates official printable PDF for a Safety Observation record,
   * matching corporate NNE standards with details, findings, resolutions, signatures, and action timeline.
   */
  async generateObservationPdf(observation: Observation, history: ObservationActionLog[] = []): Promise<Buffer> {
    const html = await this.buildHtml(observation, history);

    const browser = await this.launchBrowser();

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: ['domcontentloaded', 'load'], timeout: 30000 });
      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '14mm', right: '14mm' },
      });
      return Buffer.from(pdfBytes);
    } catch (err) {
      this.logger.error('Failed to generate Observation PDF with Puppeteer:', err);
      throw err;
    } finally {
      await browser.close();
    }
  }

  private formatDate(dateStr?: string | Date | null): string {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toISOString().split('T')[0];
    } catch {
      return String(dateStr);
    }
  }

  private formatDateTime(dateStr?: string | Date | null): string {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return `${d.toISOString().split('T')[0]} ${d.toTimeString().split(' ')[0].substring(0, 5)}`;
    } catch {
      return String(dateStr);
    }
  }

  private parseJsonArray(val: any): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [val];
      } catch {
        return [val];
      }
    }
    return [];
  }

  /**
   * Resolves an image path or URL directly to a Base64 data URI string.
   * Checks local filesystem paths first, and falls back to remote API endpoints.
   */
  private async resolveImageAsBase64(src: string): Promise<string> {
    if (!src) return '';
    if (src.startsWith('data:image')) return src;

    const filename = String(src).split('/').pop()?.split('\\').pop();
    if (!filename) return '';

    // 1. Check local file paths on disk
    const localCandidates = [
      join(process.cwd(), 'uploads', 'observations', filename),
      join(process.cwd(), 'uploads', filename),
      join(process.cwd(), src.replace(/^\/+/, '')),
    ];

    for (const cand of localCandidates) {
      if (existsSync(cand)) {
        try {
          const ext = extname(cand).toLowerCase().replace('.', '') || 'jpeg';
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          return `data:${mime};base64,${readFileSync(cand).toString('base64')}`;
        } catch (err) {
          this.logger.warn(`Failed reading local file ${cand}: ${err}`);
        }
      }
    }

    // 2. Fetch from remote endpoints (where dev and production uploads reside)
    const remoteCandidates: string[] = [];
    if (src.startsWith('http://') || src.startsWith('https://')) {
      remoteCandidates.push(src);
    }
    remoteCandidates.push(`https://api.beam.safesiteworks.com/development/m3south/observations/${filename}`);
    remoteCandidates.push(`https://api.beam.safesiteworks.com/uploads/observations/${filename}`);
    remoteCandidates.push(`http://localhost:5200/uploads/observations/${filename}`);

    for (const url of remoteCandidates) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const contentType = res.headers.get('content-type') || 'image/jpeg';
          return `data:${contentType};base64,${Buffer.from(buf).toString('base64')}`;
        }
      } catch {
        // Try next candidate
      }
    }

    return '';
  }

  private async buildHtml(obs: Observation, history: ObservationActionLog[] = []): Promise<string> {
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

    const isPositive = obs.observationType === ObservationType.POSITIVE;
    const isClosed = obs.status === ObservationStatus.CLOSED;

    // Resolve observation initial evidence photos to Base64
    const rawPhotos = this.parseJsonArray(obs.photos);
    const resolvedPhotos = (await Promise.all(rawPhotos.map((p) => this.resolveImageAsBase64(p)))).filter((b) => !!b);

    // Resolve resolution photos to Base64
    const rawResolutionPhotos = this.parseJsonArray(obs.resolutionPhotos);
    const resolvedResolutionPhotos = (await Promise.all(rawResolutionPhotos.map((p) => this.resolveImageAsBase64(p)))).filter((b) => !!b);

    // Resolve closure digital signature to Base64 if available
    let closureSigBase64 = '';
    if (obs.closureSignature) {
      closureSigBase64 = await this.resolveImageAsBase64(obs.closureSignature);
    }

    // Resolve all photos inside Action Logs history
    const resolvedHistory = await Promise.all(
      history.map(async (log) => {
        const logPhotos = this.parseJsonArray(log.photos);
        const resolvedLogPhotos = (await Promise.all(logPhotos.map((p) => this.resolveImageAsBase64(p)))).filter((b) => !!b);
        return {
          ...log,
          resolvedLogPhotos,
        };
      }),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Safety Observation - ${obs.observationNumber}</title>
  <style>
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9px;
      color: #0f172a;
      margin: 0;
      padding: 0;
      background: #ffffff;
      line-height: 1.35;
    }

    /* ── Header & Logos (Spot Check Standard) ── */
    .header-container {
      margin-bottom: 8px;
    }
    .logo-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .logo-left {
      display: flex;
      align-items: center;
    }
    .logo-right {
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }
    .title-banner {
      background: #111c38;
      color: #ffffff;
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .banner-title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      font-family: Georgia, 'Times New Roman', serif;
      letter-spacing: 0.5px;
    }
    .banner-subtitle {
      font-size: 9px;
      color: #e2e8f0;
      margin-top: 3px;
    }
    .banner-badge {
      font-size: 8.5px;
      font-weight: 700;
      color: #93c5fd;
      border: 1px solid #3b82f6;
      padding: 2.5px 8px;
      border-radius: 2px;
      background: rgba(59, 130, 246, 0.15);
    }

    /* ── Section Headings & Dividers ── */
    .section-hdr {
      background: #111c38;
      color: #ffffff;
      font-size: 10px;
      font-weight: 800;
      padding: 4.5px 8px;
      margin-top: 8px;
      margin-bottom: 0px;
      letter-spacing: 0.5px;
      page-break-after: avoid;
      break-after: avoid;
    }
    .instructions-text {
      font-size: 7.5px;
      color: #475569;
      font-style: italic;
      margin: 3px 0 5px 0;
    }

    /* ── Spot Check Standard Grid Tables ── */
    table.sc-grid {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin-bottom: 6px;
    }
    table.sc-grid th, table.sc-grid td {
      border: 1px solid #cbd5e1;
      padding: 4.5px 7px;
      vertical-align: middle;
    }
    table.sc-grid tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .lbl {
      background: #f8fafc;
      font-weight: 700;
      color: #0f172a;
    }
    .val {
      color: #0f172a;
    }

    /* ── Checkpoints / Table Header ── */
    .chk-table-hdr th {
      background: #111c38;
      color: #ffffff;
      font-size: 8.5px;
      font-weight: 700;
      padding: 5px 7px;
      letter-spacing: 0.3px;
    }

    /* ── Status Badges ── */
    .chk-status-badge {
      display: inline-block;
      font-size: 7.5px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 2px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .chk-status-badge.green {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
    }
    .chk-status-badge.yellow {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .chk-status-badge.red {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fca5a5;
    }
    .chk-status-badge.blue {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #7dd3fc;
    }

    /* ── Visual Evidence ── */
    .photos-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 2px;
    }
    .item-photo {
      width: 70px;
      height: 50px;
      object-fit: cover;
      border-radius: 2px;
      border: 1px solid #cbd5e1;
    }

    /* ── Footer ── */
    .page-footer-note {
      text-align: center;
      font-size: 7.5px;
      font-style: italic;
      color: #64748b;
      margin-top: 10px;
      border-top: 1px solid #e2e8f0;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header-container">
    <div class="logo-row">
      <div class="logo-left">
        ${projectLogoBase64 ? `<img src="${projectLogoBase64}" style="height: 38px; object-fit: contain;" alt="Novo Nordisk" />` : '<div style="font-weight: 800; font-size: 15px; color: #0f172a;">Novo Nordisk</div>'}
      </div>
      <div class="logo-right">
        ${nneLogoBase64 ? `<img src="${nneLogoBase64}" style="height: 32px; object-fit: contain;" alt="NNE" />` : '<div style="font-size: 22px; font-weight: 900; color: #111c38;">nne&reg;</div>'}
      </div>
    </div>

    <div class="title-banner">
      <div class="banner-text">
        <h1 class="banner-title">Safety Observation Report</h1>
        <div class="banner-subtitle">Official HSE Record &bull; Ref: <b>${obs.observationNumber}</b> &bull; Date: <b>${this.formatDate(obs.observationDate || obs.createdTime)}</b></div>
      </div>
      <div class="banner-badge">Controlled Safety Record</div>
    </div>
  </div>

  <!-- General Info & Classification Metrics -->
  <div class="section-hdr">GENERAL INFORMATION &amp; METRICS</div>
  <table class="sc-grid">
    <tr>
      <td class="lbl" style="width: 18%;">Observation Ref:</td>
      <td class="val" style="width: 32%; font-weight: 700; color: #0284c7;">${obs.observationNumber}</td>
      <td class="lbl" style="width: 18%;">Observation Date:</td>
      <td class="val" style="width: 32%;">${this.formatDate(obs.observationDate || obs.createdTime)} ${obs.observationTime ? `(${obs.observationTime})` : ''}</td>
    </tr>
    <tr>
      <td class="lbl">Project Name:</td>
      <td class="val">${obs.projectName || 'M3SOUTH'}</td>
      <td class="lbl">Status:</td>
      <td class="val">
        <span class="chk-status-badge ${isClosed ? 'green' : 'yellow'}">${obs.status}</span>
      </td>
    </tr>
    <tr>
      <td class="lbl">Observation Type:</td>
      <td class="val">
        <span class="chk-status-badge ${isPositive ? 'green' : 'red'}">${isPositive ? 'Positive Observation' : 'Needs Attention'}</span>
      </td>
      <td class="lbl">Risk Level:</td>
      <td class="val">
        <span class="chk-status-badge ${String(obs.riskLevel || '').toUpperCase() === 'HIGH' ? 'red' : String(obs.riskLevel || '').toUpperCase() === 'LOW' ? 'green' : 'yellow'}">${obs.riskLevel || 'MEDIUM'}</span>
      </td>
    </tr>
  </table>

  <!-- Location & Assignment -->
  <div class="section-hdr">OBSERVATION CLASSIFICATION &amp; LOCATION</div>
  <table class="sc-grid">
    <tr>
      <td class="lbl" style="width: 18%;">Subject / Title:</td>
      <td class="val" colspan="3" style="font-weight: 700;">${obs.subject || '-'}</td>
    </tr>
    <tr>
      <td class="lbl" style="width: 18%;">Nature of Finding:</td>
      <td class="val" style="width: 32%;">${obs.natureOfFinding || '-'}</td>
      <td class="lbl" style="width: 18%;">Safety Category:</td>
      <td class="val" style="width: 32%;">${obs.safetyCategory || '-'}</td>
    </tr>
    <tr>
      <td class="lbl">Subcategory:</td>
      <td class="val">${obs.subcategory || 'N/A'}</td>
      <td class="lbl">Target Deadline:</td>
      <td class="val">${this.formatDate(obs.deadline)}</td>
    </tr>
    <tr>
      <td class="lbl">Building / Area:</td>
      <td class="val">${obs.buildingName || '-'}</td>
      <td class="lbl">Floor Level:</td>
      <td class="val">${obs.floorLevel || '-'}</td>
    </tr>
    <tr>
      <td class="lbl">Specific Location:</td>
      <td class="val" colspan="3">${obs.specificLocation || '-'}</td>
    </tr>
    <tr>
      <td class="lbl">Assigned Contractor:</td>
      <td class="val" style="font-weight: 700; color: #0284c7;">${obs.assignedContractorName || 'N/A'}</td>
      <td class="lbl">Reported By:</td>
      <td class="val">${obs.createdByUserName || 'Safety Inspector'} (${obs.createdByRole || 'DEPARTMENT'})</td>
    </tr>
  </table>

  <!-- Findings & Immediate Action -->
  <div class="section-hdr">FINDING DESCRIPTION &amp; IMMEDIATE ACTION</div>
  <table class="sc-grid">
    <tr>
      <td class="lbl" style="width: 18%; vertical-align: top;">Detailed Description:</td>
      <td class="val" colspan="3" style="background: #fdfdfd; white-space: pre-wrap; line-height: 1.4;">${obs.description || 'No detailed description recorded.'}</td>
    </tr>
    ${obs.immediateActionTaken ? `
    <tr>
      <td class="lbl" style="vertical-align: top;">Immediate Action:</td>
      <td class="val" colspan="3" style="background: #fdfdfd; white-space: pre-wrap; line-height: 1.4;">${obs.immediateActionTaken}</td>
    </tr>
    ` : ''}
    ${resolvedPhotos && resolvedPhotos.length > 0 ? `
    <tr>
      <td class="lbl" style="vertical-align: top;">Initial Evidence (${resolvedPhotos.length}):</td>
      <td class="val" colspan="3">
        <div class="photos-grid">
          ${resolvedPhotos.map((p) => `<img class="item-photo" src="${p}" alt="Finding Photo" />`).join('')}
        </div>
      </td>
    </tr>
    ` : ''}
  </table>

  <!-- Contractor Corrective Action & Resolution (if available) -->
  ${(obs.resolutionNotes || (resolvedResolutionPhotos && resolvedResolutionPhotos.length > 0)) ? `
  <div class="section-hdr">CONTRACTOR CORRECTIVE ACTION &amp; RESOLUTION</div>
  <table class="sc-grid">
    <tr>
      <td class="lbl" style="width: 18%; vertical-align: top;">Resolution Notes:</td>
      <td class="val" colspan="3" style="background: #f0fdf4; white-space: pre-wrap; line-height: 1.4;">${obs.resolutionNotes || 'Corrective action implemented as per HSE requirements.'}</td>
    </tr>
    ${resolvedResolutionPhotos && resolvedResolutionPhotos.length > 0 ? `
    <tr>
      <td class="lbl" style="vertical-align: top;">Resolution Evidence (${resolvedResolutionPhotos.length}):</td>
      <td class="val" colspan="3">
        <div class="photos-grid">
          ${resolvedResolutionPhotos.map((p) => `<img class="item-photo" src="${p}" alt="Resolution Photo" />`).join('')}
        </div>
      </td>
    </tr>
    ` : ''}
  </table>
  ` : ''}

  <!-- HSE Sign-off & Closure Verification -->
  <div class="section-hdr">HSE VERIFICATION &amp; FINAL CLOSURE</div>
  <table class="sc-grid">
    <tr>
      <td class="lbl" style="width: 18%;">Closed By:</td>
      <td class="val" style="width: 32%; font-weight: 700;">${obs.closedBy || 'HSE Lead / Site Manager'}</td>
      <td class="lbl" style="width: 18%;">Closure Date &amp; Time:</td>
      <td class="val" style="width: 32%; font-weight: 700;">${this.formatDateTime(obs.closedTime || obs.updatedTime)}</td>
    </tr>
    <tr>
      <td class="lbl">Closure Comments:</td>
      <td class="val" colspan="3">${obs.closureComments || 'Observation verified, documented, and closed in accordance with applicable project HSE requirements.'}</td>
    </tr>
    <tr>
      <td class="lbl">Auditor Verification:</td>
      <td class="val" colspan="3" style="height: 52px; vertical-align: bottom;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; padding-top: 10px;">
          <div style="font-family: 'Brush Script MT', cursive, sans-serif; font-size: 18px; color: #111c38; font-weight: 700;">
            ${closureSigBase64 ? `<img src="${closureSigBase64}" style="max-height: 44px; object-fit: contain;" alt="Closure Signature" />` : (obs.closedBy || 'HSE Lead / Site Manager')}
          </div>
          <div style="border-top: 1px dashed #94a3b8; width: 220px; text-align: center; font-size: 8px; color: #64748b; padding-top: 3px;">
            Authorized HSE Sign-Off &amp; Stamp
          </div>
        </div>
      </td>
    </tr>
  </table>

  <!-- Complete Audit Trail History -->
  ${resolvedHistory && resolvedHistory.length > 0 ? `
  <div class="section-hdr">ACTION HISTORY &amp; AUDIT TRAIL</div>
  <table class="sc-grid">
    <thead>
      <tr class="chk-table-hdr">
        <th style="width: 15%;">Action</th>
        <th style="width: 22%;">Performed By</th>
        <th style="width: 18%;">Date &amp; Time</th>
        <th style="width: 45%;">Remarks / Details &amp; Attachments</th>
      </tr>
    </thead>
    <tbody>
      ${resolvedHistory.map((log) => `
      <tr>
        <td style="vertical-align: top; font-weight: 700;">${log.actionType}</td>
        <td style="vertical-align: top;">
          <b>${log.performedByUserName || 'System'}</b><br />
          <span style="color: #64748b; font-size: 8px;">(${log.performedByUserRole || '-'})</span>
        </td>
        <td style="vertical-align: top; color: #475569;">${this.formatDateTime(log.timestamp)}</td>
        <td style="vertical-align: top;">
          ${log.previousContractor && log.newContractor ? `<div style="color: #0284c7; font-weight: 600; font-size: 9px; margin-bottom: 2px;">Contractor: ${log.previousContractor} &rarr; ${log.newContractor}</div>` : ''}
          ${log.remarks ? `<div>${log.remarks}</div>` : '<span style="color: #94a3b8; font-style: italic;">No remarks</span>'}
          ${log.resolvedLogPhotos && log.resolvedLogPhotos.length > 0 ? `
          <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
            <div style="font-size: 7.5px; font-weight: 700; color: #64748b; margin-bottom: 2px;">ATTACHED PHOTOS (${log.resolvedLogPhotos.length}):</div>
            <div style="display: flex; flex-wrap: wrap; gap: 5px;">
              ${log.resolvedLogPhotos.map((src) => `
                <img src="${src}" style="width: 54px; height: 38px; object-fit: cover; border-radius: 2px; border: 1px solid #cbd5e1;" alt="Log Attachment" />
              `).join('')}
            </div>
          </div>` : ''}
        </td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <div class="page-footer-note">
    Novo Nordisk &bull; Site HSE Management System &bull; Safety Observation Record ${obs.observationNumber}
  </div>
</body>
</html>`;
  }
}
