'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MasterData, OwnedHero, UserData } from '../types';
import { mergeMasterData, reparseSkills, seedMasterData, type CrawlSnapshot } from '../master';
import { createRepositories, type Repositories } from '../repository';
import { BUNDLED_SNAPSHOT_PATH, newerSnapshot, parseSnapshot } from '../master/snapshot';
import { createDefaultOwnedHero, createDefaultUserData } from '../validation/userData';

/**
 * 画面全体で共有する状態。
 * - master: 同梱の初期データ + クロール結果（スナップショット）
 * - user:   所持状況（変更から 400ms 後に自動保存）
 *
 * スナップショットの読み込み順:
 *   ブラウザに保存した結果 と 公開サイトに同梱した public/master-data.json のうち、新しい方
 */
export type MasterOrigin = 'seed' | 'browser' | 'bundled' | 'legacy';

interface StoreValue {
  ready: boolean;
  master: MasterData;
  snapshot: CrawlSnapshot | null;
  masterOrigin: MasterOrigin;
  /** 同梱ファイルの取得日時（無ければ null） */
  bundledAt: string | null;
  importSnapshot: (text: string) => Promise<{ ok: true; heroes: number } | { ok: false; error: string }>;
  user: UserData;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  setUser: (updater: (u: UserData) => UserData) => void;
  replaceUser: (u: UserData) => void;
  updateHero: (heroId: string, patch: Partial<OwnedHero>) => void;
  resetUser: () => Promise<void>;
  applySnapshot: (snap: CrawlSnapshot) => Promise<MasterData>;
  resetMaster: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const seed = useMemo(() => seedMasterData(), []);
  const [master, setMaster] = useState<MasterData>(seed);
  const [snapshot, setSnapshot] = useState<CrawlSnapshot | null>(null);
  const [masterOrigin, setMasterOrigin] = useState<MasterOrigin>('seed');
  const [bundledAt, setBundledAt] = useState<string | null>(null);
  const [user, setUserState] = useState<UserData>(() => createDefaultUserData(seed.heroes.map((h) => h.id)));
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<StoreValue['saveState']>('idle');
  const masterRef = useRef(master);
  /** 他のタブから取り込んだ直後の変更か（その場合は保存しない） */
  const externalUpdate = useRef(false);
  masterRef.current = master;

  const repos = useRef<Repositories | null>(null);
  if (!repos.current && typeof window !== 'undefined') {
    repos.current = createRepositories(() => masterRef.current.heroes.map((h) => h.id));
  }

  // 初回読み込み
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = repos.current;
      if (!r) return;
      const [savedMaster, savedSnap, savedUser, bundled] = await Promise.all([r.master.load(), r.master.loadSnapshot(), r.user.load(), fetchBundled()]);
      if (cancelled) return;
      setBundledAt(bundled?.crawledAt ?? null);
      const snap = newerSnapshot(savedSnap, bundled);
      let m: MasterData = seed;
      if (snap) {
        m = reparseSkills(mergeMasterData(seed, snap));
        setSnapshot(snap);
        setMasterOrigin(snap === savedSnap ? 'browser' : 'bundled');
      } else if (savedMaster) {
        // 旧バージョンで保存したマスター（スナップショット未保存）。日本語名は初期データの表記で上書き
        const seedNames = new Map(seed.heroes.map((h) => [h.id, h.nameJa]));
        m = reparseSkills({ ...savedMaster, heroes: savedMaster.heroes.map((h) => (seedNames.has(h.id) ? { ...h, nameJa: seedNames.get(h.id) } : h)) });
        setMasterOrigin('legacy');
      }
      setMaster(m);
      if (savedUser) {
        // マスターに英雄が追加されていれば初期値を補う
        const heroes = { ...savedUser.heroes };
        for (const h of m.heroes) heroes[h.id] ??= createDefaultOwnedHero(h.id);
        setUserState({ ...savedUser, heroes });
      }
      setReady(true);
    })();
    // 他のタブで保存された内容を取り込む。取り込んだ内容は保存し直さない（タブ間で上書きし合わないように）
    const unsub = repos.current?.user.subscribe?.((u) => {
      if (!u) return;
      externalUpdate.current = true;
      setUserState(u);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [seed]);

  // 自動保存
  const firstSave = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    if (externalUpdate.current) {
      externalUpdate.current = false;
      return;
    }
    setSaveState('saving');
    const t = setTimeout(() => {
      repos.current?.user
        .save(user)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 400);
    return () => clearTimeout(t);
  }, [user, ready]);

  const setUser = useCallback((updater: (u: UserData) => UserData) => setUserState((u) => updater(u)), []);
  const replaceUser = useCallback((u: UserData) => setUserState(u), []);
  const updateHero = useCallback(
    (heroId: string, patch: Partial<OwnedHero>) =>
      setUserState((u) => ({
        ...u,
        heroes: { ...u.heroes, [heroId]: { ...(u.heroes[heroId] ?? createDefaultOwnedHero(heroId)), ...patch } },
      })),
    [],
  );
  const resetUser = useCallback(async () => {
    await repos.current?.user.clear();
    setUserState(createDefaultUserData(masterRef.current.heroes.map((h) => h.id)));
  }, []);

  const applySnapshot = useCallback(
    async (snap: CrawlSnapshot) => {
      // 毎回シードから重ね直す（過去のクロール結果に引きずられないように）
      const merged = reparseSkills(mergeMasterData(seed, snap));
      setMaster(merged);
      setSnapshot(snap);
      setMasterOrigin('browser');
      await repos.current?.master.saveSnapshot(snap);
      await repos.current?.master.save(merged);
      setUserState((u) => {
        const heroes = { ...u.heroes };
        for (const h of merged.heroes) heroes[h.id] ??= createDefaultOwnedHero(h.id);
        return { ...u, heroes };
      });
      return merged;
    },
    [seed],
  );
  const resetMaster = useCallback(async () => {
    await repos.current?.master.clear();
    setMaster(seed);
    setSnapshot(null);
    setMasterOrigin('seed');
  }, [seed]);

  const importSnapshot = useCallback(
    async (text: string) => {
      const r = parseSnapshot(text);
      if (!r.ok) return r;
      const merged = await applySnapshot(r.snapshot);
      return { ok: true as const, heroes: merged.heroes.filter((h) => h.dataStatus !== 'estimated').length };
    },
    [applySnapshot],
  );

  const value: StoreValue = {
    ready,
    master,
    snapshot,
    masterOrigin,
    bundledAt,
    importSnapshot,
    user,
    saveState,
    setUser,
    replaceUser,
    updateHero,
    resetUser,
    applySnapshot,
    resetMaster,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** public/master-data.json（任意）。無ければ null */
async function fetchBundled(): Promise<CrawlSnapshot | null> {
  try {
    const res = await fetch(BUNDLED_SNAPSHOT_PATH, { cache: 'no-cache' });
    if (!res.ok) return null;
    const r = parseSnapshot(await res.text());
    return r.ok ? r.snapshot : null;
  } catch {
    return null;
  }
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('StoreProvider の外で useStore が呼ばれました');
  return v;
}
