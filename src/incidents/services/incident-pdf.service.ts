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
        const timeVal = h.timestamp ? new Date(h.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '';

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

    // Helper for immediate actions (Stage 1 & Stage 2)
    const getImmediateActions = (): any[] => {
      const list: any[] = [];
      if (headsUp.immediateActions && Array.isArray(headsUp.immediateActions)) {
        list.push(...headsUp.immediateActions);
      }
      if (initial.immediateActions && Array.isArray(initial.immediateActions)) {
        initial.immediateActions.forEach((act: any) => {
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

    const renderImmediateActionsRows = () => {
      if (immActionsList.length > 0) {
        return immActionsList.map(a => {
          const actText = a.action || a.actionItem || a.description || 'Cordon off area and perform immediate risk control.';
          const respText = a.responsible || a.owner || headsUpSubmitter;
          const timeText = a.timeImplemented || a.targetDate || a.date || 'Immediate';
          const historyHtml = renderStatusHistory(a.statusHistory);

          return `
            <tr>
              <td>
                <div style="font-weight: 600; color: #0f172a;">${actText}</div>
                ${historyHtml}
              </td>
              <td>${respText}</td>
              <td>${timeText}</td>
            </tr>
          `;
        }).join('');
      }
      return `
        <tr>
          <td>Cordon off area and perform immediate risk control.</td>
          <td>${headsUpSubmitter}</td>
          <td>Immediate</td>
        </tr>
      `;
    };

    // Helper for corrective actions (Stage 3)
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
        // First priority: items explicitly marked as CORRECTIVE
        actions.filter((a: any) => a.actionType === 'CORRECTIVE').forEach((act: any) => {
          if (!list.some((existing) => (existing.action || existing.correctiveAction) === act.action)) {
            list.push(act);
          }
        });
        // If no explicit CORRECTIVE items found, include all recorded action items from DB
        if (list.length === 0) {
          actions.forEach((act: any) => {
            if (!list.some((existing) => (existing.action || existing.correctiveAction) === act.action)) {
              list.push(act);
            }
          });
        }
      }
      return list;
    };
    const correctiveActionsList = getCorrectiveActions();

    const renderCorrectiveActionsRows = () => {
      if (correctiveActionsList.length > 0) {
        return correctiveActionsList.map(a => {
          const actText = a.action || a.correctiveAction || a.description || 'Action item recorded.';
          const respText = a.responsible || a.assignedTo || a.owner || investigatorName;
          const targetDateText = a.targetDate || a.date || date;
          const statusText = a.status || 'Implemented';
          const statusColor = (statusText.toUpperCase() === 'COMPLETED' || statusText.toUpperCase() === 'IMPLEMENTED') ? '#16a34a' : '#d97706';
          const historyHtml = renderStatusHistory(a.statusHistory);

          return `
            <tr>
              <td>
                <div style="font-weight: 600; color: #0f172a;">${actText}</div>
                ${historyHtml}
              </td>
              <td>${respText}</td>
              <td>${targetDateText}</td>
              <td style="font-weight: 700; color: ${statusColor};">${statusText}</td>
            </tr>
          `;
        }).join('');
      }

      return `
        <tr>
          <td colspan="4" style="text-align: center; color: #64748b; font-style: italic; padding: 10px;">
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
          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 6px;">3 Fishbone Analysis – Cause and Effect</div>
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
      const lessons = inv.lessonsLearned || inv.lessons_learned || inv.lessons || 'Ensure pre-task risk assessments explicitly include pedestrian crossing controls and vehicle speed checks.';
      const prevention = inv.preventionMeasures || inv.prevention || 'Install permanent physical speed calming humps and implement high-visibility crossing warning signage.';

      return `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div style="border: 1px solid #cbd5e1; background: #fff; padding: 6px 10px; border-radius: 4px;">
            <div style="font-size: 8.5px; font-weight: 700; color: #0f172a; margin-bottom: 3px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 2px;">Lessons Learned</div>
            <div style="font-size: 8px; color: #334155; line-height: 1.4;">${lessons}</div>
          </div>
          <div style="border: 1px solid #cbd5e1; background: #fff; padding: 6px 10px; border-radius: 4px;">
            <div style="font-size: 8.5px; font-weight: 700; color: #0f172a; margin-bottom: 3px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 2px;">Recurrence Prevention Measures</div>
            <div style="font-size: 8px; color: #334155; line-height: 1.4;">${prevention}</div>
          </div>
        </div>
      `;
    };

    const renderMandatoryAttachmentsTable = (): string => {
      let att = inv.mandatoryAttachments || inv.mandatory_attachments || inv.attachments || {};
      if (typeof att === 'string') {
        try { att = JSON.parse(att); } catch (e) {}
      }

      const items = [
        { label: "Contractor's Incident Report", checked: !!(att.contractorsIncidentReport || att[0]) },
        { label: "Witness Statement Form", checked: !!(att.witnessStatement || att[1]) },
        { label: "Risk Assessment & Method Statement (RAMS)", checked: !!(att.rams || att[2]) },
        { label: "Training Records", checked: !!(att.trainingRecords || att[5]) },
        { label: "Permit to Work (PTW)", checked: !!(att.permitsToWork || att[4]) },
        { label: "Safe Plan of Action (SPA)", checked: !!(att.safePlanOfAction || att[3]) },
        { label: "Photos from Incident Location", checked: !!(att.photos || resolvedPhotos.length > 0) },
        { label: "Evidence for Actions Taken", checked: !!(att.evidenceForActionsTaken || att[7]) },
        { label: "Waste Disposal Invoice (if applicable)", checked: !!(att.wasteDisposalInvoice || att[8]) },
      ];

      const missingExplain = att.missingExplanation || att.missingAttachmentsExplanation || inv.missingExplain || 'All mandatory attachments collected and uploaded.';

      const rowsHtml = items.map(item => `
        <tr>
          <td style="width: 75%; font-weight: 600;">${item.label}</td>
          <td style="text-align: center;">
            <span style="font-weight: 800; color: ${item.checked ? '#16a34a' : '#dc2626'};">${item.checked ? '✓ Attached' : '✗ Pending / N/A'}</span>
          </td>
        </tr>
      `).join('');

      return `
        <table class="nne-tbl" style="margin-bottom: 6px;">
          <thead>
            <tr class="dark-hdr">
              <th>Mandatory Item</th>
              <th style="width: 25%; text-align: center;">Attachment Status</th>
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
            break-after: always;
            padding: 4px;
          }
          .form-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
          .pdf-section, .pdf-box, .nne-tbl, tr, td, th, .nne-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .sec-title {
            font-size: 11px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 4px;
            page-break-after: avoid !important;
            break-after: avoid !important;
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

          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">1 Project Details</div>
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
          </div>

          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">2 Injured / Ill Person Details</div>
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
          </div>

          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">3 Severity Assessment</div>
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
          </div>

          <!-- Photos from Incident Location -->
          <div class="pdf-box" style="border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; margin-bottom: 12px; background: #fff; page-break-inside: avoid; break-inside: avoid;">
            <div style="font-size: 9.5px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">Photos from the incident location (minimum of 2 photos)</div>
            ${renderPhotosGrid()}
          </div>

          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
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
          </div>

          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
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
          </div>

          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">Injury / Illness Information</div>
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
          </div>

          <!-- Body Injured Diagram & Checklist Box -->
          <div class="pdf-box" style="border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid; background: #fff;">
            <div style="font-size: 9.5px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">Indicate Parts of the Body Injured (Left or Right side if applicable)</div>
            <div style="display: flex; gap: 14px; align-items: flex-start;">
              <div style="flex: 1;">
                ${renderCheckbox(isBodyPartChecked('Head') || isBodyPartChecked('Cranium'), 'Head / Cranium')}
                ${renderCheckbox(isBodyPartChecked('Shoulder'), 'Shoulder (L/R)')}
                ${renderCheckbox(isBodyPartChecked('Arm') || isBodyPartChecked('Elbow'), 'Arm / Elbow')}
                ${renderCheckbox(isBodyPartChecked('Hand') || isBodyPartChecked('Finger') || isBodyPartChecked('Wrist'), 'Hand / Finger / Wrist')}
                ${renderCheckbox(isBodyPartChecked('Leg') || isBodyPartChecked('Knee'), 'Leg / Knee')}
                ${renderCheckbox(isBodyPartChecked('Foot') || isBodyPartChecked('Ankle'), 'Foot / Ankle')}
                ${renderCheckbox(selectedBodyPartsList.length === 0 || isBodyPartChecked('No Injury'), 'No Injury / Near Miss')}
                ${selectedBodyPartsList.length > 0 ? `
                  <div style="margin-top: 6px; font-size: 9px; font-weight: 700; color: #0f172a;">
                    Selected Injured Areas:
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                      ${selectedBodyPartsList.map(p => `
                        <span style="background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-weight: 700; font-size: 8.5px; padding: 2px 6px; border-radius: 12px;">
                          ${p}
                        </span>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
              <div style="display: flex; gap: 12px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; text-align: center;">
                <!-- FRONT VIEW -->
                <div>
                  <div style="font-size: 8px; font-weight: 800; color: #334155; margin-bottom: 3px;">FRONT VIEW</div>
                  <svg width="105" height="195" viewBox="0 0 140 280">
                    <!-- HEAD & FACE -->
                    <circle cx="70" cy="24" r="16" fill="${getBodyPartFill('Head')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="70" cy="24" r="9" fill="${isPartSelected('Facial area') || isPartSelected('Teeth') || isPartSelected('Eye') ? '#dc2626' : '#ffffff'}" stroke="#ffffff" stroke-width="1" />

                    <!-- NECK -->
                    <rect x="61" y="42" width="18" height="9" rx="3" fill="${getBodyPartFill('Neck')}" stroke="#ffffff" stroke-width="2" />

                    <!-- SHOULDERS -->
                    <circle cx="42" cy="59" r="8" fill="${getBodyPartFill('Shoulder', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="98" cy="59" r="8" fill="${getBodyPartFill('Shoulder', 'L')}" stroke="#ffffff" stroke-width="2" />

                    <!-- CHEST -->
                    <rect x="52" y="53" width="36" height="26" rx="4" fill="${getBodyPartFill('Chest')}" stroke="#ffffff" stroke-width="2" />

                    <!-- ABDOMEN -->
                    <rect x="54" y="81" width="32" height="18" rx="3" fill="${getBodyPartFill('Pelvis or abdomen')}" stroke="#ffffff" stroke-width="2" />

                    <!-- HIPS / PELVIS BLOCK -->
                    <rect x="52" y="101" width="36" height="24" rx="4" fill="${getBodyPartFill('Pelvis or abdomen')}" stroke="#ffffff" stroke-width="2" />

                    <!-- ARMS & HANDS -->
                    <rect x="36" y="69" width="12" height="38" rx="5" fill="${getBodyPartFill('Arm, Elbow', 'R')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="92" y="69" width="12" height="38" rx="5" fill="${getBodyPartFill('Arm, Elbow', 'L')}" stroke="#ffffff" stroke-width="2" />

                    <circle cx="36" cy="112" r="5" fill="${isPartSelected('Wrist', 'R') || isPartSelected('Hand', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="104" cy="112" r="5" fill="${isPartSelected('Wrist', 'L') || isPartSelected('Hand', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />

                    <rect x="30" y="119" width="12" height="18" rx="6" fill="${isPartSelected('Hand', 'R') || isPartSelected('Finger(s)', 'R') || isPartSelected('Finger', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <rect x="98" y="119" width="12" height="18" rx="6" fill="${isPartSelected('Hand', 'L') || isPartSelected('Finger(s)', 'L') || isPartSelected('Finger', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />

                    <!-- LEGS, KNEES & FEET -->
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
                  <svg width="105" height="195" viewBox="0 0 140 280">
                    <!-- HEAD & EARS (BACK) -->
                    <circle cx="70" cy="24" r="16" fill="${getBodyPartFill('Head')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="52" cy="24" r="4" fill="${getBodyPartFill('Ear', 'L')}" stroke="#ffffff" stroke-width="1.5" />
                    <circle cx="88" cy="24" r="4" fill="${getBodyPartFill('Ear', 'R')}" stroke="#ffffff" stroke-width="1.5" />

                    <!-- NECK -->
                    <rect x="61" y="42" width="18" height="9" rx="3" fill="${getBodyPartFill('Neck')}" stroke="#ffffff" stroke-width="2" />

                    <!-- SHOULDERS -->
                    <circle cx="42" cy="59" r="8" fill="${getBodyPartFill('Shoulder', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="98" cy="59" r="8" fill="${getBodyPartFill('Shoulder', 'R')}" stroke="#ffffff" stroke-width="2" />

                    <!-- UPPER BACK & SPINE -->
                    <rect x="52" y="53" width="36" height="46" rx="4" fill="${isPartSelected('Back incl. spine') || isPartSelected('Back') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />

                    <!-- LOWER BACK / PELVIS -->
                    <rect x="52" y="101" width="36" height="24" rx="4" fill="${isPartSelected('Back incl. spine') || isPartSelected('Back') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />

                    <!-- ARMS & HANDS (BACK) -->
                    <rect x="36" y="69" width="12" height="38" rx="5" fill="${getBodyPartFill('Arm, Elbow', 'L')}" stroke="#ffffff" stroke-width="2" />
                    <rect x="92" y="69" width="12" height="38" rx="5" fill="${getBodyPartFill('Arm, Elbow', 'R')}" stroke="#ffffff" stroke-width="2" />

                    <circle cx="36" cy="112" r="5" fill="${isPartSelected('Wrist', 'L') || isPartSelected('Hand', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="104" cy="112" r="5" fill="${isPartSelected('Wrist', 'R') || isPartSelected('Hand', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />

                    <circle cx="30" cy="125" r="9" fill="${isPartSelected('Hand', 'L') || isPartSelected('Finger(s)', 'L') || isPartSelected('Finger', 'L') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />
                    <circle cx="110" cy="125" r="9" fill="${isPartSelected('Hand', 'R') || isPartSelected('Finger(s)', 'R') || isPartSelected('Finger', 'R') ? '#dc2626' : '#b4c6e7'}" stroke="#ffffff" stroke-width="2" />

                    <!-- LEGS, KNEES & FEET (BACK) -->
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

          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">Initial Root Cause Assessment</div>
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
          </div>

          <!-- Step 2 Signature -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
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
          </div>

          ${renderNneFooter(2)}
        </div>

        <!-- =================================================================
             FORM 3: INCIDENT INVESTIGATION REPORT (FINAL 7 DAYS TEMPLATE)
        ================================================================== -->
        <!-- =================================================================
             FORM 3: INCIDENT INVESTIGATION REPORT (FINAL 7 DAYS TEMPLATE)
        ================================================================== -->
        <div class="form-page">
          ${renderNneHeader('Final Incident Investigation Report', 3)}

          <div style="font-size: 9.5px; font-style: italic; color: #475569; margin-bottom: 10px;">
            The following template must be completed as soon as possible and within 7 days of the incident occurrence.
          </div>

          <!-- Section 1: Project Details & Incident Overview -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">1 Project Details & Incident Overview</div>
            <table class="nne-tbl">
              <tbody>
                <tr>
                  <td class="lbl-cell" style="width: 22%;">Project Name:</td>
                  <td style="width: 28%;"><strong>${project}</strong></td>
                  <td class="lbl-cell" style="width: 22%;">Case Number:</td>
                  <td style="width: 28%;"><strong>${caseNo}</strong></td>
                </tr>
                <tr>
                  <td class="lbl-cell">Incident Title:</td>
                  <td><strong>${title}</strong></td>
                  <td class="lbl-cell">Date & Time:</td>
                  <td>${date} @ ${time}</td>
                </tr>
                <tr>
                  <td class="lbl-cell">Building / Location:</td>
                  <td>${building}</td>
                  <td class="lbl-cell">Specific Location:</td>
                  <td>${specificLoc}</td>
                </tr>
                <tr>
                  <td class="lbl-cell">Contractor Involved:</td>
                  <td>${contractor}</td>
                  <td class="lbl-cell">Category / Classification:</td>
                  <td><strong>${category}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Section 1. Investigation Team -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">1. Investigation Team</div>
            <table class="nne-tbl">
              <thead>
                <tr class="dark-hdr">
                  <th style="width: 8%; text-align: center;">#</th>
                  <th style="width: 32%;">Name</th>
                  <th style="width: 30%;">Position / Role</th>
                  <th style="width: 30%;">Company</th>
                </tr>
              </thead>
              <tbody>
                ${renderInvTeamRows()}
              </tbody>
            </table>
          </div>

          <!-- Section 2. Investigation Details -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">2. Investigation Details</div>
            <div style="font-size: 8.5px; color: #334155; line-height: 1.4; background: #fff; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 4px;">
              ${inv.investigationDetails || inv.investigation_details || description || 'Detailed investigation process completed covering timeline, tools, equipment inspection, interviews, and system review.'}
            </div>
          </div>

          <!-- Section 3. Witness Statements -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">3. Witness Statements</div>
            <table class="nne-tbl">
              <thead>
                <tr class="dark-hdr">
                  <th style="width: 20%;">Witness Name</th>
                  <th style="width: 12%;">Badge No.</th>
                  <th style="width: 18%;">Employer</th>
                  <th style="width: 18%;">Occupation</th>
                  <th>Brief Statement / Description</th>
                </tr>
              </thead>
              <tbody>
                ${renderWitnessRows()}
              </tbody>
            </table>
          </div>

          <!-- Section 4. Fishbone Analysis – Cause and Effect -->
          ${renderFishboneSvg()}

          <!-- Section 5. Effect Description & 6. Problem Statement -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div style="border: 1px solid #cbd5e1; background: #fff; padding: 6px 10px; border-radius: 4px;">
                <div style="font-size: 8.5px; font-weight: 700; color: #0f172a; margin-bottom: 3px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 2px;">5. Effect Description</div>
                <div style="font-size: 8px; color: #334155; line-height: 1.4;">${inv.effect || inv.effectDescription || title || 'Incident outcome analyzed.'}</div>
              </div>
              <div style="border: 1px solid #cbd5e1; background: #fff; padding: 6px 10px; border-radius: 4px;">
                <div style="font-size: 8.5px; font-weight: 700; color: #0f172a; margin-bottom: 3px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 2px;">6. Problem Statement</div>
                <div style="font-size: 8px; color: #334155; line-height: 1.4;">${inv.problemStatement || description || 'Problem statement under investigation.'}</div>
              </div>
            </div>
          </div>

          <!-- Section 8. 5-Whys Root Cause Analysis -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">8. 5-Whys Root Cause Analysis</div>
            ${renderFiveWhysRows()}
          </div>

          <!-- Section 9. Identified Root Causes & 10. Contributing Factors -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div style="border: 1px solid #cbd5e1; background: #fff; padding: 6px 10px; border-radius: 4px;">
                <div style="font-size: 8.5px; font-weight: 700; color: #dc2626; margin-bottom: 4px; border-bottom: 1px dashed #fee2e2; padding-bottom: 2px;">9. Identified Root Causes</div>
                ${renderRootCausesRows()}
              </div>
              <div style="border: 1px solid #cbd5e1; background: #fff; padding: 6px 10px; border-radius: 4px;">
                <div style="font-size: 8.5px; font-weight: 700; color: #0f172a; margin-bottom: 4px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 2px;">10. Contributing Factors</div>
                ${renderFactorsRows()}
              </div>
            </div>
          </div>

          <!-- Section 11. Severity Assessment -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">11. Severity Assessment</div>
            ${renderSeverityAssessment()}
          </div>

          <!-- Section 12. Corrective Actions -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">12. Corrective Actions</div>
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
                ${renderCorrectiveActionsRows()}
              </tbody>
            </table>
          </div>

          <!-- Section 13. Lessons Learned & Recurrence Prevention -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">13. Lessons Learned & Prevention</div>
            ${renderLessonsPrevention()}
          </div>

          <!-- Section 14. Photos from Incident Location & Evidence -->
          <div class="pdf-box" style="border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; margin-bottom: 12px; background: #fff; page-break-inside: avoid; break-inside: avoid;">
            <div style="font-size: 9.5px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">14. Photos from Incident Location & Evidence</div>
            ${renderPhotosGrid()}
          </div>

          <!-- Section 15. Mandatory Attachments -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <div class="sec-title">15. Mandatory Attachments Checklist</div>
            ${renderMandatoryAttachmentsTable()}
          </div>

          <!-- Section 17. Signatures & Sign-Off -->
          <div class="pdf-section" style="page-break-inside: avoid; break-inside: avoid;">
            <table class="nne-tbl">
              <thead>
                <tr class="dark-hdr">
                  <th colspan="4">17. Signatures & Distribution Sign-Off</th>
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
          </div>

          ${renderNneFooter(3)}
        </div>

      </body>
      </html>
    `;
  }
}
