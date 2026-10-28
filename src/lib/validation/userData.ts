import {
  HERO_GEAR_RANKS,
  HERO_GEAR_SLOTS,
  type HeroGearRank,
  type HeroGearSlot,
  LORD_GEAR_SLOTS,
  TROOP_TYPES,
  type LordGear,
  type OwnedHero,
  type StatBlock,
  type TroopType,
  type UserBuffs,
  type UserData,
} from '../types';
import { checkValue, clampValue, type LimitKey } from './limits';

/* ------------------------------------------------------------------ */
/* 既定値                                                              */
/* ------------------------------------------------------------------ */

const zeroStats = (): StatBlock => ({ attack: 0, defense: 0, lethality: 0, health: 0 });
const perTroop = <T>(make: () => T): Record<TroopType, T> => ({ infantry: make(), cavalry: make(), archer: make() });

export function createDefaultOwnedHero(heroId: string): OwnedHero {
  return {
    heroId,
    owned: false,
    level: 1,
    stars: 0,
    awakened: false,
    gear: Array.from({ length: HERO_GEAR_SLOTS }, (): HeroGearSlot => ({ rank: 'none', level: 0, mastery: 0 })),
    expeditionSkills: [1, 1, 1],
    conquestSkills: [1, 1, 1],
    widget: { owned: false, level: 0 },
  };
}

/** ゲーム画面の並び順: 部位 1・2 = 騎兵、3・4 = 歩兵、5・6 = 弓兵 */
const DEFAULT_LORD_GEAR_TROOPS: TroopType[] = ['cavalry', 'cavalry', 'infantry', 'infantry', 'archer', 'archer'];

export function createDefaultLordGear(): LordGear {
  return {
    slots: Array.from({ length: LORD_GEAR_SLOTS }, (_, i) => ({ troop: DEFAULT_LORD_GEAR_TROOPS[i] ?? 'infantry', ...zeroStats() })),
    setBonus: zeroStats(),
  };
}

export function createDefaultBuffs(): UserBuffs {
  return {
    research: perTroop(zeroStats),
    governorSkills: zeroStats(),
    vipLevel: 0,
    reportOverride: { enabled: false, stats: perTroop(zeroStats) },
  };
}

export function createDefaultUserData(heroIds: string[]): UserData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    lordGear: createDefaultLordGear(),
    heroes: Object.fromEntries(heroIds.map((id) => [id, createDefaultOwnedHero(id)])),
    troops: {
      infantry: { level: 1, truegold: 0, count: 0 },
      cavalry: { level: 1, truegold: 0, count: 0 },
      archer: { level: 1, truegold: 0, count: 0 },
    },
    buffs: createDefaultBuffs(),
    settings: { serverGeneration: 1, marchCapacity: 100_000 },
  };
}

/* ------------------------------------------------------------------ */
/* 検証                                                                */
/* ------------------------------------------------------------------ */

export interface FieldError {
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; data: UserData; warnings: FieldError[] } | { ok: false; errors: FieldError[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * インポートした JSON を検証し、正規化した UserData を返す。
 * - 構造が壊れている → エラー（読み込まない）
 * - 範囲外の数値 → 範囲内に丸めて warnings に記録
 * - 未知の英雄 ID → 保持する（マスターデータ更新で追加される可能性があるため）
 */
export function validateUserData(input: unknown, knownHeroIds: string[]): ValidationResult {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];

  if (!isObj(input)) return { ok: false, errors: [{ path: '$', message: 'JSON オブジェクトではありません' }] };
  if (input.version !== 1) errors.push({ path: 'version', message: `未対応のバージョンです（${String(input.version)}）` });
  if (!isObj(input.heroes)) errors.push({ path: 'heroes', message: 'heroes がありません' });
  if (!isObj(input.troops)) errors.push({ path: 'troops', message: 'troops がありません' });
  if (errors.length) return { ok: false, errors };

  const base = createDefaultUserData(knownHeroIds);

  const num = (path: string, key: LimitKey, value: unknown, fallback: number): number => {
    const err = checkValue(key, value);
    if (err) warnings.push({ path, message: `${err}（${String(value)} → 補正）` });
    return clampValue(key, value, fallback);
  };
  const pct = (path: string, value: unknown): number => num(path, 'percent', value ?? 0, 0);
  const stats = (path: string, v: unknown): StatBlock => {
    const o = isObj(v) ? v : {};
    return {
      attack: pct(`${path}.attack`, o.attack),
      defense: pct(`${path}.defense`, o.defense),
      lethality: pct(`${path}.lethality`, o.lethality),
      health: pct(`${path}.health`, o.health),
    };
  };
  const troopOf = (v: unknown, fallback: TroopType): TroopType =>
    typeof v === 'string' && (TROOP_TYPES as readonly string[]).includes(v) ? (v as TroopType) : fallback;

  // 英雄
  let legacyGear = false;
  const heroes: Record<string, OwnedHero> = { ...base.heroes };
  for (const [id, raw] of Object.entries(input.heroes as Obj)) {
    if (!isObj(raw)) {
      warnings.push({ path: `heroes.${id}`, message: '形式が不正なため初期値に戻しました' });
      continue;
    }
    const d = createDefaultOwnedHero(id);
    const p = `heroes.${id}`;
    const gearRaw = Array.isArray(raw.gear) ? raw.gear : [];
    heroes[id] = {
      heroId: id,
      owned: raw.owned === true,
      level: num(`${p}.level`, 'heroLevel', raw.level ?? d.level, d.level),
      stars: num(`${p}.stars`, 'heroStars', raw.stars ?? d.stars, d.stars),
      awakened: raw.awakened === true,
      gear: Array.from({ length: HERO_GEAR_SLOTS }, (_, i): HeroGearSlot => {
        const g = gearRaw[i];
        const go: Obj = typeof g === 'number' ? { level: g } : isObj(g) ? g : {};
        const level = num(`${p}.gear[${i}].level`, 'heroGearLevel', go.level ?? 0, 0);
        let rank: HeroGearRank;
        if (typeof go.rank === 'string' && (HERO_GEAR_RANKS as readonly string[]).includes(go.rank)) rank = go.rank as HeroGearRank;
        else {
          // 旧形式（ランクなし）: 入力済みの部位はレジェンドとみなし、確認を促す
          rank = level > 0 || Number(go.mastery ?? 0) > 0 ? 'legendary' : 'none';
          if (rank !== 'none') legacyGear = true;
        }
        const masteryIn = num(`${p}.gear[${i}].mastery`, 'heroGearMastery', go.mastery ?? 0, 0);
        if (rank !== 'legendary' && masteryIn > 0) warnings.push({ path: `${p}.gear[${i}].mastery`, message: '精錬鍛造はレジェンド装備のみのため 0 にしました' });
        return { rank, level: rank === 'none' ? 0 : level, mastery: rank === 'legendary' ? masteryIn : 0 };
      }),
      expeditionSkills: [0, 1, 2].map((i) =>
        num(`${p}.expeditionSkills[${i}]`, 'skillLevel', (raw.expeditionSkills as unknown[] | undefined)?.[i] ?? 1, 1),
      ),
      conquestSkills: [0, 1, 2].map((i) =>
        num(`${p}.conquestSkills[${i}]`, 'skillLevel', (raw.conquestSkills as unknown[] | undefined)?.[i] ?? 1, 1),
      ),
      widget: {
        owned: isObj(raw.widget) && raw.widget.owned === true,
        level: num(`${p}.widget.level`, 'widgetLevel', isObj(raw.widget) ? (raw.widget.level ?? 0) : 0, 0),
      },
    };
    if (!knownHeroIds.includes(id)) warnings.push({ path: p, message: '未知の英雄 ID です（マスターデータ更新後に表示されます）' });
  }

  if (legacyGear) {
    warnings.push({ path: 'heroes.*.gear', message: '旧形式の英雄装備（ランクなし）を読み込みました。入力済みの部位はレジェンドとして扱っています。ランクを確認してください' });
  }

  // 領主装備
  const lgRaw = isObj(input.lordGear) ? input.lordGear : {};
  const slotsRaw = Array.isArray(lgRaw.slots) ? lgRaw.slots : [];
  if (slotsRaw.some((x) => isObj(x) && ('level' in x || 'polish' in x) && !('attack' in x))) {
    warnings.push({ path: 'lordGear.slots', message: '旧形式（レベル・研磨値）の領主装備は引き継げないため、0 にしました。攻撃力・防御力・殺傷力・HP を入力し直してください' });
  }
  const lordGear: LordGear = {
    slots: base.lordGear.slots.map((d, i) => {
      const s = isObj(slotsRaw[i]) ? (slotsRaw[i] as Obj) : {};
      return {
        troop: troopOf(s.troop, d.troop),
        ...stats(`lordGear.slots[${i}]`, s),
      };
    }),
    setBonus: stats('lordGear.setBonus', lgRaw.setBonus),
  };

  // 兵士
  const tr = input.troops as Obj;
  const troops = Object.fromEntries(
    TROOP_TYPES.map((t) => {
      const o = isObj(tr[t]) ? (tr[t] as Obj) : {};
      // 旧形式は "tier"（T1〜T10）= 兵士レベルとして引き継ぐ
      const level = num(`troops.${t}.level`, 'troopLevel', o.level ?? o.tier ?? 1, 1);
      let truegold = num(`troops.${t}.truegold`, 'troopTruegold', o.truegold ?? 0, 0);
      if (truegold > 0 && level < 10) {
        warnings.push({ path: `troops.${t}.truegold`, message: '黄金レベルは兵士レベル 10 のときだけ有効なため 0 にしました' });
        truegold = 0;
      }
      return [t, { level, truegold, count: num(`troops.${t}.count`, 'troopCount', o.count ?? 0, 0) }];
    }),
  ) as UserData['troops'];

  // バフ
  const bf = isObj(input.buffs) ? input.buffs : {};
  const research = isObj(bf.research) ? bf.research : {};
  const ro = isObj(bf.reportOverride) ? bf.reportOverride : {};
  const roStats = isObj(ro.stats) ? ro.stats : {};
  const buffs: UserBuffs = {
    research: Object.fromEntries(TROOP_TYPES.map((t) => [t, stats(`buffs.research.${t}`, research[t])])) as Record<TroopType, StatBlock>,
    governorSkills: stats('buffs.governorSkills', bf.governorSkills),
    vipLevel: num('buffs.vipLevel', 'vipLevel', bf.vipLevel ?? 0, 0),
    reportOverride: {
      enabled: ro.enabled === true,
      stats: Object.fromEntries(TROOP_TYPES.map((t) => [t, stats(`buffs.reportOverride.${t}`, roStats[t])])) as Record<TroopType, StatBlock>,
    },
  };

  const st = isObj(input.settings) ? input.settings : {};
  const settings = {
    serverGeneration: num('settings.serverGeneration', 'serverGeneration', st.serverGeneration ?? 1, 1),
    marchCapacity: num('settings.marchCapacity', 'marchCapacity', st.marchCapacity ?? 100_000, 100_000),
  };

  return {
    ok: true,
    warnings,
    data: {
      version: 1,
      updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
      lordGear,
      heroes,
      troops,
      buffs,
      settings,
    },
  };
}

/** フォーム用: 1 人の英雄の入力エラーを項目ごとに返す */
export function validateOwnedHero(h: OwnedHero): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (k: string, key: LimitKey, v: unknown) => {
    const e = checkValue(key, v);
    if (e) out[k] = e;
  };
  add('level', 'heroLevel', h.level);
  add('stars', 'heroStars', h.stars);
  h.gear.forEach((g, i) => {
    add(`gear.${i}.level`, 'heroGearLevel', g.level);
    add(`gear.${i}.mastery`, 'heroGearMastery', g.mastery);
    if (g.rank !== 'legendary' && g.mastery > 0) out[`gear.${i}.mastery`] = '精錬鍛造はレジェンド装備のみです';
  });
  h.expeditionSkills.forEach((v, i) => add(`expeditionSkills.${i}`, 'skillLevel', v));
  h.conquestSkills.forEach((v, i) => add(`conquestSkills.${i}`, 'skillLevel', v));
  add('widget.level', 'widgetLevel', h.widget.level);
  if (h.widget.level > 0 && !h.widget.owned) out['widget.level'] = 'ウィジェット未所持の場合はレベル 0 にしてください';
  return out;
}
