import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { Observation, ObservationType, ObservationStatus } from '../entities/observation.entity';
import { ObservationActionLog } from '../entities/observation-action-log.entity';

@Injectable()
export class ObservationPdfService {
  private readonly logger = new Logger(ObservationPdfService.name);

  /**
   * Generates official printable PDF for a Safety Observation record,
   * matching corporate NNE standards with details, findings, resolutions, signatures, and action timeline.
   */
  async generateObservationPdf(observation: Observation, history: ObservationActionLog[] = []): Promise<Buffer> {
    const html = await this.buildHtml(observation, history);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: ['domcontentloaded', 'load'], timeout: 30000 });
      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
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
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { font-size: 11px; color: #1e293b; background: #fff; line-height: 1.4; padding: 4px; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
    .header-table td { vertical-align: middle; }
    .title-block { text-align: center; }
    .title-main { font-size: 17px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
    .title-sub { font-size: 11px; color: #64748b; font-weight: 600; margin-top: 2px; }
    .meta-box { border: 1px solid #cbd5e1; background: #f8fafc; padding: 6px 10px; border-radius: 4px; font-size: 10.5px; }
    .meta-box b { color: #0f172a; }
    
    .section-card { border: 1px solid #cbd5e1; border-radius: 4px; margin-bottom: 12px; overflow: hidden; page-break-inside: avoid; }
    .section-header { background: #1e293b; color: #fff; padding: 5px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .section-body { padding: 8px 10px; }
    
    .data-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    .data-table th, .data-table td { padding: 5px 8px; border: 1px solid #e2e8f0; text-align: left; }
    .data-table td.label { width: 22%; background: #f8fafc; font-weight: 600; color: #475569; }
    .data-table td.val { width: 28%; color: #0f172a; }
    
    .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .badge-green { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
    .badge-red { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
    .badge-orange { background: #ffedd5; color: #c2410c; border: 1px solid #fdba74; }
    .badge-blue { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
    
    .photo-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
    .photo-thumb { width: 110px; height: 85px; object-fit: cover; border-radius: 4px; border: 1px solid #cbd5e1; }
    
    .history-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 4px; }
    .history-table th { background: #f1f5f9; padding: 5px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #334155; text-align: left; }
    .history-table td { padding: 4px 8px; border: 1px solid #e2e8f0; color: #334155; }
    
    .footer-note { text-align: center; font-size: 9.5px; color: #64748b; margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 6px; }
  </style>
</head>
<body>
  <!-- Header -->
  <table class="header-table">
    <tr>
      <td style="width: 25%;">
        ${nneLogoBase64 ? `<img src="${nneLogoBase64}" style="height: 38px; object-fit: contain;" alt="NNE Logo" />` : '<b style="font-size: 18px; color: #0f172a;">NNE</b>'}
      </td>
      <td style="width: 50%;" class="title-block">
        <div class="title-main">Safety Observation Report</div>
        <div class="title-sub">Official Closed Record &amp; Verification Sign-off</div>
      </td>
      <td style="width: 25%; text-align: right;">
        ${projectLogoBase64 ? `<img src="${projectLogoBase64}" style="height: 38px; object-fit: contain;" alt="Project Logo" />` : ''}
      </td>
    </tr>
  </table>

  <!-- Meta Header Bar -->
  <table style="width: 100%; margin-bottom: 12px; font-size: 10.5px;">
    <tr>
      <td style="width: 50%;">
        <div class="meta-box">
          <b>Observation Ref:</b> <span style="font-family: monospace; font-size: 12px; font-weight: 700; color: #0284c7;">${obs.observationNumber}</span><br />
          <b>Project Name:</b> ${obs.projectName || 'M3SOUTH'}<br />
          <b>Date of Observation:</b> ${this.formatDate(obs.observationDate || obs.createdTime)} ${obs.observationTime ? `(${obs.observationTime})` : ''}
        </div>
      </td>
      <td style="width: 50%;">
        <div class="meta-box">
          <b>Status:</b> <span class="badge ${isClosed ? 'badge-green' : 'badge-orange'}">${obs.status}</span><br />
          <b>Observation Type:</b> <span class="badge ${isPositive ? 'badge-green' : 'badge-red'}">${isPositive ? 'Positive' : 'Needs Attention'}</span><br />
          <b>Risk Level:</b> <span style="font-weight: 700;">${obs.riskLevel || 'MEDIUM'}</span>
        </div>
      </td>
    </tr>
  </table>

  <!-- 1. General & Classification Details -->
  <div class="section-card">
    <div class="section-header">1 | Observation Classification &amp; Location</div>
    <table class="data-table">
      <tr>
        <td class="label">Subject / Title</td>
        <td class="val" colspan="3"><b>${obs.subject || '-'}</b></td>
      </tr>
      <tr>
        <td class="label">Nature of Finding</td>
        <td class="val">${obs.natureOfFinding || '-'}</td>
        <td class="label">Safety Category</td>
        <td class="val">${obs.safetyCategory || '-'}</td>
      </tr>
      <tr>
        <td class="label">Subcategory</td>
        <td class="val">${obs.subcategory || 'N/A'}</td>
        <td class="label">Target Deadline</td>
        <td class="val">${this.formatDate(obs.deadline)}</td>
      </tr>
      <tr>
        <td class="label">Building / Area</td>
        <td class="val">${obs.buildingName || '-'}</td>
        <td class="label">Floor Level</td>
        <td class="val">${obs.floorLevel || '-'}</td>
      </tr>
      <tr>
        <td class="label">Specific Location</td>
        <td class="val" colspan="3">${obs.specificLocation || '-'}</td>
      </tr>
      <tr>
        <td class="label">Assigned Contractor</td>
        <td class="val"><b>${obs.assignedContractorName || 'N/A'}</b></td>
        <td class="label">Reported By</td>
        <td class="val">${obs.createdByUserName || 'Safety Inspector'} (${obs.createdByRole || 'DEPARTMENT'})</td>
      </tr>
    </table>
  </div>

  <!-- 2. Observation Description & Initial Finding -->
  <div class="section-card">
    <div class="section-header">2 | Finding Description &amp; Immediate Action</div>
    <div class="section-body">
      <div style="font-weight: 700; color: #475569; margin-bottom: 3px;">Detailed Description / Observations:</div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 7px 10px; font-size: 10.5px; white-space: pre-wrap; margin-bottom: 8px;">
        ${obs.description || 'No detailed description recorded.'}
      </div>

      ${obs.immediateActionTaken ? `
      <div style="font-weight: 700; color: #475569; margin-bottom: 3px;">Immediate Action Taken on Site:</div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 7px 10px; font-size: 10.5px; white-space: pre-wrap; margin-bottom: 8px;">
        ${obs.immediateActionTaken}
      </div>` : ''}

      ${resolvedPhotos && resolvedPhotos.length > 0 ? `
      <div style="font-weight: 700; color: #475569; margin-bottom: 3px;">Initial Evidence Photographs (${resolvedPhotos.length}):</div>
      <div class="photo-grid">
        ${resolvedPhotos.map((p) => `<img class="photo-thumb" src="${p}" alt="Finding Photo" />`).join('')}
      </div>` : ''}
    </div>
  </div>

  <!-- 3. Contractor Resolution Details (if available) -->
  ${(obs.resolutionNotes || (resolvedResolutionPhotos && resolvedResolutionPhotos.length > 0)) ? `
  <div class="section-card">
    <div class="section-header">3 | Contractor Corrective Action &amp; Resolution</div>
    <div class="section-body">
      <div style="font-weight: 700; color: #475569; margin-bottom: 3px;">Resolution Notes &amp; Actions Implemented:</div>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; padding: 7px 10px; font-size: 10.5px; white-space: pre-wrap; margin-bottom: 8px;">
        ${obs.resolutionNotes || 'Corrective action implemented as per HSE requirements.'}
      </div>

      ${resolvedResolutionPhotos && resolvedResolutionPhotos.length > 0 ? `
      <div style="font-weight: 700; color: #475569; margin-bottom: 3px;">Resolution Evidence Photographs (${resolvedResolutionPhotos.length}):</div>
      <div class="photo-grid">
        ${resolvedResolutionPhotos.map((p) => `<img class="photo-thumb" src="${p}" alt="Resolution Photo" />`).join('')}
      </div>` : ''}
    </div>
  </div>` : ''}

  <!-- 4. Sign-off & Closure Verification -->
  <div class="section-card">
    <div class="section-header">4 | HSE Department Sign-off &amp; Final Closure</div>
    <table class="data-table">
      <tr>
        <td class="label">Closed By</td>
        <td class="val"><b>${obs.closedBy || 'HSE Lead / Site Manager'}</b></td>
        <td class="label">Closure Date &amp; Time</td>
        <td class="val"><b>${this.formatDateTime(obs.closedTime || obs.updatedTime)}</b></td>
      </tr>
      <tr>
        <td class="label">Closure Verification Comments</td>
        <td class="val" colspan="3">${obs.closureComments || 'Observation verified, documented, and closed in accordance with applicable project HSE requirements.'}</td>
      </tr>
      ${closureSigBase64 ? `
      <tr>
        <td class="label" style="vertical-align: middle;">Digital Signature</td>
        <td class="val" colspan="3">
          <img src="${closureSigBase64}" style="max-height: 48px; object-fit: contain;" alt="Closure Signature" />
        </td>
      </tr>` : ''}
    </table>
  </div>

  <!-- 5. Complete Audit Trail History -->
  ${resolvedHistory && resolvedHistory.length > 0 ? `
  <div class="section-card">
    <div class="section-header">5 | Action History &amp; Audit Trail</div>
    <table class="history-table">
      <thead>
        <tr>
          <th style="width: 17%;">Action</th>
          <th style="width: 20%;">Performed By</th>
          <th style="width: 18%;">Date &amp; Time</th>
          <th style="width: 45%;">Remarks / Details &amp; Attachments</th>
        </tr>
      </thead>
      <tbody>
        ${resolvedHistory.map((log) => `
        <tr>
          <td style="vertical-align: top;"><b>${log.actionType}</b></td>
          <td style="vertical-align: top;">${log.performedByUserName || 'System'}<br /><span style="color: #64748b; font-size: 9.5px;">(${log.performedByUserRole || '-'})</span></td>
          <td style="vertical-align: top;">${this.formatDateTime(log.timestamp)}</td>
          <td style="vertical-align: top;">
            ${log.previousContractor && log.newContractor ? `<div style="color: #6366f1; font-weight: 600; font-size: 10px; margin-bottom: 3px;">Contractor: ${log.previousContractor} &rarr; ${log.newContractor}</div>` : ''}
            ${log.remarks ? `<div>${log.remarks}</div>` : '<span style="color: #94a3b8; font-style: italic;">No remarks</span>'}
            ${log.resolvedLogPhotos && log.resolvedLogPhotos.length > 0 ? `
            <div style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed #cbd5e1;">
              <div style="font-size: 9.5px; font-weight: 700; color: #475569; margin-bottom: 3px;">Attached Photos (${log.resolvedLogPhotos.length}):</div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${log.resolvedLogPhotos.map((src) => `
                  <img src="${src}" style="width: 65px; height: 65px; object-fit: cover; border-radius: 4px; border: 1px solid #cbd5e1;" alt="Log Attachment" />
                `).join('')}
              </div>
            </div>` : ''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <div class="footer-note">
    Confidential document generated by BEAM Safety Management System. Retain this record in accordance with the project HSE compliance filing process.
  </div>
</body>
</html>`;
  }
}
