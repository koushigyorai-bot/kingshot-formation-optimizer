/**
 * スキルの英語名 → 日本語名（英雄ごと）。
 *
 * 出典と照合方法
 * - 公式 Wiki 日本語版（kingshotwiki.com/ja/）: アマデウス・ゴードン・あまね
 * - アルテマ（altema.jp/kingshot/dai1sedai〜dai7sedai、chara/5・6・8・20・21）の
 *   スキル名と説明文（数値）を、英語版（kingshotoptimizer.com/heroes/）の説明文と 1 つずつ照らし合わせて対応付けた。
 *   並び順ではなく効果の内容と数値で照合している。
 *
 * 載せていないもの（アルテマ側の記載に誤りの疑いがあるため）
 * - ビビアンの討伐スキル 3 つ: 名前と説明がローザのものと同じになっている
 * - 龍飛とトリトンの専用装備・遠征スキル: 両方とも「虚実一対」になっていて、どちらかが誤り
 * - 龍飛「圧倒する力」は説明文がアルカのスキルと同じ文になっているが、
 *   名前の意味と並び順が英語版 Mountain Mover と一致するため対応付けた（説明文では照合できていない）
 *
 * 英語名は表記ゆれ（Rapid Fire / Rapidfire など）を吸収するため、英数字以外を除き小文字にして照合する。
 * この表に無いスキルは「データ更新」で公式 Wiki 日本語版から取得した名前が使われる（そちらが優先）。
 */
const TABLE: Record<string, Record<string, string>> = {
  // ── 公式 Wiki 日本語版 ──
  amadeus: {
    'Combo Slash': '三段斬り',
    'Arcane Swordship': '剣気',
    Onslaught: '快進撃',
    'Battle Ready': '臨戦態勢',
    'Way of the Blade': '剣術指導',
    'Unrighteous Strike': '不義の一撃',
    'Born Leader': '天性のリーダー',
    'Double Parry': '双剣防御',
    Discernment: '真実の術',
  },
  gordon: {
    'BBQ Feast': 'バーベキュー',
    'Culinary Chaos': '嵐の厨房',
    'Emergency Snack': '非常食',
    'Super Nutrients': '幸せグルメ',
    'Trash Talk': '暴言',
  },
  amane: {
    'Sakura Blossom': '桜花爛漫',
    'Fire Sigil': '破魔矢',
    'Divine Melody': '神楽',
    'Tri-Phalanx': '三布の陣',
    Exorcism: '破魔の祈り',
  },
  // ── アルテマ（内容で照合）──
  // エピック
  quinn: {
    Headshot: 'ヘッドショット',
    'Quick Shot': 'クイックショット',
    'Natural Selection': '適者生存',
    'Sixth Sense': '危険予知',
    'Precision Shot': '弱点射撃',
  },
  howard: {
    'Shielded Strike': '盾インパクト',
    'Joint Defense': '盾の壁',
    'Shield Block': '盾ブロック',
    "Defenders' Edge": 'プロテクト',
    Weaken: '弱体化打撃',
  },
  chenko: {
    'Burst Fire': '機関銃掃射',
    'Defense Upgrade': '防具改造',
    'Weapon Upgrade': '武器改造',
    'Stand of Arms': '完全武装',
    'Shield Wall': 'アーマー',
  },
  fahd: {
    Sandstorm: 'サンドストーム',
    'Eagle Wings': 'ハヤブサの導き',
    'Dune General': '砂の将軍',
    'Desert Eclipse': 'サンドシェード',
    Pathfinder: '先行者',
  },
  yeonwoo: {
    Petalbloom: '散華',
    'Falling Swallow': '飛燕',
    'Twin Fangs': '双剣',
    'On Guard': '戦の構え',
    'Well-Traveled': '多聞',
  },
  // 第1世代
  helga: {
    'Antler Assault': '鹿角猛進',
    'Spear Charge': '追撃攻勢',
    Fury: '怒狂',
    'Oath of Guardian': '守護者の誓い',
    'Echoes of Valhalla': '英霊の叫び',
    "Nature's Balance": '荒野の均衡',
    'Valiant Fury': '英霊の怒り',
    Zeal: '狂熱共鳴',
  },
  jabel: {
    'Gallant Throw': 'ランススパイク',
    'Brave the Storm': '真っ向勝負',
    Persistence: '執念',
    'Rally Flag': '赤き旗',
    "Hero's Domain": '勇姿',
    'Youthful Rage': '戦乙女',
    'Crimson Spirit': '紅の意志',
    'Divine Strength': '信頼',
  },
  saul: {
    'Rapid Fire': '連続射撃',
    'Final Prayer': '金剛不壊',
    'Superior Techniques': '工法改良',
    'Taskforce Training': '特派訓練',
    Resourceful: 'リサイクル',
    'Positional Battler': '陣地戦の強者',
    'Positional Batter': '陣地戦の強者', // kingshot.wiki の表記
    'Fearless Advance': '義理尽',
    'Defend to Attack': '攻撃は最大の防御',
  },
  // 第2世代
  zoe: {
    'Shield Strike': 'ソードシールドアサルト',
    'Agony Rush': 'ペインエキサイトメント',
    'Holy Might': 'ゴッドパワー',
    'Sundering Wound': 'リッジワウンド',
    Charisma: '感情支配',
    'Infinite Arsenal': '無限テクニック',
    'Death Or Glory': 'デスファイト',
    'Dark Lady': '不義のプリンセス',
  },
  hilde: {
    'Rejuvenating Plea': '治療祈祷',
    Redeemer: '贖罪',
    Intimidation: '教化',
    'Noble Path': '苦行',
    'Elixir of Strength': 'ポーション注入',
    'Trial by Fire': '意志の試練',
    'Holy Invocation': '聖なる祈祷',
    Fortitude: 'タフネス',
  },
  marlin: {
    'Tidal Rush': 'バックウォッシュ',
    'Fermented Blow': 'ドランカーミスト',
    'Lucky Hit': 'ラッキーショット',
    'Wild Card': '予測不能',
    Rumhead: 'ラム酒',
    Dynamo: '強化ガンパウダー',
    'Servant of Wine': '酒飲み',
    'Admiral of the Line': '無敵艦隊',
  },
  // 第3世代
  eric: {
    'Ground Shock': 'ハンマー・スウィング',
    Veterancy: 'バトル・ボディ',
    'Hammer of Justice': 'ヘビースマッシュ',
    'Holy Warrior': '浄化',
    Conviction: '意志',
    Exhortation: '鼓舞',
    'Blessed Hammer': 'ハンマー・ブレス',
    Vanguard: 'ハンマー・ディフェンス',
  },
  petra: {
    Dichotomy: 'ジャッジカード',
    'Change of Fate': '無情な運命',
    'Turn Card': 'サプライズカード',
    'Evil Eye': 'ドゥーム',
    'The Favor': 'ラッキーカード',
    'The Shield': 'ガーディアンカード',
    'Weighted Deck': 'シャッフルマジック',
    'Cosmic Eye': '運命の計画',
  },
  jaeger: {
    'Fatal Attraction': 'デスアトラクト',
    'Game of Chance': '不器用な演技',
    Rumormonger: 'シークレット・ストーリー',
    'The Tempest': 'ストームソング',
    'The Resistance': 'コンフリクトソング',
    'The Celebration': 'フェスティバルソング',
    'Sound of Silence': 'サイレント・シレンス',
    'Hymn to Survival': '賛美歌',
  },
  // 第4世代
  alcar: {
    'Glorious Mark': 'グローリー・モーメント',
    Boneshatter: 'スプリット・ランス',
    'Second Wind': 'リバイバル・スピリット',
    'Rescuing Hands': 'アシスト・アリー',
    'Praetorian Will': 'チャンピオン・ウィル',
    'Carpe Diem': 'チャンス・オブ・フューリー',
    Flagbearer: '不屈の信念',
    'Vow of Honor': 'グローリー・オース',
  },
  margot: {
    Ambush: 'トリックアタック',
    Parry: 'トリックスルー',
    Stiletto: 'クラッシュストライク',
    Warbringer: 'デストロイ',
    Subterfuge: 'タクティクス',
    'Sleight Hand': 'トリックテクニック',
    Indefensible: 'アンブッシュ',
    Pugilist: 'デスマッチ',
  },
  rosa: {
    'Battle Focus': 'センター・アテンション',
    Flutterfang: 'ファン・ダンス',
    'Swoon Chakra': 'マインド・シャッター',
    'Chaos Gambit': 'ノイズ・タイム',
    'Rose of War': 'チャーム・ダンス',
    'Golden Rhythm': 'ゴールデン・リズム',
    'Night Reverie': 'オールナイト・フェスタ',
    Perihelion: 'インスパイア・ダンス',
  },
  // 第5世代
  'long-fei': {
    Ambrosia: '聖なる玉湯',
    'Above And Beyond': '雲散霧消',
    'Mountain Mover': '圧倒する力',
    'Mighty Paragon': '天昇豪胆',
    'Celestial Sustenance': '剛筋頑健',
    'Art of War': '杯投烈脚',
    'Strong Brew': '呑下三百杯',
  },
  thrud: {
    'Axe Flurry': 'ストームアックス',
    'Brutal Throw': 'バーサカースロー',
    'Feast of the Pack': 'ウルフバンケット',
    'Battle Hunger': 'ファナティック',
    'Reckless Charge': 'レックレス',
    'Ancestral Guidance': 'アンセスター',
    "Berserker's Edge": 'レイジアックス',
    'Wolf-Kissed': 'ウルフキッス',
  },
  vivian: {
    'Crouching Tiger': 'アウェイティング',
    'Focus Fire': 'バラージショット',
    'Trap of Greed': 'グリードトラップ',
    'Refined Gunplay': 'ロイヤルシューター',
    'Money Driven': 'フルバウンティ',
  },
  // 第6世代
  triton: {
    Tidewill: '潮汐の意思',
    'Regal Wrath': '諸王の怒り',
    'Striking Hit': '必殺の一撃',
    'Command of Power': '律令の力',
    'Warfare of Power': '戦争の力',
    'Oath of Power': '誓約の力',
    'Magnetic Reformation': 'クリスタル改造',
  },
  sophia: {
    'Puppet Master': 'マリオネット',
    'Scalding Mark': 'ペイン・マーク',
    'Scalding Mark - Lash': 'マーク・ウィップ',
    'Arcane Pact': 'コントラクト・バインド',
    'Terror - Deathblow': 'パニック・ダメージ',
    'Terror - Annihilation': 'パニック・ジエンド',
    'Eyes of Obedience': 'オーバーマインド・アイ',
    'Queen of Night': 'ダークナイトクイーン',
  },
  yang: {
    'Kin Throw': 'メガスロー',
    Combo: 'チェーンショット',
    Deadshot: 'ヘッドショット',
    Avalanche: 'アバランチ',
    'Ice Zone': 'アイスゾーン',
    Ambush: 'アンブッシュ',
    'Quick Draw': 'ラピッドファイア',
    'Offensive Defense': 'アタックディフェンス',
  },
  // 第7世代
  charles: {
    Vengeance: 'リベンジャー',
    'Parting Gift': 'フェアウェル',
    'Nimble Soul': 'ケアフリー',
    Mechanic: '修理の達人',
    Intimidation: 'パンツァーオーラ',
    'Iron Bodies': '鋼鉄の身体',
    'Great Justice': '愛と正義',
    'Shock and Awe': '華麗なる登場',
  },
  ava: {
    'Color Bomb': 'ボマーペイント',
    'Corruption Bomb': 'スポイルペイント',
    'Disguise Pigment': 'フェイクペイント',
    Dissolution: 'アナライズ',
    Chiaroscuro: 'ライト&シャドウ',
    'Light and Cold': 'クール&ホット',
    Irradiance: 'カラーセンス',
    'Color Storm': 'クロマストーム',
  },
  'wee-woo': {
    'High Ground': 'スカイハイショット',
    Incendiaries: '特製ナパーム弾',
    'Frontal Support': 'キャノンボウラー',
    Artillerymen: '砲兵隊',
    'Chain Shelling': '連続砲撃',
    'Boom Boom': 'ヘビィキャノン出撃',
    'Zero Sympathy': 'クールな砲撃手',
    Landmines: '秘密の火薬樽',
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const INDEX: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(TABLE).map(([hero, m]) => [hero, Object.fromEntries(Object.entries(m).map(([en, ja]) => [norm(en), ja]))]),
);

/** 英雄 ID とスキルの英語名から日本語名を引く。見つからなければ undefined */
export function skillNameJa(heroId: string, enName: string): string | undefined {
  return INDEX[heroId]?.[norm(enName)];
}

/** テスト・確認用: 登録されている件数 */
export function skillNameJaCount(): number {
  return Object.values(TABLE).reduce((n, m) => n + Object.keys(m).length, 0);
}
