import { join } from 'path';
import { getBase64Image } from './image-utils';

export function generateLogsHtml(permitNo: string, logs: any[], images: any[]): string {
  const leftLogo = getBase64Image(join(process.cwd(), './src/images/logos/left_side.jpeg'));
  const rightLogo = getBase64Image(join(process.cwd(), './src/images/logos/right_side.jpeg'));

  const formatDate = (dateStr: string | Date) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return String(dateStr);
    }
  };

  const formatDateTime = (dateStr: string | Date) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return String(dateStr);
    }
  };

  const TYPE_STYLES: Record<string, { color: string; bg: string; icon: string }> = {
    Hold: { color: "#d97706", bg: "#fef3c7", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>` },
    Edited: { color: "#2563eb", bg: "#dbeafe", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>` },
    Approved: { color: "#16a34a", bg: "#dcfce7", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><polyline points="20 6 9 17 4 12"/></svg>` },
    Opened: { color: "#7c3aed", bg: "#f3e8ff", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>` },
    Closed: { color: "#4b5563", bg: "#f3f4f6", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` },
    Rejected: { color: "#dc2626", bg: "#fee2e2", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>` },
    Cancelled: { color: "#dc2626", bg: "#fee2e2", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>` },
    "Auto-Cancelled": { color: "#dc2626", bg: "#fee2e2", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>` },
    Draft: { color: "#475569", bg: "#f1f5f9", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>` },
    Submitted: { color: "#0284c7", bg: "#e0f2fe", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>` },
    "Note Deleted": { color: "#dc2626", bg: "#fee2e2", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>` },
  };

  const getStatusIcon = (type: string) => {
    const key = Object.keys(TYPE_STYLES).find(k => k.toLowerCase() === String(type).toLowerCase().trim());
    return key ? TYPE_STYLES[key].icon : `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><circle cx="12" cy="12" r="6"/></svg>`;
  };

  const getStatusClass = (type: string) => {
    const key = Object.keys(TYPE_STYLES).find(k => k.toLowerCase() === String(type).toLowerCase().trim());
    return key ? `status-${key.replace(/\s+/g, '-')}` : "status-default";
  };

  const getTypeStyle = (type: string) => {
    const key = Object.keys(TYPE_STYLES).find(k => k.toLowerCase() === String(type).toLowerCase().trim());
    return key ? TYPE_STYLES[key] : { color: "#64748b", bg: "#f1f5f9", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><circle cx="12" cy="12" r="6"/></svg>` };
  };

  // Find metadata details from the first log if available
  const firstLog = logs[0];
  const companyName = firstLog?.request?.companyName || '-';
  const mainContractor = firstLog?.system === 1 ? 'NA' : (firstLog?.request?.subcontractor?.subContractorName || '-');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activity Permit Logs - ${permitNo}</title>
  <link href="https://fonts.googleapis.com/css2?family=Mulish:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0f172a;
      --accent: #edc510;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border-color: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --success: #22c55e;
      --danger: #ef4444;
      --info: #3b82f6;
    }

    * {
      box-sizing: border-box;
      font-family: 'Mulish', sans-serif;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 20px;
      line-height: 1.6;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      background: var(--card-bg);
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.03);
    }

    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid var(--accent);
      padding-bottom: 25px;
      margin-bottom: 30px;
    }

    .logo-img {
      max-width: 150px;
      height: auto;
    }

    .title-box {
      text-align: center;
      background: var(--primary);
      color: #fff;
      padding: 15px 30px;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(34, 42, 69, 0.15);
    }

    .title-box h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 1px;
      font-weight: 700;
    }

    .meta-summary {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 30px;
      padding: 14px 20px;
      background-color: #f1f5f9;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .meta-summary-item {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
    }

    .section-title {
      font-size: 18px;
      color: var(--primary);
      border-bottom: 2px solid #e9ecef;
      padding-bottom: 8px;
      margin-top: 40px;
      margin-bottom: 20px;
      font-weight: 700;
    }

    /* Timeline styling */
    .timeline-container {
      position: relative;
      margin-top: 30px;
      padding-left: 10px;
    }

    .timeline-line {
      position: absolute;
      left: 29px;
      top: 8px;
      bottom: 8px;
      width: 2px;
      background-color: #cbd5e1;
    }

    .timeline-item {
      display: flex;
      gap: 20px;
      margin-bottom: 28px;
      position: relative;
      page-break-inside: avoid;
    }

    .timeline-item:last-child {
      margin-bottom: 0;
    }

    .timeline-dot-wrap {
      width: 40px;
      flex-shrink: 0;
      display: flex;
      justify-content: center;
      padding-top: 2px;
      position: relative;
      z-index: 2;
    }

    .timeline-dot {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px solid;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
    }

    .timeline-card {
      flex: 1;
      background-color: #f8fafc;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 18px 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.01);
      transition: all 0.2s ease;
    }

    .timeline-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
      border-color: #cbd5e1;
    }

    .card-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }

    .badge-status {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      display: inline-block;
    }

    /* Colors mapping corresponding to TYPE_STYLES */
    .status-Hold { color: #d97706; background-color: #fef3c7; border-color: #fcd34d; }
    .status-Edited { color: #2563eb; background-color: #dbeafe; border-color: #bfdbfe; }
    .status-Approved { color: #16a34a; background-color: #dcfce7; border-color: #bbf7d0; }
    .status-Opened { color: #7c3aed; background-color: #f3e8ff; border-color: #e9d5ff; }
    .status-Closed { color: #4b5563; background-color: #f3f4f6; border-color: #e5e7eb; }
    .status-Rejected { color: #dc2626; background-color: #fee2e2; border-color: #fecaca; }
    .status-Cancelled, .status-Auto-Cancelled, .status-Note-Deleted { color: #dc2626; background-color: #fee2e2; border-color: #fecaca; }
    .status-Draft { color: #475569; background-color: #f1f5f9; border-color: #e2e8f0; }
    .status-Submitted { color: #0284c7; background-color: #e0f2fe; border-color: #bae6fd; }
    .status-default { color: #64748b; background-color: #f1f5f9; border-color: #e2e8f0; }

    .log-time {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
    }

    .user-details-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
      background-color: #f1f5f9;
      color: #2563eb;
    }

    .user-info-text p {
      margin: 0;
    }

    .user-username {
      font-size: 14px;
      color: var(--text);
      font-weight: 700;
    }

    .user-role {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
    }

    .company-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 6px;
      padding-bottom: 10px;
      border-bottom: 1px solid #f1f5f9;
    }

    .meta-item {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 600;
    }

    /* Changes section styling */
    .changes-section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px dashed #cbd5e1;
    }

    .changes-title {
      margin: 0 0 10px 0;
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
    }

    .change-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .change-row:last-child {
      margin-bottom: 0;
    }

    .change-field {
      font-size: 13px;
      color: var(--text);
      font-weight: 700;
      min-width: 120px;
    }

    .change-value-prev {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      background-color: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fca5a5;
      text-decoration: line-through;
    }

    .change-arrow {
      color: var(--text-muted);
      font-size: 14px;
      font-weight: bold;
    }

    .change-value-pres {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      background-color: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
      font-weight: 500;
    }

    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 20px;
      margin-top: 15px;
    }

    .image-card {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 12px;
      padding: 15px;
      text-align: center;
      box-shadow: 0 4px 6px rgba(0,0,0,0.01);
      page-break-inside: avoid;
    }

    .image-card img {
      max-width: 100%;
      height: 150px;
      object-fit: cover;
      border-radius: 8px;
      margin-bottom: 10px;
      border: 1px solid #dee2e6;
    }

    .image-meta {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    }

    .download-bar {
      margin-top: 40px;
      text-align: center;
    }

    .btn-download {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 12px 30px;
      border-radius: 30px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 15px rgba(34, 42, 69, 0.2);
      transition: background 0.2s, transform 0.2s;
    }

    .btn-download:hover {
      background: #192035;
      transform: translateY(-2px);
    }

    @media print {
      body {
        background-color: #fff;
        padding: 0;
      }
      .container {
        box-shadow: none;
        padding: 0;
      }
      .download-bar {
        display: none;
      }
      .page-break {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>

<div class="container" id="root-content">
  <!-- Header -->
  <div class="header-section">
    <div>
      ${leftLogo ? `<img src="${leftLogo}" alt="Logo Left" class="logo-img">` : ''}
    </div>
    <div class="title-box">
      <h1 id="permit-no">PERMIT LOG TIMELINE: ${permitNo}</h1>
    </div>
    <div>
      ${rightLogo ? `<img src="${rightLogo}" alt="Logo Right" class="logo-img">` : ''}
    </div>
  </div>

  <!-- Meta Summary bar -->
  <div class="meta-summary">
    <span class="meta-summary-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>${companyName}</span>
    <span class="meta-summary-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${mainContractor}</span>
  </div>

  <div class="section-title">Permit Actions Timeline</div>
  
  <div class="timeline-container">
    <div class="timeline-line"></div>
    
    ${logs.map((log: any) => {
    let usertype = log.user?.userType || '';
    if (log.system === 1) {
      usertype = 'System Auto Cancel';
    } else {
      const uLower = usertype.toLowerCase().trim();
      if (uLower === 'department') usertype = 'ConM/HSE';
      else if (uLower === 'department1') usertype = 'C&Q';
      else if (uLower === 'subcontractor') usertype = 'Contractor';
    }

    const username = log.system === 1 ? 'System' : (log.user?.username || 'System');
    const contractor = log.system === 1 ? 'NA' : (log.request?.subcontractor?.subContractorName || '-');
    const compName = log.request?.companyName || '-';

    let reqType = log.requestType || 'Created';
    if (log.system === 1 && reqType === 'Cancelled') {
      reqType = 'Auto-Cancelled';
    }

    const style = getTypeStyle(reqType);
    const badgeClass = getStatusClass(reqType);

    return `
      <div class="timeline-item">
        <!-- Timeline dot -->
        <div class="timeline-dot-wrap">
          <div class="timeline-dot" style="background-color: ${style.bg}; border-color: ${style.color}; color: ${style.color};">
            ${style.icon}
          </div>
        </div>

        <!-- Card -->
        <div class="timeline-card">
          <!-- Top row: type badge + time -->
          <div class="card-top-row">
            <span class="badge-status ${badgeClass}">
              ${reqType}
            </span>
            <span class="log-time">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${formatDateTime(log.createdTime)}
            </span>
          </div>

          <!-- User details -->
          <div class="user-details-row">
            <div class="avatar" style="border-color: ${style.color}; color: ${style.color}; background-color: ${style.bg};">
              ${(username?.[0] || '?').toUpperCase()}
            </div>
            <div class="user-info-text">
              <p class="user-username">${username}</p>
              <p class="user-role">${usertype}</p>
            </div>
          </div>

          <!-- Company info -->
          <div class="company-row">
            <span class="meta-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>${compName}</span>
            <span class="meta-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${contractor}</span>
            ${log.request?.workingDate ? `<span class="meta-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Work Date: ${formatDate(log.request.workingDate)}</span>` : ''}
          </div>

          <!-- Field changes (only for Edited) -->
          ${log.changes && log.changes.length > 0 ? `
            <div class="changes-section">
              <p class="changes-title">Changes Made</p>
              ${log.changes.map((chg: any) => `
                <div class="change-row">
                  <span class="change-field">${chg.fieldName}</span>
                  <span class="change-value-prev">${chg.previous === null || chg.previous === '' ? 'Empty' : chg.previous}</span>
                  <span class="change-arrow">→</span>
                  <span class="change-value-pres">${chg.present === null || chg.present === '' ? 'Empty' : chg.present}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
      `;
  }).join('')}
  </div>

  <!-- Uploaded Images Section -->
  ${images && images.length > 0 ? `
  <div class="page-break"></div>
  <div class="section-title">Uploaded Check-In/Check-Out Pictures</div>
  <div class="image-grid">
    ${images.map((img: any) => {
    const filename = img.imageName ? img.imageName.split('/').pop() : '';
    let srcUrl = `/requests/${filename}`;
    try {
      const fs = require('fs');
      const path = require('path');
      const localPath = path.join(process.cwd(), './uploads/requests', filename);
      if (fs.existsSync(localPath)) {
        const ext = path.extname(filename).toLowerCase().replace('.', '');
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        const base64Data = fs.readFileSync(localPath, { encoding: 'base64' });
        srcUrl = `data:${mime};base64,${base64Data}`;
      }
    } catch (e) {
      // ignore and fallback
    }
    return `
      <div class="image-card">
        <img src="${srcUrl}" alt="Check In/Out Image" onerror="this.src='https://placehold.co/220x150?text=No+Image'">
        <div class="image-meta">
          <strong>Uploaded By:</strong> ${img.user?.username || 'N/A'}<br>
          <strong>Role:</strong> ${img.user?.userType || 'N/A'}
        </div>
      </div>
      `;
  }).join('')}
  </div>` : ''}

  <!-- Footer Actions -->
  <div class="download-bar">
    <button type="button" class="btn-download" onclick="downloadPDF()">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"></path>
      </svg>
      Download PDF
    </button>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
  function downloadPDF() {
    window.location.href = "/development/m3south/requests/logs-design/${permitNo}/pdf";
  }
</script>
</body>
</html>
  `;
}
