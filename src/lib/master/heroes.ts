import type { HeroMaster, Rarity, Skill, SkillKind, TroopType, SourceRef, ConquestStats, ExpeditionStats } from '../types';
import { parseSkillDescription } from '../crawler/parseSkill';
import { SRC } from './sources';

/**
 * 英雄マスターの初期値（シード）。
 *
 * - 世代・兵種・レアリティは公式 Wiki の英雄一覧（S1〜S8 フィルタ、兵種アイコン）で確認済み。
 * - ステータス・スキルは確認できた英雄のみ実値を入れ、それ以外は推定値にして
 *   dataStatus / estimatedFields で明示する。/data 画面のクロールで上書きされる。
 * - スキル説明文は原文のまま保持し、効果の数値化は parseSkillDescription に任せる。
 */

function skill(name: string, kind: SkillKind, description: string): Skill {
  return { name, kind, description, effects: parseSkillDescription(description) };
}

/* ------------------------------------------------------------------ */
/* 推定値                                                              */
/* ------------------------------------------------------------------ */

/**
 * 世代ごとの伸び率の推定。
 * Gen1 レジェンド 200.16%（BlueStacks）→ Gen3 約 290%（kingshotguide.org）から
 * 1 世代あたり約 1.2 倍と置いた。実値が取れ次第クロールで置き換わる。
 */
const GEN_GROWTH = 1.2;

function estimatedExpedition(rarity: Rarity, generation: number | null): ExpeditionStats {
  if (rarity === 'rare') return { attack: 90.07, defense: 90.07 }; // BlueStacks（Rare 共通）
  if (rarity === 'epic') return { attack: 140.11, defense: 140.11 }; // 公式（Epic 共通）
  const g = generation ?? 1;
  const v = Math.round(200.16 * GEN_GROWTH ** (g - 1) * 100) / 100;
  return { attack: v, defense: v };
}

function estimatedConquest(rarity: Rarity, generation: number | null, troop: TroopType): ConquestStats {
  const healthByTroop: Record<TroopType, number> = { infantry: 36000, cavalry: 24000, archer: 18000 };
  const attackByTroop: Record<TroopType, number> = { infantry: 1900, cavalry: 2050, archer: 2150 };
  const rarityScale = rarity === 'rare' ? 0.6 : rarity === 'epic' ? 0.8 : 1;
  const gen = rarity === 'legendary' ? GEN_GROWTH ** ((generation ?? 1) - 1) : 1;
  // 防御は Gen1 / Epic が 2,220、Gen3 が 3,330（公式・kingshotguide.org）
  const defense = rarity === 'legendary' ? Math.round(2220 * 1.225 ** ((generation ?? 1) - 1)) : 2220;
  return {
    attack: Math.round(attackByTroop[troop] * rarityScale * gen),
    defense,
    health: Math.round(healthByTroop[troop] * rarityScale * gen),
  };
}

interface RosterEntry {
  id: string;
  name: string;
  nameJa: string;
  generation: number | null;
  rarity: Rarity;
  troop: TroopType;
  officialPath: string; // kingshotwiki.com/heroes/<path>/
}

/**
 * 公式 Wiki 英雄一覧の掲載順（Rare → Epic → S1 … S8）
 * nameJa は公式 Wiki 日本語版（https://kingshotwiki.com/ja/heroes/）の表記。
 * 日本語版に未掲載の英雄（Gen8）は空欄にして英語名だけを表示する。
 */
export const ROSTER: RosterEntry[] = [
  { id: 'olive', name: 'Olive', nameJa: 'オリーブ', generation: null, rarity: 'rare', troop: 'archer', officialPath: 'kingshot_wiki_hero_name_50003_kingshot_end' },
  { id: 'edwin', name: 'Edwin', nameJa: 'エドウィン', generation: null, rarity: 'rare', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50002_kingshot_end' },
  { id: 'forrest', name: 'Forrest', nameJa: 'フォルスト', generation: null, rarity: 'rare', troop: 'infantry', officialPath: 'kingshot_wiki_hero_name_50000_kingshot_end' },
  { id: 'seth', name: 'Seth', nameJa: 'スミス', generation: null, rarity: 'rare', troop: 'infantry', officialPath: 'kingshot_wiki_hero_name_50001_kingshot_end' },
  { id: 'quinn', name: 'Quinn', nameJa: 'クイン', generation: null, rarity: 'epic', troop: 'archer', officialPath: 'kingshot_wiki_hero_name_50006_kingshot_end' },
  { id: 'diana', name: 'Diana', nameJa: 'ダイアナ', generation: null, rarity: 'epic', troop: 'archer', officialPath: 'kingshot_wiki_hero_name_50008_kingshot_end' },
  { id: 'amane', name: 'Amane', nameJa: 'あまね', generation: null, rarity: 'epic', troop: 'archer', officialPath: 'kingshot_wiki_hero_name_50027_kingshot_end' },
  { id: 'yeonwoo', name: 'Yeonwoo', nameJa: 'インウー', generation: null, rarity: 'epic', troop: 'archer', officialPath: 'kingshot_wiki_hero_name_50028_kingshot_end' },
  { id: 'gordon', name: 'Gordon', nameJa: 'ゴードン', generation: null, rarity: 'epic', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50005_kingshot_end' },
  { id: 'chenko', name: 'Chenko', nameJa: 'チェンコ', generation: null, rarity: 'epic', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50007_kingshot_end' },
  { id: 'fahd', name: 'Fahd', nameJa: 'ファハド', generation: null, rarity: 'epic', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50029_kingshot_end' },
  { id: 'howard', name: 'Howard', nameJa: 'ハワード', generation: null, rarity: 'epic', troop: 'infantry', officialPath: 'kingshot_wiki_hero_name_50004_kingshot_end' },
  { id: 'saul', name: 'Saul', nameJa: 'サロ', generation: 1, rarity: 'legendary', troop: 'archer', officialPath: 'kingshot_wiki_hero_name_50017_kingshot_end' },
  { id: 'jabel', name: 'Jabel', nameJa: 'ジェベル', generation: 1, rarity: 'legendary', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50012_kingshot_end' },
  { id: 'helga', name: 'Helga', nameJa: 'ヘルガ', generation: 1, rarity: 'legendary', troop: 'infantry', officialPath: 'kingshot_wiki_hero_name_50009_kingshot_end' },
  { id: 'amadeus', name: 'Amadeus', nameJa: 'アマデウス', generation: 1, rarity: 'legendary', troop: 'infantry', officialPath: 'kingshot_wiki_hero_name_50011_kingshot_end' },
  { id: 'marlin', name: 'Marlin', nameJa: 'マリン', generation: 2, rarity: 'legendary', troop: 'archer', officialPath: 'kingshot_wiki_hero_name_50018_kingshot_end' },
  { id: 'hilde', name: 'Hilde', nameJa: 'ヒルデ', generation: 2, rarity: 'legendary', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50013_kingshot_end' },
  { id: 'zoe', name: 'Zoe', nameJa: 'ゾーイ', generation: 2, rarity: 'legendary', troop: 'infantry', officialPath: 'kingshot_wiki_hero_name_50021_kingshot_end' },
  { id: 'jaeger', name: 'Jaeger', nameJa: 'イェーガー', generation: 3, rarity: 'legendary', troop: 'archer', officialPath: 'jaegar' },
  { id: 'petra', name: 'Petra', nameJa: 'ペーラ', generation: 3, rarity: 'legendary', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50016_kingshot_end' },
  { id: 'eric', name: 'Eric', nameJa: 'エリック', generation: 3, rarity: 'legendary', troop: 'infantry', officialPath: 'kingshot_wiki_hero_name_50010_kingshot_end' },
  { id: 'rosa', name: 'Rosa', nameJa: 'ローザ', generation: 4, rarity: 'legendary', troop: 'archer', officialPath: 'kingshot_wiki_hero_name_50022_kingshot_end' },
  { id: 'margot', name: 'Margot', nameJa: 'マーゴ', generation: 4, rarity: 'legendary', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50014_kingshot_end' },
  { id: 'alcar', name: 'Alcar', nameJa: 'アルカ', generation: 4, rarity: 'legendary', troop: 'infantry', officialPath: 'kingshot_wiki_hero_name_50023_kingshot_end' },
  { id: 'vivian', name: 'Vivian', nameJa: 'ビビアン', generation: 5, rarity: 'legendary', troop: 'archer', officialPath: 'kingshot_wiki_hero_name_50026_kingshot_end' },
  { id: 'thrud', name: 'Thrud', nameJa: 'スルード', generation: 5, rarity: 'legendary', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50025_kingshot_end' },
  { id: 'long-fei', name: 'Long Fei', nameJa: '龍飛', generation: 5, rarity: 'legendary', troop: 'infantry', officialPath: 'long-fei' },
  { id: 'yang', name: 'Yang', nameJa: 'ヤン', generation: 6, rarity: 'legendary', troop: 'archer', officialPath: 'kingshot_wiki_hero_name_50031_kingshot_end' },
  { id: 'sophia', name: 'Sophia', nameJa: 'ソフィア', generation: 6, rarity: 'legendary', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50030_kingshot_end' },
  { id: 'triton', name: 'Triton', nameJa: 'トリトン', generation: 6, rarity: 'legendary', troop: 'infantry', officialPath: 'kingshot_wiki_hero_name_50019_kingshot_end' },
  { id: 'wee-woo', name: 'Wee & Woo', nameJa: 'レン＆ロン', generation: 7, rarity: 'legendary', troop: 'archer', officialPath: 'weewoo' },
  { id: 'ava', name: 'Ava', nameJa: 'アイヴァ', generation: 7, rarity: 'legendary', troop: 'cavalry', officialPath: 'kingshot_wiki_hero_name_50015_kingshot_end' },
  { id: 'charles', name: 'Charles', nameJa: 'チャールズ', generation: 7, rarity: 'legendary', troop: 'infantry', officialPath: 'kingshot_wiki_hero_name_50032_kingshot_end' },
  { id: 'luna', name: 'Luna', nameJa: '', generation: 8, rarity: 'legendary', troop: 'archer', officialPath: 'luna-2' },
  { id: 'liz', name: 'Liz', nameJa: '', generation: 8, rarity: 'legendary', troop: 'cavalry', officialPath: 'kingshot_wiki_liz_kingshot_end' },
  { id: 'diego', name: 'Diego', nameJa: '', generation: 8, rarity: 'legendary', troop: 'infantry', officialPath: 'diego' },
];

/* ------------------------------------------------------------------ */
/* 確認済みデータ                                                      */
/* ------------------------------------------------------------------ */

interface VerifiedPatch {
  conquest?: ConquestStats;
  expedition?: ExpeditionStats;
  skills?: Skill[];
  widget?: HeroMaster['widget'];
  sources: SourceRef[];
  /** ステータスとスキルの両方が公式で確認できたか */
  complete: boolean;
}

const VERIFIED: Record<string, VerifiedPatch> = {
  amadeus: {
    conquest: { attack: 2128, defense: 2220, health: 41624 },
    expedition: { attack: 260.2, defense: 260.2 },
    skills: [
      skill('Combo Slash', 'conquest', 'Amadeus casts enemies in the target area upward followed by three powerful slashes, each dealing Attack*160%/176%/192%/208%/224% damage.'),
      skill('Arcane Swordship', 'conquest', 'Amadeus releases a burst of arcane energy with each sword slash, dealing Attack*15%/17%/19%/21%/23% damage to frontal foes.'),
      skill('Onslaught', 'conquest', 'Amadeus is a master at pressing his advantage, increasing Attack by 16%/24%/32%/40%/48% when Health is above 50%.'),
      skill('Battle Ready', 'expedition', "Young ranger Amadeus excels in boosting morale, increasing the total Squads' Lethality by 5%/10%/15%/20%/25%."),
      skill('Way of the Blade', 'expedition', "Amadeus imparts the secrets of swordsmanship, increasing the total Squads' Attack by 5%/10%/15%/20%/25%."),
      skill('Unrighteous Strike', 'expedition', "Amadeus' unique swordplay has a 8%/16%/24%/32%/40% chance of increasing damage dealt by 50% for all squads."),
      skill('Born Leader', 'talent', 'Amadeus inspires at all times even when absent, boosting Lethality and Health for all deployed soldiers by 3%/6%/9%/12% / 15%.'),
      skill('Double Parry', 'widget_conquest', 'Amadeus is a skillful parrier, reducing damage taken by 10%/15%/20%/25%/30%.'),
      skill('Discernment', 'widget_expedition', 'Amadeus attacks in a sword-tailored formation, increasing Rally Attack by 5%/7.5%/10%/12.5%/15%.'),
    ],
    widget: { name: 'Aegis of Fate', expedition: { lethality: 62.5, health: 62.5 }, conquest: { attack: 431, defense: 562, health: 8437 } },
    sources: [SRC.officialHero('kingshot_wiki_hero_name_50011_kingshot_end')],
    complete: true,
  },
  gordon: {
    conquest: { attack: 1776, defense: 2220, health: 17760 },
    expedition: { attack: 140.11, defense: 140.11 },
    skills: [
      skill('BBQ Feast', 'conquest', 'Gordon prepares a lavish feast, restoring Health by Attack*200%/220%/240%/260%/280% to all troops and increasing Attack by 5%/5.5%/6%/6.5%/7% for all troops for 4s.'),
      skill('Culinary Chaos', 'conquest', "Gordon's life in a chaotic kitchen reduces his damage taken by /10%/15%/20%/25%/30%."),
      skill('Emergency Snack', 'conquest', "Gordon's regular snacking restores Health equal to Attack*50%/55%/60%/65%/70% every 5s."),
      skill('Super Nutrients', 'expedition', "Gordon's culinary masterpieces invigorate our soldiers, increasing total Squads' Health by 5%/10%/15%/20%/25%."),
      skill('Trash Talk', 'expedition', "Beyond delicious meals, Gordon's Trash Talk increases the total Squads' Attack by 5%/10%/15%/20%/25%."),
    ],
    sources: [SRC.officialHero('kingshot_wiki_hero_name_50005_kingshot_end')],
    complete: true,
  },
  chenko: {
    conquest: { attack: 1776, defense: 2220, health: 17760 },
    expedition: { attack: 140.11, defense: 140.11 },
    skills: [
      skill('Burst Fire', 'conquest', 'Unleashes a rapid barrage, dealing Attack*55%/60%/65%/70%/75% damage to enemies in front every 0.5s for 2s.'),
      skill('Defense Upgrade', 'conquest', 'Chenko upgrades her armor, increasing Defense by 25%/37.5%/50%/62.5%/70%.'),
      skill('Weapon Upgrade', 'conquest', "Chenko's upgraded weapon boosts Attack by 8%/12%/16%/20%/24%."),
      skill('Stand of Arms', 'expedition', "Chenko implements advanced weaponry for our soldiers, increasing the total Squads' Lethality by 5%/10%/15%/20%/25%."),
      skill('Shield Wall', 'expedition', 'Enhances troop armor with a keen engineering eye, reducing damage taken by 4%/8%/12%/16%/20% for all troops.'),
    ],
    sources: [SRC.officialHero('kingshot_wiki_hero_name_50007_kingshot_end')],
    complete: true,
  },
  howard: {
    conquest: { attack: 1361, defense: 2220, health: 26640 },
    expedition: { attack: 140.11, defense: 140.11 },
    skills: [
      skill('Shielded Strike', 'conquest', 'Howard gives an enemy a solid whack with his heavy shield, knocking the target back while dealing Attack *200%/220%/240%/260%/280% Area of Effect damage.'),
      skill('Joint Defense', 'conquest', 'Howard leads the effort to fortify defenses, increasing Defense by 5%/7.5%/10%/12.5%/15% for all heroes.'),
      skill('Shield Block', 'conquest', 'Howard trades in his shield for an upgraded model, reducing damage taken by 10%/15%/20%/25%/30%.'),
      skill("Defenders' Edge", 'expedition', 'Howard guards our troops with his shield, reducing damage taken by 4%/8%/12%/16%/20% for all troops.'),
      skill('Weaken', 'expedition', "Howard's intimidating presence reduces the total Enemy Squads' Attack by 4%/8%/12%/16%/20%."),
    ],
    // ステータス・スキルは kingshot.wiki（ファンサイト）。公式ページの直接確認は未了
    sources: [SRC.fanHero('howard')],
    complete: false,
  },
  fahd: {
    // BlueStacks: Epic 騎兵 3 人（Gordon / Chenko / Fahd）は同一ステータス
    conquest: { attack: 1776, defense: 2220, health: 17760 },
    expedition: { attack: 140.11, defense: 140.11 },
    sources: [SRC.bluestacksGen1],
    complete: false,
  },
  helga: {
    conquest: { attack: 1873, defense: 2220, health: 36630 },
    expedition: { attack: 200.16, defense: 200.16 },
    sources: [SRC.bluestacksGen1],
    complete: false,
  },
  jabel: {
    expedition: { attack: 200.16, defense: 200.16 },
    sources: [SRC.bluestacksGen1],
    complete: false,
  },
  saul: {
    expedition: { attack: 200.16, defense: 200.16 },
    sources: [SRC.bluestacksGen1],
    complete: false,
  },
  olive: {
    conquest: { attack: 1752, defense: 2220, health: 10822 },
    expedition: { attack: 90.07, defense: 90.07 },
    sources: [SRC.bluestacksGen1],
    complete: false,
  },
  petra: {
    skills: [
      skill('Dichotomy', 'conquest', "Petra throws a tarot card at an enemy, dealing Attack*270%/297%/324%/351%/378% damage and inflicting one of the following effects: reducing the target's Attack by 20% for 2s or stunning the target for 1.5s"),
      skill('Change of Fate', 'conquest', "Petra curses an enemy, dealing floating damage based on the base value of Petra's Attack*50%/55%/60%/65%/70%. The final damage is a random amount between 5% and 600% of that base value"),
      skill('Turn Card', 'conquest', "Petra reverses misfortune by healing a friendly hero with the lowest percentage of Health remaining based on the base value of Petra's Attack*100%/110%/120%/130%/140%."),
    ],
    sources: [SRC.masteryConquest],
    complete: false,
  },
  zoe: {
    skills: [
      skill('Shield Strike', 'conquest', "Zoe's unpredictable attacks easily enweb foes, dealing Attack*60%/66%/72%/78%/84% damage every 0.5s and amplifying damage taken by the target by 10%/15%/20%/25%/30% for 2s"),
      skill('Agony Rush', 'conquest', 'Zoe requires pain to reach peak physical performance. She immediately regains 20%/25%/30%/35%/40% of max Health under 50% Health. Can only activate once per battle'),
      skill('Holy Might', 'conquest', "Zoe inspires her fellow warriors to battle, boosting your heroes' Attack Speed by 3%/4%/5%/6%/7%"),
    ],
    sources: [SRC.masteryConquest],
    complete: false,
  },
  vivian: {
    skills: [
      skill('Gilded Barrage', 'conquest', "Vivian fires a coin bullet at the enemy back row (heroes first), dealing Attack*180%/198%/216%/234%/252% Area of Effect damage and reducing the targets' Attack Speed by 50% for 2 seconds"),
      skill('Lucky Strike', 'conquest', 'Vivian fires at an enemy (heroes first), dealing Attack*100%/110%/120%/130%/140% damage with a 50% chance of dealing double damage'),
      skill('Priceless Shot', 'conquest', 'Vivian unleashes a devastating hail of massive coin bullets, dealing Attack*35%/38.5%/42%/45.5%/49% damage per second to enemies within range for 3s'),
    ],
    sources: [SRC.masteryConquest],
    complete: false,
  },
};

/* ------------------------------------------------------------------ */
/* 組み立て                                                            */
/* ------------------------------------------------------------------ */

export function buildSeedHeroes(): HeroMaster[] {
  return ROSTER.map((r) => {
    const v = VERIFIED[r.id];
    const estimatedFields: HeroMaster['estimatedFields'] = [];
    const conquest = v?.conquest ?? (estimatedFields.push('conquest'), estimatedConquest(r.rarity, r.generation, r.troop));
    const expedition = v?.expedition ?? (estimatedFields.push('expedition'), estimatedExpedition(r.rarity, r.generation));
    const skills = v?.skills ?? [];
    const hasExpeditionSkills = skills.some((s) => s.kind === 'expedition');
    if (!hasExpeditionSkills && r.rarity !== 'rare') estimatedFields.push('skills');

    const sources: SourceRef[] = [{ ...SRC.officialHeroList }, ...(v?.sources ?? [])];
    if (estimatedFields.length > 0) {
      sources.push(SRC.estimate(`${estimatedFields.join(', ')} は推定値。/data でクロールすると公式値に置き換わる`));
    }

    const dataStatus: HeroMaster['dataStatus'] = v?.complete
      ? 'verified'
      : estimatedFields.length === 0
        ? 'partial'
        : v
          ? 'partial'
          : 'estimated';

    return {
      id: r.id,
      name: r.name,
      nameJa: r.nameJa,
      generation: r.generation,
      rarity: r.rarity,
      troop: r.troop,
      conquest,
      expedition,
      skills,
      ...(v?.widget ? { widget: v.widget } : {}),
      sources,
      dataStatus,
      ...(estimatedFields.length ? { estimatedFields } : {}),
    } satisfies HeroMaster;
  });
}

export function officialHeroUrl(heroId: string): string | undefined {
  const r = ROSTER.find((x) => x.id === heroId);
  return r ? `https://kingshotwiki.com/heroes/${r.officialPath}/` : undefined;
}
