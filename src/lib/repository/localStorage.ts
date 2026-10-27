import type { MasterData, UserData } from '../types';
import type { CrawlSnapshot } from '../master';
import { parseSnapshot } from '../master/snapshot';
import { validateUserData } from '../validation/userData';
import type { KeyValueStore, MasterDataRepository, UserDataRepository } from './types';

export const USER_DATA_KEY = 'kingshot_user_data_v1';
export const MASTER_DATA_KEY = 'kingshot_master_data_v1';
export const CRAWL_SNAPSHOT_KEY = 'kingshot_crawl_snapshot_v1';

/** SSR 中やストレージ無効時に使うメモリ実装 */
export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** localStorage が使えない環境（SSR・プライベートモードの一部）ではメモリにフォールバック */
export function browserStore(): KeyValueStore {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = '__ks_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    /* 容量超過・無効化 */
  }
  return new MemoryStore();
}

export class LocalStorageUserDataRepository implements UserDataRepository {
  constructor(
    private store: KeyValueStore,
    private knownHeroIds: () => string[],
  ) {}

  async load(): Promise<UserData | null> {
    const raw = this.store.getItem(USER_DATA_KEY);
    if (!raw) return null;
    try {
      const result = validateUserData(JSON.parse(raw), this.knownHeroIds());
      return result.ok ? result.data : null;
    } catch {
      return null;
    }
  }

  async save(data: UserData): Promise<void> {
    const payload: UserData = { ...data, updatedAt: new Date().toISOString() };
    this.store.setItem(USER_DATA_KEY, JSON.stringify(payload));
  }

  async clear(): Promise<void> {
    this.store.removeItem(USER_DATA_KEY);
  }

  subscribe(listener: (data: UserData | null) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const onStorage = (e: StorageEvent) => {
      if (e.key !== USER_DATA_KEY) return;
      void this.load().then(listener);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }
}

export class LocalStorageMasterDataRepository implements MasterDataRepository {
  constructor(private store: KeyValueStore) {}

  async load(): Promise<MasterData | null> {
    const raw = this.store.getItem(MASTER_DATA_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as MasterData;
      return parsed && parsed.version === 1 && Array.isArray(parsed.heroes) ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(data: MasterData): Promise<void> {
    this.store.setItem(MASTER_DATA_KEY, JSON.stringify(data));
  }

  async clear(): Promise<void> {
    this.store.removeItem(MASTER_DATA_KEY);
    this.store.removeItem(CRAWL_SNAPSHOT_KEY);
  }

  async loadSnapshot(): Promise<CrawlSnapshot | null> {
    const raw = this.store.getItem(CRAWL_SNAPSHOT_KEY);
    if (!raw) return null;
    const r = parseSnapshot(raw);
    return r.ok ? r.snapshot : null;
  }

  async saveSnapshot(snap: CrawlSnapshot): Promise<void> {
    this.store.setItem(CRAWL_SNAPSHOT_KEY, JSON.stringify(snap));
  }
}
