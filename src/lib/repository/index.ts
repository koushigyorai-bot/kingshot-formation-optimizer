import type { UserData } from '../types';
import { validateUserData, type FieldError } from '../validation/userData';
import { browserStore, LocalStorageMasterDataRepository, LocalStorageUserDataRepository } from './localStorage';
import type { MasterDataRepository, UserDataRepository } from './types';

export * from './types';
export { USER_DATA_KEY, MASTER_DATA_KEY } from './localStorage';

export interface Repositories {
  user: UserDataRepository;
  master: MasterDataRepository;
}

/** 保存先の差し替えポイント（Supabase に移行するときはここだけ変える） */
export function createRepositories(knownHeroIds: () => string[]): Repositories {
  const store = browserStore();
  return {
    user: new LocalStorageUserDataRepository(store, knownHeroIds),
    master: new LocalStorageMasterDataRepository(store),
  };
}

/* ------------------------------------------------------------------ */
/* エクスポート / インポート                                           */
/* ------------------------------------------------------------------ */

export function exportUserDataJson(data: UserData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString(), app: 'kingshot-formation-optimizer' }, null, 2);
}

export function exportFileName(date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  return `kingshot-user-data-${d}.json`;
}

export type ImportResult = { ok: true; data: UserData; warnings: FieldError[] } | { ok: false; errors: FieldError[] };

export function importUserDataJson(text: string, knownHeroIds: string[]): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '$', message: `JSON として読み込めません: ${(e as Error).message}` }] };
  }
  return validateUserData(parsed, knownHeroIds);
}
