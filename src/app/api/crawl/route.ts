import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SourceSite } from '@/lib/types';
import type { CrawlSnapshot } from '@/lib/master';
import { CRAWL_TARGETS, runCrawl } from '@/lib/crawler';

/**
 * GET  /api/crawl              → 直近のクロール結果（無ければ null）
 * POST /api/crawl {sites?}     → クロールを実行して結果を返す
 *
 * ブラウザから各サイトを直接 fetch すると CORS で弾かれるため、サーバー側で取得する。
 * サーバーレス環境の実行時間制限に収まるよう、UI は 1 サイトずつ POST する。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const COOLDOWN_MS = 10 * 60 * 1000; // 同じサイトへの再クロールは 10 分空ける
const CACHE_DIR = path.join(process.cwd(), '.crawl-cache');

interface CrawlState {
  snapshots: Partial<Record<SourceSite, CrawlSnapshot>>;
  lastRun: Partial<Record<SourceSite, number>>;
  running: Set<SourceSite>;
}

const g = globalThis as unknown as { __ksCrawl?: CrawlState };
const state: CrawlState = (g.__ksCrawl ??= { snapshots: {}, lastRun: {}, running: new Set() });

async function readDisk(site: SourceSite): Promise<CrawlSnapshot | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(CACHE_DIR, `${site}.json`), 'utf8')) as CrawlSnapshot;
  } catch {
    return null;
  }
}

async function writeDisk(site: SourceSite, snap: CrawlSnapshot) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${site}.json`), JSON.stringify(snap));
  } catch {
    /* 読み取り専用のファイルシステム（サーバーレス）では保存しない */
  }
}

function combine(snaps: CrawlSnapshot[]): CrawlSnapshot | null {
  if (snaps.length === 0) return null;
  return {
    crawledAt: snaps.map((s) => s.crawledAt).sort().at(-1)!,
    heroPatches: snaps.flatMap((s) => s.heroPatches),
    tierLists: snaps.flatMap((s) => s.tierLists),
    templates: snaps.flatMap((s) => s.templates),
    siteReports: snaps.flatMap((s) => s.siteReports),
  };
}

export async function GET() {
  const snaps: CrawlSnapshot[] = [];
  for (const site of CRAWL_TARGETS) {
    const s = state.snapshots[site] ?? (await readDisk(site));
    if (s) {
      state.snapshots[site] = s;
      snaps.push(s);
    }
  }
  return NextResponse.json({ snapshot: combine(snaps), running: [...state.running], targets: CRAWL_TARGETS });
}

export async function POST(req: Request) {
  let body: { sites?: string[]; force?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* 本文なし = 全サイト */
  }
  const requested = (body.sites ?? CRAWL_TARGETS).filter((s): s is SourceSite => (CRAWL_TARGETS as string[]).includes(s));
  if (requested.length === 0) return NextResponse.json({ error: '対象サイトが指定されていません' }, { status: 400 });

  const busy = requested.filter((s) => state.running.has(s));
  if (busy.length) return NextResponse.json({ error: `クロール中です: ${busy.join(', ')}` }, { status: 409 });

  const now = Date.now();
  // force は開発時のみ有効（本番では相手サイトへの負荷を優先してクールダウンを守る）
  const bypassCooldown = body.force === true && process.env.NODE_ENV !== 'production';
  const fresh = bypassCooldown ? [] : requested.filter((s) => now - (state.lastRun[s] ?? 0) < COOLDOWN_MS);
  const toRun = requested.filter((s) => !fresh.includes(s));

  toRun.forEach((s) => state.running.add(s));
  try {
    for (const site of toRun) {
      const snap = await runCrawl({ sites: [site] });
      state.snapshots[site] = snap;
      state.lastRun[site] = Date.now();
      await writeDisk(site, snap);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    toRun.forEach((s) => state.running.delete(s));
  }

  const snaps = requested.map((s) => state.snapshots[s]).filter((s): s is CrawlSnapshot => !!s);
  return NextResponse.json({
    snapshot: combine(snaps),
    skippedByCooldown: fresh,
    note: fresh.length ? `${fresh.join(', ')} は 10 分以内に取得済みのため前回の結果を返しました` : undefined,
  });
}
