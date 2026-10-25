'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useStore } from '@/lib/client/store';

const NAV = [
  { href: '/', label: 'ホーム' },
  { href: '/setup', label: '所持状況の入力' },
  { href: '/optimize', label: '最適編成' },
  { href: '/data', label: 'データ更新' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { saveState, ready } = useStore();
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-16">
      <header className="sticky top-0 z-30 -mx-4 mb-6 border-b border-parchment-line bg-parchment/90 px-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <Link href="/" className="flex items-center gap-2">
            <CrownMark />
            <span className="display text-lg font-bold text-ink">Kingshot Formation Optimizer</span>
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {NAV.map((n) => {
              const active = n.href === '/' ? pathname === '/' : pathname?.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${active ? 'bg-ink text-parchment' : 'text-ink-soft hover:bg-parchment-deep'}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <span className="text-xs text-ink-mute" aria-live="polite">
            {!ready ? '読み込み中…' : saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '自動保存済み' : saveState === 'error' ? '保存に失敗しました' : ''}
          </span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 border-t border-parchment-line pt-4 text-xs leading-relaxed text-ink-mute">
        非公式のファンツールです。Century Games および Kingshot とは関係ありません。ゲーム内部の計算式は非公開のため、スコアは相対比較用の指数です。
      </footer>
    </div>
  );
}

function CrownMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 24 L6 10 L12 16 L16 6 L20 16 L26 10 L28 24 Z" fill="#a16207" stroke="#1c1917" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="4" y="24" width="24" height="3" rx="1" fill="#1c1917" />
    </svg>
  );
}
