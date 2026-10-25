'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/client/store';
import type { CrawlSnapshot, SiteReport } from '@/lib/master';
import { SITE_PROFILES } from '@/lib/master/sources';
import type { SourceSite } from '@/lib/types';
import { GenBadge, Notice, SectionTitle, SourceLink, StatusBadge, TroopChip } from '@/components/ui';

const TARGETS: SourceSite[] = ['kingshotwiki.com', 'kingshot.wiki', 'kingshottools.pro', 'grindnstrat.com'];

export default function DataPage() {
  const { master, applySnapshot, resetMaster } = useStore();
  const [progress, setProgress] = useState<{ site: SourceSite; state: 'waiting' | 'running' | 'done' | 'error'; message?: string }[]>([]);
  const [reports, setReports] = useState<SiteReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [serverSnapshotAt, setServerSnapshotAt] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/crawl')
      .then((r) => r.json())
      .then((j: { snapshot: CrawlSnapshot | null }) => {
        if (j.snapshot) {
          setServerSnapshotAt(j.snapshot.crawledAt);
          setReports(j.snapshot.siteReports);
        }
      })
      .catch(() => undefined);
  }, []);

  const crawl = async () => {
    setBusy(true);
    setProgress(TARGETS.map((site) => ({ site, state: 'waiting' })));
    const collected: CrawlSnapshot[] = [];
    // サーバーレスの実行時間制限に収まるよう 1 サイトずつ
    for (const site of TARGETS) {
      setProgress((p) => p.map((x) => (x.site === site ? { ...x, state: 'running' } : x)));
      try {
        const res = await fetch('/api/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sites: [site] }) });
        const json = (await res.json()) as { snapshot?: CrawlSnapshot; error?: string; note?: string };
        if (!res.ok || !json.snapshot) throw new Error(json.error ?? `HTTP ${res.status}`);
        collected.push(json.snapshot);
        const rep = json.snapshot.siteReports.find((r) => r.site === site);
        setProgress((p) =>
          p.map((x) => (x.site === site ? { ...x, state: rep?.ok === false ? 'error' : 'done', message: json.note ?? (rep ? `${rep.pagesFetched} ページ取得・英雄 ${rep.heroesParsed} 人を解析` : '') } : x)),
        );
      } catch (e) {
        setProgress((p) => p.map((x) => (x.site === site ? { ...x, state: 'error', message: (e as Error).message } : x)));
      }
    }
    if (collected.length) {
      const merged: CrawlSnapshot = {
        crawledAt: new Date().toISOString(),
        heroPatches: collected.flatMap((s) => s.heroPatches),
        tierLists: collected.flatMap((s) => s.tierLists),
        templates: collected.flatMap((s) => s.templates),
        siteReports: collected.flatMap((s) => s.siteReports),
      };
      await applySnapshot(merged);
      setReports(merged.siteReports);
      setServerSnapshotAt(merged.crawledAt);
    }
    setBusy(false);
  };

  const counts = {
    verified: master.heroes.filter((h) => h.dataStatus === 'verified').length,
    partial: master.heroes.filter((h) => h.dataStatus === 'partial').length,
    estimated: master.heroes.filter((h) => h.dataStatus === 'estimated').length,
  };

  return (
    <div className="space-y-6">
      <SectionTitle sub="攻略サイトから英雄のステータス・スキル倍率・推奨編成を取得し、公式 Wiki を最優先にマージします。">最新情報の取得</SectionTitle>

      <div className="grid gap-3 md:grid-cols-2">
        {TARGETS.map((site) => {
          const p = SITE_PROFILES[site];
          const prog = progress.find((x) => x.site === site);
          return (
            <div key={site} className="panel p-3">
              <div className="flex items-center justify-between gap-2">
                <a href={p.baseUrl} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                  {p.label}
                </a>
                <span className={`chip ${p.reliability === 'official' ? 'bg-arc-soft text-arc' : 'bg-crown-soft text-crown-deep'}`}>
                  {p.reliability === 'official' ? '公式' : 'コミュニティ'} ・ 優先度 {p.priority}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">{p.description}</p>
              {p.flagged && <Notice tone="error">排外主義的・差別的な思想を流布しているサイトとしてマークされているため、取得しません。</Notice>}
              {prog && (
                <p className={`mt-2 text-xs ${prog.state === 'error' ? 'text-cav' : 'text-ink-soft'}`}>
                  {{ waiting: '待機中', running: '取得中…（robots.txt を確認し、1.5 秒以上の間隔で取得）', done: '完了', error: 'エラー' }[prog.state]}
                  {prog.message && ` — ${prog.message}`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <button className="btn-gold px-5 py-2" onClick={() => void crawl()} disabled={busy}>
          {busy ? '取得中…' : '最新情報に更新'}
        </button>
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm('クロール結果を破棄して、同梱の初期データに戻します。')) void resetMaster();
          }}
        >
          初期データに戻す
        </button>
        <span className="text-sm text-ink-soft">
          マスター更新: {new Date(master.updatedAt).toLocaleString('ja-JP')}
          {serverSnapshotAt && ` ・ サーバー側の最終取得: ${new Date(serverSnapshotAt).toLocaleString('ja-JP')}`}
        </span>
        <span className="ml-auto flex gap-2 text-xs">
          <span>公式確認済 {counts.verified}</span>
          <span>一部確認 {counts.partial}</span>
          <span>推定値 {counts.estimated}</span>
        </span>
      </div>

      {reports.length > 0 && (
        <section className="panel p-4">
          <h3 className="mb-2 font-semibold">取得レポート</h3>
          <div className="space-y-3 text-sm">
            {reports.map((r) => (
              <div key={r.site}>
                <p>
                  <b>{SITE_PROFILES[r.site]?.label ?? r.site}</b>：{r.ok ? `${r.pagesFetched} ページ・英雄 ${r.heroesParsed} 人・robots.txt で除外 ${r.pagesSkippedByRobots} 件・${(r.durationMs / 1000).toFixed(1)} 秒` : `失敗（${r.error}）`}
                </p>
                {r.warnings.length > 0 && (
                  <details className="text-xs text-ink-soft">
                    <summary className="cursor-pointer">注意 {r.warnings.length} 件</summary>
                    <ul className="mt-1 list-disc pl-5">
                      {r.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {master.conflicts.length > 0 && (
        <section className="panel p-4">
          <h3 className="mb-2 font-semibold">情報源どうしの食い違い（{master.conflicts.length} 件）</h3>
          <p className="mb-2 text-xs text-ink-soft">優先度の高い情報源の値を採用しています。</p>
          <ul className="space-y-1 text-xs">
            {master.conflicts.slice(0, 60).map((c, i) => (
              <li key={i}>
                <b>{c.heroId}</b> / {c.field}：
                {c.values.map((v) => `${SITE_PROFILES[v.site]?.label ?? v.site} = ${v.value.slice(0, 80)}`).join('　|　')}
                <span className="ml-1 text-arc">→ 採用: {SITE_PROFILES[c.adopted]?.label ?? c.adopted}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(master.templates.length > 0 || master.tierLists.length > 0) && (
        <section className="panel p-4">
          <h3 className="mb-2 font-semibold">取得した推奨編成・ティア</h3>
          <ul className="space-y-1 text-xs">
            {master.templates.map((t, i) => (
              <li key={i}>
                [{t.event}] {t.heroIds.length ? t.heroIds.join(' + ') : ''} {t.ratio ? `比率 ${t.ratio.infantry}/${t.ratio.cavalry}/${t.ratio.archer}` : ''}
                {t.generation ? ` (Gen${t.generation})` : ''} — <SourceLink source={t.source} />
              </li>
            ))}
            {master.tierLists.map((t, i) => (
              <li key={`t${i}`}>
                [ティア/{t.category}] {t.entries.map((e) => `${e.heroId}:${e.tier}`).join(', ')} — <SourceLink source={t.source} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel overflow-x-auto p-4">
        <h3 className="mb-2 font-semibold">英雄マスター</h3>
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-ink-mute">
            <tr>
              <th className="py-1">英雄</th>
              <th>世代/兵種</th>
              <th>Conquest 攻/防/HP</th>
              <th>Expedition 攻/防 %</th>
              <th>スキル</th>
              <th>状態</th>
              <th>出典</th>
            </tr>
          </thead>
          <tbody>
            {master.heroes.map((h) => (
              <tr key={h.id} className="border-t border-parchment-line align-top">
                <td className="py-1 font-semibold">{h.name}</td>
                <td>
                  <div className="flex gap-1">
                    <GenBadge generation={h.generation} rarity={h.rarity} />
                    <TroopChip troop={h.troop} />
                  </div>
                </td>
                <td className={`font-mono ${h.estimatedFields?.includes('conquest') ? 'text-ink-mute' : ''}`}>
                  {h.conquest.attack.toLocaleString()}/{h.conquest.defense.toLocaleString()}/{h.conquest.health.toLocaleString()}
                </td>
                <td className={`font-mono ${h.estimatedFields?.includes('expedition') ? 'text-ink-mute' : ''}`}>
                  {h.expedition.attack}/{h.expedition.defense}
                </td>
                <td title={h.skills.map((s) => `[${s.kind}] ${s.name}: ${s.effects.map((e) => `${e.stat} ${e.values.join('/')}`).join(', ')}`).join('\n')}>
                  {h.skills.length ? `${h.skills.length} 件` : '—'}
                </td>
                <td>
                  <StatusBadge status={h.dataStatus} />
                </td>
                <td className="space-y-0.5">
                  {h.sources.slice(0, 4).map((s, i) => (
                    <div key={i}>
                      <SourceLink source={s} />
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-mute">灰色の数値は推定値です。兵種・世代・レアリティは公式 Wiki の英雄一覧で確認済み。</p>
      </section>
    </div>
  );
}
