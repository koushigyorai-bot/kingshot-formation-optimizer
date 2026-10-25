import type { EffectStat, SkillEffect, TroopType } from '../types';

/**
 * スキル説明文から効果を数値化する。
 *
 * 公式 Wiki の表記例:
 *   "increasing the total Squads' Lethality by 5%/10%/15%/20%/25%."
 *   "has a 8%/16%/24%/32%/40% chance of increasing damage dealt by 50% for all squads."
 *   "reduces his damage taken by /10%/15%/20%/25%/30%."   ← 先頭スラッシュの表記揺れ
 *   "by 3%/6%/9%/12% / 15%"                               ← 空白の表記揺れ
 *
 * 判定できない文は stat: 'other' で返す（値は保持する）。
 */

/** "5%/10%/15%" のような 2 段以上の数値列 */
const SERIES_RE = /\/?\s*(\d+(?:\.\d+)?)\s*%?(?:\s*\/\s*\d+(?:\.\d+)?\s*%?){1,}/g;

export function extractSeries(text: string): number[][] {
  const out: number[][] = [];
  for (const m of text.matchAll(SERIES_RE)) {
    const nums = m[0]
      .split('/')
      .map((s) => s.replace('%', '').trim())
      .filter((s) => s.length > 0)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (nums.length >= 2) out.push(nums);
  }
  return out;
}

/** "45%" や "+62.50%" や "1,776" を数値化 */
export function parseNumber(text: string | undefined | null): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const TROOP_WORDS: Array<[RegExp, TroopType]> = [
  [/\binfantry\b/i, 'infantry'],
  [/\bcavalry\b/i, 'cavalry'],
  [/\b(archer|archers|marksm[ae]n)\b/i, 'archer'],
];

function troopRestriction(text: string): TroopType | undefined {
  // "Infantry Attack by 30%" のように兵種名が効果直前にある場合だけ限定扱いにする
  for (const [re, t] of TROOP_WORDS) {
    const near = new RegExp(re.source + String.raw`(?:'s)?\s+(attack|lethality|defense|health|damage)`, 'i');
    if (near.test(text)) return t;
  }
  return undefined;
}

interface Rule {
  test: RegExp;
  stat: EffectStat;
  scope: SkillEffect['scope'];
}

/** 上から順に評価。1 文が複数ルールに当たる場合（"Lethality and Health"）は全部採用。 */
const RULES: Rule[] = [
  { test: /rally attack/i, stat: 'rallyAttack', scope: 'squad' },
  { test: /enemy[^.]{0,40}\battack\b[^.]{0,30}(reduc|decreas|lower)|(reduc|decreas|lower)[^.]{0,40}enemy[^.]{0,30}\battack\b/i, stat: 'enemyAttackDown', scope: 'enemy' },
  { test: /(damage taken by (the )?(target|enem)|enem[^.]{0,30}damage taken)[^.]{0,30}(increas|amplif)|(amplif|increas)[^.]{0,30}damage taken by (the )?(target|enem)/i, stat: 'enemyDamageTakenUp', scope: 'enemy' },
  { test: /(reduc|decreas|lower)[^.]{0,40}damage taken|damage taken[^.]{0,20}(reduc|decreas)/i, stat: 'damageTakenDown', scope: 'squad' },
  { test: /lethality/i, stat: 'lethality', scope: 'squad' },
  { test: /(squads?'?|troops'?)\s*(attack)|attack.{0,40}?for all troops|(infantry|cavalry|archer)s?'?\s+attack/i, stat: 'squadAttack', scope: 'squad' },
  { test: /(squads?'?|soldiers|troops'?)\s*[^.]{0,20}health|health for all deployed/i, stat: 'squadHealth', scope: 'squad' },
  { test: /(squads?'?|troops'?)\s*defen[cs]e/i, stat: 'squadDefense', scope: 'squad' },
  { test: /critical (hit )?(rate|chance)/i, stat: 'critRate', scope: 'squad' },
  { test: /critical (hit )?damage/i, stat: 'critDamage', scope: 'squad' },
  { test: /(dealing|deals?|deal)[^.]{0,20}attack\s*[*×x]\s*\d|attack\s*[*×x]\s*\d[^.]{0,40}damage/i, stat: 'skillDamage', scope: 'self' },
  { test: /(restor|heal)/i, stat: 'heal', scope: 'heroes' },
  { test: /damage dealt/i, stat: 'damageUp', scope: 'squad' },
  { test: /increas\w*\s+(his |her |their )?attack/i, stat: 'heroAttack', scope: 'self' },
  { test: /defen[cs]e by/i, stat: 'heroDefense', scope: 'self' },
];

/**
 * 確率発動型: "X%/... chance of increasing damage dealt by 50%"
 * 期待値 = 発動率 × 効果量 として damageUp に換算する。
 */
const CHANCE_RE = /chance[^.]{0,60}?(?:increas\w*|boost\w*)[^.]{0,30}?(damage|attack|lethality)[^.]{0,20}?by\s+(\d+(?:\.\d+)?)%/i;

export function parseSkillDescription(description: string): SkillEffect[] {
  const text = description.replace(/\s+/g, ' ').trim();
  const series = extractSeries(text);
  if (series.length === 0) return [];

  const chance = text.match(CHANCE_RE);
  if (chance && /chance/i.test(text)) {
    const magnitude = Number(chance[2]);
    const statWord = (chance[1] ?? '').toLowerCase();
    const stat: EffectStat =
      statWord === 'lethality' ? 'lethality' : statWord === 'attack' ? 'squadAttack' : 'damageUp';
    const chanceSeries = series[0]!;
    return [
      {
        stat,
        values: chanceSeries.map(() => magnitude),
        chance: chanceSeries,
        scope: /all squads|all troops|squads/i.test(text) ? 'squad' : 'self',
      },
    ];
  }

  const effects: SkillEffect[] = [];
  const troop = troopRestriction(text);
  const matched = new Set<EffectStat>();

  for (const rule of RULES) {
    if (!rule.test.test(text)) continue;
    // "damage dealt" は確率型以外でも出るが、被ダメ系と重複しないようにする
    if (rule.stat === 'damageUp' && (matched.has('damageTakenDown') || matched.has('skillDamage'))) continue;
    if (rule.stat === 'heroDefense' && (matched.has('squadDefense') || matched.has('heroAttack'))) {
      // "Defense by" が部隊防御の言い換えの場合は二重計上しない
      if (matched.has('squadDefense')) continue;
    }
    if (rule.stat === 'heroAttack' && (matched.has('squadAttack') || matched.has('skillDamage'))) continue;
    // "Enemy Squads' Attack" を味方の部隊攻撃と誤認しない
    if (rule.stat === 'squadAttack' && matched.has('enemyAttackDown') && !/for all troops/i.test(text)) continue;
    if (rule.stat === 'heal' && matched.size > 0 && !/restor/i.test(text)) continue;
    matched.add(rule.stat);
  }

  // "Lethality and Health for all deployed soldiers" → 同じ数値列を 2 効果に
  // それ以外の多重ヒットは、数値列の数に応じて順番に割り当てる
  const stats = [...matched];
  if (stats.length === 0) {
    return [{ stat: 'other', values: series[0]!, scope: 'self' }];
  }

  // 本ツールの判定順と文中の出現順がずれないよう、出現位置で並べ替え
  const position = (s: EffectStat): number => {
    const words: Record<string, RegExp> = {
      skillDamage: /attack\s*[*×x]/i,
      heal: /(restor|heal)/i,
      heroAttack: /attack by/i,
      squadAttack: /attack/i,
      lethality: /lethality/i,
      squadHealth: /health/i,
      squadDefense: /defen[cs]e/i,
      heroDefense: /defen[cs]e/i,
      damageTakenDown: /damage taken/i,
    };
    const re = words[s];
    const idx = re ? text.search(re) : -1;
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
  };
  stats.sort((a, b) => position(a) - position(b));

  stats.forEach((stat, i) => {
    const values = series[Math.min(i, series.length - 1)]!;
    const rule = RULES.find((r) => r.stat === stat)!;
    let scope = rule.scope;
    if (stat === 'damageTakenDown' && !/(all troops|squads|our troops|all heroes)/i.test(text)) scope = 'self';
    if (stat === 'heroDefense' && /all heroes/i.test(text)) scope = 'heroes';
    effects.push({ stat, values, scope, ...(troop && scope === 'squad' ? { troop } : {}) });
  });

  return effects;
}

/** スキルレベル（1〜5）での実効値（%）。0 = 未解放なら 0。 */
export function effectValueAt(effect: SkillEffect, level: number): number {
  if (level <= 0) return 0;
  const i = Math.min(level, effect.values.length) - 1;
  const v = effect.values[i] ?? 0;
  if (effect.chance) {
    const c = effect.chance[Math.min(level, effect.chance.length) - 1] ?? 0;
    return (v * c) / 100;
  }
  return v;
}
