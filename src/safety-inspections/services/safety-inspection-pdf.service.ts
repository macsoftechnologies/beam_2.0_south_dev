import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import puppeteer from 'puppeteer';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SafetyInspection } from '../entities/safety-inspection.entity';
import { SafetyInspectionItem } from '../entities/safety-inspection-item.entity';
import { Observation } from '../../observations/entities/observation.entity';

const STANDARD_CATEGORIES = [
  '1. Access / Exit',
  '2. Barriers / Signage / Shielding',
  '3. Housekeeping / Waste',
  '4. Noise / Dust / Fumes / Health Hazards',
  '5. Storage & Handling',
  '6. Electrical Hazards',
  '7. Working at Heights',
  '8. Lifting / Rigging',
  '9. Hot Works',
  '10. Mobile Elevating Work Equipment',
  '11. Lighting',
  '12. Documentation & Procedures',
  '13. Scaffold / Alloy Towers',
  '14. Slip / Trip Hazards',
  '15. PPE',
  '16. Tools & Machinery',
  '17. Environmental Hazards',
  '18. Emergency Equipment',
  '19. Excavation / Trenches',
  '20. Other',
];

@Injectable()
export class SafetyInspectionPdfService {
  private readonly logger = new Logger(SafetyInspectionPdfService.name);

  constructor(
    @InjectRepository(Observation)
    private readonly obsRepo: Repository<Observation>,
  ) {}

  /**
   * Generates official printable PDF for a Safety Inspection audit report,
   * complete with attached Safety Observation details for each non-compliant point.
   */
  async generateInspectionPdf(inspection: SafetyInspection): Promise<Buffer> {
    // 1. Fetch full details of any attached Safety Observations
    const enrichedItems = await this.enrichItemsWithObservations(inspection.items || []);

    // 2. Build HTML with rich corporate styling and observation callout cards
    const html = this.buildHtml(inspection, enrichedItems);

    // 3. Render PDF with Puppeteer
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
      this.logger.error('Failed to generate Safety Inspection PDF with Puppeteer:', err);
      throw err;
    } finally {
      await browser.close();
    }
  }

  /**
   * Fetch matching observation records for any item issues
   */
  private async enrichItemsWithObservations(items: SafetyInspectionItem[]): Promise<any[]> {
    const result: any[] = [];

    for (const item of items) {
      const rawIssues = Array.isArray(item.issues) ? item.issues : [];
      const enrichedIssues: any[] = [];

      for (const iss of rawIssues) {
        let obsDetails: Observation | null = null;
        const obsId = iss?.observationId || (typeof iss?.id === 'number' ? iss.id : (!isNaN(Number(iss?.id)) ? Number(iss.id) : null));
        const obsNum = iss?.observationNumber || (typeof iss?.id === 'string' ? iss.id : null) || (typeof iss?.text === 'string' && iss.text.startsWith('SO-') ? iss.text.split(' ')[0].replace(':', '') : null);

        if (obsId) {
          obsDetails = await this.obsRepo.findOne({ where: { id: obsId } }).catch(() => null);
        }

        if (!obsDetails && obsNum) {
          const cleanNum = String(obsNum).trim();
          obsDetails = await this.obsRepo.findOne({
            where: [
              { observationNumber: cleanNum },
              { observationNumber: Like(`%${cleanNum}%`) },
            ],
          }).catch(() => null);
        }

        enrichedIssues.push({
          ...iss,
          details: obsDetails || null,
        });
      }

      result.push({
        ...item,
        enrichedIssues,
      });
    }

    return result;
  }

  private getBase64Image(filePath: string): string {
    try {
      if (existsSync(filePath)) {
        const fileBuffer = readFileSync(filePath);
        const ext = filePath.split('.').pop()?.toLowerCase();
        let mime = 'image/png';
        if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
        else if (ext === 'svg') mime = 'image/svg+xml';
        return `data:${mime};base64,${fileBuffer.toString('base64')}`;
      }
    } catch {
      // ignore
    }
    return '';
  }

  private resolveImageSrc(imgUrl: string): string {
    if (!imgUrl) return '';
    if (imgUrl.startsWith('data:') || imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
      return imgUrl;
    }
    const cleanUrl = imgUrl.startsWith('/') ? imgUrl.substring(1) : imgUrl;
    const diskPath = join(process.cwd(), cleanUrl);
    if (existsSync(diskPath)) {
      return this.getBase64Image(diskPath);
    }
    return `http://localhost:5200/${cleanUrl}`;
  }

  private formatDate(dateVal: any): string {
    if (!dateVal) return '-';
    try {
      const d = new Date(dateVal);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return String(dateVal);
    }
  }

  private buildHtml(inspection: SafetyInspection, items: any[]): string {
    const projectLogoPath = join(process.cwd(), 'src', 'images', 'logos', 'Logo.jpeg');
    const nneLogoPath = join(process.cwd(), 'src', 'images', 'logos', 'nne_logo.png');

    const projectLogoBase64 = this.getBase64Image(projectLogoPath);
    const nneLogoBase64 = this.getBase64Image(nneLogoPath);

    const inspectionRef = inspection.inspectionNumber || `SI-${inspection.id}`;
    const dateFormatted = this.formatDate(inspection.inspectionDate || inspection.createdTime);

    // Summary counters
    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;
    let naCount = 0;

    items.forEach((it) => {
      const st = String(it.status || 'na').toLowerCase();
      if (st === 'green') greenCount++;
      else if (st === 'yellow') yellowCount++;
      else if (st === 'red') redCount++;
      else naCount++;
    });

    const passedScore = inspection.score !== undefined ? `${inspection.score}%` : (items.length > 0 ? `${Math.round((greenCount / (items.length - naCount || 1)) * 100)}%` : '100%');

    const renderItemCard = (item: any, index: number) => {
      const catName = item.categoryName || STANDARD_CATEGORIES[index] || `Category ${index + 1}`;
      const status = String(item.status || 'na').toLowerCase();

      let badgeBg = '#64748b';
      let badgeLabel = 'NOT APPLICABLE';

      if (status === 'green') {
        badgeBg = '#16a34a';
        badgeLabel = 'PASSED';
      } else if (status === 'yellow') {
        badgeBg = '#d97706';
        badgeLabel = 'WARNING / ISSUE';
      } else if (status === 'red') {
        badgeBg = '#dc2626';
        badgeLabel = 'CRITICAL ACTION NEEDED';
      }

      // Photos
      const photos = Array.isArray(item.photos) ? item.photos : [];
      let photosHtml = '';
      if (photos.length > 0) {
        const photoTags = photos
          .map((p) => {
            const src = this.resolveImageSrc(p);
            return src ? `<img src="${src}" class="item-photo" alt="Photo" />` : '';
          })
          .filter(Boolean)
          .join('');

        if (photoTags) {
          photosHtml = `
            <div class="item-photos-wrap">
              <div class="photos-label">Visual Evidence:</div>
              <div class="photos-grid">${photoTags}</div>
            </div>
          `;
        }
      }

      // Attached Observations
      let issuesHtml = '';
      const issues = Array.isArray(item.enrichedIssues) ? item.enrichedIssues : [];
      if (issues.length > 0) {
        const issueCards = issues.map((iss: any) => {
          const obs = iss.details;
          const obsNum = obs?.observationNumber || iss.observationNumber || iss.id || 'Observation';
          const subcat = obs?.subcategory || obs?.subject || iss.text || 'Safety Issue';
          const desc = obs?.description || 'No detailed description provided.';
          const risk = obs?.riskLevel || (iss.type === 'red' ? 'HIGH' : 'MEDIUM');
          const contractor = obs?.assignedContractorName || 'Not Assigned';
          const immAction = obs?.immediateActionTaken || 'None recorded';
          const obsStatus = obs?.status || 'OPEN';

          let obsPhotosHtml = '';
          const obsPhotos = Array.isArray(obs?.photos) ? obs.photos : (typeof obs?.photos === 'string' ? JSON.parse(obs.photos || '[]') : []);
          if (obsPhotos.length > 0) {
            const pTags = obsPhotos.map((p: string) => {
              const src = this.resolveImageSrc(p);
              return src ? `<img src="${src}" class="obs-photo" alt="Obs Photo" />` : '';
            }).filter(Boolean).join('');

            if (pTags) {
              obsPhotosHtml = `<div class="obs-photos-grid">${pTags}</div>`;
            }
          }

          return `
            <div class="obs-callout-card">
              <div class="obs-header">
                <div class="obs-ref-badge">
                  <span class="obs-dot ${risk.toLowerCase()}"></span>
                  <b>Attached Safety Observation: ${obsNum}</b>
                </div>
                <div class="obs-badges">
                  <span class="obs-pill risk-${risk.toLowerCase()}">Risk: ${risk}</span>
                  <span class="obs-pill status">${obsStatus}</span>
                </div>
              </div>

              <div class="obs-body">
                <div class="obs-row">
                  <span class="obs-lbl">Issue / Subcategory:</span>
                  <span class="obs-val font-semibold">${subcat}</span>
                </div>
                <div class="obs-row">
                  <span class="obs-lbl">Finding Details:</span>
                  <span class="obs-val">${desc}</span>
                </div>
                <div class="obs-row-split">
                  <div class="obs-col">
                    <span class="obs-lbl">Contractor Responsible:</span>
                    <span class="obs-val text-blue">${contractor}</span>
                  </div>
                  <div class="obs-col">
                    <span class="obs-lbl">Immediate Action:</span>
                    <span class="obs-val">${immAction}</span>
                  </div>
                </div>
                ${obsPhotosHtml}
              </div>
            </div>
          `;
        }).join('');

        issuesHtml = `<div class="item-observations-container">${issueCards}</div>`;
      }

      return `
        <div class="checklist-item-card" style="border-left: 3.5px solid ${badgeBg};">
          <div class="item-header-row">
            <div class="item-title">${catName}</div>
            <div class="item-badge" style="background-color: ${badgeBg};">${badgeLabel}</div>
          </div>

          ${item.comment ? `
            <div class="item-comment-box">
              <div class="comment-text">"${item.comment}"</div>
              ${item.commentAuthor ? `<div class="comment-author">— Logged by ${item.commentAuthor}${item.commentDate ? `, ${this.formatDate(item.commentDate)}` : ''}</div>` : ''}
            </div>
          ` : ''}

          ${photosHtml}
          ${issuesHtml}
        </div>
      `;
    };

    // Split items evenly between Page 1 and Page 2
    const page1Items = items.slice(0, 10);
    const page2Items = items.slice(10);

    const page1ItemsHtml = page1Items.map((it, idx) => renderItemCard(it, idx)).join('');
    const page2ItemsHtml = page2Items.map((it, idx) => renderItemCard(it, idx + 10)).join('');

    const renderHeader = (pageNumber: number, pageTitle: string) => `
      <div class="header-container">
        <div class="logo-row">
          <div class="logo-left">
            ${projectLogoBase64 ? `<img src="${projectLogoBase64}" style="height: 34px; object-fit: contain;" alt="Novo Nordisk" />` : '<div style="font-weight: 800; font-size: 14px;">Novo Nordisk</div>'}
          </div>
          <div class="logo-center">
            <span style="font-size: 8.5px; font-weight: 700; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">SITE HSE QUALITY & SAFETY AUDIT</span>
          </div>
          <div class="logo-right">
            ${nneLogoBase64 ? `<img src="${nneLogoBase64}" style="height: 28px; object-fit: contain;" alt="NNE" />` : '<div style="font-size: 20px; font-weight: 900; color: #002868;">nne®</div>'}
          </div>
        </div>

        <div class="title-banner">
          <div class="banner-text">
            <h1 class="banner-title">${pageTitle}</h1>
            <div class="banner-subtitle">Official HSE Inspection &bull; Ref: <b>${inspectionRef}</b> &bull; Date: <b>${dateFormatted}</b></div>
          </div>
          <div class="banner-badge">Page ${pageNumber} of 2</div>
        </div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Safety Inspection - ${inspectionRef}</title>
        <style>
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #ffffff;
            color: #0f172a;
            font-size: 9px;
            line-height: 1.3;
          }

          .pdf-page {
            padding: 2px 4px;
            page-break-after: always;
            break-after: always;
          }
          .pdf-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }

          /* ── Header Logos & Title Banner ── */
          .header-container {
            margin-bottom: 8px;
          }
          .logo-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1.5px solid #0f172a;
            padding-bottom: 4px;
            margin-bottom: 6px;
          }
          .logo-left {
            display: flex;
            align-items: center;
          }
          .logo-center {
            text-align: center;
          }
          .logo-right {
            display: flex;
            align-items: center;
            justify-content: flex-end;
          }
          .title-banner {
            background-color: #111c38;
            color: #ffffff;
            padding: 7px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 3px;
          }
          .banner-title {
            margin: 0;
            font-size: 13.5px;
            font-weight: 800;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .banner-subtitle {
            font-size: 8.5px;
            color: #cbd5e1;
            margin-top: 2px;
          }
          .banner-badge {
            font-size: 8.5px;
            color: #93c5fd;
            font-weight: 700;
            border: 1px solid #3b82f6;
            padding: 2px 6px;
            border-radius: 3px;
          }

          /* ── General Info Box ── */
          .info-box {
            border: 1px solid #cbd5e1;
            border-radius: 3px;
            margin-bottom: 8px;
            overflow: hidden;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
          }
          .info-table td {
            padding: 4px 6px;
            border: 1px solid #e2e8f0;
            font-size: 9px;
            vertical-align: middle;
          }
          .info-lbl {
            background-color: #f8fafc;
            color: #475569;
            font-weight: 700;
            width: 16%;
          }
          .info-val {
            color: #0f172a;
            font-weight: 600;
          }

          /* ── Summary KPI Bar ── */
          .kpi-bar {
            display: flex;
            gap: 6px;
            margin-bottom: 8px;
          }
          .kpi-chip {
            flex: 1;
            padding: 4px 6px;
            border-radius: 3px;
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            text-align: center;
          }
          .kpi-num {
            font-size: 12px;
            font-weight: 800;
            display: block;
            line-height: 1.1;
          }
          .kpi-lbl {
            font-size: 7.5px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 700;
          }

          /* ── Section Divider ── */
          .section-heading {
            font-size: 10px;
            font-weight: 800;
            color: #ffffff;
            background: #111c38;
            padding: 4px 8px;
            margin: 6px 0 6px 0;
            border-radius: 2px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            letter-spacing: 0.3px;
          }

          /* ── Checklist Items ── */
          .checklist-item-card {
            border: 1px solid #cbd5e1;
            border-radius: 3px;
            padding: 5px 7px;
            margin-bottom: 4.5px;
            background: #ffffff;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .item-header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .item-title {
            font-size: 9.5px;
            font-weight: 700;
            color: #0f172a;
          }
          .item-badge {
            font-size: 7.5px;
            font-weight: 800;
            color: #ffffff;
            padding: 1.5px 6px;
            border-radius: 2px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .item-comment-box {
            background: #f8fafc;
            border: 1px dashed #cbd5e1;
            padding: 3px 6px;
            border-radius: 2px;
            margin-top: 3px;
          }
          .comment-text {
            font-size: 8.5px;
            color: #334155;
            font-style: italic;
          }
          .comment-author {
            font-size: 7.5px;
            color: #64748b;
            margin-top: 1px;
            text-align: right;
          }

          /* ── Photos Grid ── */
          .item-photos-wrap {
            margin-top: 4px;
          }
          .photos-label {
            font-size: 8px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            margin-bottom: 2px;
          }
          .photos-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
          }
          .item-photo {
            width: 55px;
            height: 40px;
            object-fit: cover;
            border-radius: 2px;
            border: 1px solid #cbd5e1;
          }

          /* ── Attached Safety Observation Callout ── */
          .item-observations-container {
            margin-top: 4px;
          }
          .obs-callout-card {
            background: #fffbeb;
            border: 1px solid #fde68a;
            border-left: 3px solid #d97706;
            border-radius: 3px;
            padding: 5px 7px;
            margin-top: 3px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .obs-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #fef3c7;
            padding-bottom: 3px;
            margin-bottom: 3px;
          }
          .obs-ref-badge {
            font-size: 8.5px;
            color: #92400e;
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .obs-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            display: inline-block;
          }
          .obs-dot.high, .obs-dot.red { background: #dc2626; }
          .obs-dot.medium, .obs-dot.orange { background: #ea580c; }
          .obs-dot.low, .obs-dot.green { background: #16a34a; }

          .obs-badges {
            display: flex;
            gap: 3px;
          }
          .obs-pill {
            font-size: 7px;
            font-weight: 700;
            padding: 1px 4px;
            border-radius: 2px;
            text-transform: uppercase;
          }
          .obs-pill.risk-high { background: #fee2e2; color: #b91c1c; }
          .obs-pill.risk-medium { background: #ffedd5; color: #c2410c; }
          .obs-pill.risk-low { background: #dcfce7; color: #15803d; }
          .obs-pill.status { background: #e0f2fe; color: #0369a1; }

          .obs-body {
            font-size: 8px;
            color: #334155;
          }
          .obs-row {
            margin-bottom: 2px;
          }
          .obs-row-split {
            display: flex;
            gap: 8px;
            margin-top: 2px;
          }
          .obs-col {
            flex: 1;
          }
          .obs-lbl {
            font-weight: 700;
            color: #78350f;
            margin-right: 3px;
          }
          .obs-val {
            color: #1e293b;
          }
          .font-semibold { font-weight: 600; }
          .text-blue { color: #0284c7; font-weight: 600; }
          .obs-photos-grid {
            display: flex;
            gap: 4px;
            margin-top: 4px;
          }
          .obs-photo {
            width: 46px;
            height: 34px;
            object-fit: cover;
            border-radius: 2px;
            border: 1px solid #fde68a;
          }

          /* ── Verification Footer ── */
          .verification-box {
            border: 1px solid #cbd5e1;
            border-radius: 3px;
            padding: 6px 8px;
            margin-top: 6px;
            background: #f8fafc;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .verif-title {
            font-size: 9px;
            font-weight: 800;
            color: #111c38;
            text-transform: uppercase;
            margin-bottom: 3px;
          }
          .verif-grid {
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #475569;
          }
          .page-footer-note {
            text-align: center;
            font-size: 7.5px;
            color: #94a3b8;
            margin-top: 6px;
            border-top: 1px solid #e2e8f0;
            padding-top: 3px;
          }
        </style>
      </head>
      <body>

        <!-- ==========================================
             PAGE 1: METADATA, KPI, & CHECKPOINTS 1 – 10
        =========================================== -->
        <div class="pdf-page">
          ${renderHeader(1, 'Site Safety Inspection Report')}

          <!-- General Info Table -->
          <div class="info-box">
            <table class="info-table">
              <tr>
                <td class="info-lbl">Inspection Ref:</td>
                <td class="info-val" style="color: #0284c7;">${inspectionRef}</td>
                <td class="info-lbl">Audit Date:</td>
                <td class="info-val">${dateFormatted}</td>
              </tr>
              <tr>
                <td class="info-lbl">Project Name:</td>
                <td class="info-val">${inspection.projectName || 'M3SOUTH'}</td>
                <td class="info-lbl">Project No:</td>
                <td class="info-val">${inspection.projectNo || '063205-010'}</td>
              </tr>
              <tr>
                <td class="info-lbl">Building:</td>
                <td class="info-val">${inspection.buildingName || 'Main Building'}</td>
                <td class="info-lbl">Floor / Level:</td>
                <td class="info-val">${inspection.floorLevel || '-'}</td>
              </tr>
              <tr>
                <td class="info-lbl">Location Details:</td>
                <td class="info-val" colspan="3">
                  ${inspection.specificLocation || (Array.isArray(inspection.selectedRooms) ? inspection.selectedRooms.join(', ') : 'Site Wide')}
                </td>
              </tr>
              <tr>
                <td class="info-lbl">Lead Auditor:</td>
                <td class="info-val">${inspection.createdByUserName || 'Superadmin'} (${inspection.createdByRole || 'Admin'})</td>
                <td class="info-lbl">Audit Status:</td>
                <td class="info-val" style="color: ${inspection.status === 'CLOSED' ? '#16a34a' : '#0284c7'}; font-weight: 800;">
                  ${inspection.status || 'IN_PROGRESS'}
                </td>
              </tr>
            </table>
          </div>

          <!-- KPI Metrics Summary Bar -->
          <div class="kpi-bar">
            <div class="kpi-chip">
              <span class="kpi-num" style="color: #16a34a;">${greenCount}</span>
              <span class="kpi-lbl">Passed (Green)</span>
            </div>
            <div class="kpi-chip">
              <span class="kpi-num" style="color: #d97706;">${yellowCount}</span>
              <span class="kpi-lbl">Warnings (Yellow)</span>
            </div>
            <div class="kpi-chip">
              <span class="kpi-num" style="color: #dc2626;">${redCount}</span>
              <span class="kpi-lbl">Critical (Red)</span>
            </div>
            <div class="kpi-chip">
              <span class="kpi-num" style="color: #64748b;">${naCount}</span>
              <span class="kpi-lbl">Not Applicable</span>
            </div>
            <div class="kpi-chip" style="background: #eff6ff; border-color: #bfdbfe;">
              <span class="kpi-num" style="color: #0284c7;">${passedScore}</span>
              <span class="kpi-lbl">Compliance Score</span>
            </div>
          </div>

          <!-- Section Title -->
          <div class="section-heading">
            <span>PART 1 | INSPECTION CHECKPOINTS (1 TO 10)</span>
            <span style="font-size: 8px; font-weight: 600; color: #cbd5e1;">Categories 1 – 10</span>
          </div>

          <!-- Checkpoints 1 - 10 -->
          ${page1ItemsHtml}

          <div class="page-footer-note">
            Novo Nordisk &bull; Site HSE Management System &bull; Safety Inspection Record ${inspectionRef} &bull; Page 1 of 2
          </div>
        </div>

        <!-- ==========================================
             PAGE 2: CHECKPOINTS 11 – 20 & SIGN-OFF
        =========================================== -->
        <div class="pdf-page">
          ${renderHeader(2, 'Site Safety Inspection Report (Part 2)')}

          <!-- Section Title -->
          <div class="section-heading">
            <span>PART 2 | INSPECTION CHECKPOINTS (11 TO 20) & OBSERVATIONS</span>
            <span style="font-size: 8px; font-weight: 600; color: #cbd5e1;">Categories 11 – 20</span>
          </div>

          <!-- Checkpoints 11 - 20 -->
          ${page2ItemsHtml}

          <!-- Verification Sign-off Box -->
          <div class="verification-box">
            <div class="verif-title">Audit Verification & Sign-Off</div>
            <div class="verif-grid">
              <div><b>Lead Auditor:</b> ${inspection.createdByUserName || 'Safety Officer'} (NNE)</div>
              <div><b>Record Generation Time:</b> ${new Date().toLocaleString('en-GB')}</div>
              <div><b>Status:</b> ${inspection.status === 'CLOSED' ? 'CLOSED & VERIFIED' : 'INSPECTION RECORD'}</div>
            </div>
          </div>

          <div class="page-footer-note">
            Novo Nordisk &bull; Site HSE Management System &bull; Safety Inspection Record ${inspectionRef} &bull; Page 2 of 2
          </div>
        </div>

      </body>
      </html>
    `;
  }
}
