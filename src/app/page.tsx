'use client';

import Link from 'next/link';
import { useStore } from '@/lib/client/store';
import { EVENT_RULES } from '@/lib/master/events';
import type { EventType } from '@/lib/types';

const STEPS = [
  { href: '/setup', title: '1. 所持状況を入力', body: '英雄のレベル・星・スキル・装備、兵士のティアと数、研究などを入力します。自動保存されます。' },
  { href: '/data', title: '2. 最新データを取得', body: '公式 Wiki などから英雄のステータスとスキル倍率を取得します。初期データの推定値が実値に置き換わります。' },
  { href: '/optimize', title: '3. 最適編成を計算', body: 'イベントを選ぶと、全組み合わせを採点して上位の編成と兵種比率を出します。' },
];

export default function Home() {
  const { master, user } = useStore();
  const owned = Object.values(user.heroes).filter((h) => h.owned).length;
  const verified = master.heroes.filter((h) => h.dataStatus === 'verified').length;
  return (
    <div className="space-y-10">
      <section className="pt-6">
        <p className="text-sm font-medium text-crown-deep">非公式ファンツール</p>
        <h1 className="display mt-1 text-3xl font-bold leading-tight sm:text-4xl">あなたの英雄で、いちばん強い編成を。</h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          集結・熊狩り・駐屯・アリーナ・征服の各モードについて、所持している英雄と兵力から最適な英雄の組み合わせと兵種比率を算出します。数値の出典と、仮定を置いた箇所はすべて画面上で確認できます。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={owned ? '/optimize' : '/setup'} className="btn-gold px-5 py-2 text-base">
            {owned ? '最適編成を計算する' : '所持状況の入力から始める'}
          </Link>
          <span className="self-center text-sm text-ink-mute">
            所持英雄 {owned} 人 ・ 英雄データ {master.heroes.length} 人（公式確認済 {verified}）
          </span>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {STEPS.map((s) => (
          <Link key={s.href} href={s.href} className="panel block p-4 transition hover:-translate-y-0.5 hover:shadow-md">
            <h2 className="font-bold">{s.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="display mb-3 text-lg font-bold">対応イベント</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(EVENT_RULES) as EventType[]).map((e) => {
            const r = EVENT_RULES[e];
            return (
              <div key={e} className="panel p-3">
                <div className="font-semibold">{r.label}</div>
                <div className="text-xs text-ink-mute">{r.subtitle}</div>
                <div className="mt-2 text-xs text-crown-deep">
                  {r.skillSet === 'expedition' ? '遠征スキル' : '討伐スキル'} ・ 英雄 {r.slots} 人
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
