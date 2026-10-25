import { normalizeHeroId } from '../../master';
import { collectLinks, htmlToLines } from '../html';
import { mineRatioTemplates, parseToolsHeroCard } from '../parsers';
import { emptyResult, type SiteAdapter } from './types';

/**
 * kingshottools.pro — 非公式ツール集
 * 英雄紹介文に公式 Wiki と矛盾する記述が見られたため（例: Amadeus を "shield guardian" と記載）、
 * 世代・兵種の照合と、熊狩りページの比率抽出にだけ使う。ステータスやスキルは採用しない。
 */
const BASE = 'https://kingshottools.pro';

export const kingshotToolsAdapter: SiteAdapter = {
  site: 'kingshottools.pro',
  async run(ctx) {
    const res = emptyResult();
    const src = (url: string) => ({
      site: 'kingshottools.pro' as const,
      url,
      fetchedAt: ctx.now,
      reliability: 'community' as const,
      note: '世代・兵種の照合のみ',
    });

    try {
      const url = `${BASE}/database/heroes`;
      const html = await ctx.fetcher.get(url);
      for (const l of collectLinks(html, BASE, (h) => /\/database\/heroes\/[a-z0-9-]+$/.test(h) && !h.endsWith('/guide'))) {
        const card = parseToolsHeroCard(l.text);
        if (!card) continue;
        const id = normalizeHeroId(card.name, ctx.heroes);
        if (!id) {
          res.warnings.push(`未登録の英雄: ${card.name}`);
          continue;
        }
        const known = ctx.heroes.find((h) => h.id === id);
        if (known && card.troop && known.troop !== card.troop) res.warnings.push(`${id}: 兵種が公式と異なる（${card.troop}）`);
        if (known && card.generation !== null && known.generation !== card.generation) res.warnings.push(`${id}: 世代が公式と異なる（Gen${card.generation}）`);
        res.heroPatches.push({ heroId: id, generation: card.generation, ...(card.troop ? { troop: card.troop } : {}), source: src(l.href) });
        res.heroesParsed++;
      }
    } catch (e) {
      res.warnings.push(`英雄データベースの取得に失敗: ${(e as Error).message}`);
    }

    try {
      const url = `${BASE}/events/bear-hunt`;
      res.templates.push(...mineRatioTemplates(htmlToLines(await ctx.fetcher.get(url)), src(url), 'Bear Hunt'));
    } catch (e) {
      res.warnings.push(`熊狩りページの取得に失敗: ${(e as Error).message}`);
    }
    return res;
  },
};
