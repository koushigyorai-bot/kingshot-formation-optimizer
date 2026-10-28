import type { HeroGearRank, HeroGearSlot, OwnedHero, SourceRef } from '../types';

/**
 * 英雄装備の効果量。
 *
 * kingshotoptimizer.com の「Stat Bonuses by Level and Quality」表による:
 *   Epic（紫）   = 9%  + 練磨 Lv × 0.21%
 *   Mythic（金） = 15% + 練磨 Lv × 0.35%
 * ゲーム内の「レジェンド」= 金（精錬鍛造ができるのは金装備のみ: 公式 Wiki）、「エピック」= 紫 とみなす。
 *
 * レア・グッド・ノーマルの値は公開情報で確認できなかったため、
 * エピック/レジェンドの比（0.6）を 1 ランクごとに掛けた推定値にしている。
 *
 * 部位ごとの効果（同表）: 頭・足 = 殺傷力、手・胴 = HP。
 * 効果は装備した英雄と同じ兵種の部隊に掛かるものとして計算する。
 */
export const HERO_GEAR_SOURCE: SourceRef = {
  site: 'kingshotoptimizer.com',
  url: 'https://kingshotoptimizer.com/hero-gear/references/stat-bonuses',
  fetchedAt: '2026-10-28T00:00:00Z',
  reliability: 'community',
};

export const HERO_GEAR_RANK_LABEL: Record<HeroGearRank, string> = {
  none: '未装備',
  normal: 'ノーマル',
  good: 'グッド',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンド',
};

interface RankCurve {
  base: number; // Lv0 の効果 %
  perLevel: number; // 練磨 1Lv あたり %
  estimated: boolean;
}

const R = 0.6; // エピック ÷ レジェンド（9/15 = 0.21/0.35 = 0.6）
export const HERO_GEAR_CURVES: Record<Exclude<HeroGearRank, 'none'>, RankCurve> = {
  legendary: { base: 15, perLevel: 0.35, estimated: false },
  epic: { base: 9, perLevel: 0.21, estimated: false },
  rare: { base: 9 * R, perLevel: 0.21 * R, estimated: true },
  good: { base: 9 * R * R, perLevel: 0.21 * R * R, estimated: true },
  normal: { base: 9 * R ** 3, perLevel: 0.21 * R ** 3, estimated: true },
};

/** 頭・手・胴・足 の効果の種類（kingshotoptimizer.com） */
export const HERO_GEAR_SLOT_STAT = ['lethality', 'health', 'health', 'lethality'] as const;

export const HERO_GEAR_MAX_LEVEL = 100;
export const HERO_GEAR_MAX_MASTERY = 20;

/** 1 部位の効果（%）。精錬鍛造は 1Lv ごとに効果を masteryPerLevel 倍だけ上乗せする（係数は推定） */
export function heroGearSlotValue(g: HeroGearSlot, masteryPerLevel: number): number {
  if (g.rank === 'none') return 0;
  const c = HERO_GEAR_CURVES[g.rank];
  const level = Math.min(HERO_GEAR_MAX_LEVEL, Math.max(0, g.level));
  const mastery = g.rank === 'legendary' ? Math.min(HERO_GEAR_MAX_MASTERY, Math.max(0, g.mastery)) : 0;
  return (c.base + c.perLevel * level) * (1 + (mastery * masteryPerLevel) / 100);
}

/** 英雄装備による部隊の殺傷力・HP の合計（%） */
export function heroGearTroopBonus(o: OwnedHero, masteryPerLevel: number): { lethality: number; health: number; estimated: boolean } {
  let lethality = 0;
  let health = 0;
  let estimated = false;
  o.gear.forEach((g, i) => {
    const v = heroGearSlotValue(g, masteryPerLevel);
    if (HERO_GEAR_SLOT_STAT[i] === 'lethality') lethality += v;
    else health += v;
    if (g.rank !== 'none' && (HERO_GEAR_CURVES[g.rank].estimated || (g.rank === 'legendary' && g.mastery > 0))) estimated = true;
  });
  return { lethality, health, estimated };
}
