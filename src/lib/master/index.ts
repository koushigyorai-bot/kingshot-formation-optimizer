import type {
  ConquestStats,
  DataConflict,
  ExpeditionStats,
  FormationTemplate,
  HeroMaster,
  MasterData,
  Rarity,
  Skill,
  SourceRef,
  TierList,
  TroopType,
  WidgetMaster,
} from '../types';
import { buildSeedHeroes } from './heroes';
import { parseSkillDescription } from '../crawler/parseSkill';
import { SITE_PROFILES, SRC, sitePriority } from './sources';

export { EVENT_RULES, presetFor, COUNTERS } from './events';
export { SITE_PROFILES } from './sources';

/** 討伐ランキング（アルテマ「最強キャラランキング」、2026-10-29 閲覧） */
const SEED_TOUBATSU_TIER: TierList = {
  category: 'conquest',
  source: SRC.altemaRanking,
  entries: [
    ...['diego', 'liz', 'luna', 'charles', 'ava', 'wee-woo'].map((heroId) => ({ heroId, tier: 'SS' })),
    ...['triton', 'sophia', 'yang', 'long-fei', 'thrud', 'vivian'].map((heroId) => ({ heroId, tier: 'S' })),
    ...['alcar', 'margot', 'rosa', 'eric', 'petra', 'jaeger', 'zoe', 'hilde', 'marlin', 'helga', 'jabel', 'amadeus', 'saul'].map((heroId) => ({ heroId, tier: 'A' })),
    ...['chenko', 'howard', 'gordon', 'quinn', 'amane', 'yeonwoo', 'fahd'].map((heroId) => ({ heroId, tier: 'B' })),
    ...['diana', 'olive', 'forrest', 'edwin', 'seth'].map((heroId) => ({ heroId, tier: 'C' })),
  ],
};

/** 討伐のおすすめ編成例（アルテマ 第 4 世代ページ）: 前列 エリック・アルカ ／ 後列 マーゴ・ローザ・ペーラ */
const SEED_TOUBATSU_TEMPLATE: FormationTemplate = {
  event: 'conquest',
  heroIds: ['eric', 'alcar', 'margot', 'rosa', 'petra'],
  generation: 4,
  label: '前列 エリック・アルカ ／ 後列 マーゴ・ローザ・ペーラ',
  source: SRC.altemaGen4,
};

export function seedMasterData(): MasterData {
  return {
    version: 1,
    updatedAt: '2026-10-25T00:00:00Z',
    heroes: buildSeedHeroes(),
    tierLists: [SEED_TOUBATSU_TIER],
    templates: [SEED_TOUBATSU_TEMPLATE],
    conflicts: [],
  };
}

/** クロールで得た 1 英雄分の部分データ */
export interface HeroPatch {
  heroId: string;
  name?: string;
  nameJa?: string;
  generation?: number | null;
  rarity?: Rarity;
  troop?: TroopType;
  conquest?: Partial<ConquestStats>;
  expedition?: Partial<ExpeditionStats>;
  skills?: Skill[];
  widget?: WidgetMaster;
  source: SourceRef;
}

export interface CrawlSnapshot {
  crawledAt: string;
  heroPatches: HeroPatch[];
  tierLists: TierList[];
  templates: FormationTemplate[];
  siteReports: SiteReport[];
}

export interface SiteReport {
  site: SourceRef['site'];
  ok: boolean;
  pagesFetched: number;
  pagesSkippedByRobots: number;
  heroesParsed: number;
  warnings: string[];
  error?: string;
  durationMs: number;
}

/** 英雄名・別表記 → ID */
export function normalizeHeroId(nameOrSlug: string, heroes: Pick<HeroMaster, 'id' | 'name'>[]): string | null {
  const key = nameOrSlug
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const aliases: Record<string, string> = {
    jaegar: 'jaeger',
    'wee woo': 'wee-woo',
    weewoo: 'wee-woo',
    'long fei': 'long-fei',
    longfei: 'long-fei',
    merlin: 'marlin',
    yeonwo: 'yeonwoo',
  };
  if (aliases[key]) return aliases[key];
  const hit = heroes.find((h) => h.id === key.replace(/ /g, '-') || h.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === key);
  return hit ? hit.id : null;
}

const fmt = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * シード（または保存済みマスター）にクロール結果を重ねる。
 *
 * 規則:
 *  - 値ごとに「出典の優先度」が高い方を採用（公式 > ファンサイト > 推定）
 *  - 同じ項目で値が食い違えば DataConflict に記録
 *  - 差別的コンテンツとしてマークされたサイトの値は採用しない
 */
export function mergeMasterData(base: MasterData, snapshot: CrawlSnapshot): MasterData {
  const heroes = new Map(base.heroes.map((h) => [h.id, structuredCloneSafe(h)]));
  const conflicts: DataConflict[] = [];
  /** heroId:field → 現在採用している出典の優先度 */
  const adoptedPriority = new Map<string, number>();

  const currentPriority = (h: HeroMaster, field: string): number => {
    const k = `${h.id}:${field}`;
    if (adoptedPriority.has(k)) return adoptedPriority.get(k)!;
    const estimated = h.estimatedFields?.includes(field as never);
    if (estimated) return sitePriority('estimate');
    // シードで採用済みの出典のうち最良のもの（一覧ページの出典はステータスの根拠ではないので除外）
    const ps = h.sources.filter((s) => s.site !== 'estimate' && !s.note?.includes('世代・兵種')).map((s) => sitePriority(s.site));
    return ps.length ? Math.min(...ps) : sitePriority('estimate');
  };

  const patches = [...snapshot.heroPatches].sort((a, b) => sitePriority(b.source.site) - sitePriority(a.source.site));

  for (const p of patches) {
    if (SITE_PROFILES[p.source.site]?.flagged || p.source.flag) continue;
    let h = heroes.get(p.heroId);
    if (!h) {
      // クロールで見つかった新英雄: 名前・兵種・レアリティが揃っていれば追加する
      if (!p.name || !p.troop || !p.rarity) continue;
      h = {
        id: p.heroId,
        name: p.name,
        generation: p.generation ?? null,
        rarity: p.rarity,
        troop: p.troop,
        conquest: { attack: 0, defense: 0, health: 0 },
        expedition: { attack: 0, defense: 0 },
        skills: [],
        sources: [],
        dataStatus: 'estimated',
        estimatedFields: ['conquest', 'expedition', 'skills'],
      };
      heroes.set(h.id, h);
    }
    const pr = sitePriority(p.source.site);

    const apply = <K extends 'conquest' | 'expedition' | 'skills' | 'widget' | 'generation' | 'troop' | 'rarity'>(
      field: K,
      next: HeroMaster[K] | undefined,
    ) => {
      if (next === undefined) return;
      const cur = h[field];
      const curPr = currentPriority(h, field);
      const same = fmt(cur) === fmt(next);
      if (!same && cur !== undefined && !(h.estimatedFields?.includes(field as never))) {
        const existing = conflicts.find((c) => c.heroId === h.id && c.field === field);
        const entry = { site: p.source.site, value: fmt(next) };
        if (existing) existing.values.push(entry);
        else conflicts.push({ heroId: h.id, field, values: [{ site: bestSite(h), value: fmt(cur) }, entry], adopted: pr <= curPr ? p.source.site : bestSite(h) });
      }
      if (pr <= curPr) {
        if (field === 'skills' && Array.isArray(cur) && Array.isArray(next)) {
          const ja = new Map((cur as Skill[]).filter((s) => s.nameJa).map((s) => [s.name, s.nameJa!]));
          next = (next as Skill[]).map((s) => (s.nameJa || !ja.has(s.name) ? s : { ...s, nameJa: ja.get(s.name) })) as typeof next;
        }
        (h as unknown as Record<string, unknown>)[field] = next;
        adoptedPriority.set(`${h.id}:${field}`, pr);
        if (h.estimatedFields) h.estimatedFields = h.estimatedFields.filter((f) => f !== field);
        const c = conflicts.find((x) => x.heroId === h.id && x.field === field);
        if (c) c.adopted = p.source.site;
      }
    };

    if (p.conquest && isCompleteConquest(p.conquest)) apply('conquest', p.conquest);
    if (p.expedition && p.expedition.attack !== undefined) {
      apply('expedition', { attack: p.expedition.attack, defense: p.expedition.defense ?? p.expedition.attack });
    }
    if (p.skills && p.skills.length > 0) apply('skills', p.skills);
    if (p.widget) apply('widget', p.widget);
    if (p.troop) apply('troop', p.troop);
    if (p.rarity) apply('rarity', p.rarity);
    if (p.generation !== undefined) apply('generation', p.generation);
    // 日本語名は公式 Wiki 日本語版で取れた場合だけ、未設定の英雄に入れる（同梱の表記を優先）
    if (p.nameJa && !h.nameJa && p.source.site === 'kingshotwiki.com') h.nameJa = p.nameJa;

    if (!h.sources.some((s) => s.site === p.source.site && s.url === p.source.url)) h.sources.push(p.source);
    h.sources = h.sources.filter((s) => s.site !== 'estimate' || (h.estimatedFields?.length ?? 0) > 0);
    h.dataStatus = deriveStatus(h);
    if (h.estimatedFields && h.estimatedFields.length === 0) delete h.estimatedFields;
  }

  return {
    version: 1,
    updatedAt: snapshot.crawledAt,
    heroes: [...heroes.values()],
    tierLists: dedupeBy([...snapshot.tierLists, ...base.tierLists], (t) => `${t.source.site}:${t.category}`),
    templates: dedupeBy([...snapshot.templates, ...base.templates], (t) => `${t.source.site}:${t.event}:${t.heroIds.join(',')}`),
    conflicts,
  };
}

function isCompleteConquest(c: Partial<ConquestStats>): c is ConquestStats {
  return c.attack !== undefined && c.defense !== undefined && c.health !== undefined;
}

function bestSite(h: HeroMaster): SourceRef['site'] {
  const sorted = [...h.sources].sort((a, b) => sitePriority(a.site) - sitePriority(b.site));
  return sorted[0]?.site ?? 'estimate';
}

function deriveStatus(h: HeroMaster): HeroMaster['dataStatus'] {
  const est = h.estimatedFields?.length ?? 0;
  const official = h.sources.some((s) => s.reliability === 'official' && !s.note?.includes('世代・兵種'));
  if (est === 0 && official) return 'verified';
  if (est === 0) return 'partial';
  return h.sources.some((s) => s.site !== 'estimate' && !s.note?.includes('世代・兵種')) ? 'partial' : 'estimated';
}

function dedupeBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * 保存済みのスキル効果を説明文から解析し直す。
 * パーサーを修正したとき、データ更新をやり直さなくても反映されるようにするため。
 */
export function reparseSkills(master: MasterData): MasterData {
  return {
    ...master,
    heroes: master.heroes.map((h) => ({
      ...h,
      skills: h.skills.map((s) => ({ ...s, effects: parseSkillDescription(s.description) })),
    })),
  };
}

export function heroById(master: MasterData): Map<string, HeroMaster> {
  return new Map(master.heroes.map((h) => [h.id, h]));
}
