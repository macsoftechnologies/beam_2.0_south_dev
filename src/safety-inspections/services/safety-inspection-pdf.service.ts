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
   * Generates official printable PDF for a Safety Inspection audit report,
   * complete with attached Safety Observation details for each non-compliant point.
   */
  async generateInspectionPdf(inspection: SafetyInspection): Promise<Buffer> {
    // 1. Fetch full details of any attached Safety Observations
    const enrichedItems = await this.enrichItemsWithObservations(inspection.items || []);

    // 2. Build HTML with rich corporate styling and observation callout cards
    const html = this.buildHtml(inspection, enrichedItems);

    // 3. Render PDF with Puppeteer
    const browser = await this.launchBrowser();

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
      let rawIssues: any[] = [];
      if (Array.isArray(item.issues)) {
        rawIssues = item.issues;
      } else if (typeof item.issues === 'string') {
        try {
          const parsed = JSON.parse(item.issues);
          rawIssues = Array.isArray(parsed) ? parsed : [item.issues];
        } catch {
          rawIssues = [];
        }
      }

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
    if (imgUrl.startsWith('data:')) {
      return imgUrl;
    }
    const cleanUrl = imgUrl.startsWith('/') ? imgUrl.substring(1) : imgUrl;
    const filename = cleanUrl.split('/').pop() || cleanUrl;

    const candidatePaths = [
      join(process.cwd(), cleanUrl),
      join(process.cwd(), cleanUrl.replace(/^development\/m3south\//, '')),
      join(process.cwd(), 'uploads', filename),
      join(process.cwd(), 'uploads', 'safety-inspections', filename),
      join(process.cwd(), 'uploads', 'observations', filename),
      join(process.cwd(), 'uploads', 'incidents', filename),
    ];

    for (const p of candidatePaths) {
      if (existsSync(p)) {
        return this.getBase64Image(p);
      }
    }

    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
      return imgUrl;
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
      let photos: string[] = [];
      if (Array.isArray(item.photos)) {
        photos = item.photos;
      } else if (typeof item.photos === 'string') {
        try {
          const parsed = JSON.parse(item.photos);
          photos = Array.isArray(parsed) ? parsed : [item.photos];
        } catch {
          photos = item.photos.includes(',') ? item.photos.split(',').map((s: string) => s.trim()) : [item.photos];
        }
      }

      let photosHtml = '';
      if (photos.length > 0) {
        const photoTags = photos
          .map((p) => {
            const src = this.resolveImageSrc(p);
            return src ? `<img src="${src}" class="item-photo" alt="Visual Evidence" />` : '';
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

          let obsPhotos: string[] = [];
          if (Array.isArray(obs?.photos)) {
            obsPhotos = obs.photos;
          } else if (typeof obs?.photos === 'string') {
            try {
              const parsed = JSON.parse(obs.photos);
              obsPhotos = Array.isArray(parsed) ? parsed : [obs.photos];
            } catch {
              obsPhotos = obs.photos.includes(',') ? obs.photos.split(',').map((s: string) => s.trim()) : [obs.photos];
            }
          }

          let obsPhotosHtml = '';
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
        <div class="checklist-item-card" style="border-left: 4px solid ${badgeBg};">
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

    // Calculate item weights to distribute them cleanly across pages without congestion
    const estimateItemHeight = (it: any): number => {
      let h = 38; // base card height
      if (it.comment) h += 32;
      const ph = Array.isArray(it.photos) ? it.photos : (typeof it.photos === 'string' && it.photos ? [it.photos] : []);
      if (ph.length > 0) h += 58;
      const issues = Array.isArray(it.enrichedIssues) ? it.enrichedIssues : [];
      if (issues.length > 0) {
        issues.forEach((iss: any) => {
          h += 105;
          const obsPh = iss.details?.photos || [];
          if ((Array.isArray(obsPh) && obsPh.length > 0) || (typeof obsPh === 'string' && obsPh)) {
            h += 48;
          }
        });
      }
      return h;
    };

    // Page 1 budget: Available height for checklist items is ~460px
    // (Header + General Info Box + KPI Bar takes ~360px out of ~880px printable area)
    // Subsequent pages budget: ~680px for items
    const PAGE_1_CAPACITY = 450;
    const SUBSEQUENT_PAGE_CAPACITY = 680;

    const pageBuckets: { pageNumber: number; items: { item: any; globalIndex: number }[]; startIndex: number; endIndex: number }[] = [];
    let curBucket: { item: any; globalIndex: number }[] = [];
    let curHeight = 0;
    let curCap = PAGE_1_CAPACITY;
    let startIdx = 1;

    items.forEach((it, idx) => {
      const h = estimateItemHeight(it);
      // If adding this item exceeds capacity and we already have at least 4 items on this page, start new page
      if (curBucket.length >= 4 && curHeight + h > curCap) {
        pageBuckets.push({
          pageNumber: pageBuckets.length + 1,
          items: curBucket,
          startIndex: startIdx,
          endIndex: startIdx + curBucket.length - 1,
        });
        startIdx += curBucket.length;
        curBucket = [{ item: it, globalIndex: idx }];
        curHeight = h;
        curCap = SUBSEQUENT_PAGE_CAPACITY;
      } else {
        curBucket.push({ item: it, globalIndex: idx });
        curHeight += h;
      }
    });

    if (curBucket.length > 0) {
      pageBuckets.push({
        pageNumber: pageBuckets.length + 1,
        items: curBucket,
        startIndex: startIdx,
        endIndex: startIdx + curBucket.length - 1,
      });
    }

    const totalPages = pageBuckets.length;

    const renderHeader = (pageNumber: number, pageTitle: string, isPartContinued = false) => `
      <div class="header-container">
        <div class="logo-row">
          <div class="logo-left">
            ${projectLogoBase64 ? `<img src="${projectLogoBase64}" style="height: 36px; object-fit: contain;" alt="Novo Nordisk" />` : '<div style="font-weight: 800; font-size: 15px; color: #002868;">Novo Nordisk</div>'}
          </div>
          <div class="logo-center">
            <span style="font-size: 9px; font-weight: 700; color: #475569; letter-spacing: 0.8px; text-transform: uppercase;">SITE HSE QUALITY & SAFETY AUDIT</span>
          </div>
          <div class="logo-right">
            ${nneLogoBase64 ? `<img src="${nneLogoBase64}" style="height: 30px; object-fit: contain;" alt="NNE" />` : '<div style="font-size: 22px; font-weight: 900; color: #002868;">nne®</div>'}
          </div>
        </div>

        <div class="title-banner">
          <div class="banner-text">
            <h1 class="banner-title">${pageTitle}</h1>
            <div class="banner-subtitle">Official HSE Inspection &bull; Ref: <b>${inspectionRef}</b> &bull; Date: <b>${dateFormatted}</b></div>
          </div>
          <div class="banner-badge">Page ${pageNumber} of ${totalPages}</div>
        </div>
      </div>
    `;

    // Render individual pages
    const pagesHtml = pageBuckets.map((bucket, bIdx) => {
      const isFirstPage = bIdx === 0;
      const isLastPage = bIdx === totalPages - 1;
      const pNum = bucket.pageNumber;
      const pTitle = isFirstPage ? 'Site Safety Inspection Report' : `Site Safety Inspection Report (Part ${pNum})`;
      const sectionSubtitle = `Categories ${bucket.startIndex} – ${bucket.endIndex}`;
      const itemsHtml = bucket.items.map((entry) => renderItemCard(entry.item, entry.globalIndex)).join('');

      return `
        <div class="pdf-page">
          ${renderHeader(pNum, pTitle, !isFirstPage)}

          ${isFirstPage ? `
            <!-- General Info Table -->
            <div class="info-box">
              <table class="info-table">
                <tr>
                  <td class="info-lbl">Inspection Ref:</td>
                  <td class="info-val" style="color: #0284c7; font-weight: 800;">${inspectionRef}</td>
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
                  <td class="info-val">
                    <span class="status-pill status-${(inspection.status || 'IN_PROGRESS').toLowerCase()}">${inspection.status || 'IN_PROGRESS'}</span>
                  </td>
                </tr>
              </table>
            </div>

            <!-- KPI Summary Bar (4 Metrics - Compliance Score Removed) -->
            <div class="kpi-bar">
              <div class="kpi-chip kpi-green">
                <span class="kpi-num">${greenCount}</span>
                <span class="kpi-lbl">Passed (Green)</span>
              </div>
              <div class="kpi-chip kpi-yellow">
                <span class="kpi-num">${yellowCount}</span>
                <span class="kpi-lbl">Warnings (Yellow)</span>
              </div>
              <div class="kpi-chip kpi-red">
                <span class="kpi-num">${redCount}</span>
                <span class="kpi-lbl">Critical (Red)</span>
              </div>
              <div class="kpi-chip kpi-na">
                <span class="kpi-num">${naCount}</span>
                <span class="kpi-lbl">Not Applicable</span>
              </div>
            </div>
          ` : ''}

          <!-- Section Title -->
          <div class="section-heading">
            <span>PART ${pNum} | INSPECTION CHECKPOINTS (${bucket.startIndex} TO ${bucket.endIndex})</span>
            <span class="heading-sub">${sectionSubtitle}</span>
          </div>

          <!-- Checkpoints -->
          <div class="checklist-items-wrap">
            ${itemsHtml}
          </div>

          ${isLastPage ? `
            <!-- Verification Sign-off Box -->
            <div class="verification-box">
              <div class="verif-title">Audit Verification & Sign-Off</div>
              <div class="verif-grid">
                <div class="verif-col">
                  <div class="verif-line"><b>Lead Auditor:</b> ${inspection.createdByUserName || 'Safety Officer'} (${inspection.createdByRole || 'NNE'})</div>
                  <div class="verif-line"><b>Inspection Reference:</b> ${inspectionRef}</div>
                  <div class="verif-line"><b>Audit Status:</b> <span class="verif-badge">${inspection.status === 'CLOSED' ? 'CLOSED & VERIFIED' : (inspection.status || 'INSPECTION RECORD')}</span></div>
                </div>
                <div class="verif-col">
                  <div class="verif-line"><b>Record Generation Time:</b> ${new Date().toLocaleString('en-GB')}</div>
                  <div class="verif-line"><b>Project / Location:</b> ${inspection.projectName || 'M3SOUTH'} &bull; ${inspection.buildingName || 'JE'}</div>
                  <div class="signature-line-wrap">
                    <span class="signature-label">Auditor Verification Signature:</span>
                    <div class="signature-line"></div>
                  </div>
                </div>
              </div>
            </div>
          ` : ''}

          <div class="page-footer-note">
            Novo Nordisk &bull; Site HSE Management System &bull; Safety Inspection Record ${inspectionRef} &bull; Page ${pNum} of ${totalPages}
          </div>
        </div>
      `;
    }).join('');

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
            font-size: 9.5px;
            line-height: 1.35;
          }

          .pdf-page {
            padding: 0;
            page-break-after: always;
            break-after: always;
          }
          .pdf-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }

          /* ── Header Logos & Title Banner ── */
          .header-container {
            margin-bottom: 9px;
          }
          .logo-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #002868;
            padding-bottom: 5px;
            margin-bottom: 7px;
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
            background-color: #002868;
            color: #ffffff;
            padding: 8px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 4px;
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
            padding: 2.5px 8px;
            border-radius: 4px;
            background: rgba(59, 130, 246, 0.15);
          }

          /* ── General Info Box ── */
          .info-box {
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            margin-bottom: 9px;
            overflow: hidden;
            background: #ffffff;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
          }
          .info-table td {
            padding: 5px 8px;
            border: 1px solid #e2e8f0;
            font-size: 9px;
            vertical-align: middle;
          }
          .info-lbl {
            background-color: #f1f5f9;
            color: #334155;
            font-weight: 700;
            width: 17%;
            text-transform: uppercase;
            font-size: 8px;
            letter-spacing: 0.3px;
          }
          .info-val {
            color: #0f172a;
            font-weight: 600;
            font-size: 9px;
          }
          .status-pill {
            display: inline-block;
            padding: 1.5px 7px;
            border-radius: 3px;
            font-weight: 800;
            font-size: 8px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .status-pill.status-closed {
            background-color: #dcfce7;
            color: #15803d;
          }
          .status-pill.status-in_progress, .status-pill.status-open {
            background-color: #e0f2fe;
            color: #0369a1;
          }

          /* ── Summary KPI Bar (Balanced 4-Chip Layout) ── */
          .kpi-bar {
            display: flex;
            gap: 8px;
            margin-bottom: 9px;
          }
          .kpi-chip {
            flex: 1;
            padding: 6px 10px;
            border-radius: 4px;
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            text-align: center;
          }
          .kpi-chip.kpi-green {
            border-color: #bbf7d0;
            background: #f0fdf4;
          }
          .kpi-chip.kpi-green .kpi-num {
            color: #16a34a;
          }
          .kpi-chip.kpi-yellow {
            border-color: #fef08a;
            background: #fefce8;
          }
          .kpi-chip.kpi-yellow .kpi-num {
            color: #d97706;
          }
          .kpi-chip.kpi-red {
            border-color: #fecaca;
            background: #fef2f2;
          }
          .kpi-chip.kpi-red .kpi-num {
            color: #dc2626;
          }
          .kpi-chip.kpi-na {
            border-color: #e2e8f0;
            background: #f8fafc;
          }
          .kpi-chip.kpi-na .kpi-num {
            color: #64748b;
          }
          .kpi-num {
            font-size: 15px;
            font-weight: 800;
            display: block;
            line-height: 1.1;
          }
          .kpi-lbl {
            font-size: 8px;
            color: #475569;
            text-transform: uppercase;
            font-weight: 700;
            margin-top: 2px;
            letter-spacing: 0.3px;
          }

          /* ── Section Divider ── */
          .section-heading {
            font-size: 9.5px;
            font-weight: 800;
            color: #ffffff;
            background: #002868;
            padding: 5px 10px;
            margin: 7px 0 7px 0;
            border-radius: 3px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            letter-spacing: 0.4px;
            text-transform: uppercase;
          }
          .heading-sub {
            font-size: 8px;
            font-weight: 600;
            color: #93c5fd;
            text-transform: none;
            letter-spacing: normal;
          }

          /* ── Checklist Items ── */
          .checklist-items-wrap {
            margin-bottom: 6px;
          }
          .checklist-item-card {
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 7px 10px;
            margin-bottom: 6px;
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
            font-size: 8px;
            font-weight: 800;
            color: #ffffff;
            padding: 2px 7px;
            border-radius: 3px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
          }
          .item-comment-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-left: 2.5px solid #94a3b8;
            padding: 5px 8px;
            border-radius: 3px;
            margin-top: 5px;
          }
          .comment-text {
            font-size: 8.5px;
            color: #334155;
            font-style: italic;
          }
          .comment-author {
            font-size: 7.5px;
            color: #64748b;
            margin-top: 2px;
            text-align: right;
          }

          /* ── Photos Grid ── */
          .item-photos-wrap {
            margin-top: 5px;
          }
          .photos-label {
            font-size: 7.5px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            margin-bottom: 3px;
            letter-spacing: 0.3px;
          }
          .photos-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }
          .item-photo {
            width: 58px;
            height: 42px;
            object-fit: cover;
            border-radius: 3px;
            border: 1px solid #cbd5e1;
          }

          /* ── Attached Safety Observation Callout ── */
          .item-observations-container {
            margin-top: 5px;
          }
          .obs-callout-card {
            background: #fffbeb;
            border: 1px solid #fde68a;
            border-left: 3.5px solid #d97706;
            border-radius: 4px;
            padding: 6px 9px;
            margin-top: 4px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .obs-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #fef3c7;
            padding-bottom: 4px;
            margin-bottom: 4px;
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
            gap: 4px;
          }
          .obs-pill {
            font-size: 7px;
            font-weight: 700;
            padding: 1.5px 5px;
            border-radius: 2px;
            text-transform: uppercase;
          }
          .obs-pill.risk-high { background: #fee2e2; color: #b91c1c; }
          .obs-pill.risk-medium { background: #ffedd5; color: #c2410c; }
          .obs-pill.risk-low { background: #dcfce7; color: #15803d; }
          .obs-pill.status { background: #e0f2fe; color: #0369a1; }

          .obs-body {
            font-size: 8.5px;
            color: #334155;
          }
          .obs-row {
            margin-bottom: 2.5px;
          }
          .obs-row-split {
            display: flex;
            gap: 12px;
            margin-top: 3px;
          }
          .obs-col {
            flex: 1;
          }
          .obs-lbl {
            font-weight: 700;
            color: #78350f;
            margin-right: 4px;
          }
          .obs-val {
            color: #1e293b;
          }
          .font-semibold { font-weight: 600; }
          .text-blue { color: #0284c7; font-weight: 600; }
          .obs-photos-grid {
            display: flex;
            gap: 5px;
            margin-top: 5px;
          }
          .obs-photo {
            width: 50px;
            height: 38px;
            object-fit: cover;
            border-radius: 3px;
            border: 1px solid #fde68a;
          }

          /* ── Verification Footer ── */
          .verification-box {
            border: 1.5px solid #cbd5e1;
            border-radius: 4px;
            padding: 8px 12px;
            margin-top: 8px;
            background: #f8fafc;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .verif-title {
            font-size: 9.5px;
            font-weight: 800;
            color: #002868;
            text-transform: uppercase;
            margin-bottom: 6px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
            letter-spacing: 0.4px;
          }
          .verif-grid {
            display: flex;
            justify-content: space-between;
            font-size: 8.5px;
            color: #334155;
          }
          .verif-col {
            flex: 1;
          }
          .verif-line {
            margin-bottom: 3px;
          }
          .verif-badge {
            display: inline-block;
            background: #dcfce7;
            color: #15803d;
            font-weight: 800;
            padding: 1px 6px;
            border-radius: 2px;
            font-size: 7.5px;
          }
          .signature-line-wrap {
            margin-top: 6px;
          }
          .signature-label {
            font-size: 7.5px;
            color: #64748b;
            display: block;
          }
          .signature-line {
            border-bottom: 1px dashed #94a3b8;
            width: 140px;
            height: 14px;
          }
          .page-footer-note {
            text-align: center;
            font-size: 7.5px;
            color: #94a3b8;
            margin-top: 8px;
            border-top: 1px solid #e2e8f0;
            padding-top: 4px;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
      </html>
    `;
  }
}
