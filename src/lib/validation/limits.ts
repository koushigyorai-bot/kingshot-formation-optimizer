/** 入力値の範囲。フォームのバリデーションとインポート時の検証で共用する。 */
export const LIMITS = {
  heroLevel: { min: 1, max: 80 },
  heroStars: { min: 0, max: 5 },
  heroGearLevel: { min: 0, max: 100 },
  heroGearMastery: { min: 0, max: 20 },
  skillLevel: { min: 0, max: 5 },
  widgetLevel: { min: 0, max: 10 },
  percent: { min: -100, max: 2000 },
  troopLevel: { min: 1, max: 10 },
  troopTruegold: { min: 0, max: 8 },
  troopCount: { min: 0, max: 100_000_000 },
  vipLevel: { min: 0, max: 12 },
  serverGeneration: { min: 1, max: 8 },
  marchCapacity: { min: 1, max: 10_000_000 },
} as const;

export type LimitKey = keyof typeof LIMITS;

export const INTEGER_FIELDS: ReadonlySet<LimitKey> = new Set<LimitKey>([
  'heroLevel',
  'heroStars',
  'heroGearLevel',
  'heroGearMastery',
  'skillLevel',
  'widgetLevel',
  'troopLevel',
  'troopTruegold',
  'troopCount',
  'vipLevel',
  'serverGeneration',
  'marchCapacity',
]);

/** 1 つの値を検証し、エラーメッセージ（問題なければ null）を返す */
export function checkValue(key: LimitKey, value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '数値を入力してください';
  const { min, max } = LIMITS[key];
  if (INTEGER_FIELDS.has(key) && !Number.isInteger(value)) return '整数で入力してください';
  if (value < min || value > max) return `${min}〜${max} の範囲で入力してください`;
  return null;
}

export function clampValue(key: LimitKey, value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const { min, max } = LIMITS[key];
  const v = INTEGER_FIELDS.has(key) ? Math.round(n) : n;
  return Math.min(max, Math.max(min, v));
}
