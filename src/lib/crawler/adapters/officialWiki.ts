import { normalizeHeroId } from '../../master';
import { collectLinks, htmlToLines } from '../html';
import { RobotsDisallowedError } from '../http';
import { mineHeroCombos, mineRatioTemplates, parseOfficialHeroLines, parseOfficialJaNames } from '../parsers';
import { emptyResult, heroNameIndex, type SiteAdapter } from './types';

/**
 * kingshotwiki.com — Century Games 公式 Wiki（最優先）
 *  1. /heroes/ の一覧から英雄ページの URL・世代セクション・兵種アイコンを集める
 *  2. 各英雄ページからステータス・スキル・ウィジェットを読む
 *  3. /events/bear-hunt/ から推奨比率・推奨編成を拾う
 */
const BASE = 'https://kingshotwiki.com';

export const officialWikiAdapter: SiteAdapter = {
  site: 'kingshotwiki.com',
  async run(ctx) {
    const res = emptyResult();
    const src = (url: string) => ({ site: 'kingshotwiki.com' as const, url, fetchedAt: ctx.now, reliability: 'official' as const });

    // 1. 一覧
    let links: Array<{ id: string; url: string; generation?: number | null; troop?: string }> = [];
    try {
      const html = await ctx.fetcher.get(`${BASE}/heroes/`);
      const raw = collectLinks(html, BASE, (h) => /kingshotwiki\.com\/heroes\/[^/#]+\/?$/.test(h) && !/\/(ja|ko)\//.test(h));
      const seen = new Set<string>();
      for (const l of raw) {
        let id = normalizeHeroId(l.text, ctx.heroes);
        if (!id) {
          // シードに無い新英雄（新世代など）。英雄カードらしい短い名前だけ追加候補にする
          if (l.text.length > 24 || !/^[A-Za-z][A-Za-z &.'-]+$/.test(l.text) || !l.troopIcon) continue;
          id = l.text.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          res.warnings.push(`シード未登録の英雄を追加: ${l.text}${l.generationSection ? `（S${l.generationSection}）` : ''}`);
        }
        if (seen.has(id)) continue;
        seen.add(id);
        links.push({ id, url: l.href, ...(l.generationSection !== undefined ? { generation: l.generationSection } : {}), troop: l.troopIcon });
      }
    } catch (e) {
      res.warnings.push(`英雄一覧の取得に失敗: ${(e as Error).message}。シードの URL を使います`);
    }
    if (links.length === 0) links = Object.entries(ctx.officialUrls).map(([id, url]) => ({ id, url }));

    // 2. 各英雄ページ
    for (const l of links.slice(0, ctx.maxPages)) {
      try {
        const html = await ctx.fetcher.get(l.url);
        const page = parseOfficialHeroLines(htmlToLines(html));
        page.warnings.forEach((w) => res.warnings.push(`${l.id}: ${w}`));

        // 日本語版ページ（言語切り替えのリンク）から英雄名・スキル名・ウィジェット名を取る
        let heroNameJa: string | undefined;
        const jaUrl = collectLinks(html, BASE, (h) => /kingshotwiki\.com\/ja\/heroes\/[^/#]+\/?$/.test(h))[0]?.href;
        if (jaUrl) {
          try {
            const ja = parseOfficialJaNames(htmlToLines(await ctx.fetcher.get(jaUrl)));
            heroNameJa = ja.heroName;
            if (ja.skillNames.length === page.skills.length) {
              page.skills = page.skills.map((sk, idx) => ({ ...sk, nameJa: ja.skillNames[idx] }));
            } else if (ja.skillNames.length) {
              res.warnings.push(`${l.id}: 日本語版のスキル数（${ja.skillNames.length}）が英語版（${page.skills.length}）と違うため、日本語名を付けませんでした`);
            }
            if (page.widget && ja.widgetName) page.widget = { ...page.widget, nameJa: ja.widgetName };
          } catch (e) {
            res.warnings.push(`${l.id}: 日本語版ページの取得に失敗 ${(e as Error).message}`);
          }
        }
        res.heroPatches.push({
          heroId: l.id,
          ...(page.name ? { name: page.name } : {}),
          ...(heroNameJa ? { nameJa: heroNameJa } : {}),
          ...(typeof l.generation === 'number' ? { generation: l.generation } : {}),
          ...(page.rarity ? { rarity: page.rarity } : {}),
          ...(page.troop ? { troop: page.troop } : {}),
          ...(page.conquest ? { conquest: page.conquest } : {}),
          ...(page.expedition ? { expedition: page.expedition } : {}),
          ...(page.skills.length ? { skills: page.skills } : {}),
          ...(page.widget ? { widget: page.widget } : {}),
          source: src(l.url),
        });
        if (page.conquest || page.skills.length) res.heroesParsed++;
      } catch (e) {
        if (e instanceof RobotsDisallowedError) res.warnings.push(e.message);
        else res.warnings.push(`${l.id}: 取得失敗 ${(e as Error).message}`);
      }
    }

    // 3. 熊狩りページ
    try {
      const url = `${BASE}/events/bear-hunt/`;
      const lines = htmlToLines(await ctx.fetcher.get(url));
      res.templates.push(...mineRatioTemplates(lines, src(url), 'Bear Hunt'));
      res.templates.push(...mineHeroCombos(lines, heroNameIndex(ctx.heroes), src(url), 'Bear Hunt'));
    } catch (e) {
      res.warnings.push(`熊狩りページの取得に失敗: ${(e as Error).message}`);
    }
    return res;
  },
};
