import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

@Injectable()
export class IncidentPdfService {
  private readonly logger = new Logger(IncidentPdfService.name);

  async generate3In1Pdf(details: any): Promise<Buffer> {
    const html = this.buildFullHtml(details);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      // Wait for DOM content and network requests (external images) to complete loading
      await page.setContent(html, { waitUntil: ['domcontentloaded', 'load'], timeout: 30000 });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
      });
      return Buffer.from(pdfBuffer);
    } catch (err) {
      this.logger.error('Failed to generate backend PDF with Puppeteer:', err);
      throw err;
    } finally {
      await browser.close();
    }
  }

  private buildFullHtml(details: any): string {
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
    const contractor = inc.contractorsInvolved || inc.contractor || 'Give Steel / ATEA';
    const category = (inc.categories && inc.categories.length > 0) ? inc.categories.join(', ') : (inc.category || 'Near Miss');
    const reportedBy = headsUp.submittedBy || inc.reportedBy || 'Ahmed Al-Rashidi';
    const description = headsUp.descriptionWhatHappened || inc.description || 'Incident description recorded.';
    const consequence = headsUp.descriptionConsequence || 'Potential safety risk identified.';

    const isCat = (catName: string) => category.toLowerCase().includes(catName.toLowerCase());

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
            return `https://api.beam.safesiteworks.com/development/m3south/uploads/incidents/${sigFilename}`;
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

    // Helper for immediate actions
    const getImmediateActions = (): any[] => {
      let list: any[] = [];
      if (headsUp.immediateActions && Array.isArray(headsUp.immediateActions) && headsUp.immediateActions.length > 0) {
        list = headsUp.immediateActions;
      } else if (initial.immediateActions && Array.isArray(initial.immediateActions) && initial.immediateActions.length > 0) {
        list = initial.immediateActions;
      } else if (actions && Array.isArray(actions) && actions.length > 0) {
        list = actions.filter((a: any) => a.actionType === 'IMMEDIATE' || !a.actionType);
      }
      return list;
    };
    const immActionsList = getImmediateActions();

    // Form 1 Signatures
    const headsUpSig = headsUp.signature || headsUp.submittedBySignature || headsUp.submitted_by_signature || inc.signature || null;
    const headsUpSubmitter = headsUp.submittedBy || headsUp.submitted_by || reportedBy;
    const headsUpApprSig = headsUp.approverSignature || headsUp.approver_signature || null;
    const headsUpApprName = headsUp.approvedBy || headsUp.approved_by || 'Site HSE Manager';

    const renderImmediateActionsRows = () => {
      if (immActionsList.length > 0) {
        return immActionsList.map(a => `
          <tr>
            <td>${a.action || a.actionItem || 'Cordon off area and perform immediate risk control.'}</td>
            <td>${a.responsible || a.owner || headsUpSubmitter}</td>
            <td>${a.timeImplemented || a.targetDate || 'Immediate'}</td>
          </tr>
        `).join('');
      }
      return `
        <tr>
          <td>${inc.correctiveAction || 'Cordon off area and perform immediate risk control.'}</td>
          <td>${headsUpSubmitter}</td>
          <td>Immediate</td>
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

    // Accident Categories helper
    const isAccidentCategory = (catName: string) => {
      const accCats = initial.accidentCategories || [];
      if (Array.isArray(accCats) && accCats.some((c: string) => c.toLowerCase().includes(catName.toLowerCase()))) return true;
      return isCat(catName);
    };

    // Injury Types helper
    const isInjuryType = (type: string) => {
      const types = initial.injuryTypes || [];
      if (Array.isArray(types) && types.some((t: string) => t.toLowerCase().includes(type.toLowerCase()))) return true;
      return false;
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

    const renderNneHeader = (pageTitle: string, formNo: number) => `
      <div class="nne-hdr">
        <div class="nne-hdr-row" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px;">
          <div class="nne-hdr-left">
            ${projectLogoBase64 ? `<img src="${projectLogoBase64}" style="height: 38px; object-fit: contain;" alt="Project Logo" />` : `<div style="border: 1.5px solid #0f172a; padding: 4px 8px; font-weight: 700; font-size: 11px;">[Project_Logo]</div>`}
          </div>
          <div class="nne-hdr-right" style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
            ${nneLogoBase64 ? `<img src="${nneLogoBase64}" style="height: 38px; object-fit: contain;" alt="NNE Logo" />` : `<div style="font-size: 22px; font-weight: 900; color: #002868;">nne®</div>`}
          </div>
        </div>

        <h1 class="form-h1">${pageTitle}</h1>
        <div class="form-meta">
          Project: <strong>${project}</strong> &nbsp;|&nbsp;
          Project ID: <strong>${project}-001</strong> &nbsp;|&nbsp;
          System No: <strong>${caseNo}</strong>
        </div>

        <table class="nne-tbl">
          <thead>
            <tr class="dark-hdr">
              <th colspan="4">Document Approval</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="lbl-cell" style="width: 25%;">NNE Author</td>
              <td style="width: 25%;">${reportedBy}</td>
              <td class="lbl-cell" style="width: 25%;">NNE Peer Reviewer</td>
              <td style="width: 25%;">HSE Lead Manager</td>
            </tr>
            <tr>
              <td class="lbl-cell">Customer Approver</td>
              <td>Site Director</td>
              <td class="lbl-cell">Customer Approver</td>
              <td>Project Representative</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    const renderNneFooter = (pageNo: number) => `
      <div class="nne-ftr">
        <div>Template: TPL-138/NNE Project Template - Word/ 1.0 &nbsp;|&nbsp; Doc No: DPT-00049</div>
        <div>© NNE A/S &nbsp;|&nbsp; Page ${pageNo} of 3</div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${caseNo} - Export PDF</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10px;
            color: #0f172a;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .form-page {
            page-break-after: always;
            padding: 4px;
          }
          .form-page:last-child {
            page-break-after: avoid;
          }
          .nne-hdr { margin-bottom: 12px; }
          .form-h1 { font-size: 20px; font-weight: 800; color: #0f172a; margin: 8px 0 4px; }
          .form-meta { font-size: 10px; color: #475569; margin-bottom: 10px; }

          .nne-tbl {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5px;
            margin-bottom: 12px;
          }
          .nne-tbl th, .nne-tbl td {
            border: 1px solid #cbd5e1;
            padding: 5px 7px;
            vertical-align: top;
          }
          .dark-hdr th {
            background: #0f172a;
            color: #ffffff;
            font-weight: 700;
            text-align: left;
            font-size: 10px;
          }
          .lbl-cell {
            background: #f1f5f9;
            font-weight: 700;
            color: #0f172a;
          }

          .chk-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            margin-right: 10px;
            margin-bottom: 3px;
            font-size: 9.5px;
          }
          .chk-box {
            display: inline-block;
            width: 11px;
            height: 11px;
            border: 1.5px solid #0f172a;
            border-radius: 2px;
            text-align: center;
            line-height: 9px;
            font-size: 9px;
            font-weight: 900;
          }
          .chk-box.checked {
            background: #0f172a;
            color: #ffffff;
          }
          .chk-label { color: #0f172a; }

          .nne-ftr {
            margin-top: 16px;
            padding-top: 6px;
            border-top: 1px solid #cbd5e1;
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #64748b;
          }
        </style>
      </head>
      <body>

        <!-- =================================================================
             FORM 1: HEADS-UP NOTIFICATION (2 HOURS TEMPLATE)
        ================================================================== -->
        <div class="form-page">
          ${renderNneHeader('Heads-up Notification', 1)}

          <div style="font-size: 9.5px; font-style: italic; color: #475569; margin-bottom: 10px;">
            The following template must be completed within 2 hours of the incident occurrence.
          </div>

          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">1 Project Details</div>
          <table class="nne-tbl">
            <tbody>
              <tr>
                <td class="lbl-cell" style="width: 22%;">Project Name:</td>
                <td colspan="3"><strong>${project}</strong></td>
              </tr>
              <tr>
                <td class="lbl-cell">Title / Case number:</td>
                <td colspan="3"><strong>${caseNo} — ${title}</strong></td>
              </tr>
              <tr>
                <td class="lbl-cell">Date (YYYY-MM-DD)</td>
                <td>${date}</td>
                <td class="lbl-cell">Time (24hr):</td>
                <td>${time}</td>
              </tr>
              <tr>
                <td class="lbl-cell">Location/Building:</td>
                <td>${building}</td>
                <td class="lbl-cell">Floor/Level:</td>
                <td>${inc.floorLevel || 'Ground Floor'}</td>
              </tr>
              <tr>
                <td class="lbl-cell">Specific location:</td>
                <td colspan="3">${specificLoc}</td>
              </tr>
              <tr>
                <td class="lbl-cell">Contractor(s) involved:</td>
                <td colspan="3">${contractor}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">2 Incident Records</div>
          <table class="nne-tbl">
            <thead>
              <tr class="dark-hdr">
                <th colspan="4">Incident Category</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${renderCheckbox(isCat('Near Miss'), 'Near Miss')}</td>
                <td>${renderCheckbox(isCat('No Treatment'), 'No Treatment Injury')}</td>
                <td>${renderCheckbox(isCat('First Aid'), 'First Aid Injury')}</td>
                <td>${renderCheckbox(isCat('Medical Treatment'), 'Medical Treatment Injury')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isCat('Restricted Work'), 'Restricted Work Injury')}</td>
                <td>${renderCheckbox(isCat('Loss Time'), 'Loss Time Injury')}</td>
                <td>${renderCheckbox(isCat('Permanent Disability'), 'Permanent Disability')}</td>
                <td>${renderCheckbox(isCat('Fatality'), 'Fatality')}</td>
              </tr>
              <tr>
                <td colspan="2">${renderCheckbox(isCat('Occupational Illness'), 'Occupational Illness')}</td>
                <td>${renderCheckbox(isCat('Environmental'), 'Environmental Incident')}</td>
                <td>${renderCheckbox(isCat('Property Damage'), 'Property Damage')}</td>
              </tr>
            </tbody>
          </table>

          <table class="nne-tbl">
            <thead>
              <tr class="dark-hdr">
                <th>Incident Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">Description of what happened?</div>
                  <div style="line-height: 1.4;">${description}</div>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">What is the consequence of this incident?</div>
                  <div style="line-height: 1.4;">${consequence}</div>
                </td>
              </tr>
            </tbody>
          </table>

          <table class="nne-tbl">
            <thead>
              <tr class="dark-hdr">
                <th>Immediate Action Taken</th>
                <th>Responsible</th>
                <th>Time Implemented</th>
              </tr>
            </thead>
            <tbody>
              ${renderImmediateActionsRows()}
            </tbody>
          </table>

          <!-- Step 1 Signature -->
          <table class="nne-tbl">
            <tbody>
              <tr>
                <td class="lbl-cell" style="width: 25%;">Submitted By:</td>
                <td style="width: 25%;"><strong>${headsUpSubmitter}</strong></td>
                <td class="lbl-cell" style="width: 15%;">Signature:</td>
                <td style="width: 35%;">${renderSignature(headsUpSig, headsUpSubmitter)}</td>
              </tr>
              ${headsUpApprSig ? `
              <tr>
                <td class="lbl-cell">Approved By:</td>
                <td><strong>${headsUpApprName}</strong></td>
                <td class="lbl-cell">Approver Sig:</td>
                <td>${renderSignature(headsUpApprSig, headsUpApprName)}</td>
              </tr>
              ` : ''}
            </tbody>
          </table>

          ${renderNneFooter(1)}
        </div>

        <!-- =================================================================
             FORM 2: INITIAL INCIDENT REPORT (24 HOURS TEMPLATE)
        ================================================================== -->
        <div class="form-page">
          ${renderNneHeader('Initial Incident Report', 2)}

          <div style="font-size: 9.5px; font-style: italic; color: #475569; margin-bottom: 10px;">
            The following template must be completed as soon as possible and within 24 hours of the incident occurrence.
          </div>

          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">1 Project Details</div>
          <table class="nne-tbl">
            <tbody>
              <tr>
                <td class="lbl-cell" style="width: 22%;">Project Name:</td>
                <td colspan="3"><strong>${project}</strong></td>
              </tr>
              <tr>
                <td class="lbl-cell">Title / Case number:</td>
                <td colspan="3"><strong>${caseNo} — ${title}</strong></td>
              </tr>
              <tr>
                <td class="lbl-cell">Date (YYYY-MM-DD)</td>
                <td>${date}</td>
                <td class="lbl-cell">Time (24hr):</td>
                <td>${time}</td>
              </tr>
              <tr>
                <td class="lbl-cell">Location/Building:</td>
                <td>${building}</td>
                <td class="lbl-cell">Floor/Level:</td>
                <td>${inc.floorLevel || 'Ground Floor'}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">2 Injured / Ill Person Details</div>
          <table class="nne-tbl">
            <tbody>
              <tr>
                <td class="lbl-cell" style="width: 25%;">Injured Person Name:</td>
                <td style="width: 25%;"><strong>${injuredName}</strong></td>
                <td class="lbl-cell" style="width: 25%;">Company / Employer:</td>
                <td style="width: 25%;">${injuredCompany}</td>
              </tr>
              <tr>
                <td class="lbl-cell">Manager / Supervisor:</td>
                <td>${injuredSupervisor}</td>
                <td class="lbl-cell">Job Title / Trade:</td>
                <td>${injuredJobTitle}</td>
              </tr>
              <tr>
                <td class="lbl-cell">Length of Service:</td>
                <td>${lengthOfService}</td>
                <td class="lbl-cell">Experience in Role:</td>
                <td>${experienceInRole}</td>
              </tr>
              <tr>
                <td class="lbl-cell">Worker Activity at Time:</td>
                <td colspan="3">${workerActivity}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">3 Severity Assessment</div>
          <table class="nne-tbl">
            <tbody>
              <tr>
                <td class="lbl-cell" style="width: 30%;">Actual severity level & rating</td>
                <td style="font-weight: 700; color: #2563eb;">Level ${inc.actualSeverity || 1} — Minor / Near Miss</td>
              </tr>
              <tr>
                <td class="lbl-cell">Potential severity level & rating</td>
                <td style="font-weight: 700; color: #dc2626;">Level ${inc.potentialSeverity || 4} — High Potential (HiPo)</td>
              </tr>
            </tbody>
          </table>

          <!-- Photos from Incident Location -->
          <div style="border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; margin-bottom: 12px; background: #fff;">
            <div style="font-size: 9.5px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">Photos from the incident location (minimum of 2 photos)</div>
            ${renderPhotosGrid()}
          </div>

          <table class="nne-tbl">
            <thead>
              <tr class="dark-hdr">
                <th colspan="3">Type of accident categories</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${renderCheckbox(isAccidentCategory('Contact') || isAccidentCategory('Object'), 'Contact with object/equipment')}</td>
                <td>${renderCheckbox(isAccidentCategory('Electrical') || isAccidentCategory('Electrocution'), 'Electrocution – electrical injury')}</td>
                <td>${renderCheckbox(isAccidentCategory('Defective') || isAccidentCategory('Equipment'), 'Defective tools/equipment')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isAccidentCategory('Manual') || isAccidentCategory('Handling'), 'Manual Handling')}</td>
                <td>${renderCheckbox(isAccidentCategory('Hazardous') || isAccidentCategory('Substance') || isAccidentCategory('Chemical'), 'Hazardous Substance')}</td>
                <td>${renderCheckbox(isAccidentCategory('Slip') || isAccidentCategory('Trip') || isAccidentCategory('Fall'), 'Slip / Trip / Fall')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isAccidentCategory('Tool'), 'Tool accidents')}</td>
                <td>${renderCheckbox(isAccidentCategory('Scaffold'), 'Scaffolding / Height accidents')}</td>
                <td>${renderCheckbox(isAccidentCategory('Confined') || isAccidentCategory('Asphyxiation'), 'Asphyxiation – Confined space')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isAccidentCategory('Cut') || isAccidentCategory('Laceration') || isAccidentCategory('Personal'), 'Cuts / Lacerations')}</td>
                <td>${renderCheckbox(isAccidentCategory('Vehicle') || isAccidentCategory('Machinery'), 'Accidents involving machinery/vehicle')}</td>
                <td>${renderCheckbox(isAccidentCategory('Near Miss'), 'Near Miss Event')}</td>
              </tr>
            </tbody>
          </table>

          <table class="nne-tbl">
            <thead>
              <tr class="dark-hdr">
                <th colspan="4">Indicate Type(s) of Injury</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${renderCheckbox(isInjuryType('Cut') || isInjuryType('Laceration'), 'Cut / Laceration')}</td>
                <td>${renderCheckbox(isInjuryType('Burn'), 'Burn / Scald')}</td>
                <td>${renderCheckbox(isInjuryType('Fracture') || isInjuryType('Break'), 'Fracture / Bone injury')}</td>
                <td>${renderCheckbox(isInjuryType('Sprain') || isInjuryType('Strain'), 'Sprain / Strain')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isInjuryType('Bruise') || isInjuryType('Contusion'), 'Bruise / Contusion')}</td>
                <td>${renderCheckbox(isInjuryType('Eye'), 'Eye Injury')}</td>
                <td>${renderCheckbox(isInjuryType('Puncture'), 'Puncture Wound')}</td>
                <td>${renderCheckbox(isInjuryType('Amputation'), 'Amputation')}</td>
              </tr>
              <tr>
                <td>${renderCheckbox(isInjuryType('Internal'), 'Internal Injury')}</td>
                <td>${renderCheckbox(isInjuryType('Foreign'), 'Foreign Body')}</td>
                <td>${renderCheckbox(isInjuryType('Illness') || isInjuryType('Occupational'), 'Occupational Illness')}</td>
                <td>${renderCheckbox(!initial.hasInjuryIllness || (Array.isArray(initial.injuryTypes) && initial.injuryTypes.length === 0), 'No Injury / N/A')}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">Injury / Illness Information</div>
          <table class="nne-tbl">
            <tbody>
              <tr>
                <td class="lbl-cell" style="width: 25%;">Nature of Injury:</td>
                <td colspan="3"><strong>${natureOfInjury}</strong></td>
              </tr>
              <tr>
                <td class="lbl-cell" style="width: 25%;">Treatment Provided:</td>
                <td style="width: 25%;">${treatmentPrescribed}</td>
                <td class="lbl-cell" style="width: 25%;">Anticipated Absence:</td>
                <td style="width: 25%;">${anticipatedAbsence}</td>
              </tr>
              <tr>
                <td class="lbl-cell">Medical Classification:</td>
                <td colspan="3"><strong>${medicalTreatmentClass}</strong></td>
              </tr>
            </tbody>
          </table>

          <!-- Body Injured Diagram & Checklist Box -->
          <div style="border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; margin-bottom: 12px;">
            <div style="font-size: 9.5px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">Indicate Parts of the Body Injured (Left or Right side if applicable)</div>
            <div style="display: flex; gap: 14px; align-items: center;">
              <div style="flex: 1;">
                ${renderCheckbox(isBodyPartChecked('Head') || isBodyPartChecked('Cranium'), 'Head / Cranium')}
                ${renderCheckbox(isBodyPartChecked('Shoulder'), 'Shoulder (L/R)')}
                ${renderCheckbox(isBodyPartChecked('Arm') || isBodyPartChecked('Elbow'), 'Arm / Elbow')}
                ${renderCheckbox(isBodyPartChecked('Hand') || isBodyPartChecked('Finger') || isBodyPartChecked('Wrist'), 'Hand / Finger / Wrist')}
                ${renderCheckbox(isBodyPartChecked('Leg') || isBodyPartChecked('Knee'), 'Leg / Knee')}
                ${renderCheckbox(isBodyPartChecked('Foot') || isBodyPartChecked('Ankle'), 'Foot / Ankle')}
                ${renderCheckbox(selectedBodyPartsList.length === 0 || isBodyPartChecked('No Injury'), 'No Injury / Near Miss')}
                ${selectedBodyPartsList.length > 0 ? `
                  <div style="margin-top: 4px; font-size: 9px; font-weight: 700; color: #0f172a;">
                    Selected Parts: <span style="font-weight: 600; color: #2563eb;">${selectedBodyPartsList.join(', ')}</span>
                  </div>
                ` : ''}
              </div>
              <div style="width: 120px; height: 95px; border: 1px dashed #94a3b8; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8fafc;">
                <svg width="45" height="70" viewBox="0 0 100 150" fill="none" stroke="#475569" stroke-width="2">
                  <circle cx="50" cy="20" r="12" />
                  <line x1="50" y1="32" x2="50" y2="85" />
                  <line x1="50" y1="45" x2="20" y2="70" />
                  <line x1="50" y1="45" x2="80" y2="70" />
                  <line x1="50" y1="85" x2="30" y2="135" />
                  <line x1="50" y1="85" x2="70" y2="135" />
                </svg>
                <span style="font-size: 7.5px; color: #64748b; margin-top: 2px;">Body Outline Map</span>
              </div>
            </div>
          </div>

          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">Initial Root Cause Assessment</div>
          <table class="nne-tbl">
            <tbody>
              <tr>
                <td class="lbl-cell" style="width: 25%;">Initial Root Cause:</td>
                <td colspan="3"><strong>${initialRootCause}</strong></td>
              </tr>
              <tr>
                <td class="lbl-cell" style="width: 25%;">Environmental Conditions:</td>
                <td style="width: 25%;">${environmentalConditions}</td>
                <td class="lbl-cell" style="width: 25%;">Equipment Involved:</td>
                <td style="width: 25%;">${equipmentInvolved}</td>
              </tr>
            </tbody>
          </table>

          <!-- Step 2 Signature -->
          <table class="nne-tbl">
            <tbody>
              <tr>
                <td class="lbl-cell" style="width: 25%;">Submitted By:</td>
                <td style="width: 25%;"><strong>${initialSubmitter}</strong></td>
                <td class="lbl-cell" style="width: 15%;">Signature:</td>
                <td style="width: 35%;">${renderSignature(initialSig, initialSubmitter)}</td>
              </tr>
              ${initialApprSig ? `
              <tr>
                <td class="lbl-cell">Approved By:</td>
                <td><strong>${initialApprName}</strong></td>
                <td class="lbl-cell">Approver Sig:</td>
                <td>${renderSignature(initialApprSig, initialApprName)}</td>
              </tr>
              ` : ''}
            </tbody>
          </table>

          ${renderNneFooter(2)}
        </div>

        <!-- =================================================================
             FORM 3: INCIDENT INVESTIGATION REPORT (FINAL 7 DAYS TEMPLATE)
        ================================================================== -->
        <div class="form-page">
          ${renderNneHeader('Final Incident Investigation Report', 3)}

          <div style="font-size: 9.5px; font-style: italic; color: #475569; margin-bottom: 10px;">
            The following template must be completed as soon as possible and within 7 days of the incident occurrence.
          </div>

          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">1 Project Details</div>
          <table class="nne-tbl">
            <tbody>
              <tr>
                <td class="lbl-cell" style="width: 22%;">Project Name:</td>
                <td colspan="3"><strong>${project}</strong></td>
              </tr>
              <tr>
                <td class="lbl-cell">Title / Case number:</td>
                <td colspan="3"><strong>${caseNo} — ${title}</strong></td>
              </tr>
            </tbody>
          </table>

          <!-- Initial & Investigation Report Photos -->
          <div style="border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; margin-bottom: 12px; background: #fff;">
            <div style="font-size: 9.5px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">Photos from the Incident Location & Evidence</div>
            ${renderPhotosGrid()}
          </div>

          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">3 Fishbone Analysis - Cause and Effect</div>
          <div style="border: 1.5px solid #0f172a; padding: 8px; border-radius: 4px; margin-bottom: 12px; background: #fafafa;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px;">
              <div style="border: 1px solid #cbd5e1; background: #fff; padding: 5px; border-radius: 4px;">
                <div style="font-weight: 700; font-size: 9px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">People</div>
                <div style="font-size: 8px; color: #475569; margin-top: 3px;">• Not following procedures</div>
                <div style="font-size: 8px; color: #475569;">• Pedestrian alertness</div>
              </div>
              <div style="border: 1px solid #cbd5e1; background: #fff; padding: 5px; border-radius: 4px;">
                <div style="font-weight: 700; font-size: 9px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">Machine / Equipment</div>
                <div style="font-size: 8px; color: #475569; margin-top: 3px;">• Vehicle brake check</div>
                <div style="font-size: 8px; color: #475569;">• Speed bump placement</div>
              </div>
              <div style="border: 1px solid #cbd5e1; background: #fff; padding: 5px; border-radius: 4px;">
                <div style="font-weight: 700; font-size: 9px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">Method / Procedure</div>
                <div style="font-size: 8px; color: #475569; margin-top: 3px;">• Crossing speed limit rule</div>
                <div style="font-size: 8px; color: #475569;">• Traffic management plan</div>
              </div>
            </div>

            <!-- Spine arrow -->
            <div style="position: relative; height: 30px; margin: 6px 0; display: flex; align-items: center;">
              <div style="flex: 1; height: 3px; background: #0f172a; position: relative;">
                <div style="position: absolute; right: -6px; top: -5px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #0f172a;"></div>
              </div>
              <div style="border: 1.5px solid #0f172a; background: #fff; padding: 4px 8px; border-radius: 4px; font-weight: 800; font-size: 9px; color: #0f172a; margin-left: 10px;">
                EFFECT: ${title}
              </div>
            </div>
          </div>

          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">4 Problem Statement & 5 Whys Root Cause Analysis</div>
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

          <div style="font-size: 10px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">Corrective Actions</div>
          <table class="nne-tbl">
            <thead>
              <tr class="dark-hdr">
                <th>Corrective Action</th>
                <th>Responsible</th>
                <th>Target Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${inc.correctiveAction || 'Install speed bumps and erect pedestrian crossing warning signage.'}</td>
                <td>${investigatorName}</td>
                <td>${date}</td>
                <td style="font-weight: 700; color: #16a34a;">Implemented</td>
              </tr>
            </tbody>
          </table>

          <!-- Step 3 Signatures -->
          <table class="nne-tbl">
            <thead>
              <tr class="dark-hdr">
                <th colspan="4">Signatures & Distribution</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="lbl-cell" style="width: 25%;">HSE Investigator Name:</td>
                <td style="width: 25%;"><strong>${investigatorName}</strong></td>
                <td class="lbl-cell" style="width: 15%;">Signature:</td>
                <td style="width: 35%;">${renderSignature(investigatorSig, investigatorName)}</td>
              </tr>
              <tr>
                <td class="lbl-cell">Reviewer Name:</td>
                <td><strong>${reviewerName}</strong></td>
                <td class="lbl-cell">Signature:</td>
                <td>${renderSignature(reviewerSig, reviewerName)}</td>
              </tr>
            </tbody>
          </table>

          ${renderNneFooter(3)}
        </div>

      </body>
      </html>
    `;
  }
}
