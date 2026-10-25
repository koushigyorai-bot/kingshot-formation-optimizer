import type { SourceSite } from '../types';
import type { CrawlSnapshot, SiteReport } from '../master';
import { seedMasterData } from '../master';
import { officialHeroUrl } from '../master/heroes';
import { SITE_PROFILES } from '../master/sources';
import { PoliteFetcher } from './http';
import { fanWikiAdapter } from './adapters/fanWiki';
import { grindnstratAdapter } from './adapters/grindnstrat';
import { kingshotToolsAdapter } from './adapters/kingshotTools';
import { officialWikiAdapter } from './adapters/officialWiki';
import type { SiteAdapter } from './adapters/types';

export const ADAPTERS: Record<string, SiteAdapter> = {
  'kingshotwiki.com': officialWikiAdapter,
  'kingshot.wiki': fanWikiAdapter,
  'kingshottools.pro': kingshotToolsAdapter,
  'grindnstrat.com': grindnstratAdapter,
};

export const CRAWL_TARGETS = Object.keys(ADAPTERS) as SourceSite[];

export interface CrawlOptions {
  sites?: SourceSite[];
  maxPagesPerSite?: number;
  fetchImpl?: typeof fetch;
}

/** 4 サイトを順に巡回し、マージ前のスナップショットを返す（サイト単位で失敗を隔離） */
export async function runCrawl(opts: CrawlOptions = {}): Promise<CrawlSnapshot> {
  const now = new Date().toISOString();
  const seed = seedMasterData();
  const fetcher = new PoliteFetcher(opts.fetchImpl);
  const heroes = seed.heroes.map(({ id, name, generation, troop }) => ({ id, name, generation, troop }));
  const officialUrls = Object.fromEntries(seed.heroes.map((h) => [h.id, officialHeroUrl(h.id) ?? '']).filter(([, u]) => u));
  const sites = (opts.sites ?? CRAWL_TARGETS).filter((s) => ADAPTERS[s] && !SITE_PROFILES[s]?.flagged);

  const snapshot: CrawlSnapshot = { crawledAt: now, heroPatches: [], tierLists: [], templates: [], siteReports: [] };

  // サイトごとに並列（同一ホスト内は PoliteFetcher が直列化する）
  const reports = await Promise.all(
    sites.map(async (site): Promise<SiteReport> => {
      const t0 = Date.now();
      const before = { ...fetcher.stats };
      try {
        const r = await ADAPTERS[site]!.run({ fetcher, heroes, officialUrls, maxPages: opts.maxPagesPerSite ?? 60, now });
        snapshot.heroPatches.push(...r.heroPatches);
        snapshot.tierLists.push(...r.tierLists);
        snapshot.templates.push(...r.templates);
        return {
          site,
          ok: true,
          pagesFetched: fetcher.stats.fetched - before.fetched,
          pagesSkippedByRobots: fetcher.stats.skippedByRobots - before.skippedByRobots,
          heroesParsed: r.heroesParsed,
          warnings: r.warnings.slice(0, 50),
          durationMs: Date.now() - t0,
        };
      } catch (e) {
        return { site, ok: false, pagesFetched: 0, pagesSkippedByRobots: 0, heroesParsed: 0, warnings: [], error: (e as Error).message, durationMs: Date.now() - t0 };
      }
    }),
  );
  snapshot.siteReports = reports;
  return snapshot;
}
