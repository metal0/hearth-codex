import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const PROFILE_DIR = join(DATA_DIR, 'chrome-profile');
const COLLECTION_PATH = join(DATA_DIR, 'my-collection.json');
const CDP_PORT = 19222;

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
];

function findChrome(): string | null {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

function waitForPort(port: number, timeoutMs: number = 15000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Chrome did not start within ${timeoutMs / 1000}s`));
        return;
      }
      fetch(`http://127.0.0.1:${port}/json/version`)
        .then(r => r.ok ? resolve() : setTimeout(tryConnect, 500))
        .catch(() => setTimeout(tryConnect, 500));
    };
    tryConnect();
  });
}

interface CDPTab {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type: string;
}

async function getPages(): Promise<CDPTab[]> {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
  return res.json() as Promise<CDPTab[]>;
}

function cdpSend(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 30000);
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        clearTimeout(timeout);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')));
  });
}

async function evaluateInPage(ws: WebSocket, expression: string): Promise<unknown> {
  const result = await cdpSend(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if ((result as Record<string, unknown>)?.exceptionDetails) {
    throw new Error(((result as Record<string, unknown>).exceptionDetails as Record<string, string>)?.text || 'JS evaluation error');
  }
  return ((result as Record<string, unknown>)?.result as Record<string, unknown>)?.value;
}

async function navigateAndWait(ws: WebSocket, url: string): Promise<void> {
  await cdpSend(ws, 'Page.enable');
  const navPromise = new Promise<void>((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data));
      if (msg.method === 'Page.loadEventFired') {
        ws.removeEventListener('message', handler);
        resolve();
      }
    };
    ws.addEventListener('message', handler);
  });
  await cdpSend(ws, 'Page.navigate', { url });
  await navPromise;
  await new Promise(r => setTimeout(r, 2000));
}

async function tryFetchCollection(ws: WebSocket): Promise<Record<string, unknown> | null> {
  try {
    const result = await evaluateInPage(ws, `
      fetch('/api/v1/collection/', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      })
      .then(r => {
        if (!r.ok) return null;
        return r.json();
      })
      .catch(() => null)
    `);
    if (result && typeof result === 'object' && (result as Record<string, unknown>).collection && Object.keys((result as Record<string, unknown>).collection as object).length > 0) {
      return result as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function pressEnter(prompt: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

export async function syncCollection(): Promise<string | null> {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('Chrome not found. Install Chrome or export collection manually.');
    return null;
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });

  console.log('Launching Chrome...');
  const chrome: ChildProcess = spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    'https://hsreplay.net/collection/mine/',
  ], { stdio: 'ignore', detached: false });

  chrome.on('error', (err) => {
    console.error('Failed to launch Chrome:', err.message);
  });

  let ws: WebSocket | null = null;
  try {
    await waitForPort(CDP_PORT);
    console.log('Chrome started. Connecting...');

    await new Promise(r => setTimeout(r, 3000));

    const pages = await getPages();
    const hsPage = pages.find(p => p.type === 'page' && p.url.includes('hsreplay.net'));
    if (!hsPage) {
      console.error('Could not find HSReplay tab.');
      return null;
    }

    ws = await connectWs(hsPage.webSocketDebuggerUrl);

    console.log('Checking HSReplay login...');
    let collection = await tryFetchCollection(ws);

    if (!collection) {
      console.log('\n  You are not logged into HSReplay.net in this browser profile.');
      console.log('  Please log in using the Chrome window that just opened.');
      console.log('  (Blizzard / Battle.net OAuth login)\n');

      await pressEnter('  Press Enter after logging in... ');

      await navigateAndWait(ws, 'https://hsreplay.net/collection/mine/');
      await new Promise(r => setTimeout(r, 2000));

      collection = await tryFetchCollection(ws);

      if (!collection) {
        console.log('  Waiting for collection data...');
        await new Promise(r => setTimeout(r, 5000));
        collection = await tryFetchCollection(ws);
      }
    }

    if (collection) {
      writeFileSync(COLLECTION_PATH, JSON.stringify(collection, null, 2));
      const cardCount = Object.keys(collection.collection as object).length;
      const dust = (collection.dust as number) ?? 0;
      console.log(`\nCollection saved! ${cardCount} unique cards, ${dust} dust.`);
      console.log(`File: ${COLLECTION_PATH}`);
      return COLLECTION_PATH;
    } else {
      console.error('\nFailed to fetch collection. Make sure you are logged in and have collection data.');
      return null;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Sync error:', message);
    return null;
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    chrome.kill();
  }
}

export function getCollectionPath(): string | null {
  if (existsSync(COLLECTION_PATH)) return COLLECTION_PATH;
  return null;
}

if (process.argv[1]?.endsWith('sync-collection.ts')) {
  syncCollection().then(path => {
    if (path) {
      console.log('\nDone! Run `npm run cli` to calculate packs needed.');
    } else {
      console.log('\nSync failed. You can still run `npm run cli` with manual input.');
    }
    process.exit(0);
  });
}
