/**
 * 部隊戦闘力の計算（仕様書の式を実装）
 *
 *   基礎戦闘力         = Σ(英雄基礎ステータス × レベル補正 × 星補正) + 装備ボーナス + 領主装備ボーナス
 *   イベント補正後戦闘力 = 基礎戦闘力 × (1 + スキルバフ合計) × 兵種相性補正 × ウィジェットバフ
 *   総ダメージ期待値     = イベント補正後戦闘力 × Lethality × Squad Attack × クリティカル期待値
 *
 * 実装上の解釈:
 *  - Expedition 系（集結・熊狩り・駐屯）は兵種ごとに計算して合算する。
 *    英雄の Expedition ステータス(%) は「同じ兵種の部隊」に掛かる。
 *  - 基礎戦闘力には兵数の効果として sqrt(兵数 × 少ない側の兵数) を掛ける。
 *    （kingshot.wiki の熊狩り解析に出てくる army factor。兵種比率の最適化にはこの項が必要）
 *  - スキルバフ合計は Lethality / Squad Attack と二重計上しないよう、
 *    それ以外の与ダメ系（damageUp・rallyAttack・敵被ダメ増加）だけを集計する。
 *  - 確率発動スキルは「発動率 × 効果量」の期待値に換算する。
 */
import type {
  EffectStat,
  EventType,
  HeroContribution,
  HeroMaster,
  MarchRole,
  OwnedHero,
  ScoreBreakdown,
  Skill,
  SkillEffect,
  StatBlock,
  TroopRatio,
  TroopType,
  UserData,
} from '../types';
import { TROOP_TYPES } from '../types';
import { effectValueAt } from '../crawler/parseSkill';
import { COUNTERS, EVENT_RULES, type EventRule } from '../master/events';
import { DEFAULT_CONFIG, type CalcConfig } from './config';

export const TROOP_LABEL: Record<TroopType, string> = { infantry: '歩兵', cavalry: '騎兵', archer: '弓兵' };

/* ------------------------------------------------------------------ */
/* 個別の補正                                                          */
/* ------------------------------------------------------------------ */

export function levelFactor(level: number, cfg: CalcConfig = DEFAULT_CONFIG): number {
  const min = cfg.levelFactorMin.value;
  const t = Math.min(1, Math.max(0, (level - 1) / 79));
  return min + (1 - min) * t;
}

export function starFactor(stars: number, cfg: CalcConfig = DEFAULT_CONFIG): number {
  return 1 + cfg.starFactorPerStar.value * Math.max(0, stars);
}

/** レベル補正 × 星補正 × 覚醒 */
export function heroGrowth(o: OwnedHero, cfg: CalcConfig = DEFAULT_CONFIG): number {
  return levelFactor(o.level, cfg) * starFactor(o.stars, cfg) * (o.awakened ? 1 + cfg.awakeningBonus.value : 1);
}

/** 英雄装備の倍率（1 + Σ強化 + Σマスタリー） */
export function heroGearFactor(o: OwnedHero, cfg: CalcConfig = DEFAULT_CONFIG): number {
  const pct = o.gear.reduce((s, g) => s + g.level * cfg.heroGearPerLevel.value + g.mastery * cfg.heroGearPerMastery.value, 0);
  return 1 + pct / 100;
}

export function widgetSkillLevel(widgetLevel: number): number {
  return Math.min(5, Math.ceil(Math.max(0, widgetLevel) / 2));
}

/** ティア補正済みの兵の基礎ステータス */
export function troopBase(t: TroopType, tier: number, cfg: CalcConfig = DEFAULT_CONFIG): StatBlock {
  const base = cfg.troopT6.value[t];
  const m = cfg.tierGrowth.value ** (tier - 6);
  return { attack: base.attack * m, defense: base.defense * m, lethality: base.lethality * m, health: base.health * m };
}

/**
 * 兵種ごとのステータス補正（%）。
 * 戦闘レポート上書きが有効ならその値をそのまま使い、
 * 無効なら研究 + 知事スキル + VIP + 領主装備 を合算する。
 */
export function troopStatBonus(user: UserData, t: TroopType, cfg: CalcConfig = DEFAULT_CONFIG): StatBlock & { lordGear: number } {
  const ro = user.buffs.reportOverride;
  if (ro.enabled) return { ...ro.stats[t], lordGear: 0 };

  const r = user.buffs.research[t];
  const g = user.buffs.governorSkills;
  const vip = user.buffs.vipLevel * cfg.vipAttackPerLevel.value;
  const lg = user.lordGear;
  const lordPct = lg.slots
    .filter((s) => s.troop === t)
    .reduce((sum, s) => sum + s.level * cfg.lordGearPerLevel.value + s.polish * cfg.lordGearPerPolish.value, 0);

  return {
    attack: r.attack + g.attack + vip + lg.setBonus.attack,
    defense: r.defense + g.defense + lg.setBonus.defense,
    lethality: r.lethality + g.lethality + lg.setBonus.lethality,
    health: r.health + g.health + lg.setBonus.health,
    lordGear: lordPct,
  };
}

/* ------------------------------------------------------------------ */
/* スキル集計                                                          */
/* ------------------------------------------------------------------ */

type StatTotals = Partial<Record<EffectStat, number>>;
export interface SkillTotals {
  all: StatTotals;
  byTroop: Record<TroopType, StatTotals>;
  contributions: Array<{ heroId: string; skill: string; stat: EffectStat; value: number }>;
}

function emptyTotals(): SkillTotals {
  return { all: {}, byTroop: { infantry: {}, cavalry: {}, archer: {} }, contributions: [] };
}

function addEffect(tot: SkillTotals, heroId: string, skill: Skill, e: SkillEffect, level: number) {
  const v = effectValueAt(e, level);
  if (v === 0) return;
  const bucket = e.troop ? tot.byTroop[e.troop] : tot.all;
  bucket[e.stat] = (bucket[e.stat] ?? 0) + v;
  tot.contributions.push({ heroId, skill: skill.name, stat: e.stat, value: v });
}

/** n 番目（0 始まり）の Expedition / Conquest スキルを取り出す */
function skillsOfKind(h: HeroMaster, kind: Skill['kind']): Skill[] {
  return h.skills.filter((s) => s.kind === kind);
}

/**
 * 編成内の英雄のスキル効果を集計する。
 * - leader: 全員の該当スキル + ウィジェットスキル
 * - joiner: 先頭英雄の 1 番目の Expedition スキルだけ（公式 Wiki）
 * - タレント（編成外でも有効）は所持英雄すべてから加算
 */
export function collectSkills(
  formation: HeroMaster[],
  user: UserData,
  skillSet: 'expedition' | 'conquest',
  role: MarchRole,
  allHeroes: Map<string, HeroMaster>,
): SkillTotals {
  const tot = emptyTotals();
  const owned = (id: string) => user.heroes[id];

  if (skillSet === 'expedition' && role === 'joiner') {
    const lead = formation[0];
    const o = lead ? owned(lead.id) : undefined;
    const first = lead ? skillsOfKind(lead, 'expedition')[0] : undefined;
    if (lead && o && first) first.effects.forEach((e) => addEffect(tot, lead.id, first, e, o.expeditionSkills[0] ?? 0));
    return tot;
  }

  for (const h of formation) {
    const o = owned(h.id);
    if (!o) continue;
    const levels = skillSet === 'expedition' ? o.expeditionSkills : o.conquestSkills;
    skillsOfKind(h, skillSet).forEach((s, i) => s.effects.forEach((e) => addEffect(tot, h.id, s, e, levels[i] ?? 0)));
    if (o.widget.owned && o.widget.level > 0) {
      const wk = skillSet === 'expedition' ? 'widget_expedition' : 'widget_conquest';
      skillsOfKind(h, wk).forEach((s) => s.effects.forEach((e) => addEffect(tot, h.id, s, e, widgetSkillLevel(o.widget.level))));
    }
  }

  // タレント: 所持していれば常時有効。レベルは星の数とみなす（前提）
  if (skillSet === 'expedition') {
    for (const [id, o] of Object.entries(user.heroes)) {
      if (!o.owned) continue;
      const h = allHeroes.get(id);
      if (!h) continue;
      skillsOfKind(h, 'talent').forEach((s) => s.effects.forEach((e) => addEffect(tot, h.id, s, e, o.stars)));
    }
  }
  return tot;
}

const get = (t: StatTotals, k: EffectStat) => t[k] ?? 0;
const troopStat = (tot: SkillTotals, t: TroopType, k: EffectStat) => get(tot.all, k) + get(tot.byTroop[t], k);

/* ------------------------------------------------------------------ */
/* 兵種相性                                                            */
/* ------------------------------------------------------------------ */

export function counterFactor(t: TroopType, enemy: TroopRatio, event: EventType, cfg: CalcConfig = DEFAULT_CONFIG): number {
  if (event === 'bear') return t === 'archer' ? 1 + cfg.bearRangedStrike.value : 1;
  const b = cfg.counterBonus.value;
  const total = TROOP_TYPES.reduce((s, x) => s + enemy[x], 0) || 1;
  return TROOP_TYPES.reduce((s, j) => {
    const share = enemy[j] / total;
    const m = COUNTERS[t] === j ? 1 + b : COUNTERS[j] === t ? 1 - b : 1;
    return s + share * m;
  }, 0);
}

/* ------------------------------------------------------------------ */
/* Expedition（集結・熊狩り・駐屯）                                    */
/* ------------------------------------------------------------------ */

/** 兵種比率に依存しない係数をまとめたもの（比率の探索で使い回す） */
export interface ExpeditionPrecomp {
  /** 攻撃: total_t = offense[t] × sqrt(n_t × nMin) */
  offense: Record<TroopType, number>;
  /** 防衛: ehp_t = defense[t] × n_t */
  defense: Record<TroopType, number>;
  base: Record<TroopType, number>; // 基礎戦闘力の兵 1 あたり係数（army factor を除く）
  adjusted: Record<TroopType, number>; // イベント補正後の係数
  factors: Record<TroopType, ScoreBreakdown['factors']>;
  notes: string[];
  heroContrib: HeroContribution[];
  stance: EventRule['stance'];
  event: EventType;
}

export function precomputeExpedition(
  formation: HeroMaster[],
  user: UserData,
  event: EventType,
  role: MarchRole,
  enemy: TroopRatio,
  allHeroes: Map<string, HeroMaster>,
  cfg: CalcConfig = DEFAULT_CONFIG,
): ExpeditionPrecomp {
  const rule = EVENT_RULES[event];
  const skills = collectSkills(formation, user, 'expedition', role, allHeroes);
  const notes: string[] = [];
  const offense = {} as Record<TroopType, number>;
  const defense = {} as Record<TroopType, number>;
  const base = {} as Record<TroopType, number>;
  const adjusted = {} as Record<TroopType, number>;
  const factors = {} as Record<TroopType, ScoreBreakdown['factors']>;

  // ジョイナーは英雄ステータスが乗らない（スキル 1 つだけが集結に加わる）
  const heroStatsApply = role === 'leader';

  for (const t of TROOP_TYPES) {
    const tb = troopBase(t, user.troops[t].tier, cfg);
    const bonus = troopStatBonus(user, t, cfg);

    // Σ(英雄基礎ステータス × レベル補正 × 星補正) + 装備ボーナス
    let heroAtkPct = 0;
    let heroDefPct = 0;
    let widgetAtk = 0;
    let widgetDef = 0;
    if (heroStatsApply) {
      for (const h of formation.filter((x) => x.troop === t)) {
        const o = user.heroes[h.id];
        if (!o) continue;
        const g = heroGrowth(o, cfg) * heroGearFactor(o, cfg);
        heroAtkPct += h.expedition.attack * g;
        heroDefPct += h.expedition.defense * g;
        if (o.widget.owned && h.widget) {
          const ratio = Math.min(1, o.widget.level / cfg.widgetMaxLevel.value);
          widgetAtk += (h.widget.expedition.lethality ?? h.widget.expedition.attack ?? 0) * ratio;
          widgetDef += (h.widget.expedition.health ?? h.widget.expedition.defense ?? 0) * ratio;
        }
      }
    }

    // 基礎戦闘力（兵 1 あたり）: 兵の攻撃 × (1 + 英雄% + 領主装備% + 研究等%)
    const atkPct = heroAtkPct + bonus.lordGear + bonus.attack;
    const unitAttack = tb.attack * (1 + atkPct / 100);
    base[t] = unitAttack;

    const isAttack = rule.stance === 'attack';
    const rallyAttack = role === 'leader' && (event === 'rally' || event === 'bear') ? troopStat(skills, t, 'rallyAttack') : 0;
    const skillBuff = 1 + (troopStat(skills, t, 'damageUp') + rallyAttack + troopStat(skills, t, 'enemyDamageTakenUp')) / 100;
    const counter = counterFactor(t, enemy, event, cfg);
    const widget = 1 + (isAttack ? widgetAtk : widgetDef) / 100;
    const lethality = 1 + (troopStat(skills, t, 'lethality') + bonus.lethality) / 100;
    const squadAttack = 1 + troopStat(skills, t, 'squadAttack') / 100;
    const crit = 1 + (troopStat(skills, t, 'critRate') / 100) * (cfg.critDamageBase.value + troopStat(skills, t, 'critDamage') / 100);

    adjusted[t] = unitAttack * skillBuff * counter * (isAttack ? widget : 1);
    offense[t] = adjusted[t] * lethality * squadAttack * crit;

    // 生存側: 兵 1 あたりの実効 HP
    const hp = tb.health * (1 + (bonus.health + troopStat(skills, t, 'squadHealth')) / 100);
    const def = 1 + (heroDefPct + bonus.defense + bonus.lordGear + troopStat(skills, t, 'squadDefense')) / 100;
    const cap = cfg.maxDamageReduction.value;
    const dtd = Math.min(cap, troopStat(skills, t, 'damageTakenDown') / 100);
    const ead = Math.min(cap, get(skills.all, 'enemyAttackDown') / 100);
    const survival = (def / (1 - dtd) / (1 - ead)) * (isAttack ? 1 : widget);
    defense[t] = hp * survival;

    factors[t] = { skillBuff, counter, widget, lethality, squadAttack, crit, survival };
  }

  const heroContrib: HeroContribution[] = formation.map((h) => {
    const o = user.heroes[h.id];
    const g = o ? heroGrowth(o, cfg) * heroGearFactor(o, cfg) : 0;
    const statPct = heroStatsApply ? h.expedition.attack * g : 0;
    return {
      heroId: h.id,
      level: o?.level ?? 0,
      stars: o?.stars ?? 0,
      growth: g,
      statText: heroStatsApply
        ? `${TROOP_LABEL[h.troop]}の攻撃 +${statPct.toFixed(0)}%（基礎 ${h.expedition.attack}% × 補正 ${g.toFixed(2)}）`
        : '参加時は英雄ステータスは反映されない',
      skills: skills.contributions.filter((c) => c.heroId === h.id).map(({ skill, stat, value }) => ({ skill, stat, value })),
      missingSkills: !h.skills.some((sk) => sk.kind === 'expedition'),
      estimatedStats: !!h.estimatedFields?.includes('expedition'),
    };
  });
  const inFormation = new Set(formation.map((h) => h.id));
  const talents = skills.contributions.filter((c) => !inFormation.has(c.heroId));
  if (talents.length) notes.push(`編成外タレント: ${talents.map((c) => `${allHeroes.get(c.heroId)?.name ?? c.heroId}「${c.skill}」+${c.value}%`).join('、')}`);

  if (role === 'joiner') notes.push('参加者（ジョイナー）として計算: 先頭英雄の 1 番目の Expedition スキルのみ反映（公式 Wiki）');
  if (event === 'bear') notes.push('熊は反撃しないため与ダメージのみで評価。弓兵に Ranged Strike +10% を適用');
  if (user.buffs.reportOverride.enabled) notes.push('兵種ステータスは戦闘レポートの値で上書き中');
  for (const h of formation) {
    if (h.estimatedFields?.length) notes.push(`${h.name}: ${h.estimatedFields.join('・')} が推定値`);
  }
  return { offense, defense, base, adjusted, factors, notes, heroContrib, stance: rule.stance, event };
}

/** 兵種比率から実際に送れる兵数を求める（在庫不足の兵種は在庫で頭打ち） */
export function troopsSent(ratio: TroopRatio, user: UserData): Record<TroopType, number> {
  const cap = Math.min(
    user.settings.marchCapacity,
    TROOP_TYPES.reduce((s, t) => s + user.troops[t].count, 0) || user.settings.marchCapacity,
  );
  const out = {} as Record<TroopType, number>;
  for (const t of TROOP_TYPES) {
    const want = (ratio[t] / 100) * cap;
    const stock = user.troops[t].count;
    // 在庫を一度も入力していない（全兵種 0）場合は理論値で計算する
    const noStock = TROOP_TYPES.every((x) => user.troops[x].count === 0);
    out[t] = noStock ? want : Math.min(want, stock);
  }
  return out;
}

export function scoreExpedition(pre: ExpeditionPrecomp, ratio: TroopRatio, user: UserData, cfg: CalcConfig = DEFAULT_CONFIG): ScoreBreakdown {
  const sent = troopsSent(ratio, user);
  const total = TROOP_TYPES.reduce((s, t) => s + sent[t], 0);
  const nMin = pre.event === 'bear' ? Math.min(total, cfg.bearUnits.value) : total;

  let base = 0;
  let adjusted = 0;
  let offense = 0;
  let ehp = 0;
  const perTroop = {} as Record<TroopType, number>;
  for (const t of TROOP_TYPES) {
    const army = Math.sqrt(Math.max(0, sent[t]) * nMin);
    base += pre.base[t] * army;
    adjusted += pre.adjusted[t] * army;
    perTroop[t] = pre.offense[t] * army;
    offense += perTroop[t];
    ehp += pre.defense[t] * sent[t];
  }

  // 表示用の代表係数（攻撃寄与で加重平均）
  const w = (k: keyof ScoreBreakdown['factors']) =>
    offense > 0
      ? TROOP_TYPES.reduce((s, t) => s + ((pre.factors[t][k] ?? 1) as number) * perTroop[t], 0) / offense
      : 1;

  // 熊は反撃しないので与ダメージのみ。対人の集結は反撃を受けるため生存も加味する
  let totalScore = offense;
  const dw = pre.stance === 'defense' ? cfg.defenseWeight.value : pre.event === 'rally' ? cfg.rallySurvivalWeight.value : 0;
  if (dw > 0) totalScore = offense > 0 && ehp > 0 ? offense ** (1 - dw) * ehp ** dw : 0;

  const shortages = TROOP_TYPES.filter((t) => {
    const want = (ratio[t] / 100) * user.settings.marchCapacity;
    return user.troops[t].count > 0 && want > user.troops[t].count + 0.5;
  }).map((t) => `${TROOP_LABEL[t]}の在庫不足（必要 ${Math.round((ratio[t] / 100) * user.settings.marchCapacity).toLocaleString()} / 在庫 ${user.troops[t].count.toLocaleString()}）`);

  return {
    base,
    eventAdjusted: adjusted,
    total: totalScore,
    factors: {
      skillBuff: w('skillBuff'),
      counter: w('counter'),
      widget: w('widget'),
      lethality: w('lethality'),
      squadAttack: w('squadAttack'),
      crit: w('crit'),
      survival: w('survival'),
    },
    perTroop,
    heroContrib: pre.heroContrib,
    notes: [...pre.notes, ...shortages],
  };
}

/**
 * ジョイナー評価: 先頭英雄の 1 番目の Expedition スキルが集結に加える価値（%）。
 * 攻撃系イベントは与ダメ系、防衛系は被ダメ・HP 系の合計で比べる。
 */
export function joinerSkillValue(h: HeroMaster, o: OwnedHero, event: EventType): number {
  const first = skillsOfKind(h, 'expedition')[0];
  if (!first) return 0;
  const lvl = o.expeditionSkills[0] ?? 0;
  const attackStats: EffectStat[] = ['lethality', 'squadAttack', 'damageUp', 'rallyAttack', 'enemyDamageTakenUp', 'critRate'];
  const defenseStats: EffectStat[] = ['damageTakenDown', 'squadHealth', 'squadDefense', 'enemyAttackDown'];
  const wanted = EVENT_RULES[event].stance === 'defense' ? defenseStats : attackStats;
  return first.effects.filter((e) => wanted.includes(e.stat)).reduce((s, e) => s + effectValueAt(e, lvl), 0);
}

/* ------------------------------------------------------------------ */
/* Conquest（アリーナ・征服ステージ）                                  */
/* ------------------------------------------------------------------ */

export interface HeroBattleStats {
  heroId: string;
  attack: number;
  defense: number;
  health: number;
  ehp: number;
  dps: number;
}

export function scoreHeroBattle(
  formation: HeroMaster[],
  user: UserData,
  event: EventType,
  enemy: TroopRatio,
  allHeroes: Map<string, HeroMaster>,
  cfg: CalcConfig = DEFAULT_CONFIG,
): ScoreBreakdown & { heroes: HeroBattleStats[] } {
  const rule = EVENT_RULES[event];
  const positions = rule.positions ?? [];
  const team = collectSkills(formation, user, 'conquest', 'leader', allHeroes);
  const notes: string[] = [];

  // 味方全体に掛かる効果（scope = heroes / squad）
  const teamAttack = get(team.all, 'squadAttack');
  const enemyTakenUp = get(team.all, 'enemyDamageTakenUp');
  const healPct = get(team.all, 'heal');

  let base = 0;
  let adjusted = 0;
  let totalDps = 0;
  let frontEhp = 0;
  const stats: HeroBattleStats[] = [];
  const contrib: HeroContribution[] = [];

  formation.forEach((h, idx) => {
    const o = user.heroes[h.id];
    if (!o) return;
    const own = collectSkills([h], user, 'conquest', 'leader', allHeroes);
    const g = heroGrowth(o, cfg) * heroGearFactor(o, cfg);
    const wRatio = o.widget.owned && h.widget ? Math.min(1, o.widget.level / cfg.widgetMaxLevel.value) : 0;
    const wc = h.widget?.conquest ?? {};

    const rawAtk = h.conquest.attack * g + (wc.attack ?? 0) * wRatio;
    const rawDef = h.conquest.defense * g + (wc.defense ?? 0) * wRatio;
    const rawHp = h.conquest.health * g + (wc.health ?? 0) * wRatio;
    base += rawAtk + rawDef + rawHp / 10;

    // heroDefense は scope=heroes のものをチーム全体、self は本人のみ
    const heroesDef = team.contributions
      .filter((c) => c.stat === 'heroDefense')
      .reduce((s, c) => {
        const src = allHeroes.get(c.heroId);
        const eff = src?.skills.find((sk) => sk.name === c.skill)?.effects.find((e) => e.stat === 'heroDefense');
        return s + (eff?.scope === 'heroes' || c.heroId === h.id ? c.value : 0);
      }, 0);

    const attack = rawAtk * (1 + (get(own.all, 'heroAttack') + teamAttack) / 100);
    const defense = rawDef * (1 + heroesDef / 100);
    const health = rawHp * (1 + get(own.all, 'heroHealth') / 100);
    const dtd = Math.min(cfg.maxDamageReduction.value, get(own.all, 'damageTakenDown') / 100);

    const pos = positions[idx];
    const mismatch = pos?.preferred && pos.preferred !== h.troop ? cfg.positionMismatchPenalty.value : 1;
    if (mismatch < 1) notes.push(`${h.name} は ${pos?.label}（推奨: ${pos?.preferred}）に不向き`);

    const ehp = ((health * (1 + defense / 10000)) / (1 - dtd)) * (pos?.label === '前衛' ? mismatch : 1);
    const counter = counterFactor(h.troop, enemy, event, cfg);
    const skillMul = 1 + (get(own.all, 'skillDamage') / 100) * cfg.conquestSkillWeight.value;
    // 前衛の不適合は耐久に、側面・後衛の不適合は火力に効かせる
    const isFront = pos?.label === '前衛' || (!positions.length && idx === 0);
    const dps = attack * skillMul * counter * (1 + enemyTakenUp / 100) * (isFront ? 1 : mismatch);

    adjusted += attack * skillMul * counter;
    totalDps += dps;
    if (isFront) frontEhp += ehp;
    stats.push({ heroId: h.id, attack, defense, health, ehp, dps });
    contrib.push({
      heroId: h.id,
      level: o.level,
      stars: o.stars,
      growth: g,
      statText: `攻撃 ${Math.round(attack).toLocaleString()} ・ 実効HP ${Math.round(ehp).toLocaleString()}（補正 ${g.toFixed(2)}）`,
      skills: own.contributions.map(({ skill, stat, value }) => ({ skill, stat, value })),
      missingSkills: !h.skills.some((sk) => sk.kind === 'conquest'),
      estimatedStats: !!h.estimatedFields?.includes('conquest'),
    });
    if (h.estimatedFields?.includes('conquest')) notes.push(`${h.name}: Conquest ステータスが推定値`);
  });

  const sustain = 1 + healPct / 1000;
  const survival = Math.sqrt(Math.max(0, frontEhp * sustain) / 10000);
  const total = totalDps * survival;
  if (frontEhp === 0) notes.push('前衛がいないため生存係数が 0 になっています');

  return {
    base,
    eventAdjusted: adjusted,
    total,
    factors: { skillBuff: 1 + enemyTakenUp / 100, counter: 1, widget: 1, lethality: 1, squadAttack: 1 + teamAttack / 100, crit: 1, survival },
    heroContrib: contrib,
    notes,
    heroes: stats,
  };
}

export function usesEstimated(formation: HeroMaster[], skillSet: 'expedition' | 'conquest'): boolean {
  return formation.some((h) =>
    (h.estimatedFields ?? []).some((f) => f === 'skills' || f === 'widget' || (skillSet === 'expedition' ? f === 'expedition' : f === 'conquest')),
  );
}
