import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

const INACTIVE_DAYS = 90;

export interface TokenData {
  token: string;
  accountLo: string;
  battletag: string;
  region: number;
  sessionId: string;
  createdAt: number;
  lastSeenAt: number;
}

interface ResolvedUser {
  accountLo: string;
  userDir: string;
  tokenData: TokenData;
}

let usersDir = '';
const tokenCache = new Map<string, ResolvedUser>();

export function initAuth(dataDir: string): void {
  usersDir = join(dataDir, 'users');
  if (!existsSync(usersDir)) mkdirSync(usersDir, { recursive: true });
  purgeInactiveUsers();
  rebuildTokenCache();
}

export function purgeInactiveUsers(): void {
  if (!existsSync(usersDir)) return;
  const cutoff = Date.now() - INACTIVE_DAYS * 86400000;

  for (const dir of readdirSync(usersDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const tokenPath = join(usersDir, dir.name, 'token.json');
    if (!existsSync(tokenPath)) continue;
    try {
      const data: TokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'));
      const lastActive = data.lastSeenAt || data.createdAt;
      if (lastActive < cutoff) {
        tokenCache.delete(data.token);
        rmSync(join(usersDir, dir.name), { recursive: true });
        console.log(`[Auth] Purged inactive user ${data.battletag} (${dir.name}), last seen ${Math.round((Date.now() - lastActive) / 86400000)}d ago`);
      }
    } catch { /* skip corrupted */ }
  }
}

function rebuildTokenCache(): void {
  tokenCache.clear();
  if (!existsSync(usersDir)) return;

  for (const dir of readdirSync(usersDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const tokenPath = join(usersDir, dir.name, 'token.json');
    if (!existsSync(tokenPath)) continue;
    try {
      const data: TokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'));
      tokenCache.set(data.token, {
        accountLo: dir.name,
        userDir: join(usersDir, dir.name),
        tokenData: data,
      });
    } catch { /* corrupted token file — skip */ }
  }

  console.log(`[Auth] Loaded ${tokenCache.size} user(s)`);
}

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function resolveUserByToken(token: string): ResolvedUser | null {
  const user = tokenCache.get(token);
  if (user) touchLastSeen(user);
  return user ?? null;
}

function touchLastSeen(user: ResolvedUser): void {
  const now = Date.now();
  if (now - (user.tokenData.lastSeenAt || 0) < 3600000) return;
  user.tokenData.lastSeenAt = now;
  writeFileSync(join(user.userDir, 'token.json'), JSON.stringify(user.tokenData, null, 2));
}

export function findUserByAccount(accountLo: string): ResolvedUser | null {
  for (const user of tokenCache.values()) {
    if (user.accountLo === accountLo) return user;
  }
  return null;
}

export function createUser(accountLo: string, battletag: string, region: number, sessionId: string): ResolvedUser {
  const existing = findUserByAccount(accountLo);
  if (existing) {
    existing.tokenData.sessionId = sessionId;
    existing.tokenData.battletag = battletag;
    existing.tokenData.lastSeenAt = Date.now();
    writeFileSync(join(existing.userDir, 'token.json'), JSON.stringify(existing.tokenData, null, 2));
    return existing;
  }

  const userDir = join(usersDir, accountLo);
  mkdirSync(userDir, { recursive: true });

  const token = generateToken();
  const now = Date.now();
  const tokenData: TokenData = { token, accountLo, battletag, region, sessionId, createdAt: now, lastSeenAt: now };
  writeFileSync(join(userDir, 'token.json'), JSON.stringify(tokenData, null, 2));

  const user: ResolvedUser = { accountLo, userDir, tokenData };
  tokenCache.set(token, user);
  return user;
}

export function getAllUsers(): ResolvedUser[] {
  return [...tokenCache.values()];
}

export function getActiveUsers(withinMs: number): ResolvedUser[] {
  const cutoff = Date.now() - withinMs;
  const active: ResolvedUser[] = [];
  for (const user of tokenCache.values()) {
    if ((user.tokenData.lastSeenAt || 0) >= cutoff) active.push(user);
  }
  return active;
}

export function deleteUser(accountLo: string): boolean {
  const user = findUserByAccount(accountLo);
  if (!user) return false;
  tokenCache.delete(user.tokenData.token);
  try { rmSync(user.userDir, { recursive: true }); } catch {}
  return true;
}

export function updateSessionId(accountLo: string, sessionId: string): void {
  const user = findUserByAccount(accountLo);
  if (!user) return;
  user.tokenData.sessionId = sessionId;
  writeFileSync(join(user.userDir, 'token.json'), JSON.stringify(user.tokenData, null, 2));
}
