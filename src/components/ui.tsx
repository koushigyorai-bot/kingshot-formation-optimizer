'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import type { DataStatus, Reliability, SourceRef, TroopType } from '@/lib/types';
import { SITE_PROFILES } from '@/lib/master/sources';
import { checkValue, LIMITS, type LimitKey } from '@/lib/validation/limits';

export const TROOP_LABEL: Record<TroopType, string> = { infantry: '歩兵', cavalry: '騎兵', archer: '弓兵' };
export const TROOP_CLASS: Record<TroopType, { chip: string; ring: string; fill: string; text: string }> = {
  infantry: { chip: 'bg-inf-soft text-inf', ring: 'ring-inf/40', fill: 'bg-inf', text: 'text-inf' },
  cavalry: { chip: 'bg-cav-soft text-cav', ring: 'ring-cav/40', fill: 'bg-cav', text: 'text-cav' },
  archer: { chip: 'bg-arc-soft text-arc', ring: 'ring-arc/40', fill: 'bg-arc', text: 'text-arc' },
};

export function TroopChip({ troop }: { troop: TroopType }) {
  return <span className={`chip ${TROOP_CLASS[troop].chip}`}>{TROOP_LABEL[troop]}</span>;
}

export function GenBadge({ generation, rarity }: { generation: number | null; rarity: string }) {
  const label = generation ? `Gen${generation}` : rarity === 'epic' ? 'Epic' : 'Rare';
  const cls = generation ? 'bg-crown text-white' : rarity === 'epic' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700';
  return <span className={`chip ${cls}`}>{label}</span>;
}

const STATUS: Record<DataStatus, { label: string; cls: string; title: string }> = {
  verified: { label: '公式確認済', cls: 'bg-arc-soft text-arc', title: 'ステータスとスキルを公式 Wiki で確認済み' },
  partial: { label: '一部確認', cls: 'bg-crown-soft text-crown-deep', title: '一部の項目のみ確認済み（コミュニティ出典を含む）' },
  estimated: { label: '推定値', cls: 'bg-stone-200 text-stone-700', title: '一次情報が無い項目を推定値で補っています' },
};
export function StatusBadge({ status }: { status: DataStatus }) {
  const s = STATUS[status];
  return (
    <span className={`chip ${s.cls}`} title={s.title}>
      {s.label}
    </span>
  );
}

const REL: Record<Reliability, string> = { official: '公式', community: 'コミュニティ', estimate: '推定' };
export function SourceLink({ source }: { source: SourceRef }) {
  const profile = SITE_PROFILES[source.site];
  const flagged = profile?.flagged || source.flag === 'discriminatory';
  const text = `${profile?.label ?? source.site}（${REL[source.reliability]}）`;
  return (
    <span className="inline-flex items-center gap-1">
      {flagged && (
        <span className="chip bg-cav text-white" title="排外主義的・差別的な思想を流布しているサイトとしてマークされています">
          ⚠ 要注意サイト
        </span>
      )}
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-crown-deep">
          {text}
        </a>
      ) : (
        <span>{text}</span>
      )}
      {source.note && <span className="text-ink-mute">— {source.note}</span>}
    </span>
  );
}

/** 範囲チェック付きの数値入力。入力途中の空文字も許し、確定値だけを onChange に渡す */
export function NumberField({
  label,
  value,
  onChange,
  limit,
  step,
  suffix,
  disabled,
  compact,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  limit: LimitKey;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const n = text.trim() === '' ? NaN : Number(text);
  const error = text.trim() === '' ? '値を入力してください' : checkValue(limit, n);
  const { min, max } = LIMITS[limit];
  return (
    <div className={compact ? '' : 'min-w-0'}>
      <label htmlFor={id} className="field-label">
        {label}
        {suffix && <span className="ml-1 text-ink-mute">({suffix})</span>}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className={`input ${error ? 'input-error' : ''}`}
        value={text}
        min={min}
        max={max}
        step={step ?? 1}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value.trim() !== '' && !checkValue(limit, v)) onChange(v);
        }}
      />
      {error && (
        <p id={`${id}-err`} className="mt-0.5 text-[11px] text-cav">
          {error}
        </p>
      )}
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`inline-flex cursor-pointer select-none items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-crown' : 'bg-stone-300'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label}
    </label>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="display text-xl font-bold text-ink">{children}</h2>
      {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const cls =
    tone === 'error' ? 'border-cav/40 bg-cav-soft text-cav' : tone === 'warn' ? 'border-crown/40 bg-crown-soft text-crown-deep' : 'border-inf/30 bg-inf-soft text-inf';
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

/** 画像プレースホルダー（英雄の頭文字 + 兵種色）。著作物の画像は使わない */
export function HeroPortrait({ name, troop, size = 56 }: { name: string; troop: TroopType; size?: number }) {
  const initials = name
    .split(/[\s&]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-lg ring-2 ${TROOP_CLASS[troop].ring} bg-gradient-to-br from-parchment-deep to-white`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className={`display text-lg font-bold ${TROOP_CLASS[troop].text}`}>{initials}</span>
      <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-tl-md rounded-br-lg ${TROOP_CLASS[troop].fill}`} />
    </div>
  );
}
