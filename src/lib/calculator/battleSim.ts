/**
 * 討伐戦闘（討伐・競技場）の簡易タイムライン計算
 *
 * 「スキルが全部発動する」前提をやめ、0.5 秒刻みで戦闘を進める。
 *  - 敵は前列から狙う（前列が全滅してから後列）。同じ列の生存者で被ダメを等分する
 *  - 倒された英雄はそれ以降、攻撃もスキル発動もしない
 *  - スキルは説明文の時間表記（"every 5s" "for 4s" "at the 5-second mark" "below 50% Health"）から
 *    発動タイミングを決める。表記が無いものは本ツールの仮定（config: battleSkillFirstCast / battleSkillCooldown）
 *
 * ゲーム内部の戦闘処理（攻撃速度・エネルギー・ターゲット選択）は非公開のため近似。
 */
import type { EffectStat, Skill, SkillEffect } from '../types';
import { effectValueAt } from '../crawler/parseSkill';
import type { CalcConfig } from './config';

export interface SimSkill {
  name: string;
  effects: Array<{ stat: EffectStat; value: number; scope: SkillEffect['scope'] }>;
  mode: 'passive' | 'active' | 'periodic' | 'trigger';
  firstCast: number; // 秒
  cooldown: number; // 秒（active / periodic）
  duration: number; // バフの持続秒数（0 = 即時）
  hits: number; // 多段ヒット数
  condition?: 'hpAbove50' | 'hpBelow50';
  healBase: 'attack' | 'maxHp';
  healTarget: 'self' | 'lowest' | 'all';
}

export interface SimUnit {
  id: string;
  name: string;
  front: boolean;
  maxHp: number;
  attack: number;
  defense: number;
  /** 推奨外の列に置いたときの補正（前列 = 耐久、後列 = 火力） */
  mismatch: number;
  skills: SimSkill[];
}

export interface UnitResult {
  id: string;
  deathTime: number | null; // 倒された時刻（生存なら null）
  casts: number; // スキル発動回数（パッシブを除く）
  castableSkills: number; // 発動型スキルの数
  damage: number;
  hpLeft: number;
}

export interface SimResult {
  win: boolean;
  duration: number;
  enemyDestroyed: number; // 0〜1
  ownHpLeft: number; // 0〜1
  units: UnitResult[];
  score: number;
}

/* ------------------------------------------------------------------ */
/* スキル文 → 発動タイミング                                           */
/* ------------------------------------------------------------------ */

const num = (s: string | undefined) => (s ? Number(s) : NaN);

export function toSimSkill(skill: Skill, level: number, slotIndex: number, cfg: CalcConfig): SimSkill | null {
  if (level <= 0) return null;
  const text = skill.description.replace(/\s+/g, ' ');
  const effects = skill.effects
    .map((e) => ({ stat: e.stat, value: effectValueAt(e, level), scope: e.scope }))
    .filter((e) => e.value !== 0 && e.stat !== 'other');
  if (effects.length === 0) return null;

  const every = /every second\b/i.test(text) ? 1 : num(text.match(/every\s+(\d+(?:\.\d+)?)\s*s\b/i)?.[1]);
  const forSec = num(text.match(/for\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\b/i)?.[1]);
  const mark = num(text.match(/(\d+(?:\.\d+)?)-second mark/i)?.[1] ?? text.match(/after\s+(\d+(?:\.\d+)?)\s*s\b/i)?.[1]);
  const below = /(under|below)\s+50%\s+health/i.test(text);
  const above = /above\s+50%\s+health/i.test(text);
  const isInstant = effects.some((e) => e.stat === 'skillDamage' || e.stat === 'heal');
  const healBase: SimSkill['healBase'] = /attack\s*[*×x]|by attack|equal to attack|petra's attack/i.test(text) ? 'attack' : 'maxHp';
  const healTarget: SimSkill['healTarget'] = /all (friendly )?(heroes|troops)|all troops|to all/i.test(text)
    ? 'all'
    : /lowest|weakest/i.test(text)
      ? 'lowest'
      : 'self';

  const base = {
    name: skill.name,
    effects,
    duration: 0,
    hits: 1,
    healBase,
    healTarget,
  };

  // 多段ヒット: "dealing ... every 0.5s for 2s" → 4 ヒット
  if (isInstant && Number.isFinite(every) && Number.isFinite(forSec) && every > 0) {
    return { ...base, mode: 'active', firstCast: firstCastFor(slotIndex, mark, cfg), cooldown: cfg.battleSkillCooldown.value, hits: Math.max(1, Math.round(forSec / every)) };
  }
  if (Number.isFinite(every) && every > 0) {
    return { ...base, mode: 'periodic', firstCast: every, cooldown: every };
  }
  if (below) {
    return { ...base, mode: 'trigger', firstCast: 0, cooldown: Infinity, condition: 'hpBelow50' };
  }
  if (isInstant || Number.isFinite(forSec) || Number.isFinite(mark)) {
    return {
      ...base,
      mode: 'active',
      firstCast: firstCastFor(slotIndex, mark, cfg),
      cooldown: cfg.battleSkillCooldown.value,
      duration: Number.isFinite(forSec) ? forSec : 0,
    };
  }
  return { ...base, mode: 'passive', firstCast: 0, cooldown: 0, ...(above ? { condition: 'hpAbove50' as const } : {}) };
}

function firstCastFor(slotIndex: number, mark: number, cfg: CalcConfig): number {
  if (Number.isFinite(mark)) return mark;
  // 1 枠目から順に少しずつずらす（同時発動を避ける仮定）
  return cfg.battleSkillFirstCast.value + slotIndex * 1;
}

/* ------------------------------------------------------------------ */
/* 戦闘                                                                */
/* ------------------------------------------------------------------ */

interface Live {
  u: SimUnit;
  hp: number;
  deathTime: number | null;
  next: number[]; // 各スキルの次回発動時刻
  triggered: boolean[];
  casts: number;
  damage: number;
}

interface TimedBuff {
  until: number;
  targetId: string | 'team';
  stat: EffectStat;
  value: number;
}

const DT = 0.5;

export function simulateBattle(own: SimUnit[], enemy: SimUnit[], cfg: CalcConfig): SimResult {
  const maxT = cfg.battleMaxSeconds.value;
  const mk = (u: SimUnit): Live => ({
    u,
    hp: u.maxHp,
    deathTime: null,
    next: u.skills.map((s) => s.firstCast),
    triggered: u.skills.map(() => false),
    casts: 0,
    damage: 0,
  });
  const A = own.map(mk);
  const B = enemy.map(mk);
  const buffs: TimedBuff[] = [];
  const enemyMaxHp = B.reduce((s, x) => s + x.u.maxHp, 0) || 1;
  const ownMaxHp = A.reduce((s, x) => s + x.u.maxHp, 0) || 1;

  const alive = (xs: Live[]) => xs.filter((x) => x.deathTime === null);
  const targets = (xs: Live[]) => {
    const a = alive(xs);
    const f = a.filter((x) => x.u.front);
    return f.length ? f : a;
  };

  /** 有効なステータス倍率（パッシブ + 時限バフ） */
  const statOf = (x: Live, team: Live[], stat: EffectStat, t: number): number => {
    let v = 0;
    for (const m of team) {
      if (m.deathTime !== null) continue;
      m.u.skills.forEach((s) => {
        if (s.mode !== 'passive') return;
        if (s.condition === 'hpAbove50' && m.hp / m.u.maxHp <= 0.5) return;
        for (const e of s.effects) {
          if (e.stat !== stat) continue;
          const teamWide = e.scope === 'heroes' || e.scope === 'squad';
          if (m === x || teamWide) v += e.value;
        }
      });
    }
    for (const b of buffs) if (b.until > t && b.stat === stat && (b.targetId === 'team' || b.targetId === x.u.id)) v += b.value;
    return v;
  };

  const dealTo = (pool: Live[], amount: number, t: number, defenders: Live[]) => {
    const tg = targets(pool);
    if (!tg.length) return 0;
    let dealt = 0;
    const share = amount / tg.length;
    for (const x of tg) {
      const def = x.u.defense * (1 + statOf(x, defenders, 'heroDefense', t) / 100);
      const dtd = Math.min(cfg.maxDamageReduction.value, statOf(x, defenders, 'damageTakenDown', t) / 100);
      const dmg = (share / (1 + def / 10000)) * (1 - dtd) / (x.u.front ? x.u.mismatch : 1);
      const real = Math.min(x.hp, dmg);
      x.hp -= real;
      dealt += real;
      if (x.hp <= 0 && x.deathTime === null) x.deathTime = t;
    }
    return dealt;
  };

  let t = 0;
  for (; t < maxT; t += DT) {
    if (!alive(A).length || !alive(B).length) break;

    // 1. スキル発動
    for (const [side, foes] of [
      [A, B],
      [B, A],
    ] as const) {
      for (const x of alive(side)) {
        x.u.skills.forEach((s, i) => {
          if (s.mode === 'passive') return;
          if (s.mode === 'trigger') {
            if (x.triggered[i] || x.hp / x.u.maxHp >= 0.5) return;
            x.triggered[i] = true;
          } else {
            if (t + 1e-9 < x.next[i]!) return;
            x.next[i] = t + s.cooldown;
          }
          x.casts++;
          const atk = x.u.attack * (1 + (statOf(x, side, 'heroAttack', t) + statOf(x, side, 'squadAttack', t)) / 100);
          for (const e of s.effects) {
            if (e.stat === 'skillDamage') {
              const amp = 1 + statOf(x, side, 'enemyDamageTakenUp', t) / 100;
              x.damage += dealTo(foes, ((atk * e.value) / 100) * s.hits * amp * (x.u.front ? 1 : x.u.mismatch), t, foes);
            } else if (e.stat === 'heal') {
              const pool = alive(side);
              const recips = s.healTarget === 'all' ? pool : s.healTarget === 'lowest' ? pool.sort((p, q) => p.hp / p.u.maxHp - q.hp / q.u.maxHp).slice(0, 1) : [x];
              for (const r of recips) {
                const amt = s.healBase === 'attack' ? (atk * e.value) / 100 : (r.u.maxHp * e.value) / 100;
                r.hp = Math.min(r.u.maxHp, r.hp + amt);
              }
            } else if (s.duration > 0 || s.mode === 'trigger') {
              const teamWide = e.scope === 'heroes' || e.scope === 'squad';
              const until = t + (s.duration > 0 ? s.duration : maxT);
              if (e.stat === 'enemyDamageTakenUp' || e.stat === 'enemyAttackDown') buffs.push({ until, targetId: 'team', stat: e.stat, value: e.value });
              else buffs.push({ until, targetId: teamWide ? 'team' : x.u.id, stat: e.stat, value: e.value });
            }
          }
        });
      }
    }

    // 2. 通常攻撃（攻撃力 × 1 / 秒 とみなす）
    for (const [side, foes] of [
      [A, B],
      [B, A],
    ] as const) {
      let out = 0;
      const attackers = alive(side);
      for (const x of attackers) {
        const atk = x.u.attack * (1 + (statOf(x, side, 'heroAttack', t) + statOf(x, side, 'squadAttack', t)) / 100);
        const amp = 1 + statOf(x, side, 'enemyDamageTakenUp', t) / 100;
        out += atk * DT * amp * (x.u.front ? 1 : x.u.mismatch);
      }
      // 相手側の「敵攻撃力低下」
      const weak = Math.min(cfg.maxDamageReduction.value, (foes[0] ? statOf(foes[0], foes, 'enemyAttackDown', t) : 0) / 100);
      const dealt = dealTo(foes, out * (1 - weak), t, foes);
      // 与ダメを攻撃者に按分
      const total = attackers.reduce((s, x) => s + x.u.attack, 0) || 1;
      for (const x of attackers) x.damage += (dealt * x.u.attack) / total;
    }
  }

  const enemyHpLeft = B.reduce((s, x) => s + Math.max(0, x.hp), 0);
  const ownHpLeft = A.reduce((s, x) => s + Math.max(0, x.hp), 0) / ownMaxHp;
  const enemyDestroyed = 1 - enemyHpLeft / enemyMaxHp;
  const win = !alive(B).length;
  return {
    win,
    duration: t,
    enemyDestroyed,
    ownHpLeft,
    units: A.map((x) => ({
      id: x.u.id,
      deathTime: x.deathTime,
      casts: x.casts,
      castableSkills: x.u.skills.filter((s) => s.mode !== 'passive').length,
      damage: x.damage,
      hpLeft: Math.max(0, x.hp) / x.u.maxHp,
    })),
    // 相手をどれだけ削れたか（0〜100）＋ 味方がどれだけ残ったか（0〜50）
    score: 100 * enemyDestroyed + 50 * ownHpLeft,
  };
}
