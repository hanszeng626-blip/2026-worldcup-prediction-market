import { currentAbsences, DEFAULT_ABSENCE_WEIGHTS, teamPenalty } from '@/lib/sim/absences';
import type { Team } from '@/lib/sim/types';
import type {
  ExpertPrediction,
  PredictedLineup,
  PrematchFeedItem,
  PrematchSource,
  PrematchSourceStatus,
  TeamNewsItem,
} from './types';

interface SourceAdapter {
  name: string;
  homeUrl: string;
  site?: string;
  querySuffix: string;
}

interface RssItem {
  title: string;
  url: string;
  sourceName: string;
  publishedAt?: string;
  summary: string;
  author?: string;
}

interface EspnArticle {
  headline?: string;
  description?: string;
  published?: string;
  byline?: string;
  links?: {
    web?: {
      href?: string;
    };
  };
}

export interface LivePrematchSignals {
  feedItems: PrematchFeedItem[];
  expertPredictions: ExpertPrediction[];
  teamNews: TeamNewsItem[];
  predictedLineups: {
    home: PredictedLineup;
    away: PredictedLineup;
  };
  sources: PrematchSource[];
  sourceStatus: PrematchSourceStatus[];
}

const SEARCH_SOURCES: SourceAdapter[] = [
  { name: '虎扑足球', homeUrl: 'https://soccer.hupu.com', site: 'soccer.hupu.com', querySuffix: '足球 世界杯 阵容 伤停 预测' },
  { name: '500彩票网', homeUrl: 'https://www.500.com', site: '500.com', querySuffix: '足球 世界杯 赛程 指数 阵容 伤停' },
  { name: '新浪体育', homeUrl: 'https://sports.sina.com.cn', site: 'sports.sina.com.cn', querySuffix: '足球 世界杯 伤停 阵容 预测' },
  { name: 'BBC Sport', homeUrl: 'https://www.bbc.com/sport/football', site: 'bbc.com/sport', querySuffix: 'World Cup 2026 team news prediction' },
  { name: 'Sky Sports', homeUrl: 'https://www.skysports.com/football', site: 'skysports.com', querySuffix: 'World Cup 2026 predicted lineups injuries' },
  { name: 'Reuters Sports', homeUrl: 'https://www.reuters.com/sports/soccer/', site: 'reuters.com', querySuffix: 'World Cup 2026 soccer team news' },
];

const ESPN_WORLD_CUP_NEWS = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news?limit=20';
const FIFA_ARTICLES = 'https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026/articles';

const INJURY_RE = /(injur|absence|suspend|doubt|training|fitness|伤停|伤病|缺阵|停赛|受伤|出战成疑|训练)/i;
const LINEUP_RE = /(lineup|squad|roster|starting|阵容|首发|名单|大名单|预计首发)/i;
const ODDS_RE = /(odds|price|market|指数|赔率|盘口|胜平负)/i;
const EXPERT_RE = /(predict|preview|analysis|expert|forecast|pick|观点|预测|前瞻|分析|解说|专家)/i;

function nowIso(): string {
  return new Date().toISOString();
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function duckDuckGoUrl(query: string): string {
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function sourceQuery(source: SourceAdapter, home: Team, away: Team): string {
  const site = source.site ? `site:${source.site}` : '';
  return `${site} ("${home.name_en}" OR "${away.name_en}") ${source.querySuffix}`.trim();
}

export function parseBingNewsRss(xml: string, fallbackSourceName: string): RssItem[] {
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return itemBlocks
    .map((block) => {
      const title = tag(block, 'title');
      const url = tag(block, 'link');
      const summary = tag(block, 'description');
      const publishedAt = tag(block, 'pubDate');
      const sourceName = tag(block, 'source') || fallbackSourceName || hostFromUrl(url);
      return { title, url, sourceName, summary, publishedAt };
    })
    .filter((item) => item.title && /^https?:\/\//i.test(item.url));
}

export function parseDuckDuckGoHtml(html: string, fallbackSourceName: string): RssItem[] {
  const blocks = html.match(/<div class="result[\s\S]*?(?=<div class="result|<\/body>)/gi) ?? [];
  return blocks
    .map((block) => {
      const title = decodeXml(tag(block, 'a'));
      const hrefMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/i);
      const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
      const rawUrl = decodeXml(hrefMatch?.[1] || '');
      let url = rawUrl;
      try {
        const parsed = new URL(rawUrl, 'https://duckduckgo.com');
        url = parsed.searchParams.get('uddg') || parsed.toString();
      } catch {
        url = rawUrl;
      }
      return {
        title,
        url,
        sourceName: fallbackSourceName || hostFromUrl(url),
        summary: decodeXml(snippetMatch?.[1] || snippetMatch?.[2] || ''),
      };
    })
    .filter((item) => item.title && /^https?:\/\//i.test(item.url));
}

function classifyFeedItem(item: RssItem): PrematchFeedItem['kind'] {
  const text = `${item.title} ${item.summary}`;
  if (INJURY_RE.test(text)) return 'injury';
  if (LINEUP_RE.test(text)) return 'lineup';
  if (ODDS_RE.test(text)) return 'odds';
  if (EXPERT_RE.test(text)) return 'expert';
  return 'news';
}

function mentionedTeams(item: RssItem, home: Team, away: Team): string[] {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const teams: string[] = [];
  if (text.includes(home.name_en.toLowerCase()) || text.includes(home.id.toLowerCase())) teams.push(home.id);
  if (text.includes(away.name_en.toLowerCase()) || text.includes(away.id.toLowerCase())) teams.push(away.id);
  return teams.length > 0 ? teams : [home.id, away.id];
}

function toFeedItem(item: RssItem, home: Team, away: Team): PrematchFeedItem {
  return {
    title: item.title,
    url: item.url,
    sourceName: item.sourceName || hostFromUrl(item.url),
    publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined,
    summaryZh: item.summary || item.title,
    kind: classifyFeedItem(item),
    teams: mentionedTeams(item, home, away),
  };
}

function dedupeFeedItems(items: PrematchFeedItem[]): PrematchFeedItem[] {
  const seen = new Set<string>();
  const out: PrematchFeedItem[] = [];
  for (const item of items) {
    const key = item.url.replace(/[#?].*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function fetchEspnWorldCupNews(): Promise<RssItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(ESPN_WORLD_CUP_NEWS, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; GoalLens2026/0.1; prematch research)',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { articles?: EspnArticle[] };
    return (json.articles ?? [])
      .map((article) => ({
        title: article.headline ?? '',
        url: article.links?.web?.href ?? '',
        sourceName: 'ESPN',
        publishedAt: article.published,
        summary: article.description ?? '',
        author: article.byline,
      }))
      .filter((item) => item.title && /^https?:\/\//i.test(item.url));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFifaArticles(): Promise<RssItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(FIFA_ARTICLES, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoalLens2026/0.1; prematch research)' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const titleMatches = Array.from(html.matchAll(/"title"\s*:\s*"([^"]{12,180})"/g)).slice(0, 6);
    return titleMatches.map((match, index) => ({
      title: decodeXml(match[1]),
      url: FIFA_ARTICLES,
      sourceName: 'FIFA',
      summary: 'FIFA World Cup 2026 official article listing.',
      publishedAt: index === 0 ? nowIso() : undefined,
    }));
  } finally {
    clearTimeout(timer);
  }
}

function fallbackSource(source: SourceAdapter, home: Team, away: Team): PrematchSource {
  return {
    title: `${source.name} 站内检索：${home.name_en} vs ${away.name_en}`,
    url: duckDuckGoUrl(sourceQuery(source, home, away)),
    sourceName: source.name,
    fetchedAt: nowIso(),
    kind: 'search',
  };
}

function lineupFor(team: Team, items: PrematchFeedItem[]): PredictedLineup {
  const teamItems = items.filter((item) => item.teams.includes(team.id));
  const lineupSource = teamItems.find((item) => item.kind === 'lineup' || item.kind === 'injury') ?? teamItems[0];
  const absences = currentAbsences(team.id);
  const penalty = teamPenalty(absences, DEFAULT_ABSENCE_WEIGHTS, 'group');
  const formation = team.elo >= 1950
    ? '4-3-3 / 4-2-3-1'
    : team.elo >= 1780
      ? '4-2-3-1 / 4-4-2'
      : '5-4-1 / 4-5-1';

  return {
    teamId: team.id,
    formation,
    statusZh: lineupSource ? '已接入实时赛前新闻源，首发仍需临场确认' : '暂无可追溯阵容源，使用模型阵型占位',
    availabilityZh: absences.length > 0
      ? `当前伤停缓存 ${absences.length} 人，模型影响约 ${penalty.toFixed(0)} ELO`
      : '当前本地伤停缓存为空，需继续核对赛前发布会、训练动态和官方名单',
    sourceUrl: lineupSource?.url,
    sourceName: lineupSource?.sourceName,
    updatedAt: nowIso(),
    notesZh: [
      '不编造具体首发球员名；只有来源明确时才展示阵容细节。',
      team.is_host ? '主办国适应和旅行压力相对较低。' : '需结合比赛地、抵达时间和小组赛轮次评估疲劳。',
      absences.length > 0 ? `重点核对：${absences.slice(0, 3).map((item) => item.player).join('、')}` : '重点核对：赛前 24 小时训练、发布会和官方名单。',
    ],
  };
}

function newsFromFeed(items: PrematchFeedItem[]): TeamNewsItem[] {
  const now = nowIso();
  return items
    .filter((item) => item.kind === 'injury' || item.kind === 'lineup')
    .slice(0, 8)
    .flatMap((item) => item.teams.map<TeamNewsItem>((teamId) => ({
      teamId,
      titleZh: item.kind === 'injury' ? `伤停/状态：${item.title}` : `阵容动态：${item.title}`,
      detailZh: item.summaryZh,
      impact: item.kind === 'injury' ? 'negative' : 'neutral',
      sourceUrl: item.url,
      updatedAt: item.publishedAt || now,
    })));
}

function expertPredictionsFromFeed(items: PrematchFeedItem[]): ExpertPrediction[] {
  return items
    .filter((item) => item.kind === 'expert' || EXPERT_RE.test(`${item.title} ${item.summaryZh}`))
    .slice(0, 6)
    .map((item) => ({
      sourceName: item.sourceName,
      sourceUrl: item.url,
      author: item.sourceName,
      publishedAt: item.publishedAt || nowIso(),
      predictionType: 'tactical',
      pick: 'draw',
      summaryZh: item.summaryZh || item.title,
      confidence: 'low',
    }));
}

export async function buildLivePrematchSignals(home: Team, away: Team): Promise<LivePrematchSignals> {
  const checkedAt = nowIso();
  const rawItems: PrematchFeedItem[] = [];
  const sources: PrematchSource[] = [];
  const sourceStatus: PrematchSourceStatus[] = [];

  const liveFetches = [
    { name: 'ESPN World Cup', url: ESPN_WORLD_CUP_NEWS, run: fetchEspnWorldCupNews },
    { name: 'FIFA Official', url: FIFA_ARTICLES, run: fetchFifaArticles },
  ];

  await Promise.all(liveFetches.map(async (source) => {
    try {
      const items = await source.run();
      const feedItems = items.map((item) => toFeedItem(item, home, away));
      rawItems.push(...feedItems);
      sourceStatus.push({
        sourceName: source.name,
        url: source.url,
        status: feedItems.length > 0 ? 'ok' : 'empty',
        itemCount: feedItems.length,
        messageZh: feedItems.length > 0 ? '已获取实时新闻条目。' : '已连接，但当前没有可展示条目。',
        checkedAt,
      });
    } catch (err) {
      sourceStatus.push({
        sourceName: source.name,
        url: source.url,
        status: 'failed',
        itemCount: 0,
        messageZh: err instanceof Error ? `抓取失败：${err.message}` : '抓取失败。',
        checkedAt,
      });
    }
  }));

  for (const source of SEARCH_SOURCES) {
    sources.push(fallbackSource(source, home, away));
    sourceStatus.push({
      sourceName: source.name,
      url: source.homeUrl,
      status: 'fallback',
      itemCount: 0,
      messageZh: '已提供站点限定检索入口；后续可接入该站专用抓取器。',
      checkedAt,
    });
  }

  const feedItems = dedupeFeedItems(rawItems)
    .sort((a, b) => Date.parse(b.publishedAt || checkedAt) - Date.parse(a.publishedAt || checkedAt))
    .slice(0, 16);

  sources.push(...feedItems.map<PrematchSource>((item) => ({
    title: item.title,
    url: item.url,
    sourceName: item.sourceName,
    fetchedAt: item.publishedAt || checkedAt,
    kind: item.kind === 'injury' || item.kind === 'lineup' ? 'team_news' : item.kind === 'expert' ? 'expert' : 'search',
  })));

  return {
    feedItems,
    expertPredictions: expertPredictionsFromFeed(feedItems),
    teamNews: newsFromFeed(feedItems),
    predictedLineups: {
      home: lineupFor(home, feedItems),
      away: lineupFor(away, feedItems),
    },
    sources,
    sourceStatus,
  };
}
