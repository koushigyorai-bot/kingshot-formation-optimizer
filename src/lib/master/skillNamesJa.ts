/**
 * スキルの英語名 → 日本語名。
 *
 * - 公式 Wiki 日本語版で確認: アマデウス・ゴードン・あまね
 * - アルテマの世代別英雄ページの名称を、スキルの内容と照合して対応付け: ペーラ・ゾーイ・アルカ
 *   （アルテマはスキルの並び順が英語版と違う英雄があるため、順番では対応付けていない）
 *
 * それ以外の英雄は「データ更新」で公式 Wiki 日本語版から自動で取得する。
 * この表はデータ更新の結果にも適用されるので、日本語版ページが取れなかった場合の補完にもなる。
 */
export const SKILL_JA: Record<string, string> = {
  // アマデウス（公式 Wiki 日本語版）
  'Combo Slash': '三段斬り',
  'Arcane Swordship': '剣気',
  Onslaught: '快進撃',
  'Battle Ready': '臨戦態勢',
  'Way of the Blade': '剣術指導',
  'Unrighteous Strike': '不義の一撃',
  'Born Leader': '天性のリーダー',
  'Double Parry': '双剣防御',
  Discernment: '真実の術',
  // ゴードン（公式 Wiki 日本語版）
  'BBQ Feast': 'バーベキュー',
  'Culinary Chaos': '嵐の厨房',
  'Emergency Snack': '非常食',
  'Super Nutrients': '幸せグルメ',
  'Trash Talk': '暴言',
  // あまね（公式 Wiki 日本語版）
  'Sakura Blossom': '桜花爛漫',
  'Fire Sigil': '破魔矢',
  'Divine Melody': '神楽',
  'Tri-Phalanx': '三布の陣',
  Exorcism: '破魔の祈り',
  // ペーラ（アルテマ「第3世代」、内容で照合）
  Dichotomy: 'ジャッジカード',
  'Change of Fate': '無情な運命',
  'Turn Card': 'サプライズカード',
  'Evil Eye': 'ドゥーム',
  'The Favor': 'ラッキーカード',
  'The Shield': 'ガーディアンカード',
  'Weighted Deck': 'シャッフルマジック',
  'Cosmic Eye': '運命の計画',
  // ゾーイ（アルテマ「第2世代」、内容で照合）
  'Shield Strike': 'ソードシールドアサルト',
  'Agony Rush': 'ペインエキサイトメント',
  'Holy Might': 'ゴッドパワー',
  // アルカ（アルテマ「第4世代」、内容で照合）
  Boneshatter: 'スプリット・ランス',
  'Glorious Mark': 'グローリー・モーメント',
  'Second Wind': 'リバイバル・スピリット',
};
