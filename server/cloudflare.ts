import type { Browser, Page } from 'puppeteer';

const CF_SOLVE_TIMEOUT_MS = 60_000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_FETCHES_BEFORE_RECYCLE = 30;

let browser: Browser | null = null;
let page: Page | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let fetchCount = 0;
let cfReady = false;
let solving = false;
let solvePromise: Promise<boolean> | null = null;
let solvedAt = 0;
let expiresAt = 0;
let puppeteerLoaded: typeof import('puppeteer-extra').default | null = null;

async function loadPuppeteer() {
  if (puppeteerLoaded) return puppeteerLoaded;
  console.log('[CF] Loading puppeteer-extra...');
  const { default: puppeteer } = await import('puppeteer-extra');
  const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
  puppeteerLoaded = puppeteer;
  return puppeteer;
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    console.log('[CF] Idle timeout, closing browser');
    await closeBrowser();
  }, IDLE_TIMEOUT_MS);
}

async function closeBrowser() {
  cfReady = false;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (page) {
    try { await page.close(); } catch {}
    page = null;
  }
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
  fetchCount = 0;
}

async function ensureBrowser(): Promise<Page> {
  if (browser && page) {
    try {
      await page.evaluate('1');
      return page;
    } catch {
      await closeBrowser();
    }
  }

  const puppeteer = await loadPuppeteer();
  console.log('[CF] Launching browser...');
  browser = await puppeteer.launch({
    headless: 'new' as never,
    protocolTimeout: 300_000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-translate',
      '--no-first-run',
      '--js-flags=--max-old-space-size=128',
    ],
  });

  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  return page;
}

async function solveCfChallenge(): Promise<boolean> {
  console.log('[CF] Solving Cloudflare challenge...');
  const p = await ensureBrowser();

  try {
    await p.goto('https://hsreplay.net', { waitUntil: 'domcontentloaded', timeout: CF_SOLVE_TIMEOUT_MS });

    const startTime = Date.now();
    while (Date.now() - startTime < CF_SOLVE_TIMEOUT_MS) {
      const cookies = await p.cookies();
      const cfCookie = cookies.find(c => c.name === 'cf_clearance');
      if (cfCookie) {
        expiresAt = cfCookie.expires > 0
          ? cfCookie.expires * 1000
          : Date.now() + 30 * 60 * 1000;
        solvedAt = Date.now();
        cfReady = true;
        console.log(`[CF] Challenge solved! Expires in ${Math.round((expiresAt - Date.now()) / 60000)}m`);
        resetIdleTimer();
        return true;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    console.error('[CF] Timed out waiting for cf_clearance');
    return false;
  } catch (err) {
    console.error('[CF] Solve failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function ensureCfReady(): Promise<boolean> {
  if (cfReady && Date.now() < expiresAt - 5 * 60 * 1000) return true;

  if (solving && solvePromise) return solvePromise;

  solving = true;
  solvePromise = solveCfChallenge().finally(() => {
    solving = false;
    solvePromise = null;
  });
  return solvePromise;
}

let sessionLockQueue: Promise<void> = Promise.resolve();

export function acquireSessionLock(): Promise<() => void> {
  let release: () => void;
  const prev = sessionLockQueue;
  sessionLockQueue = new Promise(resolve => { release = resolve; });
  return prev.then(() => release!);
}

export async function clearSessionCookie(): Promise<void> {
  const p = await ensureBrowser();
  await p.deleteCookie({ name: 'sessionid', domain: '.hsreplay.net' });
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const p = await ensureBrowser();
  await p.setCookie({
    name: 'sessionid',
    value: sessionId,
    domain: '.hsreplay.net',
    path: '/',
    httpOnly: true,
    secure: true,
  });
}

export async function fetchThroughBrowser(url: string): Promise<{ status: number; body: string }> {
  await ensureCfReady();
  resetIdleTimer();

  const p = await ensureBrowser();

  const result = await p.evaluate(async (fetchUrl: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(fetchUrl, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      const text = await res.text();
      return { status: res.status, body: text };
    } finally {
      clearTimeout(timer);
    }
  }, url);

  fetchCount++;
  if (fetchCount >= MAX_FETCHES_BEFORE_RECYCLE) {
    console.log(`[CF] Recycling browser after ${fetchCount} fetches to reclaim memory`);
    const cookies = await p.cookies();
    await closeBrowser();
    const newPage = await ensureBrowser();
    if (cookies.length > 0) await newPage.setCookie(...cookies);
    cfReady = true;
    resetIdleTimer();
  }

  return result;
}

export function getCfStatus(): { valid: boolean; expiresIn: number } {
  const valid = cfReady && Date.now() < expiresAt;
  return {
    valid,
    expiresIn: valid ? Math.round((expiresAt - Date.now()) / 1000) : 0,
  };
}

export function clearCfSession(): void {
  cfReady = false;
}
