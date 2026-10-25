import type { SourceRef, StatBlock, TroopType } from '../types';
import { SRC } from '../master/sources';

/**
 * 計算に使う係数。
 *
 * ゲーム内部の正確な式は公開されていないため、
 *  - 出典がある値は source を付ける
 *  - 出典が無い値は assumption: true として UI に一覧表示する
 * どちらも /optimize 画面の「計算の前提」から確認できる。
 */
export interface Coefficient<T = number> {
  value: T;
  label: string;
  source?: SourceRef;
  assumption?: boolean;
  note?: string;
}

export interface CalcConfig {
  /** レベル補正: Lv1 で min、Lv80 で 1.0 になる線形補間 */
  levelFactorMin: Coefficient;
  /** 星補正: 1 + 係数 × 星の数 */
  starFactorPerStar: Coefficient;
  awakeningBonus: Coefficient;
  heroGearPerLevel: Coefficient; // 強化 1 レベルあたり英雄ステータス +%
  heroGearPerMastery: Coefficient; // マスタリー 1 レベルあたり +%
  lordGearPerLevel: Coefficient; // 領主装備 1 レベルあたり兵種ステータス +%
  lordGearPerPolish: Coefficient; // 研磨 1 ポイントあたり +%
  vipAttackPerLevel: Coefficient;
  counterBonus: Coefficient; // 兵種相性の有利・不利の幅
  bearRangedStrike: Coefficient; // 熊（歩兵扱い）に対する弓兵ボーナス
  bearUnits: Coefficient; // 熊の兵数
  troopT6: Coefficient<Record<TroopType, StatBlock>>;
  tierGrowth: Coefficient; // ティア 1 段あたりの兵ステータス倍率
  widgetMaxLevel: Coefficient;
  critDamageBase: Coefficient;
  conquestSkillWeight: Coefficient; // Attack×X% スキルを通常攻撃何回分とみなすか
  positionMismatchPenalty: Coefficient;
  defenseWeight: Coefficient; // 防衛スコアで生存側に掛ける重み（0〜1）
  rallySurvivalWeight: Coefficient; // 対人集結で生存側に掛ける重み（0〜1）
  maxDamageReduction: Coefficient;
}

export const DEFAULT_CONFIG: CalcConfig = {
  levelFactorMin: { value: 0.25, label: 'レベル補正（Lv1 時点の倍率）', assumption: true, note: 'Lv80 で 1.0。間は線形補間' },
  starFactorPerStar: { value: 0.08, label: '星補正（星 1 つあたり）', assumption: true },
  awakeningBonus: { value: 0.05, label: '覚醒ボーナス', assumption: true },
  heroGearPerLevel: { value: 0.05, label: '英雄装備 強化 1Lv あたり +%', assumption: true, note: '公式 Wiki は「強化で Conquest/Expedition ステータスが上がる」とのみ記載' },
  heroGearPerMastery: { value: 0.5, label: '英雄装備 マスタリー 1Lv あたり +%', assumption: true, note: '公式 Wiki はマスタリーを乗算の強化と説明。係数は未公開' },
  lordGearPerLevel: { value: 0.3, label: '領主装備 1Lv あたり兵種ステータス +%', assumption: true },
  lordGearPerPolish: { value: 0.1, label: '研磨 1pt あたり +%', assumption: true },
  vipAttackPerLevel: {
    value: 0,
    label: 'VIP 1Lv あたり攻撃 +%',
    assumption: true,
    note: '効果量を確認できなかったため 0。正確に反映するには「戦闘レポート値で上書き」を使う',
  },
  counterBonus: {
    value: 0.1,
    label: '兵種相性の補正幅',
    assumption: true,
    source: SRC.masteryBattle,
    note: '相性の向き（歩>騎>弓>歩）は複数の攻略サイトで一致。幅は未公開',
  },
  bearRangedStrike: { value: 0.1, label: '熊に対する弓兵ボーナス（Ranged Strike）', source: SRC.bearMechanics },
  bearUnits: { value: 5000, label: '熊の兵数', source: SRC.bearMechanics },
  troopT6: {
    value: {
      infantry: { attack: 243, defense: 10, lethality: 10, health: 730 },
      cavalry: { attack: 730, defense: 10, lethality: 10, health: 243 },
      archer: { attack: 974, defense: 10, lethality: 10, health: 183 },
    },
    label: 'T6 兵の基礎ステータス',
    source: SRC.bearMechanics,
  },
  tierGrowth: { value: 1.1, label: 'ティア 1 段あたりの兵ステータス倍率', assumption: true, note: 'T6 以外の実値は未確認' },
  widgetMaxLevel: { value: 10, label: 'ウィジェット最大レベル', assumption: true, note: 'スキル Lv = ceil(ウィジェット Lv / 2) とみなす' },
  critDamageBase: { value: 0.5, label: 'クリティカル基礎ダメージ倍率', assumption: true },
  conquestSkillWeight: { value: 0.5, label: 'Conquest ダメージスキルの重み', assumption: true },
  positionMismatchPenalty: { value: 0.85, label: '推奨外の兵種を置いた枠の補正', assumption: true },
  defenseWeight: { value: 0.6, label: '防衛スコアの生存重み', assumption: true, note: '総合 = 攻撃^(1-w) × 生存^w' },
  rallySurvivalWeight: { value: 0.35, label: '対人集結スコアの生存重み', assumption: true, note: '集結先の守備隊が反撃するため。熊狩りは 0（反撃なし）' },
  maxDamageReduction: { value: 0.9, label: '被ダメ減少の上限', assumption: true },
};

export function listAssumptions(cfg: CalcConfig = DEFAULT_CONFIG): Array<{ key: string } & Coefficient<unknown>> {
  return Object.entries(cfg).map(([key, c]) => ({ key, ...(c as Coefficient<unknown>) }));
}
