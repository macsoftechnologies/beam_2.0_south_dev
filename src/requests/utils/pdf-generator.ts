import puppeteer from 'puppeteer';
import { generatePermitHtml } from './permit-html-template';
import { generateLogsHtml } from './logs-html-template';

/**
 * Shared Puppeteer launch args hardened for headless Linux servers.
 * - --no-sandbox / --disable-setuid-sandbox: required when running as root
 * - --disable-dev-shm-usage: prevents crashes on low /dev/shm memory (Docker, VPS)
 * - --disable-gpu: not needed in headless mode, avoids GL errors
 * - --no-zygote / --single-process: avoids process spawning issues on restricted envs
 */
const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

import fs from 'fs';

function getExecutablePath(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }
  return undefined;
}

/**
 * Generates a permit PDF via Puppeteer/headless Chrome from the HTML template.
 */
export async function generatePermitPdf(data: any): Promise<Buffer> {
  const html = generatePermitHtml(data);
  const execPath = getExecutablePath();
  const browser = await puppeteer.launch({
    headless: true,
    args: PUPPETEER_ARGS,
    ...(execPath ? { executablePath: execPath } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    // Hide the download button so it never appears in the generated PDF
    await page.addStyleTag({ content: '.confirm-pg-download-container, .back-btn { display: none !important; }' });
    const pdfBuffer = await page.pdf({
      width: '330mm',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '5mm', right: '5mm' },
      preferCSSPageSize: false,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Generates a logs PDF via Puppeteer/headless Chrome from the logs HTML template.
 */
export async function generateLogsPdf(
  permitNo: string,
  logs: any[],
  images: any[],
): Promise<Buffer> {
  const html = generateLogsHtml(permitNo, logs, images);
  const execPath = getExecutablePath();
  const browser = await puppeteer.launch({
    headless: true,
    args: PUPPETEER_ARGS,
    ...(execPath ? { executablePath: execPath } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    // Hide the download button so it never appears in the generated PDF
    await page.addStyleTag({ content: '.download-bar { display: none !important; }' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}