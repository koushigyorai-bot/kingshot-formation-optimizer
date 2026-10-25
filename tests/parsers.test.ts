import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectValueAt, extractSeries, parseNumber, parseSkillDescription } from '../src/lib/crawler/parseSkill';
import {
  mineHeroCombos,
  mineRatioTemplates,
  mineTierLists,
  parseFanHeroLines,
  parseFanSkillRows,
  parseOfficialHeroLines,
  parseToolsHeroCard,
} from '../src/lib/crawler/parsers';
import { FAN_HOWARD_LINES, OFFICIAL_AMADEUS_LINES, OFFICIAL_GORDON_LINES } from './fixtures/officialGordon';
import type { SourceRef } from '../src/lib/types';

const src: SourceRef = { site: 'kingshot.wiki', reliability: 'community' };

test('数値列の抽出（表記揺れを含む）', () => {
  assert.deepEqual(extractSeries('by 5%/10%/15%/20%/25%.'), [[5, 10, 15, 20, 25]]);
  assert.deepEqual(extractSeries('by /10%/15%/20%/25%/30%.'), [[10, 15, 20, 25, 30]]);
  assert.deepEqual(extractSeries('by 3%/6%/9%/12% / 15%.'), [[3, 6, 9, 12, 15]]);
  assert.deepEqual(extractSeries('by 5%/7.5%/10%/12.5%/15%'), [[5, 7.5, 10, 12.5, 15]]);
  assert.equal(parseNumber('+62.50%'), 62.5);
  assert.equal(parseNumber('1,776'), 1776);
});

test('スキル効果の分類', () => {
  const leth = parseSkillDescription("increasing the total Squads' Lethality by 5%/10%/15%/20%/25%.");
  assert.equal(leth[0]?.stat, 'lethality');
  assert.equal(effectValueAt(leth[0]!, 5), 25);
  assert.equal(effectValueAt(leth[0]!, 0), 0, '未解放は 0');

  const chance = parseSkillDescription('has a 8%/16%/24%/32%/40% chance of increasing damage dealt by 50% for all squads.');
  assert.equal(chance[0]?.stat, 'damageUp');
  assert.equal(effectValueAt(chance[0]!, 5), 20, '期待値 = 40% × 50% = 20%');

  const weaken = parseSkillDescription("reduces the total Enemy Squads' Attack by 4%/8%/12%/16%/20%.");
  assert.deepEqual(weaken.map((e) => e.stat), ['enemyAttackDown'], '敵の攻撃低下を味方の攻撃と誤認しない');

  const both = parseSkillDescription('boosting Lethality and Health for all deployed soldiers by 3%/6%/9%/12% / 15%.');
  assert.deepEqual(both.map((e) => e.stat).sort(), ['lethality', 'squadHealth']);

  const archer = parseSkillDescription('Increases Archer Attack by 10%/15%/20%/25%/30%.');
  assert.equal(archer[0]?.troop, 'archer');

  const selfDtd = parseSkillDescription("Gordon's life in a chaotic kitchen reduces his damage taken by /10%/15%/20%/25%/30%.");
  assert.equal(selfDtd[0]?.scope, 'self');
  const squadDtd = parseSkillDescription('reducing damage taken by 4%/8%/12%/16%/20% for all troops.');
  assert.equal(squadDtd[0]?.scope, 'squad');
});

test('公式 Wiki: Epic 英雄（Gordon）', () => {
  const p = parseOfficialHeroLines(OFFICIAL_GORDON_LINES);
  assert.equal(p.name, 'Gordon');
  assert.equal(p.rarity, 'epic');
  assert.equal(p.troop, 'cavalry');
  assert.deepEqual(p.conquest, { attack: 1776, defense: 2220, health: 17760 });
  assert.deepEqual(p.expedition, { attack: 140.11, defense: 140.11 });
  assert.equal(p.skills.length, 5);
  assert.deepEqual(p.skills.map((s) => s.kind), ['conquest', 'conquest', 'conquest', 'expedition', 'expedition']);
  assert.equal(p.skills[3]?.name, 'Super Nutrients');
  assert.equal(p.warnings.length, 0, p.warnings.join(','));
});

test('公式 Wiki: レジェンド英雄（Amadeus）とウィジェット', () => {
  const p = parseOfficialHeroLines(OFFICIAL_AMADEUS_LINES);
  assert.equal(p.rarity, 'legendary');
  assert.deepEqual(p.conquest, { attack: 2128, defense: 2220, health: 41624 });
  assert.equal(p.expedition?.attack, 260.2);
  const kinds = p.skills.map((s) => s.kind);
  assert.deepEqual(kinds, ['conquest', 'conquest', 'conquest', 'expedition', 'expedition', 'expedition', 'talent', 'widget_conquest', 'widget_expedition']);
  assert.equal(p.widget?.name, 'Aegis of Fate');
  assert.deepEqual(p.widget?.expedition, { lethality: 62.5, health: 62.5 });
  assert.deepEqual(p.widget?.conquest, { attack: 431, defense: 562, health: 8437 });
  assert.equal(p.skills.find((s) => s.name === 'Discernment')?.effects[0]?.stat, 'rallyAttack');
});

test('公式 Wiki: 構造が崩れたページは警告を返す', () => {
  const p = parseOfficialHeroLines(['Something', 'else']);
  assert.ok(p.warnings.length >= 2);
  assert.equal(p.conquest, undefined);
});

test('ファンサイト: ステータスとスキル行', () => {
  const p = parseFanHeroLines(FAN_HOWARD_LINES);
  assert.equal(p.rarity, 'epic');
  assert.equal(p.troop, 'infantry');
  assert.equal(p.name, 'Howard');
  assert.deepEqual(p.conquest, { attack: 1361, defense: 2220, health: 26640 });
  const skills = parseFanSkillRows([
    { label: 'Conquest', name: 'Shield Block', desc: 'reducing damage taken by 10%/15%/20%/25%/30%.' },
    { label: 'Expedition', name: "Defenders' Edge", desc: 'reducing damage taken by 4%/8%/12%/16%/20% for all troops.' },
    { label: 'Special', name: 'Born Leader', desc: 'boosting Lethality and Health for all deployed soldiers by 3%/6%/9%/12% / 15%.' },
    { label: 'Expedition', name: "Defenders' Edge", desc: 'duplicate' },
  ]);
  assert.deepEqual(skills.map((s) => s.kind), ['conquest', 'expedition', 'talent']);
});

test('KingshotTools の英雄カード', () => {
  const c = parseToolsHeroCard('Petra Petra mythicGen 3Roulette The absolute best F2P investment in Gen 3. cavalry Ultimate F2P Carry');
  assert.deepEqual(c, { name: 'Petra', rarity: 'legendary', generation: 3, troop: 'cavalry' });
  const e = parseToolsHeroCard('Howard Howard epicBase A defensive fortress commander. infantry Garrison & Shield');
  assert.equal(e?.generation, null);
  assert.equal(e?.rarity, 'epic');
});

test('比率・3 人組・ティアの抽出', () => {
  const lines = ['Troop ratios (infantry-lancer-archer)', 'Opening rallies for Bear: 10-10-80.', 'Joining rallies: 20-30-50.', 'not a ratio 10/10/10', 'Amadeus-petra-rosa'];
  const t = mineRatioTemplates(lines, src, 'Bear Hunt');
  assert.deepEqual(t.map((x) => x.label), ['10/10/80', '20/30/50']);
  assert.ok(t.every((x) => x.event === 'bear'));

  const names = [
    { id: 'amadeus', names: ['Amadeus'] },
    { id: 'petra', names: ['Petra'] },
    { id: 'rosa', names: ['Rosa'] },
    { id: 'zoe', names: ['Zoe'] },
  ];
  const combos = mineHeroCombos(lines, names, src, 'Bear Hunt');
  assert.deepEqual(combos[0]?.heroIds, ['amadeus', 'petra', 'rosa']);

  const tiers = mineTierLists(['S tier', 'Amadeus is great', 'Petra', 'A tier', 'Zoe', 'Rosa'], names, src, 'Bear Hunt tier list');
  assert.equal(tiers[0]?.category, 'bear');
  assert.deepEqual(
    tiers[0]?.entries.map((e) => `${e.heroId}:${e.tier}`),
    ['amadeus:S', 'petra:S', 'zoe:A', 'rosa:A'],
  );
});
