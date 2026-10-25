import { htmlToLines } from '../html';
import { mineHeroCombos, mineRatioTemplates, mineTierLists } from '../parsers';
import { emptyResult, heroNameIndex, type SiteAdapter } from './types';

/**
 * grindnstrat.com — 複数タイトルを扱う WordPress ブログ
 * 2026-10-25 時点の調査では Kingshot の記事を確認できなかった。
 * 記事が追加された場合に備え、WordPress 標準の REST API で検索してから本文を解析する。
 */
const BASE = 'https://grindnstrat.com';

interface WpPost {
  link: string;
  title?: { rendered?: string };
}

export const grindnstratAdapter: SiteAdapter = {
  site: 'grindnstrat.com',
  async run(ctx) {
    const res = emptyResult();
    const names = heroNameIndex(ctx.heroes);
    let posts: WpPost[] = [];
    try {
      const json = await ctx.fetcher.get(`${BASE}/wp-json/wp/v2/posts?search=kingshot&per_page=10&_fields=link,title`, 'application/json');
      const parsed = JSON.parse(json) as unknown;
      posts = Array.isArray(parsed) ? (parsed as WpPost[]).filter((p) => typeof p.link === 'string' && p.link.startsWith(BASE)) : [];
    } catch (e) {
      res.warnings.push(`記事検索に失敗: ${(e as Error).message}`);
      return res;
    }
    if (posts.length === 0) {
      res.warnings.push('Kingshot の記事は見つかりませんでした');
      return res;
    }
    for (const p of posts.slice(0, Math.min(ctx.maxPages, 10))) {
      try {
        const title = (p.title?.rendered ?? '').replace(/<[^>]+>/g, '');
        const lines = htmlToLines(await ctx.fetcher.get(p.link));
        const source = { site: 'grindnstrat.com' as const, url: p.link, fetchedAt: ctx.now, reliability: 'community' as const };
        res.tierLists.push(...mineTierLists(lines, names, source, title));
        res.templates.push(...mineRatioTemplates(lines, source, title));
        res.templates.push(...mineHeroCombos(lines, names, source, title));
      } catch (e) {
        res.warnings.push(`${p.link}: ${(e as Error).message}`);
      }
    }
    return res;
  },
};
