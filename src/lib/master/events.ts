import type { EventType, SourceRef, TroopRatio, TroopType } from '../types';
import { SRC } from './sources';

/**
 * イベントごとの編成ルール。
 * 仕様書の分類と、調査で確認できた事実が食い違う箇所は note に記載している。
 */
export interface EventRule {
  id: EventType;
  label: string;
  subtitle: string;
  skillSet: 'expedition' | 'conquest';
  slots: number;
  /** 位置ごとの推奨兵種（Conquest 系のみ）。null は制約なし */
  positions?: Array<{ label: string; preferred: TroopType[] | null }>;
  /** 攻撃か防衛か（スコアの式が変わる） */
  stance: 'attack' | 'defense' | 'hero_battle';
  /** 敵の兵種（相性補正の既定値） */
  defaultEnemy: TroopRatio;
  notes: Array<{ text: string; source: SourceRef }>;
}

/** 討伐戦闘（討伐・競技場）の配置: 前列 2（耐久型の歩兵）・後列 3（火力型の弓兵・騎兵）— アルテマ */
const HERO_BATTLE_POSITIONS: NonNullable<EventRule['positions']> = [
  { label: '前列', preferred: ['infantry'] },
  { label: '前列', preferred: ['infantry'] },
  { label: '後列', preferred: ['cavalry', 'archer'] },
  { label: '後列', preferred: ['cavalry', 'archer'] },
  { label: '後列', preferred: ['cavalry', 'archer'] },
];

export const EVENT_RULES: Record<EventType, EventRule> = {
  rally: {
    id: 'rally',
    label: '集結攻撃',
    subtitle: '城塞戦・チェーザレ討伐・テラーなど',
    skillSet: 'expedition',
    slots: 3,
    stance: 'attack',
    defaultEnemy: { infantry: 60, cavalry: 20, archer: 20 },
    notes: [
      {
        text: '行軍・集結には英雄を 3 人まで連れて行ける（歩兵・騎兵・弓兵の各 1 人が一般的）。',
        source: { site: 'kingshotmastery.com', url: 'https://kingshotmastery.com/guides/kingshot-troop-formations-guide', reliability: 'community' },
      },
      {
        text: '集結に参加する側（ジョイナー）は、先頭の英雄の最上段 Expedition スキルだけが反映される。',
        source: SRC.officialBear,
      },
    ],
  },
  bear: {
    id: 'bear',
    label: '熊狩り（ベアハント）',
    subtitle: 'Bear Trap',
    skillSet: 'expedition',
    slots: 3,
    stance: 'attack',
    // 熊は歩兵扱い（kingshot.wiki の解析）
    defaultEnemy: { infantry: 100, cavalry: 0, archer: 0 },
    notes: [
      { text: '自分で集結を開く場合、3 人全員のスキルが有効（左端の隊長枠に誰を置いても同じ）。', source: SRC.officialBear },
      { text: '参加する場合は最上段の Expedition スキルのみ有効。スキルの高い上位 4 人の参加者分が採用される。', source: SRC.officialBear },
      { text: '熊は反撃しないため、生存力ではなく与ダメージだけで評価する。', source: SRC.masteryBear },
      { text: '熊は歩兵扱いのため、弓兵は「Ranged Strike」で与ダメージ +10%（プレイヤー解析）。', source: SRC.bearMechanics },
    ],
  },
  garrison: {
    id: 'garrison',
    label: '駐屯・守城',
    subtitle: '守城ラリー・拠点防衛',
    skillSet: 'expedition',
    slots: 3,
    stance: 'defense',
    defaultEnemy: { infantry: 50, cavalry: 20, archer: 30 },
    notes: [
      { text: '防衛では被ダメージ減少・部隊 HP・敵攻撃力低下のスキルを重く評価する。', source: SRC.masteryBattle },
    ],
  },
  arena: {
    id: 'arena',
    label: '競技場（アリーナ）',
    subtitle: '討伐戦闘の対人戦',
    skillSet: 'conquest',
    slots: 5,
    positions: HERO_BATTLE_POSITIONS,
    stance: 'hero_battle',
    defaultEnemy: { infantry: 40, cavalry: 40, archer: 20 },
    notes: [
      { text: '競技場は討伐と同じ「討伐戦闘」。英雄 5 人（前列 2・後列 3）で、討伐スキルだけが発動する。', source: SRC.altemaBattle },
      { text: '公式 Wiki の推奨初期編成も 5 人（前列＝歩兵の Howard・Forrest、騎兵の Jabel・Chenko、後衛＝弓兵の Quinn）。', source: SRC.officialArena },
    ],
  },
  conquest: {
    id: 'conquest',
    label: '討伐',
    subtitle: 'ステージ攻略・自動戦闘・放置報酬',
    skillSet: 'conquest',
    slots: 5,
    positions: HERO_BATTLE_POSITIONS,
    stance: 'hero_battle',
    defaultEnemy: { infantry: 50, cavalry: 20, archer: 30 },
    notes: [
      {
        text: '英雄 5 人（前列 2・後列 3）。前列は攻撃を受けやすいので歩兵など耐久型、後列は弓兵・騎兵など火力型を置く。発動するのは討伐スキルだけ（遠征スキルは無効）。',
        source: SRC.altemaBattle,
      },
      { text: '兵士は使わない。勝敗に効くのは英雄のレベル・星ランク・討伐スキル・英雄装備。', source: SRC.altemaBattle },
      { text: '第 4 世代のおすすめ例: 前列 エリック・アルカ ／ 後列 マーゴ・ローザ・ペーラ。', source: SRC.altemaGen4 },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* 兵種比率のプリセット                                                */
/* ------------------------------------------------------------------ */

export interface RatioPreset {
  ratio: TroopRatio;
  label: string;
  source: SourceRef;
}

const r = (infantry: number, cavalry: number, archer: number): TroopRatio => ({ infantry, cavalry, archer });

/** 熊狩り（集結を開く側）の世代別プリセット */
export function bearLeaderPreset(generation: number): RatioPreset {
  if (generation <= 1) return { ratio: r(10, 30, 60), label: 'Gen1 推奨 10/30/60', source: SRC.guideBear };
  if (generation === 2) return { ratio: r(10, 20, 70), label: 'Gen2 推奨 10/20/70', source: SRC.guideBear };
  if (generation === 3) return { ratio: r(10, 10, 80), label: 'Gen3 推奨 10/10/80（公式 Wiki も 10-10-80）', source: SRC.officialBear };
  return { ratio: r(1, 10, 89), label: 'Gen4 以降 1/10/89（コミュニティ）', source: SRC.masteryBear };
}

/** 熊狩り（参加する側）: 公式 Wiki は 20-30-50、兵が多ければ 10-10-80 */
export function bearJoinerPreset(largeArmy: boolean): RatioPreset {
  return largeArmy
    ? { ratio: r(10, 10, 80), label: '大軍なら 10/10/80（公式 Wiki）', source: SRC.officialBear }
    : { ratio: r(20, 30, 50), label: '参加時 20/30/50（公式 Wiki）', source: SRC.officialBear };
}

export const DEFAULT_RATIOS: Record<Exclude<EventType, 'bear'>, RatioPreset> = {
  rally: {
    ratio: r(50, 20, 30),
    label: '集結 50/20/30',
    source: { site: 'kingshotmastery.com', url: 'https://kingshotmastery.com/guides/kingshot-troop-formations-guide', reliability: 'community' },
  },
  garrison: {
    ratio: r(60, 20, 20),
    label: '防衛 60/20/20',
    source: { site: 'kingshotmastery.com', url: 'https://kingshotmastery.com/guides/kingshot-troop-formations-guide', reliability: 'community' },
  },
  arena: {
    ratio: r(50, 20, 30),
    label: '50/20/30',
    source: { site: 'kingshotmastery.com', url: 'https://kingshotmastery.com/guides/kingshot-troop-formations-guide', reliability: 'community' },
  },
  conquest: {
    ratio: r(50, 20, 30),
    label: '討伐（兵士は使わない）',
    source: SRC.masteryConquest,
  },
};

export function presetFor(event: EventType, generation: number, role: 'leader' | 'joiner', largeArmy = false): RatioPreset {
  if (event === 'bear') return role === 'joiner' ? bearJoinerPreset(largeArmy) : bearLeaderPreset(generation);
  return DEFAULT_RATIOS[event];
}

/** 兵種相性: 歩兵 > 騎兵 > 弓兵 > 歩兵（複数のコミュニティ情報で一致） */
export const COUNTERS: Record<TroopType, TroopType> = {
  infantry: 'cavalry',
  cavalry: 'archer',
  archer: 'infantry',
};
export const COUNTER_SOURCE: SourceRef = SRC.masteryBattle;
