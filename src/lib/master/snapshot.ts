import type { CrawlSnapshot } from './index';

/**
 * クロール結果（スナップショット）の書き出し・読み込み。
 *
 * マージ済みのマスターデータではなく「クロールした生の結果」を保存する。
 * 読み込むたびに同梱の初期データと重ね直すので、アプリ側で初期データや
 * スキル文の解析方法を直したとき、その修正が保存済みデータにも反映される。
 */
export const SNAPSHOT_APP_ID = 'kingshot-formation-optimizer/crawl-snapshot';
/** public/ に置くと全員に配られるファイル名 */
export const BUNDLED_SNAPSHOT_PATH = '/master-data.json';

export interface SnapshotFile extends CrawlSnapshot {
  app: typeof SNAPSHOT_APP_ID;
  version: 1;
  exportedAt: string;
}

export function exportSnapshotJson(snap: CrawlSnapshot): string {
  const file: SnapshotFile = { app: SNAPSHOT_APP_ID, version: 1, exportedAt: new Date().toISOString(), ...snap };
  return JSON.stringify(file, null, 2);
}

export function snapshotFileName(snap: CrawlSnapshot): string {
  return `kingshot-master-data-${snap.crawledAt.slice(0, 10)}.json`;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export type SnapshotParseResult = { ok: true; snapshot: CrawlSnapshot } | { ok: false; error: string };

/** 書き出したファイル・同梱ファイルの検証（構造が壊れていれば読み込まない） */
export function parseSnapshot(input: unknown): SnapshotParseResult {
  let v = input;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch (e) {
      return { ok: false, error: `JSON として読み込めません: ${(e as Error).message}` };
    }
  }
  if (!isObj(v)) return { ok: false, error: 'JSON オブジェクトではありません' };
  if (v.app !== undefined && v.app !== SNAPSHOT_APP_ID) {
    return { ok: false, error: 'このツールのデータ更新結果ではありません（所持状況のファイルは「所持状況の入力 → 保存・入出力」で読み込んでください）' };
  }
  if (typeof v.crawledAt !== 'string' || Number.isNaN(Date.parse(v.crawledAt))) return { ok: false, error: 'crawledAt（取得日時）がありません' };
  if (!Array.isArray(v.heroPatches)) return { ok: false, error: 'heroPatches がありません' };

  const heroPatches = v.heroPatches.filter(
    (p): p is CrawlSnapshot['heroPatches'][number] =>
      isObj(p) && typeof p.heroId === 'string' && isObj(p.source) && typeof (p.source as Obj).site === 'string',
  );
  if (heroPatches.length === 0) return { ok: false, error: '英雄データが 1 件も含まれていません' };

  return {
    ok: true,
    snapshot: {
      crawledAt: v.crawledAt,
      heroPatches,
      tierLists: Array.isArray(v.tierLists) ? (v.tierLists as CrawlSnapshot['tierLists']) : [],
      templates: Array.isArray(v.templates) ? (v.templates as CrawlSnapshot['templates']) : [],
      siteReports: Array.isArray(v.siteReports) ? (v.siteReports as CrawlSnapshot['siteReports']) : [],
    },
  };
}

/** 新しい方を返す（同時刻ならブラウザ側を優先） */
export function newerSnapshot(a: CrawlSnapshot | null, b: CrawlSnapshot | null): CrawlSnapshot | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.crawledAt) > Date.parse(a.crawledAt) ? b : a;
}
