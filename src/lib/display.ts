import type { HeroMaster, Skill, WidgetMaster } from './types';

/** 画面表示用の名前（日本語名があれば日本語名） */
export function heroName(h: Pick<HeroMaster, 'name' | 'nameJa'> | undefined | null, fallback = ''): string {
  if (!h) return fallback;
  return h.nameJa && h.nameJa.trim() ? h.nameJa : h.name;
}

export function skillName(s: Pick<Skill, 'name' | 'nameJa'> | undefined | null, fallback = ''): string {
  if (!s) return fallback;
  return s.nameJa && s.nameJa.trim() ? s.nameJa : s.name;
}

export function widgetName(w: WidgetMaster | undefined): string | undefined {
  if (!w) return undefined;
  return w.nameJa && w.nameJa.trim() ? w.nameJa : w.name;
}
