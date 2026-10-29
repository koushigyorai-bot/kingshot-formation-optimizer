/**
 * Kingshot Formation Optimizer — 共通型定義
 *
 * データは「マスターデータ（ゲームの仕様・英雄の性能）」と
 * 「ユーザーデータ（所持状況）」の 2 系統に分かれる。
 * どちらも repository 層を介して保存し、UI から保存先を意識させない。
 */

export const TROOP_TYPES = ['infantry', 'cavalry', 'archer'] as const;
export type TroopType = (typeof TROOP_TYPES)[number];

export type Rarity = 'rare' | 'epic' | 'legendary';

/* ------------------------------------------------------------------ */
/* 出典                                                                */
/* ------------------------------------------------------------------ */

export type SourceSite =
  | 'kingshotwiki.com' // Century Games 公式 Wiki
  | 'kingshot.wiki' // ファンサイト
  | 'kingshottools.pro' // ファンサイト
  | 'grindnstrat.com' // 総合ゲーム攻略サイト
  | 'kingshotmastery.com' // ファンサイト（シード値の出典として参照のみ）
  | 'kingshotguide.org' // ファンサイト（シード値の出典として参照のみ）
  | 'bluestacks.com' // エミュレーター公式ブログ（シード値の出典として参照のみ）
  | 'kingshotoptimizer.com' // ファンサイト（シード値の出典として参照のみ）
  | 'altema.jp' // 日本語の攻略サイト（シード値の出典として参照のみ）
  | 'user' // ユーザーが手入力
  | 'estimate'; // 本ツールの推定値

/**
 * 信頼度。official > community > estimate の順に優先してマージする。
 * official = ゲーム開発元が運営する情報源
 * community = 第三者が運営する攻略サイト（検証可能だが一次情報ではない）
 * estimate = 実データが無い箇所を本ツールが仮置きした値
 */
export type Reliability = 'official' | 'community' | 'estimate';

/**
 * 排外主義的・差別的な思想を流布するサイトに付けるマーク。
 * 該当サイトの情報は UI 上で警告付きで表示し、既定ではマージしない。
 */
export type ContentFlag = 'discriminatory';

export interface SourceRef {
  site: SourceSite;
  url?: string;
  fetchedAt?: string; // ISO 8601
  reliability: Reliability;
  note?: string;
  flag?: ContentFlag;
}

/* ------------------------------------------------------------------ */
/* スキル                                                              */
/* ------------------------------------------------------------------ */

export type SkillKind =
  | 'conquest'
  | 'expedition'
  | 'talent' // 編成外でも常時有効（例: Amadeus "Born Leader"）
  | 'widget_conquest'
  | 'widget_expedition';

/** スキル効果の種類。値はすべて % の数値（25% → 25）。 */
export type EffectStat =
  | 'lethality' // 部隊の殺傷力
  | 'squadAttack' // 部隊の攻撃力
  | 'squadDefense'
  | 'squadHealth'
  | 'damageUp' // 与ダメージ増加（確率発動は期待値に換算）
  | 'rallyAttack' // 集結時の攻撃力
  | 'damageTakenDown' // 被ダメージ減少
  | 'enemyAttackDown' // 敵の攻撃力低下
  | 'enemyDamageTakenUp' // 敵の被ダメージ増加
  | 'critRate'
  | 'critDamage'
  | 'heroAttack' // 英雄自身（Conquest）
  | 'heroDefense'
  | 'heroHealth'
  | 'skillDamage' // Attack×X% のダメージスキル（Conquest）
  | 'heal'
  | 'other';

export interface SkillEffect {
  stat: EffectStat;
  /** スキルレベル 1〜5 の値（%）。 */
  values: number[];
  /** 確率発動スキルの発動率（%）。指定時の実効値 = chance × values / 100 */
  chance?: number[];
  /** 兵種限定の効果（例: 弓兵の攻撃力 +30%） */
  troop?: TroopType;
  /** squad = 部隊全体 / self = 英雄自身 / heroes = 味方英雄全員 / enemy = 敵 */
  scope: 'squad' | 'self' | 'heroes' | 'enemy';
}

export interface Skill {
  name: string;
  kind: SkillKind;
  description: string;
  effects: SkillEffect[];
}

/* ------------------------------------------------------------------ */
/* 英雄マスター                                                        */
/* ------------------------------------------------------------------ */

export interface ConquestStats {
  attack: number;
  defense: number;
  health: number;
}

/** Expedition の英雄ステータス（%）。自分と同じ兵種の部隊に掛かる。 */
export interface ExpeditionStats {
  attack: number;
  defense: number;
}

export interface WidgetMaster {
  name?: string;
  /** 最大レベル時の Expedition 補正（%）。 */
  expedition: { lethality?: number; health?: number; attack?: number; defense?: number };
  conquest?: Partial<ConquestStats>;
}

export type DataStatus = 'verified' | 'partial' | 'estimated';

export interface HeroMaster {
  id: string;
  name: string;
  nameJa?: string;
  /** レア・エピックは世代を持たないので null */
  generation: number | null;
  rarity: Rarity;
  troop: TroopType;
  conquest: ConquestStats;
  expedition: ExpeditionStats;
  skills: Skill[];
  widget?: WidgetMaster;
  sources: SourceRef[];
  /**
   * verified = 数値とスキルが一次情報源（公式）で確認済み
   * partial = 一部のみ確認済み（例: ステータスのみ / コミュニティ出典のみ）
   * estimated = 推定値（クロールで上書きされる前提）
   */
  dataStatus: DataStatus;
  /** 推定値になっている項目名（UI に「推定」バッジを出す） */
  estimatedFields?: Array<'conquest' | 'expedition' | 'skills' | 'widget'>;
}

/* ------------------------------------------------------------------ */
/* ティアリスト・編成テンプレート                                       */
/* ------------------------------------------------------------------ */

export type TierCategory = 'rally' | 'garrison' | 'bear' | 'conquest' | 'overall';

export interface TierEntry {
  heroId: string;
  tier: string; // "S+", "S", "A" …
}

export interface TierList {
  category: TierCategory;
  entries: TierEntry[];
  source: SourceRef;
}

export interface FormationTemplate {
  event: EventType;
  heroIds: string[];
  ratio?: TroopRatio;
  generation?: number;
  label?: string;
  source: SourceRef;
}

export interface MasterData {
  version: 1;
  updatedAt: string;
  heroes: HeroMaster[];
  tierLists: TierList[];
  templates: FormationTemplate[];
  /** 情報源同士の値の食い違い（マージ時に検出） */
  conflicts: DataConflict[];
}

export interface DataConflict {
  heroId: string;
  field: string;
  values: Array<{ site: SourceSite; value: string }>;
  adopted: SourceSite;
}

/* ------------------------------------------------------------------ */
/* ユーザーデータ                                                      */
/* ------------------------------------------------------------------ */

export const LORD_GEAR_SLOTS = 6;
/** 英雄装備は 頭・手・胴・足 の 4 部位（ゲーム内表記。攻略サイトの Helmet / Gloves / Chest / Boots） */
export const HERO_GEAR_SLOTS = 4;
export const HERO_GEAR_SLOT_LABELS = ['頭', '手', '胴', '足'] as const;

/**
 * 領主装備 1 部位。ゲームの装備詳細に表示される、対応兵種へのバフ値（%）をそのまま入力する。
 * 例: 騎兵用の装備なら「騎兵攻撃力 +12.5%」→ troop = 'cavalry', attack = 12.5
 */
export interface LordGearSlot {
  troop: TroopType; // この部位がバフする兵種
  attack: number; // 攻撃力 %
  defense: number; // 防御力 %
  lethality: number; // 殺傷力 %
  health: number; // HP %
}

export interface LordGear {
  slots: LordGearSlot[];
  /** セット効果（%）。ゲーム内表示の値をそのまま入力する。 */
  setBonus: { attack: number; defense: number; lethality: number; health: number };
}

/** 英雄装備のランク（ゲーム内表記: レジェンド / エピック / レア / グッド / ノーマル） */
export const HERO_GEAR_RANKS = ['none', 'normal', 'good', 'rare', 'epic', 'legendary'] as const;
export type HeroGearRank = (typeof HERO_GEAR_RANKS)[number];

export interface HeroGearSlot {
  rank: HeroGearRank; // 'none' = 未装備
  level: number; // 練磨（強化）レベル 0〜100
  mastery: number; // 精錬鍛造 0〜20（レジェンドのみ。それ以外は常に 0）
}

export interface OwnedHero {
  heroId: string;
  owned: boolean;
  level: number; // 1〜80
  stars: number; // 0〜5（赤星）
  awakened: boolean;
  /**
   * 英雄装備 4 部位（頭・手・胴・足）。各部位にランク・練磨 Lv（0〜100）・精錬鍛造（レジェンドのみ）を持つ。
   */
  gear: HeroGearSlot[];
  expeditionSkills: number[]; // 3 枠 × 0〜5（0 = 未解放）
  conquestSkills: number[]; // 3 枠 × 0〜5
  widget: { owned: boolean; level: number }; // level 0〜10
}

/**
 * 兵種ごとの兵士の状態。歩兵（兵舎）・騎兵（厩舎）・弓兵（射撃場）は建物が別なので兵種ごとに持つ。
 * - level: 兵士レベル 1〜10（建物のレベルに応じて訓練できる段階）
 * - truegold: 黄金レベル 0〜8（役場 Lv30 以降、建物を黄金化すると上がる。0 = 未黄金化）
 *   黄金レベルはレベル 10 の兵士を強化するもの（kingshotmastery.com）なので、level = 10 のときだけ有効
 */
export interface TroopStock {
  level: number; // 1〜10
  truegold: number; // 0〜8
  count: number;
}

export interface StatBlock {
  attack: number;
  defense: number;
  lethality: number;
  health: number;
}

export interface UserBuffs {
  /** 研究（兵種別、%） */
  research: Record<TroopType, StatBlock>;
  /** 知事スキル（全兵種、%） */
  governorSkills: StatBlock;
  vipLevel: number; // 0〜12
  /**
   * 戦闘レポートの最終ステータス（%）で上書きする。
   * 装備・研究・VIP などの合算値をゲームが表示してくれるため、最も正確。
   */
  reportOverride: { enabled: boolean; stats: Record<TroopType, StatBlock> };
}

export interface UserSettings {
  serverGeneration: number; // 1〜8
  marchCapacity: number; // 行軍（または集結）で送れる兵数
}

export interface UserData {
  version: 1;
  updatedAt: string;
  lordGear: LordGear;
  heroes: Record<string, OwnedHero>;
  troops: Record<TroopType, TroopStock>;
  buffs: UserBuffs;
  settings: UserSettings;
}

/* ------------------------------------------------------------------ */
/* イベント・計算                                                      */
/* ------------------------------------------------------------------ */

/**
 * rally    = 集結攻撃（城塞戦 / チェーザレ討伐 / テラーなど）… Expedition 3 人
 * bear     = 熊狩り（ベアハント）                          … Expedition 3 人
 * garrison = 駐屯・守城                                    … Expedition 3 人
 * arena    = 競技場（アリーナ）                            … 討伐スキル 5 人（前列 2・後列 3）
 * conquest = 討伐（ステージ攻略・自動戦闘）                … 討伐スキル 5 人（前列 2・後列 3）
 */
export type EventType = 'rally' | 'bear' | 'garrison' | 'arena' | 'conquest';

export type TroopRatio = Record<TroopType, number>; // 合計 100

export type MarchRole = 'leader' | 'joiner';

export interface OptimizeRequest {
  event: EventType;
  role: MarchRole;
  /** 3 人編成で「歩兵・騎兵・弓兵を 1 人ずつ」に制限するか */
  oneHeroPerTroop: boolean;
  /** 編成人数を上書きする（未指定ならイベント既定値） */
  slotOverride?: 3 | 5;
  /** 相手の兵種構成（兵種相性補正に使う） */
  enemyRatio: TroopRatio;
  optimizeRatio: boolean;
  /** 0 にすると全探索。正の値なら探索空間がこれを超えたとき遺伝的アルゴリズムに切替 */
  exhaustiveLimit: number;
  topN: number;
}

export interface ScoreBreakdown {
  /** 基礎戦闘力 */
  base: number;
  /** イベント補正後戦闘力 */
  eventAdjusted: number;
  /** 総ダメージ期待値（または防衛スコア） */
  total: number;
  factors: {
    skillBuff: number; // 1 + スキルバフ合計
    counter: number; // 兵種相性補正
    widget: number; // ウィジェットバフ
    lethality: number; // 1 + 殺傷力
    squadAttack: number; // 1 + 部隊攻撃力
    crit: number; // クリティカル期待値
    survival?: number; // 防衛系の生存係数
  };
  perTroop?: Record<TroopType, number>;
  /** 英雄ごとの寄与（なぜその英雄が選ばれたかを画面に出すため） */
  heroContrib?: HeroContribution[];
  notes: string[];
}

export interface HeroContribution {
  heroId: string;
  level: number;
  stars: number;
  /** レベル補正 × 星補正 × 覚醒 × 装備 */
  growth: number;
  /** ステータス寄与の説明（例: "歩兵の攻撃 +312%"） */
  statText: string;
  /** スコアに効いたスキル */
  skills: Array<{ skill: string; stat: EffectStat; value: number }>;
  /** スキルの数値が未取得（= 0 として計算している） */
  missingSkills: boolean;
  /** ステータスが推定値 */
  estimatedStats: boolean;
}

export interface FormationResult {
  heroIds: string[]; // 左から順（[0] が集結リーダー / 前衛）
  ratio: TroopRatio;
  score: ScoreBreakdown;
  usesEstimatedData: boolean;
}

export interface OptimizeResult {
  request: OptimizeRequest;
  results: FormationResult[];
  searched: number;
  method: 'exhaustive' | 'filtered' | 'genetic';
  elapsedMs: number;
  warnings: string[];
}
