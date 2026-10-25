'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useStore } from '@/lib/client/store';
import { heroById } from '@/lib/master';
import { EVENT_RULES, presetFor } from '@/lib/master/events';
import { DEFAULT_REQUEST, listAssumptions, optimize } from '@/lib/calculator';
import type { EventType, FormationResult, HeroMaster, OptimizeRequest, OptimizeResult, TroopRatio } from '@/lib/types';
import { TROOP_TYPES } from '@/lib/types';
import { GenBadge, HeroPortrait, Notice, SectionTitle, SourceLink, StatusBadge, Toggle, TROOP_CLASS, TROOP_LABEL, TroopChip } from '@/components/ui';

const EVENTS: EventType[] = ['rally', 'bear', 'garrison', 'arena', 'conquest'];

export default function OptimizePage() {
  const { master, user, ready } = useStore();
  const heroes = useMemo(() => heroById(master), [master]);
  const [req, setReq] = useState<OptimizeRequest>({ ...DEFAULT_REQUEST, enemyRatio: EVENT_RULES.rally.defaultEnemy });
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [running, setRunning] = useState(false);
  const rule = EVENT_RULES[req.event];
  const ownedCount = Object.values(user.heroes).filter((h) => h.owned).length;
  const preset = presetFor(req.event, user.settings.serverGeneration, req.role);

  const selectEvent = (event: EventType) => {
    setReq((r) => ({ ...r, event, enemyRatio: EVENT_RULES[event].defaultEnemy, role: EVENT_RULES[event].skillSet === 'conquest' ? 'leader' : r.role, slotOverride: undefined }));
    setResult(null);
  };

  const run = () => {
    setRunning(true);
    // 描画を先に返してから計算する（アリーナの全探索は数秒かかることがある）
    setTimeout(() => {
      try {
        setResult(optimize(heroes, user, req));
      } finally {
        setRunning(false);
      }
    }, 20);
  };

  return (
    <div className="space-y-6">
      <SectionTitle sub="イベントを選ぶと、所持英雄の全組み合わせを採点して上位の編成と兵種比率を表示します。">最適編成の算出</SectionTitle>

      <div className="grid gap-2 sm:grid-cols-5" role="radiogroup" aria-label="イベント">
        {EVENTS.map((e) => {
          const r = EVENT_RULES[e];
          const active = req.event === e;
          return (
            <button
              key={e}
              role="radio"
              aria-checked={active}
              onClick={() => selectEvent(e)}
              className={`panel p-3 text-left transition ${active ? 'bg-ink text-parchment ring-2 ring-crown' : 'hover:bg-parchment-deep'}`}
            >
              <div className="font-semibold">{r.label}</div>
              <div className={`text-[11px] ${active ? 'text-parchment/70' : 'text-ink-mute'}`}>{r.subtitle}</div>
              <div className={`mt-1 text-[11px] ${active ? 'text-crown-soft' : 'text-crown-deep'}`}>
                {r.skillSet === 'expedition' ? 'Expedition' : 'Conquest'} ・ {r.slots}人
              </div>
            </button>
          );
        })}
      </div>

      <div className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {rule.skillSet === 'expedition' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-soft">立場</span>
              {(['leader', 'joiner'] as const).map((role) => (
                <button key={role} className={req.role === role ? 'btn-primary' : 'btn-ghost'} onClick={() => setReq((r) => ({ ...r, role }))}>
                  {role === 'leader' ? '集結を開く（リーダー）' : '集結に参加'}
                </button>
              ))}
            </div>
          )}
          {rule.skillSet === 'expedition' && req.role === 'leader' && (
            <Toggle label="歩兵・騎兵・弓兵を 1 人ずつ" checked={req.oneHeroPerTroop} onChange={(v) => setReq((r) => ({ ...r, oneHeroPerTroop: v }))} />
          )}
          {rule.skillSet === 'expedition' && <Toggle label="兵種比率も最適化" checked={req.optimizeRatio} onChange={(v) => setReq((r) => ({ ...r, optimizeRatio: v }))} />}
          {rule.skillSet === 'conquest' && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-soft">編成人数</span>
              <select
                className="input w-auto"
                value={req.slotOverride ?? rule.slots}
                onChange={(e) => setReq((r) => ({ ...r, slotOverride: Number(e.target.value) as 3 | 5 }))}
              >
                <option value={3}>3 人</option>
                <option value={5}>5 人</option>
              </select>
              {(req.slotOverride ?? rule.slots) !== rule.slots && <span className="text-[11px] text-crown-deep">出典上の既定は {rule.slots} 人です</span>}
            </label>
          )}
        </div>

        {req.event !== 'bear' && (
          <EnemyRatioInput value={req.enemyRatio} onChange={(enemyRatio) => setReq((r) => ({ ...r, enemyRatio }))} />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-gold px-5 py-2 text-base" onClick={run} disabled={!ready || running || ownedCount === 0}>
            {running ? '計算中…' : '最適編成を計算'}
          </button>
          <span className="text-sm text-ink-soft">
            所持英雄 {ownedCount} 人 ・ 比率の基準: {preset.label}（<SourceLink source={preset.source} />）
          </span>
        </div>
        {ownedCount === 0 && (
          <Notice tone="warn">
            所持英雄がまだ登録されていません。<Link href="/setup" className="underline">所持状況の入力</Link>で英雄にチェックを入れてください。
          </Notice>
        )}
      </div>

      <details className="panel p-4 text-sm">
        <summary className="cursor-pointer font-semibold">このイベントのルール（出典付き）</summary>
        <ul className="mt-2 space-y-1.5">
          {rule.notes.map((n, i) => (
            <li key={i}>
              {n.text}
              <span className="ml-1 text-xs">
                — <SourceLink source={n.source} />
              </span>
            </li>
          ))}
        </ul>
      </details>

      {result && <Results result={result} heroes={heroes} />}

      <AssumptionsPanel />
    </div>
  );
}

function EnemyRatioInput({ value, onChange }: { value: TroopRatio; onChange: (r: TroopRatio) => void }) {
  const sum = TROOP_TYPES.reduce((s, t) => s + value[t], 0);
  return (
    <div>
      <p className="field-label">相手の兵種構成（兵種相性の補正に使用。歩兵 &gt; 騎兵 &gt; 弓兵 &gt; 歩兵）</p>
      <div className="flex flex-wrap items-end gap-2">
        {TROOP_TYPES.map((t) => (
          <label key={t} className="w-24">
            <span className="field-label">{TROOP_LABEL[t]} %</span>
            <input
              type="number"
              min={0}
              max={100}
              className={`input ${sum !== 100 ? 'input-error' : ''}`}
              value={value[t]}
              onChange={(e) => onChange({ ...value, [t]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            />
          </label>
        ))}
        <span className={`pb-2 text-xs ${sum === 100 ? 'text-ink-mute' : 'text-cav'}`}>合計 {sum}%{sum !== 100 && '（100% にしてください。計算では比率に正規化します）'}</span>
      </div>
    </div>
  );
}

function Results({ result, heroes }: { result: OptimizeResult; heroes: Map<string, HeroMaster> }) {
  const rule = EVENT_RULES[result.request.event];
  const methodLabel = { exhaustive: '全探索', filtered: '位置別フィルタリング後に全探索', genetic: '遺伝的アルゴリズム' }[result.method];
  const top = result.results[0]?.score.total ?? 1;
  return (
    <section className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-lg font-bold">結果</h2>
        <span className="text-xs text-ink-mute">
          {methodLabel} ・ {result.searched.toLocaleString()} 通りを評価 ・ {result.elapsedMs} ms
        </span>
      </div>
      {result.warnings.map((w, i) => (
        <Notice key={i} tone="warn">
          {w}
        </Notice>
      ))}
      {result.results.length === 0 && <p className="text-sm text-ink-mute">候補がありません。</p>}
      <ol className="space-y-3">
        {result.results.map((r, i) => (
          <ResultCard key={r.heroIds.join('-') + i} rank={i + 1} r={r} heroes={heroes} relative={r.score.total / top} positions={rule.positions} joiner={result.request.role === 'joiner' && rule.skillSet === 'expedition'} />
        ))}
      </ol>
    </section>
  );
}

function ResultCard({
  rank,
  r,
  heroes,
  relative,
  positions,
  joiner,
}: {
  rank: number;
  r: FormationResult;
  heroes: Map<string, HeroMaster>;
  relative: number;
  positions?: Array<{ label: string }>;
  joiner: boolean;
}) {
  const [open, setOpen] = useState(rank === 1);
  const f = r.score.factors;
  const fmt = (n: number) => (n >= 1e6 ? n.toExponential(3) : Math.round(n).toLocaleString());
  return (
    <li className={`panel overflow-hidden ${rank === 1 ? 'ring-2 ring-crown/60' : ''}`}>
      <div className="flex flex-wrap items-center gap-4 p-4">
        <div className={`display flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${rank === 1 ? 'bg-crown text-white' : 'bg-parchment-deep text-ink'}`}>{rank}</div>
        <div className="flex flex-1 flex-wrap gap-3">
          {r.heroIds.map((id, i) => {
            const h = heroes.get(id);
            if (!h) return null;
            return (
              <div key={id} className="flex items-center gap-2">
                <HeroPortrait name={h.name} troop={h.troop} size={44} />
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-mute">
                    {joiner ? '先頭（スキルが反映）' : positions?.[i]?.label ?? (i === 0 ? '左（隊長枠）' : `枠${i + 1}`)}
                  </div>
                  <div className="font-semibold leading-tight">{h.name}</div>
                  <div className="mt-0.5 flex gap-1">
                    <GenBadge generation={h.generation} rarity={h.rarity} />
                    <TroopChip troop={h.troop} />
                  </div>
                </div>
              </div>
            );
          })}
          {joiner && <span className="self-center text-xs text-ink-mute">2・3 人目は結果に影響しません</span>}
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-mute">{joiner ? '集結に加わる効果' : 'スコア（相対）'}</div>
          <div className="display text-xl font-bold">{joiner ? `${r.score.total.toFixed(1)}%` : `${(relative * 100).toFixed(1)}`}</div>
          {r.usesEstimatedData && <span className="chip bg-stone-200 text-stone-700">推定値を含む</span>}
        </div>
      </div>

      <RatioBar ratio={r.ratio} />

      <div className="border-t border-parchment-line px-4 py-2">
        <button className="text-sm text-crown-deep hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? '計算の内訳を閉じる' : '計算の内訳を見る'}
        </button>
        {open && (
          <div className="mt-2 grid gap-4 pb-2 text-sm md:grid-cols-2">
            <table className="w-full text-left">
              <tbody className="[&_td]:py-0.5">
                <tr>
                  <td className="text-ink-soft">基礎戦闘力</td>
                  <td className="text-right font-mono">{fmt(r.score.base)}</td>
                </tr>
                <tr>
                  <td className="text-ink-soft">× (1 + スキルバフ合計)</td>
                  <td className="text-right font-mono">{f.skillBuff.toFixed(3)}</td>
                </tr>
                <tr>
                  <td className="text-ink-soft">× 兵種相性補正</td>
                  <td className="text-right font-mono">{f.counter.toFixed(3)}</td>
                </tr>
                <tr>
                  <td className="text-ink-soft">× ウィジェットバフ</td>
                  <td className="text-right font-mono">{f.widget.toFixed(3)}</td>
                </tr>
                <tr className="border-t border-parchment-line">
                  <td className="text-ink-soft">= イベント補正後戦闘力</td>
                  <td className="text-right font-mono">{fmt(r.score.eventAdjusted)}</td>
                </tr>
                <tr>
                  <td className="text-ink-soft">× Lethality</td>
                  <td className="text-right font-mono">{f.lethality.toFixed(3)}</td>
                </tr>
                <tr>
                  <td className="text-ink-soft">× Squad Attack</td>
                  <td className="text-right font-mono">{f.squadAttack.toFixed(3)}</td>
                </tr>
                <tr>
                  <td className="text-ink-soft">× クリティカル期待値</td>
                  <td className="text-right font-mono">{f.crit.toFixed(3)}</td>
                </tr>
                {f.survival !== undefined && (
                  <tr>
                    <td className="text-ink-soft">生存係数（防衛・反撃の考慮）</td>
                    <td className="text-right font-mono">{f.survival.toFixed(3)}</td>
                  </tr>
                )}
                <tr className="border-t border-parchment-line font-semibold">
                  <td>総合スコア</td>
                  <td className="text-right font-mono">{joiner ? `${r.score.total.toFixed(1)}%` : fmt(r.score.total)}</td>
                </tr>
              </tbody>
            </table>
            <div className="space-y-2">
              {r.score.perTroop && !joiner && (
                <div>
                  <p className="field-label">兵種別の与ダメージ寄与</p>
                  {TROOP_TYPES.map((t) => {
                    const total = TROOP_TYPES.reduce((s, x) => s + (r.score.perTroop?.[x] ?? 0), 0) || 1;
                    const share = ((r.score.perTroop?.[t] ?? 0) / total) * 100;
                    return (
                      <div key={t} className="flex items-center gap-2 text-xs">
                        <span className="w-8">{TROOP_LABEL[t]}</span>
                        <div className="h-2 flex-1 rounded bg-parchment-deep">
                          <div className={`h-2 rounded ${TROOP_CLASS[t].fill}`} style={{ width: `${share}%` }} />
                        </div>
                        <span className="w-10 text-right font-mono">{share.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {r.score.notes.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-soft">
                  {[...new Set(r.score.notes)].map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-1">
                {r.heroIds.map((id) => {
                  const h = heroes.get(id);
                  return h ? (
                    <span key={id} className="inline-flex items-center gap-1 text-xs">
                      {h.name}
                      <StatusBadge status={h.dataStatus} />
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function RatioBar({ ratio }: { ratio: TroopRatio }) {
  return (
    <div className="px-4 pb-3">
      <div className="flex h-6 overflow-hidden rounded-md text-[11px] font-semibold text-white" role="img" aria-label={`歩兵 ${ratio.infantry}% 騎兵 ${ratio.cavalry}% 弓兵 ${ratio.archer}%`}>
        {TROOP_TYPES.map((t) =>
          ratio[t] > 0 ? (
            <div key={t} className={`${TROOP_CLASS[t].fill} flex items-center justify-center`} style={{ width: `${ratio[t]}%` }}>
              {ratio[t] >= 8 ? `${TROOP_LABEL[t]} ${ratio[t]}%` : ''}
            </div>
          ) : null,
        )}
      </div>
      <p className="mt-1 text-xs text-ink-mute">
        兵種比率 {ratio.infantry} / {ratio.cavalry} / {ratio.archer}（歩兵 / 騎兵 / 弓兵）
      </p>
    </div>
  );
}

function AssumptionsPanel() {
  const items = listAssumptions();
  return (
    <details className="panel p-4 text-sm">
      <summary className="cursor-pointer font-semibold">計算の前提（係数と出典）</summary>
      <p className="mt-2 text-ink-soft">
        ゲーム内部の計算式は公開されていません。仕様書の式をベースに、出典のある値は出典を、無い値は「仮定」と明記しています。スコアは編成どうしを比べるための指数で、ゲーム内のダメージ値とは一致しません。
      </p>
      <table className="mt-3 w-full text-left text-xs">
        <thead className="text-ink-mute">
          <tr>
            <th className="py-1">項目</th>
            <th>値</th>
            <th>根拠</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.key} className="border-t border-parchment-line align-top">
              <td className="py-1 pr-2">{c.label}</td>
              <td className="pr-2 font-mono">{typeof c.value === 'object' ? 'T6: 歩243/騎730/弓974 攻撃 他' : String(c.value)}</td>
              <td>
                {c.source && <SourceLink source={c.source} />}
                {c.assumption && <span className="chip ml-1 bg-stone-200 text-stone-700">仮定</span>}
                {c.note && <div className="text-ink-mute">{c.note}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
