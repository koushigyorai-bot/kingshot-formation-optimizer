import type { FormationTemplate, HeroMaster, SourceSite, TierList } from '../../types';
import type { HeroPatch } from '../../master';
import type { PoliteFetcher } from '../http';

export interface AdapterContext {
  fetcher: PoliteFetcher;
  /** 既知の英雄（名前照合・URL 推定に使う） */
  heroes: Pick<HeroMaster, 'id' | 'name' | 'generation' | 'troop'>[];
  /** 公式 Wiki の英雄ページ URL（シードに記録済みのもの） */
  officialUrls: Record<string, string>;
  /** 1 サイトあたりの最大取得ページ数 */
  maxPages: number;
  now: string;
}

export interface AdapterResult {
  heroPatches: HeroPatch[];
  tierLists: TierList[];
  templates: FormationTemplate[];
  warnings: string[];
  heroesParsed: number;
}

export interface SiteAdapter {
  site: SourceSite;
  run(ctx: AdapterContext): Promise<AdapterResult>;
}

export const emptyResult = (): AdapterResult => ({ heroPatches: [], tierLists: [], templates: [], warnings: [], heroesParsed: 0 });

export function heroNameIndex(heroes: AdapterContext['heroes']): Array<{ id: string; names: string[] }> {
  const extra: Record<string, string[]> = {
    jaeger: ['Jaegar'],
    'wee-woo': ['Wee & Woo', 'Wee and Woo', 'WeeWoo'],
    'long-fei': ['Longfei'],
    marlin: ['Merlin'],
    yeonwoo: ['Yeonwo'],
  };
  return heroes.map((h) => ({ id: h.id, names: [h.name, ...(extra[h.id] ?? [])] }));
}
