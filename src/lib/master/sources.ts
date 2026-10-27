import type { SourceRef, SourceSite, Reliability } from '../types';

/**
 * 情報源の定義と優先度。
 * マージ時は priority の小さい方を採用し、食い違いは DataConflict として記録する。
 */
export interface SiteProfile {
  site: SourceSite;
  label: string;
  baseUrl?: string;
  reliability: Reliability;
  priority: number;
  description: string;
  /** 排外主義・差別的な思想を流布するサイトとして警告表示する */
  flagged?: boolean;
}

export const SITE_PROFILES: Record<SourceSite, SiteProfile> = {
  'kingshotwiki.com': {
    site: 'kingshotwiki.com',
    label: 'Kingshot 公式 Wiki',
    baseUrl: 'https://kingshotwiki.com',
    reliability: 'official',
    priority: 1,
    description: 'Century Games が運営する公式 Wiki（フッターに "Kingshot - Official Wiki | Century Games" と明記）。',
  },
  'kingshot.wiki': {
    site: 'kingshot.wiki',
    label: 'kingshot.wiki',
    baseUrl: 'https://kingshot.wiki',
    reliability: 'community',
    priority: 2,
    description: '非公式ファンサイト（"fan-made/unofficial companion site" と自己申告）。英雄ステータス・スキルの数値が構造化されている。',
  },
  'kingshottools.pro': {
    site: 'kingshottools.pro',
    label: 'KingshotTools.pro',
    baseUrl: 'https://kingshottools.pro',
    reliability: 'community',
    priority: 4,
    description: '非公式の計算ツール集。英雄紹介文に公式 Wiki と食い違う記述があるため、世代・兵種の照合にのみ使う。',
  },
  'grindnstrat.com': {
    site: 'grindnstrat.com',
    label: 'GrindNStrat',
    baseUrl: 'https://grindnstrat.com',
    reliability: 'community',
    priority: 5,
    description: '複数タイトルを扱う攻略ブログ。2026-10-25 時点の調査では Kingshot 記事を確認できなかった。',
  },
  'kingshotmastery.com': {
    site: 'kingshotmastery.com',
    label: 'Kingshot Mastery',
    reliability: 'community',
    priority: 3,
    description: '非公式ファンサイト。シード値（熊狩り比率・征服ステージの編成人数など）の出典として参照。',
  },
  'kingshotguide.org': {
    site: 'kingshotguide.org',
    label: 'kingshotguide.org',
    reliability: 'community',
    priority: 3,
    description: '非公式ファンサイト。世代別のステータス傾向の出典として参照。',
  },
  'bluestacks.com': {
    site: 'bluestacks.com',
    label: 'BlueStacks ブログ',
    reliability: 'community',
    priority: 3,
    description: 'エミュレーター運営元のゲームガイド。Gen1 英雄の基礎ステータスの出典として参照。',
  },
  'kingshotoptimizer.com': {
    site: 'kingshotoptimizer.com',
    label: 'Kingshot Optimizer',
    reliability: 'community',
    priority: 3,
    description: '非公式ファンサイト。スキルのレベル別数値の出典として参照。',
  },
  user: { site: 'user', label: '手入力', reliability: 'official', priority: 0, description: 'ユーザーが直接入力・修正した値。' },
  estimate: {
    site: 'estimate',
    label: '推定値',
    reliability: 'estimate',
    priority: 9,
    description: '一次情報が無い項目に本ツールが仮置きした値。クロール結果で上書きされる。',
  },
};

export function sitePriority(site: SourceSite): number {
  return SITE_PROFILES[site]?.priority ?? 9;
}

/** シード値の出典（2026-10-25 に閲覧） */
const SEEN = '2026-10-25T00:00:00Z';
export const SRC = {
  officialHero: (slugOrId: string): SourceRef => ({
    site: 'kingshotwiki.com',
    url: `https://kingshotwiki.com/heroes/${slugOrId}/`,
    fetchedAt: SEEN,
    reliability: 'official',
  }),
  officialHeroList: {
    site: 'kingshotwiki.com',
    url: 'https://kingshotwiki.com/heroes/',
    fetchedAt: SEEN,
    reliability: 'official',
    note: '世代・兵種・レアリティ',
  } as SourceRef,
  officialBear: {
    site: 'kingshotwiki.com',
    url: 'https://kingshotwiki.com/events/bear-hunt/',
    fetchedAt: SEEN,
    reliability: 'official',
  } as SourceRef,
  officialArena: {
    site: 'kingshotwiki.com',
    url: 'https://kingshotwiki.com/buildings/kingshot_wiki_builddes_name_326_kingshot_end/',
    fetchedAt: SEEN,
    reliability: 'official',
  } as SourceRef,
  officialHeroGear: {
    site: 'kingshotwiki.com',
    url: 'https://kingshotwiki.com/hero-gears/hero-gear/',
    fetchedAt: SEEN,
    reliability: 'official',
  } as SourceRef,
  fanHero: (slug: string): SourceRef => ({
    site: 'kingshot.wiki',
    url: `https://kingshot.wiki/heroes/${slug}`,
    fetchedAt: SEEN,
    reliability: 'community',
  }),
  bearMechanics: {
    site: 'kingshot.wiki',
    url: 'https://kingshot.wiki/guides/bear-trap-damage-mechanics-and-example-simulation',
    fetchedAt: SEEN,
    reliability: 'community',
    note: 'プレイヤーによる解析。公式の計算式ではない',
  } as SourceRef,
  masteryBear: {
    site: 'kingshotmastery.com',
    url: 'https://kingshotmastery.com/guides/bear-hunt',
    fetchedAt: SEEN,
    reliability: 'community',
  } as SourceRef,
  masteryConquest: {
    site: 'kingshotmastery.com',
    url: 'https://kingshotmastery.com/guides/kingshot-conquest-guide',
    fetchedAt: SEEN,
    reliability: 'community',
  } as SourceRef,
  masterySkills: {
    site: 'kingshotmastery.com',
    url: 'https://kingshotmastery.com/guides/hero-skills-and-builds',
    fetchedAt: SEEN,
    reliability: 'community',
  } as SourceRef,
  masteryBattle: {
    site: 'kingshotmastery.com',
    url: 'https://kingshotmastery.com/guides/battle-mechanics-guide',
    fetchedAt: SEEN,
    reliability: 'community',
  } as SourceRef,
  guideBear: {
    site: 'kingshotguide.org',
    url: 'https://www.kingshotguide.org/guide/kingshot-bear-event-guide-2026',
    fetchedAt: SEEN,
    reliability: 'community',
  } as SourceRef,
  guideGen3: {
    site: 'kingshotguide.org',
    url: 'https://www.kingshotguide.org/guide/kingshot-gen-3-heroes',
    fetchedAt: SEEN,
    reliability: 'community',
  } as SourceRef,
  bluestacksGen1: {
    site: 'bluestacks.com',
    url: 'https://www.bluestacks.com/blog/game-guides/kingshot/kgst-hero-tier-list-en.html',
    fetchedAt: SEEN,
    reliability: 'community',
  } as SourceRef,
  estimate: (note: string): SourceRef => ({ site: 'estimate', reliability: 'estimate', note }),
};
