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
        margin: { top: '10mm', bottom: '10mm', left: '14mm', right: '14mm' },
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
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Europe/Copenhagen',
      });
    } catch {
      return String(dateVal);
    }
  }

  private formatDateTime(dateVal: any): string {
    if (!dateVal) return '-';
    try {
      const d = new Date(dateVal);
      const datePart = d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Europe/Copenhagen',
      });
      const timePart = d.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Copenhagen',
      });
      return `${datePart} ${timePart}`;
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

    const renderTableRows = (bucketItems: { item: any; globalIndex: number }[]) => {
      return bucketItems.map(({ item, globalIndex }) => {
        const catFull = item.categoryName || STANDARD_CATEGORIES[globalIndex] || `Category ${globalIndex + 1}`;
        const dotIndex = catFull.indexOf('.');
        const numPart = dotIndex !== -1 ? catFull.substring(0, dotIndex).trim() : String(globalIndex + 1);
        const namePart = dotIndex !== -1 ? catFull.substring(dotIndex + 1).trim() : catFull;

        const status = String(item.status || 'na').toLowerCase();
        let badgeLabel = 'NOT APPLICABLE';
        if (status === 'green') badgeLabel = 'PASSED';
        else if (status === 'yellow') badgeLabel = 'WARNING / ISSUE';
        else if (status === 'red') badgeLabel = 'CRITICAL';

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

        const hasComment = Boolean(item.comment);
        const hasPhotos = photos.length > 0;
        const issues = Array.isArray(item.enrichedIssues) ? item.enrichedIssues : [];
        const hasIssues = issues.length > 0;
        const hasDetails = hasComment || hasPhotos || hasIssues;

        let issuesHtml = '';
        if (hasIssues) {
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
              <table class="sc-grid obs-attached-table">
                <tr style="background: #111c38; color: #ffffff;">
                  <td colspan="4" style="padding: 4px 7px; font-weight: 800; font-size: 8px; letter-spacing: 0.3px;">
                    ATTACHED OBSERVATION: ${obsNum} &nbsp;&bull;&nbsp; RISK: ${risk} &nbsp;&bull;&nbsp; STATUS: ${obsStatus}
                  </td>
                </tr>
                <tr>
                  <td class="lbl" style="width: 18%;">Issue / Topic:</td>
                  <td class="val" style="width: 32%; font-weight: 600;">${subcat}</td>
                  <td class="lbl" style="width: 18%;">Contractor:</td>
                  <td class="val" style="width: 32%; color: #0284c7; font-weight: 600;">${contractor}</td>
                </tr>
                <tr>
                  <td class="lbl">Findings:</td>
                  <td class="val" colspan="3">${desc}</td>
                </tr>
                ${immAction && immAction !== 'None recorded' ? `
                <tr>
                  <td class="lbl">Immediate Action:</td>
                  <td class="val" colspan="3">${immAction}</td>
                </tr>
                ` : ''}
                ${obsPhotosHtml ? `
                <tr>
                  <td class="lbl">Visual Evidence:</td>
                  <td class="val" colspan="3">${obsPhotosHtml}</td>
                </tr>
                ` : ''}
              </table>
            `;
          }).join('');

          issuesHtml = `<div class="item-observations-container">${issueCards}</div>`;
        }

        let photosHtml = '';
        if (hasPhotos) {
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

        let detailsHtml = '';
        if (hasDetails) {
          detailsHtml = `
            <tr class="chk-details-row status-${status}">
              <td class="chk-num-cell" style="border-top: none; background: #ffffff;"></td>
              <td colspan="2" class="chk-details-cell" style="border-top: none; padding: 4px 10px 8px 10px; background: #fafbfc;">
                ${item.comment ? `
                  <div class="chk-comment-wrap">
                    <span class="comment-label">Comment:</span>
                    <span class="comment-text">"${item.comment}"</span>
                    ${item.commentAuthor ? `<div class="comment-author">— Logged by ${item.commentAuthor}${item.commentDate ? `, ${this.formatDate(item.commentDate)}` : ''}</div>` : ''}
                  </div>
                ` : ''}

                ${photosHtml}

                ${issuesHtml}
              </td>
            </tr>
          `;
        }

        return `
          <tr class="chk-row status-${status} ${hasDetails ? 'has-details' : ''}">
            <td class="chk-num-cell">${numPart}</td>
            <td class="chk-name-cell">
              <span class="chk-name-text">${namePart}</span>
            </td>
            <td class="chk-status-cell">
              <span class="chk-status-badge ${status}">${badgeLabel}</span>
            </td>
          </tr>
          ${detailsHtml}
        `;
      }).join('');
    };

    // Calculate item weights to distribute them cleanly across pages without congestion
    const estimateItemHeight = (it: any): number => {
      let h = 34; // base row height
      if (it.comment) h += 28;
      const ph = Array.isArray(it.photos) ? it.photos : (typeof it.photos === 'string' && it.photos ? [it.photos] : []);
      if (ph.length > 0) h += 55;
      const issues = Array.isArray(it.enrichedIssues) ? it.enrichedIssues : [];
      if (issues.length > 0) {
        issues.forEach(() => {
          h += 90;
        });
      }
      return h;
    };

    // Spacious page budgets: max 10 items on page 1, max 10 items on subsequent pages
    const PAGE_1_CAPACITY = 380;
    const SUBSEQUENT_PAGE_CAPACITY = 650;
    const MAX_ITEMS_PAGE_1 = 10;
    const MAX_ITEMS_SUBSEQUENT = 10;

    const pageBuckets: { pageNumber: number; items: { item: any; globalIndex: number }[]; startIndex: number; endIndex: number }[] = [];
    let curBucket: { item: any; globalIndex: number }[] = [];
    let curHeight = 0;
    let curCap = PAGE_1_CAPACITY;
    let maxItemsCurPage = MAX_ITEMS_PAGE_1;
    let startIdx = 1;

    items.forEach((it, idx) => {
      const h = estimateItemHeight(it);
      const exceedsCapacity = curBucket.length >= 4 && (curHeight + h > curCap);
      const exceedsMaxCount = curBucket.length >= maxItemsCurPage;

      if (exceedsCapacity || exceedsMaxCount) {
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
        maxItemsCurPage = MAX_ITEMS_SUBSEQUENT;
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

    const renderHeader = (pageNumber: number, pageTitle: string) => `
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
      const sectionSubtitle = `Categories ${bucket.startIndex} &ndash; ${bucket.endIndex}`;

      return `
        <div class="pdf-page">
          ${renderHeader(pNum, pTitle)}

          ${isFirstPage ? `
            <!-- General Info Section -->
            <div class="section-hdr">GENERAL INFORMATION</div>
            <table class="sc-grid" style="margin-bottom: 6px;">
              <tr>
                <td class="lbl" style="width: 14%;">Inspection Ref:</td>
                <td class="val" style="width: 36%; font-weight: 700; color: #0284c7;">${inspectionRef}</td>
                <td class="lbl" style="width: 14%;">Audit Date:</td>
                <td class="val" style="width: 36%;">${dateFormatted}</td>
              </tr>
              <tr>
                <td class="lbl">Project Name:</td>
                <td class="val">${inspection.projectName || 'M3SOUTH'}</td>
                <td class="lbl">Project No:</td>
                <td class="val">${inspection.projectNo || '063205-010'}</td>
              </tr>
              <tr>
                <td class="lbl">Building:</td>
                <td class="val">${inspection.buildingName || 'Main Building'}</td>
                <td class="lbl">Floor / Level:</td>
                <td class="val">${inspection.floorLevel || '-'}</td>
              </tr>
              <tr>
                <td class="lbl">Location Details:</td>
                <td class="val" colspan="3">${inspection.specificLocation || (Array.isArray(inspection.selectedRooms) ? inspection.selectedRooms.join(', ') : 'Site Wide')}</td>
              </tr>
              <tr>
                <td class="lbl">Lead Auditor:</td>
                <td class="val">${inspection.createdByUserName || 'Superadmin'} (${inspection.createdByRole || 'Admin'})</td>
                <td class="lbl">Audit Status:</td>
                <td class="val">
                  <span class="chk-status-badge ${String(inspection.status || '').toLowerCase() === 'closed' ? 'green' : 'yellow'}">
                    ${inspection.status || 'IN_PROGRESS'}
                  </span>
                </td>
              </tr>
            </table>

            <!-- KPI Summary Grid (4 Metrics matching Spot Check grid) -->
            <table class="sc-grid" style="margin-top: 4px; margin-bottom: 8px; text-align: center;">
              <tr>
                <td style="width: 25%; background: #f0fdf4; border: 1px solid #bbf7d0; border-top: 3px solid #16a34a; padding: 5px 4px;">
                  <div style="font-size: 15px; font-weight: 800; color: #16a34a; line-height: 1.1;">${greenCount}</div>
                  <div style="font-size: 7.5px; font-weight: 700; color: #166534; text-transform: uppercase; margin-top: 2px; letter-spacing: 0.3px;">Passed (Green)</div>
                </td>
                <td style="width: 25%; background: #fefce8; border: 1px solid #fef08a; border-top: 3px solid #ca8a04; padding: 5px 4px;">
                  <div style="font-size: 15px; font-weight: 800; color: #ca8a04; line-height: 1.1;">${yellowCount}</div>
                  <div style="font-size: 7.5px; font-weight: 700; color: #854d0e; text-transform: uppercase; margin-top: 2px; letter-spacing: 0.3px;">Warnings (Yellow)</div>
                </td>
                <td style="width: 25%; background: #fef2f2; border: 1px solid #fecaca; border-top: 3px solid #dc2626; padding: 5px 4px;">
                  <div style="font-size: 15px; font-weight: 800; color: #dc2626; line-height: 1.1;">${redCount}</div>
                  <div style="font-size: 7.5px; font-weight: 700; color: #991b1b; text-transform: uppercase; margin-top: 2px; letter-spacing: 0.3px;">Critical (Red)</div>
                </td>
                <td style="width: 25%; background: #f8fafc; border: 1px solid #e2e8f0; border-top: 3px solid #64748b; padding: 5px 4px;">
                  <div style="font-size: 15px; font-weight: 800; color: #475569; line-height: 1.1;">${naCount}</div>
                  <div style="font-size: 7.5px; font-weight: 700; color: #475569; text-transform: uppercase; margin-top: 2px; letter-spacing: 0.3px;">Not Applicable</div>
                </td>
              </tr>
            </table>
          ` : ''}

          <!-- Section Heading -->
          <div class="section-hdr" style="display: flex; justify-content: space-between; align-items: center;">
            <span>PART ${pNum} | INSPECTION CHECKPOINTS (${bucket.startIndex} TO ${bucket.endIndex})</span>
            <span style="font-size: 8px; font-weight: 600; color: #cbd5e1; text-transform: none;">${sectionSubtitle}</span>
          </div>
          <div class="instructions-text">Verify each safety checkpoint category for statutory and site HSE compliance. Record findings, attached observations, and photographic evidence.</div>

          <!-- Unified Checkpoints Table -->
          <table class="sc-grid chk-table">
            <thead>
              <tr class="chk-table-hdr">
                <th style="width: 32px; text-align: center;">#</th>
                <th style="text-align: left;">Safety Inspection Category / Checkpoint</th>
                <th style="width: 140px; text-align: center;">Compliance Status</th>
              </tr>
            </thead>
            <tbody>
              ${renderTableRows(bucket.items)}
            </tbody>
          </table>

          ${isLastPage ? `
            ${inspection.history && inspection.history.length > 0 ? `
              <!-- Action History & Audit Trail -->
              <div class="section-hdr" style="margin-top: 10px;">ACTION HISTORY &amp; AUDIT TRAIL</div>
              <table class="sc-grid" style="margin-top: 0; margin-bottom: 6px;">
                <thead>
                  <tr class="chk-table-hdr">
                    <th style="width: 18%;">Action</th>
                    <th style="width: 25%;">Performed By</th>
                    <th style="width: 22%;">Date &amp; Time (Denmark)</th>
                    <th style="width: 35%;">Remarks / Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${inspection.history.map((log: any) => `
                  <tr>
                    <td style="vertical-align: top; font-weight: 700;">${log.actionType}</td>
                    <td style="vertical-align: top;">
                      <b>${log.performedByUserName || 'Safety Officer'}</b><br />
                      <span style="color: #64748b; font-size: 8px;">(${log.performedByUserRole || '-'})</span>
                    </td>
                    <td style="vertical-align: top; color: #475569;">${this.formatDateTime(log.timestamp)}</td>
                    <td style="vertical-align: top;">
                      ${log.remarks ? `<div>${log.remarks}</div>` : '<span style="color: #94a3b8; font-style: italic;">No remarks</span>'}
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>
            ` : ''}

            <!-- Verification Sign-off Table -->
            <div class="section-hdr" style="margin-top: 10px;">AUDIT VERIFICATION &amp; SIGN-OFF</div>
            <table class="sc-grid" style="margin-top: 0; margin-bottom: 6px;">
              <tr>
                <td class="lbl" style="width: 18%;">Lead Auditor:</td>
                <td class="val" style="width: 32%; font-weight: 700;">${inspection.createdByUserName || 'Safety Officer'} (${inspection.createdByRole || 'NNE'})</td>
                <td class="lbl" style="width: 18%;">Inspection Ref:</td>
                <td class="val" style="width: 32%; font-weight: 700; color: #0284c7;">${inspectionRef}</td>
              </tr>
              <tr>
                <td class="lbl">Audit Status:</td>
                <td class="val">
                  <span class="chk-status-badge ${String(inspection.status || '').toLowerCase() === 'closed' ? 'green' : 'yellow'}">
                    ${inspection.status === 'CLOSED' ? 'CLOSED &amp; VERIFIED' : (inspection.status || 'IN_PROGRESS')}
                  </span>
                </td>
                <td class="lbl">Report Date:</td>
                <td class="val">${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Copenhagen' })}</td>
              </tr>
              <tr>
                <td class="lbl">Project / Location:</td>
                <td class="val" colspan="3">${inspection.projectName || 'M3SOUTH'} &bull; ${inspection.buildingName || 'Main Building'} ${inspection.floorLevel ? `&bull; ${inspection.floorLevel}` : ''}</td>
              </tr>
              <tr>
                <td class="lbl">Auditor Verification:</td>
                <td class="val" colspan="3" style="height: 48px; vertical-align: bottom;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-end; padding-top: 12px;">
                    <div style="font-family: 'Brush Script MT', cursive, sans-serif; font-size: 18px; color: #111c38; font-weight: 700;">
                      ${inspection.createdByUserName || 'Lead Auditor'}
                    </div>
                    <div style="border-top: 1px dashed #94a3b8; width: 220px; text-align: center; font-size: 8px; color: #64748b; padding-top: 3px;">
                      Authorized Lead Auditor Signature &amp; Stamp
                    </div>
                  </div>
                </td>
              </tr>
            </table>
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
            font-size: 9px;
            color: #0f172a;
            margin: 0;
            padding: 0;
            background: #ffffff;
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
            margin-bottom: 5px;
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

          /* ── Checkpoints Unified Table ── */
          table.chk-table {
            margin-bottom: 6px;
          }
          .chk-table-hdr th {
            background: #111c38;
            color: #ffffff;
            font-size: 8.5px;
            font-weight: 700;
            padding: 5px 7px;
            letter-spacing: 0.3px;
          }
          .chk-row td {
            background: #ffffff;
            padding: 5.5px 7px;
          }
          .chk-row.has-details td {
            border-bottom: 1px dashed #e2e8f0;
          }
          .chk-num-cell {
            text-align: center;
            font-weight: 700;
            color: #475569;
            background: #f8fafc !important;
            width: 32px;
          }
          .chk-name-cell {
            font-size: 9px;
            color: #0f172a;
          }
          .chk-name-text {
            font-weight: 700;
          }
          .chk-status-cell {
            text-align: center;
            width: 140px;
          }

          .chk-comment-wrap {
            padding: 3.5px 8px;
            background: #fffbeb;
            border-left: 3px solid #d97706;
            border-radius: 2px;
            margin: 3px 0;
            font-size: 8px;
          }
          .comment-label {
            font-weight: 700;
            color: #92400e;
            margin-right: 4px;
          }
          .comment-text {
            color: #1e293b;
            font-style: italic;
          }
          .comment-author {
            font-size: 7px;
            color: #78350f;
            margin-top: 1.5px;
            text-align: right;
            font-weight: 600;
          }

          /* ── Status Badges ── */
          .chk-status-badge {
            display: inline-block;
            font-size: 7.5px;
            font-weight: 800;
            padding: 2.5px 9px;
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
          .chk-status-badge.na {
            background: #f1f5f9;
            color: #64748b;
            border: 1px solid #cbd5e1;
          }

          /* ── Visual Evidence ── */
          .item-photos-wrap {
            margin-top: 4px;
            margin-bottom: 4px;
          }
          .photos-label {
            font-size: 7px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            margin-bottom: 2px;
            letter-spacing: 0.3px;
          }
          .photos-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }
          .item-photo {
            width: 54px;
            height: 38px;
            object-fit: cover;
            border-radius: 2px;
            border: 1px solid #cbd5e1;
          }

          /* ── Attached Observations ── */
          .item-observations-container {
            margin-top: 4px;
            margin-bottom: 2px;
          }
          table.obs-attached-table {
            margin-top: 3px;
            margin-bottom: 3px;
            background: #ffffff;
          }
          .obs-photos-grid {
            display: flex;
            gap: 5px;
            margin-top: 3px;
          }
          .obs-photo {
            width: 48px;
            height: 36px;
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
