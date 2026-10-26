'use client';

import { useState } from 'react';
import type { HeroMaster, OwnedHero } from '@/lib/types';
import { HERO_GEAR_SLOT_LABELS, HERO_GEAR_SLOTS } from '@/lib/types';
import { validateOwnedHero } from '@/lib/validation/userData';
import { GenBadge, HeroPortrait, NumberField, StatusBadge, Toggle, TroopChip } from './ui';

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="星（赤星）">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`星 ${n}`}
          onClick={() => onChange(value === n ? n - 1 : n)}
          className={`text-lg leading-none transition ${n <= value ? 'text-cav' : 'text-stone-300 hover:text-stone-400'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function HeroCard({ hero, owned, onChange }: { hero: HeroMaster; owned: OwnedHero; onChange: (patch: Partial<OwnedHero>) => void }) {
  const [open, setOpen] = useState(false);
  const errors = validateOwnedHero(owned);
  const hasErrors = Object.keys(errors).length > 0;
  const expSkills = hero.skills.filter((s) => s.kind === 'expedition');
  const conqSkills = hero.skills.filter((s) => s.kind === 'conquest');
  const expSlots = hero.rarity === 'legendary' ? 3 : 2;
  const conqSlots = hero.rarity === 'rare' ? 2 : 3;
  const canWidget = hero.rarity === 'legendary';

  return (
    <article
      className={`panel flex flex-col transition ${owned.owned ? 'ring-1 ring-crown/40' : 'opacity-80'} ${hasErrors ? 'ring-2 ring-cav/50' : ''}`}
      aria-label={hero.name}
    >
      <div className="flex items-start gap-3 p-3">
        <HeroPortrait name={hero.name} troop={hero.troop} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate font-bold text-ink">{hero.name}</h3>
            <span className="text-xs text-ink-mute">{hero.nameJa}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <GenBadge generation={hero.generation} rarity={hero.rarity} />
            <TroopChip troop={hero.troop} />
            <StatusBadge status={hero.dataStatus} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Toggle label="所持" checked={owned.owned} onChange={(v) => onChange({ owned: v })} />
            {owned.owned && <Stars value={owned.stars} onChange={(v) => onChange({ stars: v })} />}
          </div>
        </div>
      </div>

      {owned.owned && (
        <div className="border-t border-parchment-line px-3 py-2">
          <div className="flex items-center justify-between text-xs text-ink-soft">
            <span>
              Lv {owned.level} ・ Exp {owned.expeditionSkills.slice(0, expSlots).join('/')} ・ Conq {owned.conquestSkills.slice(0, conqSlots).join('/')}
              {owned.widget.owned ? ` ・ W${owned.widget.level}` : ''}
            </span>
            <button type="button" className="text-crown-deep underline-offset-2 hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? '閉じる' : '詳細を編集'}
            </button>
          </div>
          {hasErrors && !open && <p className="mt-1 text-[11px] text-cav">入力に誤りがあります。詳細を確認してください</p>}
        </div>
      )}

      {owned.owned && open && (
        <div className="space-y-4 border-t border-parchment-line bg-parchment/50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="レベル" limit="heroLevel" value={owned.level} onChange={(v) => onChange({ level: v })} />
            <div>
              <span className="field-label">覚醒</span>
              <Toggle label={owned.awakened ? '覚醒済み' : '未覚醒'} checked={owned.awakened} onChange={(v) => onChange({ awakened: v })} />
            </div>
          </div>

          <fieldset>
            <legend className="field-label">Expedition スキル（0 = 未解放）</legend>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <NumberField
                  key={i}
                  compact
                  label={expSkills[i]?.name ?? (i < expSlots ? `スキル${i + 1}` : '（枠なし）')}
                  limit="skillLevel"
                  disabled={i >= expSlots}
                  value={owned.expeditionSkills[i] ?? 0}
                  onChange={(v) => onChange({ expeditionSkills: owned.expeditionSkills.map((x, j) => (j === i ? v : x)) })}
                />
              ))}
            </div>
            {expSkills.length === 0 && <p className="mt-1 text-[11px] text-ink-mute">スキルの数値は未取得です（/data でクロールすると反映されます）</p>}
          </fieldset>

          <fieldset>
            <legend className="field-label">Conquest スキル</legend>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <NumberField
                  key={i}
                  compact
                  label={conqSkills[i]?.name ?? (i < conqSlots ? `スキル${i + 1}` : '（枠なし）')}
                  limit="skillLevel"
                  disabled={i >= conqSlots}
                  value={owned.conquestSkills[i] ?? 0}
                  onChange={(v) => onChange({ conquestSkills: owned.conquestSkills.map((x, j) => (j === i ? v : x)) })}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="field-label">英雄装備（精錬鍛造 0〜20 / 練磨 Lv 0〜200）</legend>
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
              {Array.from({ length: HERO_GEAR_SLOTS }, (_, i) => {
                const g = owned.gear[i] ?? { level: 0, mastery: 0 };
                const set = (patch: Partial<typeof g>) => onChange({ gear: owned.gear.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={i} className="grid grid-cols-2 gap-1 rounded-md border border-parchment-line bg-white p-1.5">
                    <NumberField compact label={`${HERO_GEAR_SLOT_LABELS[i] ?? `部位${i + 1}`} 精錬鍛造`} limit="heroGearMastery" value={g.mastery} onChange={(v) => set({ mastery: v })} />
                    <NumberField compact label="練磨" limit="heroGearLevel" value={g.level} onChange={(v) => set({ level: v })} />
                  </div>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="field-label">ウィジェット（専用装備）</legend>
            {canWidget ? (
              <div className="grid grid-cols-2 items-end gap-2">
                <Toggle
                  label={hero.widget?.name ? `所持（${hero.widget.name}）` : '所持'}
                  checked={owned.widget.owned}
                  onChange={(v) => onChange({ widget: { owned: v, level: v ? Math.max(1, owned.widget.level) : 0 } })}
                />
                <NumberField
                  compact
                  label="レベル"
                  limit="widgetLevel"
                  disabled={!owned.widget.owned}
                  value={owned.widget.level}
                  onChange={(v) => onChange({ widget: { ...owned.widget, level: v } })}
                />
              </div>
            ) : (
              <p className="text-[11px] text-ink-mute">ウィジェットはレジェンド（金）英雄のみ（公式 Wiki）</p>
            )}
            {errors['widget.level'] && <p className="mt-1 text-[11px] text-cav">{errors['widget.level']}</p>}
          </fieldset>
        </div>
      )}
    </article>
  );
}
