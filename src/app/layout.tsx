import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { StoreProvider } from '@/lib/client/store';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Kingshot Formation Optimizer',
  description: '所持英雄と兵力から、イベントごとの最強編成と兵種比率を算出するツール（非公式）',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
