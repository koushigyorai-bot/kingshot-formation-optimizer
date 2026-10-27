import type { MasterData, UserData } from '../types';
import type { CrawlSnapshot } from '../master';

/**
 * 保存先を差し替えられるようにするための repository インターフェース。
 * UI・計算ロジックはこのインターフェースだけに依存する。
 *
 * Supabase へ移行する場合は SupabaseUserDataRepository を実装し、
 * src/lib/repository/index.ts の createRepositories() で差し替える。
 */
export interface UserDataRepository {
  load(): Promise<UserData | null>;
  save(data: UserData): Promise<void>;
  clear(): Promise<void>;
  /** 他タブなど外部での更新を購読（対応しない実装は no-op を返す） */
  subscribe?(listener: (data: UserData | null) => void): () => void;
}

export interface MasterDataRepository {
  /** クロール結果を含む保存済みマスターデータ。無ければ null（シードを使う） */
  load(): Promise<MasterData | null>;
  save(data: MasterData): Promise<void>;
  clear(): Promise<void>;
  /** クロールした生の結果（読み込み時に初期データと重ね直す） */
  loadSnapshot(): Promise<CrawlSnapshot | null>;
  saveSnapshot(snap: CrawlSnapshot): Promise<void>;
}

/** Web Storage の最小インターフェース（テストでは Map 実装を渡す） */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
