/**
 * robots.txt の最小実装。
 * User-agent: * と本ツールの UA に当てはまるグループの Allow / Disallow を見て、
 * 最長一致のルールで可否を決める（Google の解釈に準拠）。Crawl-delay も読む。
 */
export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelaySec?: number;
}

export function parseRobots(text: string, userAgent: string): RobotsRules {
  const ua = userAgent.toLowerCase();
  const groups: Array<{ agents: string[]; rules: RobotsRules }> = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: { allow: [], disallow: [] } };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' && value) current.rules.allow.push(value);
    else if (key === 'disallow' && value) current.rules.disallow.push(value);
    else if (key === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n)) current.rules.crawlDelaySec = n;
    }
  }

  // 自分の UA に一致するグループがあればそれを、無ければ * を使う
  const token = ua.split('/')[0] ?? ua;
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return chosen.reduce<RobotsRules>(
    (acc, g) => ({
      allow: [...acc.allow, ...g.rules.allow],
      disallow: [...acc.disallow, ...g.rules.disallow],
      crawlDelaySec: g.rules.crawlDelaySec ?? acc.crawlDelaySec,
    }),
    { allow: [], disallow: [] },
  );
}

function patternToRegex(p: string): RegExp {
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

export function isAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  const consider = (p: string, allow: boolean) => {
    if (!patternToRegex(p).test(pathWithQuery)) return;
    const len = p.replace(/\*/g, '').length;
    // 同じ長さなら Allow を優先
    if (!best || len > best.len || (len === best.len && allow)) best = { len, allow };
  };
  rules.allow.forEach((p) => consider(p, true));
  rules.disallow.forEach((p) => consider(p, false));
  return best ? (best as { allow: boolean }).allow : true;
}
