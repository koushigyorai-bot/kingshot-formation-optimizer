import { normalizeHeroId } from '../../master';
import { collectLabeledStrongRows, collectLinks, htmlToLines } from '../html';
import { RobotsDisallowedError } from '../http';
import { mineHeroCombos, mineRatioTemplates, mineTierLists, parseFanHeroLines, parseFanSkillRows } from '../parsers';
import { emptyResult, heroNameIndex, type SiteAdapter } from './types';

/**
 * kingshot.wiki — 非公式ファンサイト
 * 英雄ページにステータスとスキル（Lv1〜5 の数値）が構造化されている。
 * 公式 Wiki で取れなかった項目の補完と、編成ページからのテンプレート抽出に使う。
 */
const BASE = 'https://kingshot.wiki';

export const fanWikiAdapter: SiteAdapter = {
  site: 'kingshot.wiki',
  async run(ctx) {
    const res = emptyResult();
    const src = (url: string) => ({ site: 'kingshot.wiki' as const, url, fetchedAt: ctx.now, reliability: 'community' as const });
    const names = heroNameIndex(ctx.heroes);

    let heroLinks: Array<{ id: string; url: string }> = [];
    try {
      const html = await ctx.fetcher.get(`${BASE}/heroes`);
      const seen = new Set<string>();
      for (const l of collectLinks(html, BASE, (h) => /kingshot\.wiki\/heroes\/[a-z0-9-]+$/.test(h))) {
        const slug = l.href.split('/').pop() ?? '';
        if (['tier-list', 'best-f2p-heroes', 'best-pvp-heroes', 'best-pve-heroes'].includes(slug)) continue;
        const id = normalizeHeroId(slug.replace(/-/g, ' '), ctx.heroes) ?? normalizeHeroId(l.text.replace(/ Guide$/, ''), ctx.heroes);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        heroLinks.push({ id, url: l.href });
      }
    } catch (e) {
      res.warnings.push(`英雄一覧の取得に失敗: ${(e as Error).message}`);
      heroLinks = ctx.heroes.map((h) => ({ id: h.id, url: `${BASE}/heroes/${h.id === 'wee-woo' ? 'wee-woo' : h.id}` }));
    }

    for (const l of heroLinks.slice(0, ctx.maxPages)) {
      try {
        const html = await ctx.fetcher.get(l.url);
        const page = parseFanHeroLines(htmlToLines(html));
        const skills = parseFanSkillRows(collectLabeledStrongRows(html));
        page.warnings.forEach((w) => res.warnings.push(`${l.id}: ${w}`));
        res.heroPatches.push({
          heroId: l.id,
          ...(page.rarity ? { rarity: page.rarity } : {}),
          ...(page.troop ? { troop: page.troop } : {}),
          ...(page.conquest ? { conquest: page.conquest } : {}),
          ...(page.expedition ? { expedition: page.expedition } : {}),
          ...(skills.length ? { skills } : {}),
          source: src(l.url),
        });
        if (page.conquest || skills.length) res.heroesParsed++;
      } catch (e) {
        res.warnings.push(e instanceof RobotsDisallowedError ? e.message : `${l.id}: 取得失敗 ${(e as Error).message}`);
      }
    }

    // ティアリスト・編成ページ（構造化されたティア表が無い場合は空で返る）
    for (const path of ['/heroes/tier-list', '/formations/best-formations', '/guides/bear-hunt-expert', '/guides/advanced-rally']) {
      try {
        const url = `${BASE}${path}`;
        const lines = htmlToLines(await ctx.fetcher.get(url));
        const title = lines.find((x) => x.length > 8 && x.length < 90) ?? path;
        res.tierLists.push(...mineTierLists(lines, names, src(url), title));
        res.templates.push(...mineRatioTemplates(lines, src(url), title));
        res.templates.push(...mineHeroCombos(lines, names, src(url), title));
      } catch (e) {
        res.warnings.push(`${path}: ${(e as Error).message}`);
      }
    }
    if (res.tierLists.length === 0) res.warnings.push('ティア表は見つかりませんでした（このサイトのティアページは文章形式）');
    return res;
  },
};
