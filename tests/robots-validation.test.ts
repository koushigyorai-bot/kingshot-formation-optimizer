import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowed, parseRobots } from '../src/lib/crawler/robots';
import { createDefaultUserData, validateUserData } from '../src/lib/validation/userData';
import { exportUserDataJson, importUserDataJson } from '../src/lib/repository';
import { LocalStorageUserDataRepository, MemoryStore, USER_DATA_KEY } from '../src/lib/repository/localStorage';

const UA = 'KingshotFormationOptimizer/0.1';

test('robots.txt: 最長一致・Allow 優先・ワイルドカード', () => {
  const rules = parseRobots(
    ['User-agent: *', 'Disallow: /wp-admin/', 'Allow: /wp-admin/admin-ajax.php', 'Disallow: /*?s=', 'Crawl-delay: 3', '', 'User-agent: BadBot', 'Disallow: /'].join('\n'),
    UA,
  );
  assert.equal(isAllowed(rules, '/heroes/'), true);
  assert.equal(isAllowed(rules, '/wp-admin/options.php'), false);
  assert.equal(isAllowed(rules, '/wp-admin/admin-ajax.php'), true);
  assert.equal(isAllowed(rules, '/search?s=amadeus'), false);
  assert.equal(rules.crawlDelaySec, 3);
});

test('robots.txt: 自分の UA 専用グループを優先', () => {
  const rules = parseRobots(['User-agent: *', 'Disallow:', '', 'User-agent: KingshotFormationOptimizer', 'Disallow: /private'].join('\n'), UA);
  assert.equal(isAllowed(rules, '/private/x'), false);
  assert.equal(isAllowed(rules, '/heroes'), true);
});

const ids = ['amadeus', 'gordon'];

test('エクスポート → インポートで内容が保たれる', () => {
  const d = createDefaultUserData(ids);
  d.heroes.amadeus!.owned = true;
  d.heroes.amadeus!.level = 61;
  d.heroes.amadeus!.gear[2] = { level: 120, mastery: 8 };
  d.troops.archer = { tier: 9, count: 123456 };
  const r = importUserDataJson(exportUserDataJson(d), ids);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.heroes.amadeus?.level, 61);
  assert.deepEqual(r.data.heroes.amadeus?.gear[2], { level: 120, mastery: 8 });
  assert.equal(r.data.troops.archer.count, 123456);
  assert.equal(r.warnings.length, 0);
});

test('範囲外の値は補正して警告、壊れた JSON はエラー', () => {
  const d = createDefaultUserData(ids) as unknown as Record<string, any>;
  d.heroes.amadeus.level = 999;
  d.heroes.amadeus.stars = -2;
  d.heroes.amadeus.gear = [5, 10]; // 旧形式（数値のみ）
  const r = validateUserData(d, ids);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.heroes.amadeus?.level, 80);
  assert.equal(r.data.heroes.amadeus?.stars, 0);
  assert.deepEqual(r.data.heroes.amadeus?.gear[1], { level: 10, mastery: 0 });
  assert.ok(r.warnings.some((w) => w.path === 'heroes.amadeus.level'));

  assert.equal(importUserDataJson('{not json', ids).ok, false);
  assert.equal(validateUserData({ version: 2, heroes: {}, troops: {} }, ids).ok, false);
});

test('LocalStorage repository（メモリ実装で検証）', async () => {
  const store = new MemoryStore();
  const repo = new LocalStorageUserDataRepository(store, () => ids);
  assert.equal(await repo.load(), null);
  const d = createDefaultUserData(ids);
  d.heroes.gordon!.owned = true;
  await repo.save(d);
  assert.ok(store.getItem(USER_DATA_KEY));
  assert.equal((await repo.load())?.heroes.gordon?.owned, true);
  store.setItem(USER_DATA_KEY, 'broken');
  assert.equal(await repo.load(), null, '壊れたデータは読み込まない');
  await repo.clear();
  assert.equal(store.getItem(USER_DATA_KEY), null);
});

test('旧形式（レベル・研磨値）の領主装備は 0 にして警告', () => {
  const d = createDefaultUserData(ids) as unknown as Record<string, any>;
  d.lordGear.slots = d.lordGear.slots.map((s: any) => ({ troop: s.troop, level: 50, polish: 20 }));
  const r = validateUserData(d, ids);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.data.lordGear.slots[0], { troop: 'cavalry', attack: 0, defense: 0, lethality: 0, health: 0 });
  assert.ok(r.warnings.some((w) => w.path === 'lordGear.slots'));
});
