'use client';

import { useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/client/store';
import { exportFileName, exportUserDataJson, importUserDataJson } from '@/lib/repository';
import type { StatBlock, TroopType, UserData } from '@/lib/types';
import { TROOP_TYPES } from '@/lib/types';
import { HeroCard } from '@/components/HeroCard';
import { NumberField, Notice, SectionTitle, Toggle, TROOP_LABEL } from '@/components/ui';
import type { FieldError } from '@/lib/validation/userData';

type Tab = 'heroes' | 'lordGear' | 'troops' | 'buffs' | 'data';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'heroes', label: '英雄' },
  { id: 'lordGear', label: '領主装備' },
  { id: 'troops', label: '兵士' },
  { id: 'buffs', label: '領主バフ・設定' },
  { id: 'data', label: '保存・入出力' },
];

export default function SetupPage() {
  const [tab, setTab] = useState<Tab>('heroes');
  return (
    <div>
      <SectionTitle sub="入力内容はこのブラウザに自動保存されます（localStorage: kingshot_user_data_v1）。">所持状況の入力</SectionTitle>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-parchment-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px rounded-t-md border px-4 py-2 text-sm transition ${
              tab === t.id ? 'border-parchment-line border-b-white bg-white font-semibold text-ink' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'heroes' && <HeroesTab />}
      {tab === 'lordGear' && <LordGearTab />}
      {tab === 'troops' && <TroopsTab />}
      {tab === 'buffs' && <BuffsTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HeroesTab() {
  const { master, user, updateHero } = useStore();
  const [gen, setGen] = useState<'all' | 'epic' | 'rare' | number>('all');
  const [troop, setTroop] = useState<'all' | TroopType>('all');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [q, setQ] = useState('');

  const generations = useMemo(() => [...new Set(master.heroes.map((h) => h.generation).filter((g): g is number => g !== null))].sort((a, b) => a - b), [master]);
  const list = master.heroes.filter((h) => {
    if (gen === 'epic' && h.rarity !== 'epic') return false;
    if (gen === 'rare' && h.rarity !== 'rare') return false;
    if (typeof gen === 'number' && h.generation !== gen) return false;
    if (troop !== 'all' && h.troop !== troop) return false;
    if (ownedOnly && !user.heroes[h.id]?.owned) return false;
    if (q && !`${h.name} ${h.nameJa ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const ownedCount = master.heroes.filter((h) => user.heroes[h.id]?.owned).length;
  const serverGen = user.settings.serverGeneration;

  return (
    <div>
      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="field-label">世代</label>
          <select className="input" value={String(gen)} onChange={(e) => setGen(e.target.value === 'all' || e.target.value === 'epic' || e.target.value === 'rare' ? (e.target.value as 'all') : Number(e.target.value))}>
            <option value="all">すべて</option>
            <option value="rare">Rare</option>
            <option value="epic">Epic</option>
            {generations.map((g) => (
              <option key={g} value={g}>
                Gen{g}
                {g > serverGen ? '（未開放）' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">兵種</label>
          <select className="input" value={troop} onChange={(e) => setTroop(e.target.value as 'all')}>
            <option value="all">すべて</option>
            {TROOP_TYPES.map((t) => (
              <option key={t} value={t}>
                {TROOP_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[10rem] flex-1">
          <label className="field-label">検索</label>
          <input className="input" placeholder="英雄名" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Toggle label="所持のみ" checked={ownedOnly} onChange={setOwnedOnly} />
        <span className="ml-auto text-sm text-ink-soft">
          所持 <b className="text-ink">{ownedCount}</b> / {master.heroes.length}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((h) => {
          const o = user.heroes[h.id];
          if (!o) return null;
          return <HeroCard key={h.id} hero={h} owned={o} onChange={(p) => updateHero(h.id, p)} />;
        })}
      </div>
      {list.length === 0 && <p className="py-10 text-center text-sm text-ink-mute">条件に合う英雄がいません</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatInputs({ value, onChange, prefix }: { value: StatBlock; onChange: (v: StatBlock) => void; prefix?: string }) {
  const keys: Array<[keyof StatBlock, string]> = [
    ['attack', '攻撃'],
    ['defense', '防御'],
    ['lethality', '殺傷力'],
    ['health', 'HP'],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {keys.map(([k, label]) => (
        <NumberField key={k} label={`${prefix ?? ''}${label}`} suffix="%" step={0.1} limit="percent" value={value[k]} onChange={(v) => onChange({ ...value, [k]: v })} />
      ))}
    </div>
  );
}

function LordGearTab() {
  const { user, setUser } = useStore();
  const lg = user.lordGear;
  const setSlot = (i: number, patch: Partial<UserData['lordGear']['slots'][number]>) =>
    setUser((u) => ({ ...u, lordGear: { ...u.lordGear, slots: u.lordGear.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) } }));
  return (
    <div className="space-y-4">
      <Notice tone="warn">
        領主装備の段階ごとの効果量は公開情報で確認できなかったため、レベル・研磨値は仮の係数で換算しています。ゲーム内の「戦闘レポート」に出る最終ステータスを「領主バフ・設定」タブで入力すると、こちらより正確に計算できます。
      </Notice>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lg.slots.map((s, i) => (
          <div key={i} className="panel space-y-2 p-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">部位 {i + 1}</h3>
              <select className="input w-auto" value={s.troop} onChange={(e) => setSlot(i, { troop: e.target.value as TroopType })} aria-label={`部位${i + 1}の兵種`}>
                {TROOP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TROOP_LABEL[t]}強化
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="レベル" limit="lordGearLevel" value={s.level} onChange={(v) => setSlot(i, { level: v })} />
              <NumberField label="研磨値" limit="lordGearPolish" value={s.polish} onChange={(v) => setSlot(i, { polish: v })} />
            </div>
          </div>
        ))}
      </div>
      <div className="panel p-3">
        <h3 className="mb-2 font-semibold">セット効果（ゲーム内表示の % をそのまま入力）</h3>
        <StatInputs value={lg.setBonus} onChange={(v) => setUser((u) => ({ ...u, lordGear: { ...u.lordGear, setBonus: v } }))} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TroopsTab() {
  const { user, setUser } = useStore();
  const total = TROOP_TYPES.reduce((s, t) => s + user.troops[t].count, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {TROOP_TYPES.map((t) => (
          <div key={t} className="panel space-y-2 p-3">
            <h3 className="font-semibold">{TROOP_LABEL[t]}</h3>
            <NumberField
              label="ティア"
              suffix="T1〜T10"
              limit="troopTier"
              value={user.troops[t].tier}
              onChange={(v) => setUser((u) => ({ ...u, troops: { ...u.troops, [t]: { ...u.troops[t], tier: v } } }))}
            />
            <NumberField
              label="保有数"
              limit="troopCount"
              value={user.troops[t].count}
              onChange={(v) => setUser((u) => ({ ...u, troops: { ...u.troops, [t]: { ...u.troops[t], count: v } } }))}
            />
          </div>
        ))}
      </div>
      <div className="panel grid gap-3 p-3 sm:grid-cols-3">
        <NumberField label="兵舎レベル" limit="barracksLevel" value={user.troops.barracksLevel} onChange={(v) => setUser((u) => ({ ...u, troops: { ...u.troops, barracksLevel: v } }))} />
        <NumberField
          label="行軍・集結の容量（兵数）"
          limit="marchCapacity"
          value={user.settings.marchCapacity}
          onChange={(v) => setUser((u) => ({ ...u, settings: { ...u.settings, marchCapacity: v } }))}
        />
        <div className="self-end text-sm text-ink-soft">
          総兵数 <b className="text-ink">{total.toLocaleString()}</b>
          {total > 0 && total < user.settings.marchCapacity && <p className="text-[11px] text-crown-deep">容量より兵が少ないため、計算は保有数で頭打ちになります</p>}
        </div>
      </div>
      <Notice>
        T6 以外のティアの基礎ステータスは確認できなかったため、T6 の実値（プレイヤー解析）から 1 段あたり 1.1 倍で推定しています。保有数を 0 のままにすると、在庫制限なしで比率だけを計算します。
      </Notice>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BuffsTab() {
  const { user, setUser } = useStore();
  const b = user.buffs;
  const setBuffs = (patch: Partial<UserData['buffs']>) => setUser((u) => ({ ...u, buffs: { ...u.buffs, ...patch } }));
  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">戦闘レポートの最終ステータスで上書き（推奨）</h3>
          <Toggle label={b.reportOverride.enabled ? '上書き中' : '使わない'} checked={b.reportOverride.enabled} onChange={(v) => setBuffs({ reportOverride: { ...b.reportOverride, enabled: v } })} />
        </div>
        <p className="text-sm text-ink-soft">
          戦闘レポートの「ステータスボーナス」には、研究・領主装備・VIP・知事スキルなどの合計が兵種別に表示されます。これを入力すると、下の個別入力と領主装備の換算は使わずにこの値で計算します。
        </p>
        {b.reportOverride.enabled &&
          TROOP_TYPES.map((t) => (
            <div key={t}>
              <p className="mb-1 text-sm font-medium">{TROOP_LABEL[t]}</p>
              <StatInputs value={b.reportOverride.stats[t]} onChange={(v) => setBuffs({ reportOverride: { ...b.reportOverride, stats: { ...b.reportOverride.stats, [t]: v } } })} />
            </div>
          ))}
      </div>

      <fieldset className={`panel space-y-3 p-3 ${b.reportOverride.enabled ? 'opacity-50' : ''}`} disabled={b.reportOverride.enabled}>
        <h3 className="font-semibold">研究（兵種別）</h3>
        {TROOP_TYPES.map((t) => (
          <div key={t}>
            <p className="mb-1 text-sm font-medium">{TROOP_LABEL[t]}</p>
            <StatInputs value={b.research[t]} onChange={(v) => setBuffs({ research: { ...b.research, [t]: v } })} />
          </div>
        ))}
        <h3 className="pt-2 font-semibold">知事スキル（全兵種）</h3>
        <StatInputs value={b.governorSkills} onChange={(v) => setBuffs({ governorSkills: v })} />
        <div className="max-w-xs pt-2">
          <NumberField label="VIP レベル" limit="vipLevel" value={b.vipLevel} onChange={(v) => setBuffs({ vipLevel: v })} />
          <p className="mt-1 text-[11px] text-ink-mute">VIP の戦闘効果量は確認できなかったため、計算には使っていません。</p>
        </div>
      </fieldset>

      <div className="panel p-3">
        <h3 className="mb-2 font-semibold">サーバー</h3>
        <div className="max-w-xs">
          <NumberField
            label="サーバーの英雄世代"
            suffix="Gen1〜8"
            limit="serverGeneration"
            value={user.settings.serverGeneration}
            onChange={(v) => setUser((u) => ({ ...u, settings: { ...u.settings, serverGeneration: v } }))}
          />
          <p className="mt-1 text-[11px] text-ink-mute">熊狩りの兵種比率プリセット（世代別）に使います。</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DataTab() {
  const { user, master, replaceUser, resetUser } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ ok: boolean; messages: FieldError[]; summary: string } | null>(null);

  const doExport = () => {
    const blob = new Blob([exportUserDataJson(user)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName();
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    const text = await file.text();
    const r = importUserDataJson(text, master.heroes.map((h) => h.id));
    if (!r.ok) {
      setResult({ ok: false, messages: r.errors, summary: '読み込めませんでした。現在のデータは変更していません。' });
      return;
    }
    replaceUser(r.data);
    const owned = Object.values(r.data.heroes).filter((h) => h.owned).length;
    setResult({ ok: true, messages: r.warnings, summary: `読み込みました（所持英雄 ${owned} 人）。${r.warnings.length ? `${r.warnings.length} 件の値を範囲内に補正しました。` : ''}` });
  };

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-4">
        <h3 className="font-semibold">エクスポート / インポート</h3>
        <p className="text-sm text-ink-soft">JSON ファイルとして書き出し・読み込みできます。別のブラウザや端末への移行、バックアップに使えます。</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={doExport}>
            JSON を書き出す
          </button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
            JSON を読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
        </div>
        {result && (
          <Notice tone={result.ok ? (result.messages.length ? 'warn' : 'info') : 'error'}>
            <p>{result.summary}</p>
            {result.messages.length > 0 && (
              <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-xs">
                {result.messages.slice(0, 50).map((m, i) => (
                  <li key={i}>
                    <code>{m.path}</code>: {m.message}
                  </li>
                ))}
              </ul>
            )}
          </Notice>
        )}
      </div>
      <div className="panel space-y-2 p-4">
        <h3 className="font-semibold">データの削除</h3>
        <p className="text-sm text-ink-soft">このブラウザに保存した所持状況をすべて削除して初期状態に戻します。先に書き出しておくことをおすすめします。</p>
        <button
          className="btn-danger"
          onClick={() => {
            if (window.confirm('保存した所持状況をすべて削除します。よろしいですか？')) void resetUser();
          }}
        >
          すべて削除
        </button>
      </div>
      <p className="text-xs text-ink-mute">最終更新: {new Date(user.updatedAt).toLocaleString('ja-JP')}</p>
    </div>
  );
}
