/**
 * 最適編成の探索
 *
 * - Expedition 3 人（集結・熊狩り・駐屯）
 *     集結リーダーは 3 人全員のスキルが有効で、公式 Wiki によれば隊長枠の位置は結果に影響しない。
 *     そのため順列 P(n,3) ではなく組合せ C(n,3)（= P(n,3)/6）を全探索する。
 *     「兵種ごとに 1 人」制約がオンなら 歩×騎×弓 の直積を全探索する。
 *     表示順は「参加時に効く 1 番目のスキルが強い英雄」を左端に置く。
 * - ジョイナー: 先頭英雄の 1 番目のスキルしか効かないので英雄単位で評価する。
 * - Conquest（アリーナ 5 人 / 征服 3 人）
 *     位置ごとに推奨兵種があるので、位置別の上位候補に絞ってから組み合わせる（フィルタリング）。
 *     探索空間が上限を超える場合は遺伝的アルゴリズムに切り替える。
 * - 兵種比率: 上位候補ごとにプリセットの周辺を 1% 刻みで探索する。
 */
import type {
  EventType,
  FormationResult,
  HeroMaster,
  OptimizeRequest,
  OptimizeResult,
  TroopRatio,
  TroopType,
  UserData,
} from '../types';
import { TROOP_TYPES } from '../types';
import { EVENT_RULES, presetFor } from '../master/events';
import { DEFAULT_CONFIG, type CalcConfig } from './config';
import {
  heroGearFactor,
  heroGrowth,
  joinerSkillValue,
  precomputeExpedition,
  scoreExpedition,
  scoreHeroBattle,
  usesEstimated,
  type ExpeditionPrecomp,
} from './calculator';

export const DEFAULT_REQUEST: OptimizeRequest = {
  event: 'rally',
  role: 'leader',
  oneHeroPerTroop: true,
  enemyRatio: { infantry: 60, cavalry: 20, archer: 20 },
  optimizeRatio: true,
  exhaustiveLimit: 200_000,
  topN: 10,
};

/* ------------------------------------------------------------------ */
/* 組合せユーティリティ                                                */
/* ------------------------------------------------------------------ */

export function* combinations<T>(xs: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield [...acc];
    return;
  }
  for (let i = start; i <= xs.length - (k - acc.length); i++) {
    acc.push(xs[i]!);
    yield* combinations(xs, k, i + 1, acc);
    acc.pop();
  }
}

export function countCombinations(n: number, k: number): number {
  if (k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

export function countPermutations(n: number, k: number): number {
  if (k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r *= n - i;
  return r;
}

/** 決定的な乱数（同じ入力なら同じ結果を返すため） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* 兵種比率                                                            */
/* ------------------------------------------------------------------ */

export function normalizeRatio(r: TroopRatio): TroopRatio {
  const sum = TROOP_TYPES.reduce((s, t) => s + Math.max(0, r[t]), 0) || 1;
  const out = {} as TroopRatio;
  let acc = 0;
  TROOP_TYPES.forEach((t, i) => {
    if (i === TROOP_TYPES.length - 1) out[t] = 100 - acc;
    else {
      out[t] = Math.round((Math.max(0, r[t]) / sum) * 100);
      acc += out[t];
    }
  });
  return out;
}

/**
 * プリセットの ±spread % の範囲を 1% 刻みで探索し、スコア最大の比率を返す。
 * 在庫が足りない兵種は troopsSent 側で頭打ちになるため、自動的に不利な比率として評価される。
 */
export function optimizeRatio(
  pre: ExpeditionPrecomp,
  preset: TroopRatio,
  user: UserData,
  cfg: CalcConfig = DEFAULT_CONFIG,
  spread = 15,
): { ratio: TroopRatio; total: number } {
  let best = { ratio: preset, total: scoreExpedition(pre, preset, user, cfg).total };
  const lo = (v: number) => Math.max(0, v - spread);
  const hi = (v: number) => Math.min(100, v + spread);
  for (let inf = lo(preset.infantry); inf <= hi(preset.infantry); inf++) {
    for (let cav = lo(preset.cavalry); cav <= hi(preset.cavalry); cav++) {
      const arc = 100 - inf - cav;
      if (arc < 0 || arc < lo(preset.archer) || arc > hi(preset.archer)) continue;
      const ratio = { infantry: inf, cavalry: cav, archer: arc };
      const total = scoreExpedition(pre, ratio, user, cfg).total;
      if (total > best.total + 1e-9) best = { ratio, total };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 本体                                                                */
/* ------------------------------------------------------------------ */

interface Ctx {
  heroes: Map<string, HeroMaster>;
  user: UserData;
  req: OptimizeRequest;
  cfg: CalcConfig;
  preset: TroopRatio;
}

export function ownedHeroes(heroes: Map<string, HeroMaster>, user: UserData): HeroMaster[] {
  return [...heroes.values()].filter((h) => user.heroes[h.id]?.owned);
}

export function optimize(
  heroes: Map<string, HeroMaster>,
  user: UserData,
  request: Partial<OptimizeRequest> = {},
  cfg: CalcConfig = DEFAULT_CONFIG,
): OptimizeResult {
  const started = Date.now();
  const req: OptimizeRequest = { ...DEFAULT_REQUEST, ...request };
  const rule = EVENT_RULES[req.event];
  const warnings: string[] = [];
  const largeArmy = TROOP_TYPES.reduce((s, t) => s + user.troops[t].count, 0) >= user.settings.marchCapacity * 2;
  const preset = presetFor(req.event, user.settings.serverGeneration, req.role, largeArmy).ratio;
  const ctx: Ctx = { heroes, user, req, cfg, preset };

  const pool = ownedHeroes(heroes, user);
  const slots = req.slotOverride ?? rule.slots;
  if (pool.length === 0) {
    return { request: req, results: [], searched: 0, method: 'exhaustive', elapsedMs: 0, warnings: ['所持英雄が登録されていません。/setup で所持英雄にチェックを入れてください。'] };
  }
  if (pool.length < slots && !(rule.skillSet === 'expedition' && req.role === 'joiner')) {
    warnings.push(`所持英雄が ${pool.length} 人のため、${slots} 人編成の空き枠があります。`);
  }

  let out: { results: FormationResult[]; searched: number; method: OptimizeResult['method'] };
  if (rule.skillSet === 'expedition') {
    out = req.role === 'joiner' ? searchJoiner(ctx, pool) : searchExpeditionLeader(ctx, pool, Math.min(slots, 3));
  } else {
    out = searchHeroBattle(ctx, pool, slots);
  }

  const missing = new Set(out.results.flatMap((r) => (r.score.heroContrib ?? []).filter((c) => c.missingSkills).map((c) => heroes.get(c.heroId)?.name ?? c.heroId)));
  if (missing.size > 0) {
    warnings.push(
      `スキルの数値が未取得の英雄は、スキル効果を 0 として計算しています（${[...missing].join('、')}）。星やレベルを上げても、スキルが判明している英雄に負けやすくなります。「データ更新」で取得すると正しく比較できます。`,
    );
  }
  const estimated = out.results.filter((r) => r.usesEstimatedData).length;
  if (estimated > 0) warnings.push(`上位 ${out.results.length} 件中 ${estimated} 件に推定値の英雄が含まれます。/data でクロールすると精度が上がります。`);

  return { request: req, results: out.results, searched: out.searched, method: out.method, elapsedMs: Date.now() - started, warnings };
}

/* ---------------- Expedition: リーダー ---------------- */

function searchExpeditionLeader(ctx: Ctx, pool: HeroMaster[], k: number) {
  const { user, req, cfg, heroes, preset } = ctx;
  const candidates: HeroMaster[][] = [];

  if (req.oneHeroPerTroop) {
    const byTroop = (t: TroopType) => {
      const xs = pool.filter((h) => h.troop === t);
      return xs.length ? xs : [null];
    };
    for (const i of byTroop('infantry'))
      for (const c of byTroop('cavalry'))
        for (const a of byTroop('archer')) {
          const f = [i, c, a].filter((x): x is HeroMaster => x !== null);
          if (f.length) candidates.push(f);
        }
  } else {
    const kk = Math.min(k, pool.length);
    const space = countCombinations(pool.length, kk);
    if (req.exhaustiveLimit > 0 && space > req.exhaustiveLimit) {
      return geneticExpedition(ctx, pool, kk);
    }
    for (const f of combinations(pool, kk)) candidates.push(f);
  }

  // 1 次評価: プリセット比率でスコアリング
  const scored = candidates.map((f) => {
    const pre = precomputeExpedition(f, user, req.event, 'leader', req.enemyRatio, heroes, cfg);
    return { f, pre, total: scoreExpedition(pre, preset, user, cfg).total };
  });
  scored.sort((a, b) => b.total - a.total);

  // 2 次評価: 上位だけ比率を最適化
  const refineN = Math.min(scored.length, req.topN * 2);
  const refined = scored.slice(0, refineN).map(({ f, pre }) => {
    const best = req.optimizeRatio ? optimizeRatio(pre, preset, user, cfg) : { ratio: preset, total: 0 };
    const score = scoreExpedition(pre, best.ratio, user, cfg);
    return toResult(orderForDisplay(f, user, req.event), best.ratio, score, 'expedition');
  });
  refined.sort((a, b) => b.score.total - a.score.total);
  return { results: refined.slice(0, req.topN), searched: candidates.length, method: 'exhaustive' as const };
}

/** 参加時に効く 1 番目のスキルが強い英雄を左端へ（リーダーのスコアは順序に依存しない） */
function orderForDisplay(f: HeroMaster[], user: UserData, event: EventType): HeroMaster[] {
  return [...f].sort((a, b) => {
    const oa = user.heroes[a.id];
    const ob = user.heroes[b.id];
    const va = oa ? joinerSkillValue(a, oa, event) : 0;
    const vb = ob ? joinerSkillValue(b, ob, event) : 0;
    return vb - va;
  });
}

/* ---------------- Expedition: ジョイナー ---------------- */

function searchJoiner(ctx: Ctx, pool: HeroMaster[]) {
  const { user, req, cfg, heroes, preset } = ctx;
  const ranked = pool
    .map((h) => {
      const o = user.heroes[h.id]!;
      const value = joinerSkillValue(h, o, req.event);
      const pre = precomputeExpedition([h], user, req.event, 'joiner', req.enemyRatio, heroes, cfg);
      const best = req.optimizeRatio ? optimizeRatio(pre, preset, user, cfg) : { ratio: preset, total: 0 };
      const score = scoreExpedition(pre, best.ratio, user, cfg);
      score.notes = [...score.notes, `集結に加わる効果: ${value.toFixed(1)}%（${h.skills.find((s) => s.kind === 'expedition')?.name ?? 'スキル情報なし'}）`];
      // ジョイナーの順位はスキル価値で決める（兵力部分は誰を選んでも同じ）
      return { h, value, result: toResult([h], best.ratio, { ...score, total: value }, 'expedition') };
    })
    .sort((a, b) => b.value - a.value);
  return { results: ranked.slice(0, ctx.req.topN).map((r) => r.result), searched: pool.length, method: 'exhaustive' as const };
}

/* ---------------- Conquest: アリーナ / 征服 ---------------- */

function heroPower(h: HeroMaster, user: UserData, cfg: CalcConfig) {
  const o = user.heroes[h.id]!;
  const g = heroGrowth(o, cfg) * heroGearFactor(o, cfg);
  return { tank: h.conquest.health * g * (1 + h.conquest.defense / 10000), dps: h.conquest.attack * g };
}

function searchHeroBattle(ctx: Ctx, pool: HeroMaster[], slots: number) {
  const { user, req, cfg, heroes, preset } = ctx;
  const positions = (EVENT_RULES[req.event].positions ?? []).slice(0, slots);
  const k = Math.min(slots, pool.length);

  const evaluate = (f: HeroMaster[]) => scoreHeroBattle(f, user, req.event, req.enemyRatio, heroes, cfg);
  const space = countPermutations(pool.length, k);
  let method: OptimizeResult['method'];
  let candidates: HeroMaster[][];

  // exhaustiveLimit <= 0 は「常に全探索」だが、ブラウザが固まらないよう上限を設ける
  const HARD_CAP = 2_000_000;
  if (space <= HARD_CAP && (req.exhaustiveLimit <= 0 || space <= req.exhaustiveLimit)) {
    // 全探索（位置が意味を持つので順列）
    method = 'exhaustive';
    candidates = [];
    for (const c of combinations(pool, k)) for (const p of permutations(c)) candidates.push(p);
  } else {
    // フィルタリング: 位置グループごとに推奨兵種・役割で上位 K 人に絞ってから組み合わせる
    method = 'filtered';
    candidates = filteredCandidates(pool, positions, user, cfg);
    if (candidates.length === 0) return geneticHeroBattle(ctx, pool, k);
  }

  const scored = candidates.map((f) => ({ f, s: evaluate(f) }));
  scored.sort((a, b) => b.s.total - a.s.total);
  const seen = new Set<string>();
  const results: FormationResult[] = [];
  for (const { f, s } of scored) {
    // 同じ位置グループ内の並べ替えは同一編成として扱う
    const key = groupKey(f, positions);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(toResult(f, preset, s, 'conquest'));
    if (results.length >= req.topN) break;
  }
  return { results, searched: candidates.length, method };
}

function* permutations<T>(xs: T[]): Generator<T[]> {
  if (xs.length <= 1) {
    yield [...xs];
    return;
  }
  for (let i = 0; i < xs.length; i++) {
    const rest = [...xs.slice(0, i), ...xs.slice(i + 1)];
    for (const p of permutations(rest)) yield [xs[i]!, ...p];
  }
}

function groupKey(f: HeroMaster[], positions: Array<{ label: string }>): string {
  const groups = new Map<string, string[]>();
  f.forEach((h, i) => {
    const g = positions[i]?.label ?? String(i);
    groups.set(g, [...(groups.get(g) ?? []), h.id]);
  });
  return [...groups.entries()].map(([g, ids]) => `${g}:${ids.sort().join('+')}`).join('|');
}

/** 位置グループ（前衛/側面/後衛）ごとに上位候補を選び、重複なしで組み合わせる */
export function filteredCandidates(
  pool: HeroMaster[],
  positions: Array<{ label: string; preferred: TroopType | null }>,
  user: UserData,
  cfg: CalcConfig,
  perGroup = 8,
): HeroMaster[][] {
  const groups: Array<{ label: string; size: number; preferred: TroopType | null }> = [];
  for (const p of positions) {
    const g = groups.find((x) => x.label === p.label);
    if (g) g.size++;
    else groups.push({ label: p.label, size: 1, preferred: p.preferred });
  }
  const rankFor = (g: (typeof groups)[number]) =>
    [...pool]
      .map((h) => {
        const pw = heroPower(h, user, cfg);
        const fit = g.preferred === null || g.preferred === h.troop ? 1 : cfg.positionMismatchPenalty.value;
        const value = (g.label === '前衛' ? pw.tank : pw.dps) * fit;
        return { h, value };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, perGroup)
      .map((x) => x.h);

  const pickLists = groups.map((g) => ({ g, list: rankFor(g) }));
  const out: HeroMaster[][] = [];
  const recurse = (gi: number, used: Set<string>, acc: HeroMaster[]) => {
    if (gi === pickLists.length) {
      out.push([...acc]);
      return;
    }
    const { g, list } = pickLists[gi]!;
    const avail = list.filter((h) => !used.has(h.id));
    for (const combo of combinations(avail, Math.min(g.size, avail.length))) {
      combo.forEach((h) => used.add(h.id));
      recurse(gi + 1, used, [...acc, ...combo]);
      combo.forEach((h) => used.delete(h.id));
    }
  };
  recurse(0, new Set(), []);
  return out;
}

/* ---------------- 遺伝的アルゴリズム ---------------- */

interface GaOptions {
  population: number;
  generations: number;
  mutationRate: number;
  seed: number;
}
const GA_DEFAULT: GaOptions = { population: 80, generations: 120, mutationRate: 0.25, seed: 20261025 };

/**
 * 長さ k の重複なし配列を個体とする GA。
 * 選択: トーナメント（3）/ 交叉: 親 A の前半 + 親 B から不足分 / 突然変異: 未使用の英雄と入れ替え
 */
export function geneticSearch(
  pool: HeroMaster[],
  k: number,
  fitness: (f: HeroMaster[]) => number,
  opts: Partial<GaOptions> = {},
): Array<{ f: HeroMaster[]; fit: number }> {
  const o = { ...GA_DEFAULT, ...opts };
  const rnd = mulberry32(o.seed);
  const pick = () => pool[Math.floor(rnd() * pool.length)]!;
  const randomIndividual = () => {
    const ids = new Set<string>();
    const f: HeroMaster[] = [];
    while (f.length < k) {
      const h = pick();
      if (!ids.has(h.id)) {
        ids.add(h.id);
        f.push(h);
      }
    }
    return f;
  };
  const cache = new Map<string, number>();
  const fit = (f: HeroMaster[]) => {
    const key = f.map((h) => h.id).join(',');
    if (!cache.has(key)) cache.set(key, fitness(f));
    return cache.get(key)!;
  };

  let pop = Array.from({ length: o.population }, randomIndividual);
  for (let gen = 0; gen < o.generations; gen++) {
    const ranked = pop.map((f) => ({ f, s: fit(f) })).sort((a, b) => b.s - a.s);
    const elite = ranked.slice(0, Math.max(2, Math.floor(o.population * 0.1))).map((x) => x.f);
    const tournament = () => {
      let best = ranked[Math.floor(rnd() * ranked.length)]!;
      for (let i = 0; i < 2; i++) {
        const c = ranked[Math.floor(rnd() * ranked.length)]!;
        if (c.s > best.s) best = c;
      }
      return best.f;
    };
    const next = [...elite];
    while (next.length < o.population) {
      const a = tournament();
      const b = tournament();
      const cut = 1 + Math.floor(rnd() * Math.max(1, k - 1));
      const child = a.slice(0, cut);
      for (const h of b) if (child.length < k && !child.some((x) => x.id === h.id)) child.push(h);
      while (child.length < k) {
        const h = pick();
        if (!child.some((x) => x.id === h.id)) child.push(h);
      }
      if (rnd() < o.mutationRate) {
        const i = Math.floor(rnd() * k);
        const h = pick();
        if (!child.some((x) => x.id === h.id)) child[i] = h;
        else {
          const j = Math.floor(rnd() * k);
          [child[i], child[j]] = [child[j]!, child[i]!];
        }
      }
      next.push(child);
    }
    pop = next;
  }
  const seen = new Set<string>();
  return [...cache.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([key]) => {
      const sorted = key.split(',').sort().join(',');
      if (seen.has(sorted)) return false;
      seen.add(sorted);
      return true;
    })
    .map(([key, s]) => ({ f: key.split(',').map((id) => pool.find((h) => h.id === id)!), fit: s }));
}

function geneticExpedition(ctx: Ctx, pool: HeroMaster[], k: number) {
  const { user, req, cfg, heroes, preset } = ctx;
  const ranked = geneticSearch(pool, k, (f) => {
    const pre = precomputeExpedition(f, user, req.event, 'leader', req.enemyRatio, heroes, cfg);
    return scoreExpedition(pre, preset, user, cfg).total;
  });
  const results = ranked.slice(0, req.topN).map(({ f }) => {
    const pre = precomputeExpedition(f, user, req.event, 'leader', req.enemyRatio, heroes, cfg);
    const best = req.optimizeRatio ? optimizeRatio(pre, preset, user, cfg) : { ratio: preset, total: 0 };
    return toResult(orderForDisplay(f, user, req.event), best.ratio, scoreExpedition(pre, best.ratio, user, cfg), 'expedition');
  });
  results.sort((a, b) => b.score.total - a.score.total);
  return { results, searched: GA_DEFAULT.population * GA_DEFAULT.generations, method: 'genetic' as const };
}

function geneticHeroBattle(ctx: Ctx, pool: HeroMaster[], k: number) {
  const { user, req, cfg, heroes, preset } = ctx;
  const ranked = geneticSearch(pool, k, (f) => scoreHeroBattle(f, user, req.event, req.enemyRatio, heroes, cfg).total);
  const results = ranked
    .slice(0, req.topN)
    .map(({ f }) => toResult(f, preset, scoreHeroBattle(f, user, req.event, req.enemyRatio, heroes, cfg), 'conquest'));
  return { results, searched: GA_DEFAULT.population * GA_DEFAULT.generations, method: 'genetic' as const };
}

function toResult(f: HeroMaster[], ratio: TroopRatio, score: FormationResult['score'], skillSet: 'expedition' | 'conquest'): FormationResult {
  const { ...plain } = score as FormationResult['score'] & { heroes?: unknown };
  delete (plain as { heroes?: unknown }).heroes;
  return { heroIds: f.map((h) => h.id), ratio: normalizeRatio(ratio), score: plain, usesEstimatedData: usesEstimated(f, skillSet) };
}
