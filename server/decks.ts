export const HERO_DBFIDS: Record<string, number> = {
  DRUID: 274,
  HUNTER: 31,
  MAGE: 637,
  PALADIN: 671,
  PRIEST: 813,
  ROGUE: 930,
  SHAMAN: 1066,
  WARLOCK: 893,
  WARRIOR: 7,
  DEMONHUNTER: 56550,
  DEATHKNIGHT: 78065,
};

function writeVarint(buf: number[], value: number): void {
  let v = value;
  while (v > 127) {
    buf.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  buf.push(v & 0x7f);
}

function readVarint(buf: Buffer, offset: { pos: number }): number {
  let result = 0;
  let shift = 0;
  while (offset.pos < buf.length) {
    const byte = buf[offset.pos++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return result;
    shift += 7;
  }
  return result;
}

export function decodeDeckstring(deckstring: string): {
  heroDbfId: number;
  format: number;
  cards: [number, number][];
  sideboard: [number, number][];
} {
  const buf = Buffer.from(deckstring, 'base64');
  const offset = { pos: 0 };

  offset.pos++; // skip reserved byte
  readVarint(buf, offset); // version (1)
  const format = readVarint(buf, offset);
  const heroCount = readVarint(buf, offset);
  let heroDbfId = 0;
  for (let i = 0; i < heroCount; i++) heroDbfId = readVarint(buf, offset);

  const cards: [number, number][] = [];

  const singleCount = readVarint(buf, offset);
  for (let i = 0; i < singleCount; i++) cards.push([readVarint(buf, offset), 1]);

  const doubleCount = readVarint(buf, offset);
  for (let i = 0; i < doubleCount; i++) cards.push([readVarint(buf, offset), 2]);

  const nCopyCount = readVarint(buf, offset);
  for (let i = 0; i < nCopyCount; i++) {
    const dbfId = readVarint(buf, offset);
    const count = readVarint(buf, offset);
    cards.push([dbfId, count]);
  }

  const sideboard: [number, number][] = [];
  if (offset.pos < buf.length) {
    const sideboardFlag = readVarint(buf, offset);
    if (sideboardFlag === 1) {
      const sbSingleCount = readVarint(buf, offset);
      for (let i = 0; i < sbSingleCount; i++) {
        const companion = readVarint(buf, offset);
        const owner = readVarint(buf, offset);
        sideboard.push([companion, owner]);
      }
    }
  }

  return { heroDbfId, format, cards, sideboard };
}

export function encodeDeckstring(
  heroDbfId: number,
  cards: [number, number][],
  format = 2,
  sideboard?: [number, number][],
): string {
  const singles: number[] = [];
  const doubles: number[] = [];
  const nCopies: [number, number][] = [];

  for (const [dbfId, count] of cards) {
    if (count === 1) singles.push(dbfId);
    else if (count === 2) doubles.push(dbfId);
    else nCopies.push([dbfId, count]);
  }

  singles.sort((a, b) => a - b);
  doubles.sort((a, b) => a - b);
  nCopies.sort((a, b) => a[0] - b[0]);

  const buf: number[] = [];
  buf.push(0x00);
  writeVarint(buf, 1);
  writeVarint(buf, format);
  writeVarint(buf, 1);
  writeVarint(buf, heroDbfId);

  writeVarint(buf, singles.length);
  for (const id of singles) writeVarint(buf, id);

  writeVarint(buf, doubles.length);
  for (const id of doubles) writeVarint(buf, id);

  writeVarint(buf, nCopies.length);
  for (const [id, count] of nCopies) {
    writeVarint(buf, id);
    writeVarint(buf, count);
  }

  if (sideboard && sideboard.length > 0) {
    writeVarint(buf, 1);
    const sorted = [...sideboard].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    writeVarint(buf, sorted.length);
    for (const [companionDbfId, ownerDbfId] of sorted) {
      writeVarint(buf, companionDbfId);
      writeVarint(buf, ownerDbfId);
    }
    writeVarint(buf, 0);
    writeVarint(buf, 0);
  }

  return Buffer.from(buf).toString('base64');
}

export interface HsrArchetype {
  id: number;
  name: string;
  player_class: number;
  player_class_name: string;
  url: string;
}

export interface HsrDeckEntry {
  deck_id: string;
  total_games: number;
  win_rate: number;
  archetype_id: number;
  deck_list: string;
  deck_sideboard?: string;
  avg_game_length_seconds?: number;
}

export interface HsrArchetypeStats {
  archetype_id: number;
  pct_of_class: number;
  pct_of_total: number;
  total_games: number;
  win_rate: number;
  avg_game_length_seconds?: number;
}

export interface ArchetypeInfo {
  id: number;
  name: string;
  playerClass: string;
  url: string;
  pctOfTotal?: number;
  winRate?: number;
  totalGames?: number;
  avgTurns?: number;
  avgDuration?: number;
  climbingSpeed?: number;
}

export interface DeckInfo {
  deckId: string;
  archetypeId: number;
  playerClass: string;
  winRate: number;
  totalGames: number;
  cards: [number, number][];
  deckstring: string;
  duration?: number;
  sideboardPairs?: [number, number][];
}

export interface CompanionCard {
  id: string;
  name: string;
  cost: number;
  type: string;
  set: string;
  rarity: string;
  cardClass: string;
  ownerDbfId?: number;
  sideboard?: boolean;
}

export interface DecksResponse {
  archetypes: ArchetypeInfo[];
  decks: DeckInfo[];
  companionCards: Record<string, CompanionCard>;
  fetchedAt: number;
  source: 'hsreplay' | 'hsguru';
}

