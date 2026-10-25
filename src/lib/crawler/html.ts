import * as cheerio from 'cheerio';

/**
 * HTML をブロック単位の行配列にする。
 * サイトの CSS クラス名に依存しないよう、パーサーは「行の並び」だけを見る。
 */
const BLOCK = 'p,div,section,article,header,footer,aside,main,nav,li,ul,ol,tr,td,th,table,h1,h2,h3,h4,h5,h6,dt,dd,figure,figcaption,blockquote,pre';

export interface HtmlToLinesOptions {
  /** <strong>/<b> を独立した行にする（kingshot.wiki のスキル名用） */
  splitStrong?: boolean;
}

export function htmlToLines(html: string, opts: HtmlToLinesOptions = {}): string[] {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,iframe,template').remove();
  $('br').replaceWith('\n');
  if (opts.splitStrong) $('strong,b').each((_, el) => void $(el).replaceWith(`\n${$(el).text()}\n`));
  $(BLOCK).each((_, el) => {
    $(el).prepend('\n');
    $(el).append('\n');
  });
  return $('body')
    .text()
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

export interface LinkInfo {
  href: string;
  text: string;
  /** 直前に出現した id="generation-N…" の N（公式 Wiki の世代セクション） */
  generationSection?: number;
  /** 直前の兵種アイコン（soldier_icon_type_00N） */
  troopIcon?: 'infantry' | 'cavalry' | 'archer';
}

/** 文書順にリンクを集め、所属セクションと直前の兵種アイコンを添える */
export function collectLinks(html: string, baseUrl: string, filter: (href: string) => boolean): LinkInfo[] {
  const $ = cheerio.load(html);
  const out: LinkInfo[] = [];
  let gen: number | undefined;
  let troop: LinkInfo['troopIcon'];
  $('*').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('id') ?? '';
    const gm = id.match(/generation-(\d+)/i);
    if (gm) gen = Number(gm[1]);
    if (/^(rare|epic)(-en)?$/i.test(id)) gen = undefined;
    const src = $el.attr('src') ?? '';
    const tm = src.match(/soldier_icon_type_00(\d)/);
    if (tm) troop = tm[1] === '1' ? 'infantry' : tm[1] === '2' ? 'cavalry' : tm[1] === '3' ? 'archer' : undefined;
    if ($el.is('a')) {
      const href = $el.attr('href');
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (!href || !text) return;
      let abs: string;
      try {
        abs = new URL(href, baseUrl).toString();
      } catch {
        return;
      }
      if (!filter(abs)) return;
      out.push({ href: abs, text, ...(gen !== undefined ? { generationSection: gen } : {}), ...(troop ? { troopIcon: troop } : {}) });
    }
  });
  return out;
}

/** kingshot.wiki のスキル行（"Conquest" + <strong>名前</strong> + 説明）を取り出す */
export function collectLabeledStrongRows(html: string): Array<{ label: string; name: string; desc: string }> {
  const $ = cheerio.load(html);
  const rows: Array<{ label: string; name: string; desc: string }> = [];
  $('strong,b').each((_, el) => {
    const $s = $(el);
    const parent = $s.parent();
    const full = parent.text().replace(/\s+/g, ' ').trim();
    const name = $s.text().replace(/\s+/g, ' ').trim();
    const at = full.indexOf(name);
    if (at < 0) return;
    const label = full.slice(0, at).trim();
    const desc = full.slice(at + name.length).trim();
    if (/^(Conquest|Expedition|Special|Talent|Widget)$/i.test(label) && desc.length > 10) rows.push({ label, name, desc });
  });
  return rows;
}
