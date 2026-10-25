'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MasterData, OwnedHero, UserData } from '../types';
import { mergeMasterData, seedMasterData, type CrawlSnapshot } from '../master';
import { createRepositories, type Repositories } from '../repository';
import { createDefaultOwnedHero, createDefaultUserData } from '../validation/userData';

/**
 * 画面全体で共有する状態。
 * - master: シード + 保存済みクロール結果
 * - user:   所持状況（変更から 400ms 後に自動保存）
 */
interface StoreValue {
  ready: boolean;
  master: MasterData;
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
  const [user, setUserState] = useState<UserData>(() => createDefaultUserData(seed.heroes.map((h) => h.id)));
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<StoreValue['saveState']>('idle');
  const masterRef = useRef(master);
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
      const [savedMaster, savedUser] = await Promise.all([r.master.load(), r.user.load()]);
      if (cancelled) return;
      const m = savedMaster ?? seed;
      setMaster(m);
      if (savedUser) {
        // マスターに英雄が追加されていれば初期値を補う
        const heroes = { ...savedUser.heroes };
        for (const h of m.heroes) heroes[h.id] ??= createDefaultOwnedHero(h.id);
        setUserState({ ...savedUser, heroes });
      }
      setReady(true);
    })();
    const unsub = repos.current?.user.subscribe?.((u) => u && setUserState(u));
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
      const merged = mergeMasterData(seed, snap);
      setMaster(merged);
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
  }, [seed]);

  const value: StoreValue = { ready, master, user, saveState, setUser, replaceUser, updateHero, resetUser, applySnapshot, resetMaster };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('StoreProvider の外で useStore が呼ばれました');
  return v;
}
