/**
 * 行配列 → 構造化データ の純粋関数群（ネットワーク・cheerio 非依存なのでテスト可能）
 */
import type {
  ConquestStats,
  EventType,
  ExpeditionStats,
  FormationTemplate,
  Rarity,
  Skill,
  SkillKind,
  SourceRef,
  TierCategory,
  TierList,
  TroopRatio,
  TroopType,
  WidgetMaster,
} from '../types';
import { parseNumber, parseSkillDescription } from './parseSkill';

const isNumberLine = (l: string) => /^[+-]?[\d,]+(\.\d+)?%?$/.test(l.trim());
const isDescLine = (l: string) => l.length > 25 && /\d/.test(l);

function rarityOf(text: string): Rarity | undefined {
  const t = text.toLowerCase();
  if (/(legendary|mythic|ssr)/.test(t)) return 'legendary';
  if (/(epic|\bsr\b)/.test(t)) return 'epic';
  if (/\brare\b/.test(t)) return 'rare';
  return undefined;
}

function troopOf(text: string): TroopType | undefined {
  const t = text.toLowerCase();
  if (/infantry|shield/.test(t)) return 'infantry';
  if (/cavalry|lancer|rider/.test(t)) return 'cavalry';
  if (/archer|marksman/.test(t)) return 'archer';
  return undefined;
}

/** label の次の数値行を返す（from 以降で最初に見つかった label） */
function numberAfter(lines: string[], label: RegExp, from: number, to = lines.length): { value: number; index: number } | null {
  for (let i = from; i < Math.min(to, lines.length - 1); i++) {
    if (label.test(lines[i]!) && isNumberLine(lines[i + 1]!)) {
      const v = parseNumber(lines[i + 1]);
      if (v !== null) return { value: v, index: i + 1 };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 公式 Wiki（kingshotwiki.com）の英雄ページ                            */
/* ------------------------------------------------------------------ */

export interface ParsedHeroPage {
  name?: string;
  rarity?: Rarity;
  troop?: TroopType;
  conquest?: ConquestStats;
  expedition?: ExpeditionStats;
  skills: Skill[];
  widget?: WidgetMaster;
  warnings: string[];
}

const END_MARKERS = /^(Tips from Saul|Play the Game|Our Socials|Contributors|Related Kingshot Pages)$/i;

/** スキル件数の想定（レアリティ別）: [Conquest, Expedition] */
const SKILL_COUNTS: Record<Rarity, [number, number]> = { rare: [2, 2], epic: [3, 2], legendary: [3, 3] };

export function parseOfficialHeroLines(lines: string[]): ParsedHeroPage {
  const warnings: string[] = [];
  const out: ParsedHeroPage = { skills: [], warnings };

  const ri = lines.findIndex((l) => l === 'Rarity');
  if (ri >= 0) {
    out.rarity = rarityOf(lines[ri + 1] ?? '');
    out.name = lines[ri - 1];
  }
  const ci = lines.findIndex((l, i) => l === 'Class' && i > ri);
  if (ci >= 0) out.troop = troopOf(lines[ci + 1] ?? '');

  // Stats（最初の "Stats" の後ろ）。Special 内の Stats と区別するため Special より前に限定
  const specialIdx = lines.findIndex((l, i) => l === 'Special' && lines[i + 1] === 'Stats');
  const statsIdx = lines.findIndex((l, i) => l === 'Stats' && i > ci && (specialIdx < 0 || i < specialIdx));
  if (statsIdx >= 0) {
    const conqIdx = lines.indexOf('Conquest', statsIdx);
    const expIdx = lines.indexOf('Expedition', statsIdx);
    const atk = numberAfter(lines, /^Attack$/i, conqIdx, expIdx);
    const def = numberAfter(lines, /^Def(ense)?$/i, conqIdx, expIdx);
    const hp = numberAfter(lines, /^Health$/i, conqIdx, expIdx);
    if (atk && def && hp) out.conquest = { attack: atk.value, defense: def.value, health: hp.value };
    else warnings.push('討伐ステータスを読み取れませんでした');
    const eAtk = numberAfter(lines, /^Attack$/i, expIdx, expIdx + 6);
    const eDef = numberAfter(lines, /^Defen[cs]e$/i, expIdx, expIdx + 6);
    if (eAtk) out.expedition = { attack: eAtk.value, defense: eDef?.value ?? eAtk.value };
    else warnings.push('遠征ステータスを読み取れませんでした');
  } else warnings.push('Stats セクションが見つかりません');

  // Skills: "Skills" の直後にタブ（Conquest / Expedition / Talent）が並ぶ箇所
  const skillsIdx = lines.findIndex((l, i) => l === 'Skills' && /^(Conquest|Expedition)$/.test(lines[i + 1] ?? ''));
  const hasTalentTab = skillsIdx >= 0 && lines.slice(skillsIdx + 1, skillsIdx + 5).includes('Talent');
  if (skillsIdx >= 0) {
    let i = skillsIdx + 1;
    while (/^(Conquest|Expedition|Talent)$/.test(lines[i] ?? '')) i++;
    const pairs: Array<{ name: string; desc: string }> = [];
    for (; i < lines.length - 1; i++) {
      const l = lines[i]!;
      if (l === 'Special' || END_MARKERS.test(l)) break;
      const next = lines[i + 1]!;
      if (!isDescLine(l) && l.length <= 40 && isDescLine(next)) {
        pairs.push({ name: l, desc: next });
        i++;
      }
    }
    const [nc, ne] = SKILL_COUNTS[out.rarity ?? 'legendary'];
    if (pairs.length < nc + ne) warnings.push(`スキル数が想定（${nc + ne}）より少ない: ${pairs.length}`);
    out.skills = pairs.map((p, idx) => {
      let kind: SkillKind = idx < nc ? 'conquest' : idx < nc + ne ? 'expedition' : 'talent';
      if (kind === 'talent' && !hasTalentTab) kind = 'expedition';
      return { name: p.name, kind, description: p.desc, effects: parseSkillDescription(p.desc) };
    });
  } else warnings.push('Skills セクションが見つかりません');

  // Special（ウィジェット）
  if (specialIdx >= 0) {
    const conqIdx = lines.indexOf('Conquest', specialIdx);
    const expIdx = lines.indexOf('Expedition', specialIdx);
    const wc: Partial<ConquestStats> = {};
    const a = numberAfter(lines, /^Attack$/i, conqIdx, expIdx);
    const d = numberAfter(lines, /^Def(ense)?$/i, conqIdx, expIdx);
    const h = numberAfter(lines, /^Health$/i, conqIdx, expIdx);
    if (a) wc.attack = a.value;
    if (d) wc.defense = d.value;
    if (h) wc.health = h.value;
    const we: WidgetMaster['expedition'] = {};
    let j = expIdx + 1;
    for (; j < lines.length - 1; j += 2) {
      const label = lines[j]!.toLowerCase();
      const val = lines[j + 1]!;
      if (!isNumberLine(val)) break;
      const v = parseNumber(val);
      if (v === null) break;
      if (label === 'lethality') we.lethality = v;
      else if (label === 'health') we.health = v;
      else if (label === 'attack') we.attack = v;
      else if (label.startsWith('defen')) we.defense = v;
      else break;
    }
    // ウィジェット名（次の非数値行）と戦力値（数値行）の後にスキル 2 つ
    let name: string | undefined;
    for (; j < lines.length; j++) {
      if (!isNumberLine(lines[j]!) && !isDescLine(lines[j]!)) {
        name = lines[j];
        j++;
        break;
      }
    }
    while (j < lines.length && isNumberLine(lines[j]!)) j++;
    const wskills: Skill[] = [];
    for (; j < lines.length - 1 && wskills.length < 2; j++) {
      const l = lines[j]!;
      if (END_MARKERS.test(l)) break;
      if (!isDescLine(l) && isDescLine(lines[j + 1]!)) {
        const kind: SkillKind = wskills.length === 0 ? 'widget_conquest' : 'widget_expedition';
        wskills.push({ name: l, kind, description: lines[j + 1]!, effects: parseSkillDescription(lines[j + 1]!) });
        j++;
      }
    }
    out.widget = { ...(name ? { name } : {}), expedition: we, ...(Object.keys(wc).length ? { conquest: wc } : {}) };
    out.skills.push(...wskills);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* kingshot.wiki（ファンサイト）の英雄ページ                            */
/* ------------------------------------------------------------------ */

export function parseFanHeroLines(lines: string[]): Omit<ParsedHeroPage, 'skills' | 'widget'> {
  const warnings: string[] = [];
  const out: Omit<ParsedHeroPage, 'skills' | 'widget'> = { warnings };
  const head = lines.find((l) => /^(Legendary|Epic|Rare|Mythic)\s*\/\s*\w+/i.test(l));
  if (head) {
    const [r, t] = head.split('/').map((s) => s.trim());
    out.rarity = rarityOf(r ?? '');
    out.troop = troopOf(t ?? '');
  }
  const g = lines.find((l) => /Guide$/.test(l) && l.split(' ').length <= 4);
  if (g) out.name = g.replace(/\s*Guide$/, '');
  const atk = numberAfter(lines, /^Conquest Attack$/i, 0);
  const def = numberAfter(lines, /^Conquest Defen[cs]e$/i, 0);
  const hp = numberAfter(lines, /^Conquest Health$/i, 0);
  if (atk && def && hp) out.conquest = { attack: atk.value, defense: def.value, health: hp.value };
  else warnings.push('討伐ステータスを読み取れませんでした');
  const ea = numberAfter(lines, /^Expedition Attack$/i, 0);
  const ed = numberAfter(lines, /^Expedition Defen[cs]e$/i, 0);
  if (ea) out.expedition = { attack: ea.value, defense: ed?.value ?? ea.value };
  return out;
}

export function parseFanSkillRows(rows: Array<{ label: string; name: string; desc: string }>): Skill[] {
  const kindOf = (label: string): SkillKind | null => {
    const l = label.toLowerCase();
    if (l === 'conquest') return 'conquest';
    if (l === 'expedition') return 'expedition';
    if (l === 'special' || l === 'talent') return 'talent';
    return null;
  };
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    const kind = kindOf(r.label);
    if (!kind || seen.has(r.name)) return [];
    seen.add(r.name);
    return [{ name: r.name, kind, description: r.desc, effects: parseSkillDescription(r.desc) }];
  });
}

/* ------------------------------------------------------------------ */
/* KingshotTools.pro の英雄カード                                       */
/* ------------------------------------------------------------------ */

/** 例: "Petra Petra mythicGen 3Roulette The absolute best ... cavalry Ultimate F2P Carry" */
export function parseToolsHeroCard(text: string): { name: string; rarity?: Rarity; generation: number | null; troop?: TroopType } | null {
  const m = text.match(/^(.+?)\s+\1\s+(rare|epic|mythic)\s*(?:Gen\s*(\d+)|Base)/i);
  if (!m) return null;
  const troopWord = text.match(/\b(infantry|cavalry|archer)\b/i)?.[1];
  return {
    name: m[1]!.trim(),
    rarity: rarityOf(m[2]!),
    generation: m[3] ? Number(m[3]) : null,
    troop: troopWord ? troopOf(troopWord) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* ティアリスト・テンプレートの抽出（汎用）                              */
/* ------------------------------------------------------------------ */

export function categoryFromContext(text: string): TierCategory {
  const t = text.toLowerCase();
  if (/bear/.test(t)) return 'bear';
  if (/garrison|defen[cs]e/.test(t)) return 'garrison';
  if (/rally|attack/.test(t)) return 'rally';
  if (/conquest|arena/.test(t)) return 'conquest';
  return 'overall';
}

const TIER_HEADING = /^(?:(S\+|SS|S|A|B|C|D)[\s-]*tier\b|tier[\s-]*(S\+|SS|S|A|B|C|D)\b)/i;

/**
 * "S tier" のような見出し行の後に出てくる英雄名を、次の見出しまで集める。
 * heroNames は ID → 表示名（別表記を含む）の対応。
 */
export function mineTierLists(
  lines: string[],
  heroNames: Array<{ id: string; names: string[] }>,
  source: SourceRef,
  pageTitle = '',
): TierList[] {
  const lists = new Map<TierCategory, TierList>();
  let tier: string | null = null;
  let category: TierCategory = categoryFromContext(pageTitle);
  const matchers = heroNames.map((h) => ({ id: h.id, re: new RegExp(`\\b(${h.names.map(escapeRe).join('|')})\\b`, 'i') }));

  for (const line of lines) {
    const th = line.match(TIER_HEADING);
    if (th && line.length < 40) {
      tier = (th[1] ?? th[2] ?? '').toUpperCase();
      continue;
    }
    // 役割の見出し（"Bear Hunt Joiner" 等）でカテゴリを切り替える
    if (line.length < 40 && /(bear|garrison|rally|conquest|arena)/i.test(line) && !/\d/.test(line)) {
      category = categoryFromContext(line);
      continue;
    }
    if (!tier) continue;
    if (line.length > 200) continue;
    for (const m of matchers) {
      if (!m.re.test(line)) continue;
      const list = lists.get(category) ?? { category, entries: [], source };
      if (!list.entries.some((e) => e.heroId === m.id)) list.entries.push({ heroId: m.id, tier });
      lists.set(category, list);
    }
  }
  return [...lists.values()].filter((l) => l.entries.length >= 3);
}

/** "10/10/80" "1-10-89" のような合計 100 の比率を、前後の文脈からイベント推定して取り出す */
export function mineRatioTemplates(lines: string[], source: SourceRef, pageTitle = ''): FormationTemplate[] {
  const out: FormationTemplate[] = [];
  const re = /\b(\d{1,2})\s*[/:-]\s*(\d{1,2})\s*[/:-]\s*(\d{1,2})\b/g;
  lines.forEach((line, i) => {
    for (const m of line.matchAll(re)) {
      const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (a + b + c !== 100) continue;
      const ctx = `${pageTitle} ${lines[i - 1] ?? ''} ${line}`;
      const event = eventFromContext(ctx);
      if (!event) continue;
      const ratio: TroopRatio = { infantry: a, cavalry: b, archer: c };
      const genM = ctx.match(/gen(?:eration)?\s*(\d)/i);
      const key = `${event}:${a}/${b}/${c}`;
      if (out.some((t) => `${t.event}:${t.ratio?.infantry}/${t.ratio?.cavalry}/${t.ratio?.archer}` === key)) continue;
      out.push({ event, heroIds: [], ratio, ...(genM ? { generation: Number(genM[1]) } : {}), label: `${a}/${b}/${c}`, source });
    }
  });
  return out;
}

/** "Amadeus-petra-rosa" "Amadeus, Petra, Rosa" のような 3 人組を取り出す */
export function mineHeroCombos(
  lines: string[],
  heroNames: Array<{ id: string; names: string[] }>,
  source: SourceRef,
  pageTitle = '',
): FormationTemplate[] {
  const out: FormationTemplate[] = [];
  const nameRe = heroNames.flatMap((h) => h.names).map(escapeRe).join('|');
  const re = new RegExp(`\\b(${nameRe})\\s*[-,+/&]\\s*(${nameRe})\\s*[-,+/&]\\s*(${nameRe})\\b`, 'gi');
  const idOf = (n: string) => heroNames.find((h) => h.names.some((x) => x.toLowerCase() === n.toLowerCase()))?.id;
  lines.forEach((line, i) => {
    for (const m of line.matchAll(re)) {
      const ids = [m[1], m[2], m[3]].map((n) => idOf(n!)).filter((x): x is string => !!x);
      if (new Set(ids).size !== 3) continue;
      const event = eventFromContext(`${pageTitle} ${lines[i - 1] ?? ''} ${line}`) ?? 'rally';
      if (out.some((t) => t.event === event && t.heroIds.join() === ids.join())) continue;
      out.push({ event, heroIds: ids, source });
    }
  });
  return out;
}

function eventFromContext(text: string): EventType | null {
  const t = text.toLowerCase();
  if (/bear/.test(t)) return 'bear';
  if (/garrison|defen[cs]e/.test(t)) return 'garrison';
  if (/arena/.test(t)) return 'arena';
  if (/conquest/.test(t)) return 'conquest';
  if (/rally/.test(t)) return 'rally';
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/* 公式 Wiki 日本語版: 英雄名・スキル名・ウィジェット名                  */
/* ------------------------------------------------------------------ */

export interface ParsedJaNames {
  heroName?: string;
  /** 英語版と同じ順番（討伐 → 遠征 → 特性 → ウィジェット） */
  skillNames: string[];
  widgetName?: string;
}

const JA_END = /(からのヒント|ゲームをプレイ|公式SNS|貢献者|Tips from|Play the Game|Our Socials|Contributors)/;
const isJaDesc = (l: string) => l.length > 12 && (/\d/.test(l) || /[。、]/.test(l));

/** 日本語版ページの行配列から名称だけを取り出す（数値は英語版を使う） */
export function parseOfficialJaNames(lines: string[]): ParsedJaNames {
  const out: ParsedJaNames = { skillNames: [] };
  const ri = lines.findIndex((l) => l === 'レアリティ');
  if (ri > 0) out.heroName = lines[ri - 1];
  const si = lines.findIndex((l, i) => l === 'スキル' && /^(討伐|遠征|特性)$/.test(lines[i + 1] ?? ''));
  if (si < 0) return out;
  let i = si + 1;
  while (/^(討伐|遠征|特性)$/.test(lines[i] ?? '')) i++;
  let inSpecial = false;
  for (; i < lines.length - 1; i++) {
    const l = lines[i]!;
    if (JA_END.test(l)) break;
    if (l === 'スペシャル') {
      inSpecial = true;
      continue;
    }
    const next = lines[i + 1]!;
    // ウィジェット名: スペシャル内で、直後が戦力値（数値だけの行）
    if (inSpecial && !out.widgetName && l.length <= 30 && /^[\d,]+$/.test(next.trim()) && !/^(攻撃|防御|HP|殺傷力|体力)/.test(l)) {
      out.widgetName = l;
      continue;
    }
    if (l.length <= 24 && !isJaDesc(l) && isJaDesc(next) && !/^(攻撃|防御|HP|殺傷力|体力|討伐|遠征|ステータス)$/.test(l)) {
      out.skillNames.push(l);
      i++;
    }
  }
  return out;
}
