import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroById, mergeMasterData, seedMasterData, type CrawlSnapshot } from '../src/lib/master';
import { createDefaultUserData } from '../src/lib/validation/userData';
import {
  collectSkills,
  counterFactor,
  geneticSearch,
  optimize,
  precomputeExpedition,
  scoreExpedition,
  troopsSent,
  countCombinations,
} from '../src/lib/calculator';
import type { UserData } from '../src/lib/types';

const master = seedMasterData();
const H = heroById(master);

function account(owned: string[], tweak?: (u: UserData) => void): UserData {
  const u = createDefaultUserData(master.heroes.map((h) => h.id));
  for (const id of owned) {
    const o = u.heroes[id]!;
    o.owned = true;
    o.level = 50;
    o.stars = 2;
    o.expeditionSkills = [3, 3, 3];
    o.conquestSkills = [3, 3, 3];
  }
  u.troops.infantry = { level: 6, truegold: 0, count: 0 };
  u.troops.cavalry = { level: 6, truegold: 0, count: 0 };
  u.troops.archer = { level: 6, truegold: 0, count: 0 };
  u.settings.marchCapacity = 100_000;
  tweak?.(u);
  return u;
}

test('シードの英雄一覧は公式 Wiki の 37 人（Gen1〜8 + Epic + Rare）', () => {
  assert.equal(master.heroes.length, 37);
  assert.equal(master.heroes.filter((h) => h.generation === 8).length, 3);
  assert.equal(H.get('amadeus')?.dataStatus, 'verified');
  assert.equal(H.get('chenko')?.troop, 'cavalry');
  assert.equal(H.get('amane')?.troop, 'archer');
});

test('スキルレベルが上がるとスコアが上がる', () => {
  const f = ['amadeus', 'chenko', 'saul'].map((id) => H.get(id)!);
  const ratio = { infantry: 10, cavalry: 10, archer: 80 };
  const lo = account(['amadeus', 'chenko', 'saul']);
  const hi = account(['amadeus', 'chenko', 'saul'], (u) => (u.heroes.chenko!.expeditionSkills = [5, 5, 5]));
  const sLo = scoreExpedition(precomputeExpedition(f, lo, 'bear', 'leader', { infantry: 100, cavalry: 0, archer: 0 }, H), ratio, lo).total;
  const sHi = scoreExpedition(precomputeExpedition(f, hi, 'bear', 'leader', { infantry: 100, cavalry: 0, archer: 0 }, H), ratio, hi).total;
  assert.ok(sHi > sLo);
});

test('ジョイナーは先頭英雄の 1 番目の Expedition スキルだけ', () => {
  const u = account(['amadeus', 'gordon', 'chenko']);
  const t = collectSkills([H.get('amadeus')!, H.get('gordon')!], u, 'expedition', 'joiner', H);
  const stats = t.contributions.map((c) => `${c.heroId}:${c.skill}`);
  assert.deepEqual(stats, ['amadeus:Battle Ready']);
});

test('タレントは編成外でも所持していれば有効（星の数をレベルとみなす）', () => {
  const u = account(['amadeus', 'gordon'], (x) => (x.heroes.amadeus!.stars = 4));
  const t = collectSkills([H.get('gordon')!], u, 'expedition', 'leader', H);
  assert.ok(t.contributions.some((c) => c.skill === 'Born Leader' && c.value === 12));
});

test('兵種相性: 熊は弓兵 +10%、対人は相性の向きどおり', () => {
  assert.equal(counterFactor('archer', { infantry: 100, cavalry: 0, archer: 0 }, 'bear'), 1.1);
  assert.equal(counterFactor('infantry', { infantry: 100, cavalry: 0, archer: 0 }, 'bear'), 1);
  assert.ok(counterFactor('infantry', { infantry: 0, cavalry: 100, archer: 0 }, 'rally') > 1, '歩兵 > 騎兵');
  assert.ok(counterFactor('infantry', { infantry: 0, cavalry: 0, archer: 100 }, 'rally') < 1, '弓兵 > 歩兵');
});

test('在庫が足りない兵種は在庫で頭打ち', () => {
  const u = account([], (x) => {
    x.troops.infantry.count = 5_000;
    x.troops.cavalry.count = 50_000;
    x.troops.archer.count = 200_000;
  });
  const sent = troopsSent({ infantry: 20, cavalry: 10, archer: 70 }, u);
  assert.equal(sent.infantry, 5_000);
  assert.equal(sent.archer, 70_000);
});

test('熊狩り: 比率最適化は弓兵寄りになり、在庫制約を守る', () => {
  const u = account(['amadeus', 'chenko', 'saul'], (x) => {
    x.troops.infantry.count = 100_000;
    x.troops.cavalry.count = 100_000;
    x.troops.archer.count = 100_000;
    x.settings.serverGeneration = 3;
  });
  const r = optimize(H, u, { event: 'bear', role: 'leader', topN: 1 });
  const best = r.results[0]!;
  assert.ok(best.ratio.archer >= best.ratio.cavalry && best.ratio.archer >= best.ratio.infantry);
  assert.equal(best.ratio.infantry + best.ratio.cavalry + best.ratio.archer, 100);
});

test('兵種ごと 1 人の制約: 全結果が歩・騎・弓を 1 人ずつ含む', () => {
  const owned = ['amadeus', 'helga', 'howard', 'jabel', 'gordon', 'chenko', 'saul', 'quinn'];
  const r = optimize(H, account(owned), { event: 'rally', topN: 5 });
  assert.equal(r.searched, 3 * 3 * 2);
  for (const res of r.results) {
    const troops = res.heroIds.map((id) => H.get(id)!.troop).sort();
    assert.deepEqual(troops, ['archer', 'cavalry', 'infantry']);
  }
});

test('制約なしの全探索は C(n,3) 通り', () => {
  const owned = ['amadeus', 'helga', 'howard', 'jabel', 'gordon', 'chenko', 'saul'];
  const r = optimize(H, account(owned), { event: 'rally', oneHeroPerTroop: false, topN: 3 });
  assert.equal(r.searched, countCombinations(7, 3));
  assert.equal(r.method, 'exhaustive');
});

test('遺伝的アルゴリズムは小さな問題で全探索と同じ最適解に到達する', () => {
  const owned = ['amadeus', 'helga', 'howard', 'jabel', 'gordon', 'chenko', 'saul', 'quinn', 'amane', 'yeonwoo'];
  const u = account(owned);
  const pool = owned.map((id) => H.get(id)!);
  const fitness = (f: typeof pool) =>
    scoreExpedition(precomputeExpedition(f, u, 'rally', 'leader', { infantry: 60, cavalry: 20, archer: 20 }, H), { infantry: 50, cavalry: 20, archer: 30 }, u).total;
  const ga = geneticSearch(pool, 3, fitness, { generations: 60 });
  const ex = optimize(H, u, { event: 'rally', oneHeroPerTroop: false, optimizeRatio: false, topN: 1, exhaustiveLimit: 1e9 });
  assert.deepEqual([...ga[0]!.f.map((h) => h.id)].sort(), [...ex.results[0]!.heroIds].sort());
});

test('アリーナは 5 人・前衛に歩兵を優先', () => {
  const owned = ['amadeus', 'helga', 'howard', 'forrest', 'jabel', 'gordon', 'chenko', 'saul', 'quinn'];
  const r = optimize(H, account(owned), { event: 'arena', topN: 3 });
  const best = r.results[0]!;
  assert.equal(best.heroIds.length, 5);
  assert.deepEqual(best.heroIds.slice(0, 2).map((id) => H.get(id)!.troop), ['infantry', 'infantry']);
});

test('所持英雄ゼロなら警告のみ', () => {
  const r = optimize(H, account([]), { event: 'rally' });
  assert.equal(r.results.length, 0);
  assert.ok(r.warnings[0]?.includes('所持英雄'));
});

test('マージ: 公式値が推定値を上書きし、食い違いを記録、要注意サイトは無視', () => {
  const snap: CrawlSnapshot = {
    crawledAt: '2026-10-25T03:00:00Z',
    tierLists: [],
    templates: [],
    siteReports: [],
    heroPatches: [
      { heroId: 'petra', conquest: { attack: 2700, defense: 3330, health: 30000 }, expedition: { attack: 290.1, defense: 290.1 }, source: { site: 'kingshot.wiki', reliability: 'community' } },
      { heroId: 'petra', expedition: { attack: 291.5, defense: 291.5 }, source: { site: 'kingshotwiki.com', reliability: 'official' } },
      { heroId: 'gordon', conquest: { attack: 9999, defense: 1, health: 1 }, source: { site: 'kingshot.wiki', reliability: 'community' } },
      { heroId: 'gordon', conquest: { attack: 1, defense: 1, health: 1 }, source: { site: 'kingshottools.pro', reliability: 'community', flag: 'discriminatory' } },
      {
        heroId: 'newhero',
        name: 'Newhero',
        rarity: 'legendary',
        troop: 'archer',
        generation: 9,
        expedition: { attack: 900, defense: 900 },
        source: { site: 'kingshotwiki.com', reliability: 'official' },
      },
    ],
  };
  const m = mergeMasterData(master, snap);
  const petra = m.heroes.find((h) => h.id === 'petra')!;
  assert.equal(petra.expedition.attack, 291.5, '公式が優先');
  assert.equal(petra.conquest.attack, 2700, '推定値はコミュニティ値で上書き');
  assert.ok(!petra.estimatedFields?.includes('expedition'));
  const gordon = m.heroes.find((h) => h.id === 'gordon')!;
  assert.equal(gordon.conquest.attack, 1776, '公式シード値はファンサイト値に負けない');
  assert.ok(m.conflicts.some((c) => c.heroId === 'gordon' && c.field === 'conquest' && c.adopted === 'kingshotwiki.com'));
  assert.ok(!gordon.sources.some((s) => s.flag === 'discriminatory'));
  const nh = m.heroes.find((h) => h.id === 'newhero');
  assert.equal(nh?.generation, 9);
  assert.equal(nh?.expedition.attack, 900);
});

test('領主装備: 対応兵種にだけ % が加算され、初期の兵種は 騎・騎・歩・歩・弓・弓', async () => {
  const { troopStatBonus } = await import('../src/lib/calculator');
  const u = account([]);
  assert.deepEqual(u.lordGear.slots.map((s) => s.troop), ['cavalry', 'cavalry', 'infantry', 'infantry', 'archer', 'archer']);
  u.lordGear.slots[0] = { troop: 'cavalry', attack: 10, defense: 2, lethality: 5, health: 1 };
  u.lordGear.slots[1] = { troop: 'cavalry', attack: 2.5, defense: 0, lethality: 0, health: 0 };
  u.lordGear.slots[4] = { troop: 'archer', attack: 0, defense: 0, lethality: 7, health: 0 };
  assert.deepEqual(troopStatBonus(u, 'cavalry'), { attack: 12.5, defense: 2, lethality: 5, health: 1 });
  assert.deepEqual(troopStatBonus(u, 'archer'), { attack: 0, defense: 0, lethality: 7, health: 0 });
  assert.deepEqual(troopStatBonus(u, 'infantry'), { attack: 0, defense: 0, lethality: 0, health: 0 });
});

test('英雄装備: ランク別の効果量（kingshotoptimizer.com の表）と部隊への加算', async () => {
  const { heroGearSlotValue, heroGearTroopBonus } = await import('../src/lib/calculator/heroGear');
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  close(heroGearSlotValue({ rank: 'legendary', level: 0, mastery: 0 }, 0), 15);
  close(heroGearSlotValue({ rank: 'legendary', level: 100, mastery: 0 }, 0), 50);
  close(heroGearSlotValue({ rank: 'epic', level: 80, mastery: 0 }, 0), 25.8);
  close(heroGearSlotValue({ rank: 'epic', level: 50, mastery: 10 }, 5), 19.5, ); // エピックは精錬鍛造が効かない
  close(heroGearSlotValue({ rank: 'none', level: 50, mastery: 0 }, 5), 0);
  const u = account(['chenko', 'amadeus', 'saul']);
  const o = u.heroes.chenko!;
  o.gear = [
    { rank: 'legendary', level: 100, mastery: 0 }, // 頭 = 殺傷力
    { rank: 'legendary', level: 100, mastery: 0 }, // 手 = HP
    { rank: 'epic', level: 0, mastery: 0 }, // 胴 = HP
    { rank: 'none', level: 0, mastery: 0 }, // 足
  ];
  const b = heroGearTroopBonus(o, 5);
  close(b.lethality, 50);
  close(b.health, 59);
  // 装備を付けると騎兵の与ダメージが上がる
  const f = ['amadeus', 'chenko', 'saul'].map((id) => H.get(id)!);
  const ratio = { infantry: 10, cavalry: 30, archer: 60 };
  const without = account(['chenko', 'amadeus', 'saul']);
  const s0 = scoreExpedition(precomputeExpedition(f, without, 'bear', 'leader', { infantry: 100, cavalry: 0, archer: 0 }, H), ratio, without);
  const s1 = scoreExpedition(precomputeExpedition(f, u, 'bear', 'leader', { infantry: 100, cavalry: 0, archer: 0 }, H), ratio, u);
  assert.ok(s1.perTroop!.cavalry > s0.perTroop!.cavalry);
  close(s1.perTroop!.archer, s0.perTroop!.archer);
});

test('兵士: 黄金レベルはレベル 10 の兵だけを強化する', async () => {
  const { troopBase } = await import('../src/lib/calculator');
  assert.equal(troopBase('archer', 6).attack, 974);
  assert.ok(troopBase('archer', 10, 3).attack > troopBase('archer', 10, 0).attack);
  assert.equal(troopBase('archer', 9, 3).attack, troopBase('archer', 9, 0).attack);
});
