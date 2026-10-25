import { isAllowed, parseRobots, type RobotsRules } from './robots';

/**
 * 行儀のよい取得処理。
 * - robots.txt を尊重（取得できなければ「制限なし」として扱う）
 * - 同一ホストへは最低 MIN_DELAY_MS（または Crawl-delay）の間隔を空ける
 * - タイムアウト・最大サイズを設ける
 * - 本ツールを名乗る User-Agent を送る
 */
export const USER_AGENT =
  process.env.CRAWLER_USER_AGENT ??
  'KingshotFormationOptimizer/0.1 (+https://github.com/your-account/kingshot-formation-optimizer; personal non-commercial)';

const MIN_DELAY_MS = 1500;
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024;

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt で禁止されています: ${url}`);
    this.name = 'RobotsDisallowedError';
  }
}

export interface FetchStats {
  fetched: number;
  skippedByRobots: number;
}

export class PoliteFetcher {
  private robots = new Map<string, Promise<RobotsRules>>();
  private lastHit = new Map<string, number>();
  private queue = new Map<string, Promise<unknown>>();
  readonly stats: FetchStats = { fetched: 0, skippedByRobots: 0 };

  constructor(private fetchImpl: typeof fetch = fetch) {}

  private rulesFor(origin: string): Promise<RobotsRules> {
    let p = this.robots.get(origin);
    if (!p) {
      p = this.raw(`${origin}/robots.txt`, 'text/plain')
        .then((t) => parseRobots(t, USER_AGENT))
        .catch(() => ({ allow: [], disallow: [] }));
      this.robots.set(origin, p);
    }
    return p;
  }

  private async raw(url: string, accept = 'text/html'): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'en' },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > MAX_BYTES) throw new Error(`サイズ超過 (${len} bytes) ${url}`);
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new Error(`サイズ超過 ${url}`);
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  /** robots.txt を確認し、ホストごとに直列化・間隔を空けて取得する */
  async get(url: string, accept?: string): Promise<string> {
    const u = new URL(url);
    const rules = await this.rulesFor(u.origin);
    if (!isAllowed(rules, u.pathname + u.search)) {
      this.stats.skippedByRobots++;
      throw new RobotsDisallowedError(url);
    }
    const delay = Math.max(MIN_DELAY_MS, (rules.crawlDelaySec ?? 0) * 1000);
    const prev = this.queue.get(u.host) ?? Promise.resolve();
    const run = prev
      .catch(() => undefined)
      .then(async () => {
        const wait = (this.lastHit.get(u.host) ?? 0) + delay - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        this.lastHit.set(u.host, Date.now());
        const text = await this.raw(url, accept);
        this.stats.fetched++;
        return text;
      });
    this.queue.set(u.host, run);
    return run;
  }
}
