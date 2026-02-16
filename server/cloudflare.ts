import type { Browser } from 'puppeteer';

const CF_SOLVE_TIMEOUT_MS = 60_000;
const CF_RENEW_MARGIN_MS = 5 * 60 * 1000;
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let cfClearance: string | null = null;
let cfExpires = 0;
let cfReady = false;
let solving = false;
let solvePromise: Promise<boolean> | null = null;
let renewTimer: ReturnType<typeof setTimeout> | null = null;
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

function scheduleRenewal() {
  if (renewTimer) clearTimeout(renewTimer);
  if (!cfExpires) return;
  const delay = Math.max(0, (cfExpires - CF_RENEW_MARGIN_MS) - Date.now());
  console.log(`[CF] Renewal scheduled in ${Math.round(delay / 60000)}m`);
  renewTimer = setTimeout(() => {
    renewTimer = null;
    console.log('[CF] Auto-renewing CF clearance...');
    solveCfChallenge().catch(err => {
      console.error('[CF] Auto-renewal failed:', err instanceof Error ? err.message : err);
    });
  }, delay);
}

async function solveCfChallenge(): Promise<boolean> {
  console.log('[CF] Solving Cloudflare challenge...');
  const puppeteer = await loadPuppeteer();

  let browser: Browser | null = null;
  try {
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

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto('https://hsreplay.net', { waitUntil: 'domcontentloaded', timeout: CF_SOLVE_TIMEOUT_MS });

    const startTime = Date.now();
    while (Date.now() - startTime < CF_SOLVE_TIMEOUT_MS) {
      const cookies = await page.cookies();
      const cfCookie = cookies.find(c => c.name === 'cf_clearance');
      if (cfCookie) {
        cfClearance = cfCookie.value;
        cfExpires = cfCookie.expires > 0
          ? cfCookie.expires * 1000
          : Date.now() + 30 * 60 * 1000;
        cfReady = true;
        console.log(`[CF] Challenge solved! Cookie expires in ${Math.round((cfExpires - Date.now()) / 60000)}m`);
        scheduleRenewal();
        return true;
      }

      const isCfChallenge = await page.evaluate(() => {
        const title = document.title.toLowerCase();
        return title.includes('just a moment') || title.includes('attention required')
          || !!document.querySelector('#challenge-running, #challenge-form, .cf-browser-verification');
      });

      if (!isCfChallenge) {
        cfClearance = null;
        cfExpires = Date.now() + 30 * 60 * 1000;
        cfReady = true;
        console.log('[CF] No challenge detected, browser not needed');
        scheduleRenewal();
        return true;
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    console.error('[CF] Timed out waiting for cf_clearance');
    return false;
  } catch (err) {
    console.error('[CF] Solve failed:', err instanceof Error ? err.message : err);
    return false;
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

export async function ensureCfReady(): Promise<boolean> {
  if (cfReady && Date.now() < cfExpires - CF_RENEW_MARGIN_MS) return true;

  if (solving && solvePromise) return solvePromise;

  solving = true;
  solvePromise = solveCfChallenge().finally(() => {
    solving = false;
    solvePromise = null;
  });
  return solvePromise;
}

function isCfChallengeResponse(status: number, contentType: string | null): boolean {
  return (status === 403 || status === 503) && (contentType?.includes('text/html') ?? false);
}

function buildCookieHeader(sessionId?: string | null): string {
  const parts: string[] = [];
  if (cfClearance) parts.push(`cf_clearance=${cfClearance}`);
  if (sessionId) parts.push(`sessionid=${sessionId}`);
  return parts.join('; ');
}

export async function cfFetch(url: string, sessionId?: string | null): Promise<{ status: number; body: string }> {
  await ensureCfReady();

  const cookie = buildCookieHeader(sessionId);
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': CHROME_UA,
      ...(cookie ? { 'Cookie': cookie } : {}),
    },
    redirect: 'follow',
  });

  const contentType = res.headers.get('content-type');
  const body = await res.text();

  if (isCfChallengeResponse(res.status, contentType)) {
    console.log('[CF] Challenge detected on fetch, solving...');
    cfReady = false;
    const solved = await ensureCfReady();
    if (!solved) return { status: 403, body: 'Cloudflare challenge failed' };

    const cookie2 = buildCookieHeader(sessionId);
    const res2 = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': CHROME_UA,
        ...(cookie2 ? { 'Cookie': cookie2 } : {}),
      },
      redirect: 'follow',
    });
    return { status: res2.status, body: await res2.text() };
  }

  return { status: res.status, body };
}

export function getCfStatus(): { valid: boolean; expiresIn: number } {
  const valid = cfReady && Date.now() < cfExpires;
  return {
    valid,
    expiresIn: valid ? Math.round((cfExpires - Date.now()) / 1000) : 0,
  };
}

export function clearCfSession(): void {
  cfReady = false;
}
