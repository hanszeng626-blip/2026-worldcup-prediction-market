import type { ExpertPrediction, Pick, PrematchSource } from './types';

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  sourceName?: string;
  publishedAt?: string;
}

const SCORE_RE = /\b([0-7])\s*[-:]\s*([0-7])\b/;

function sourceFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0] || host;
  } catch {
    return 'unknown';
  }
}

export function inferPick(text: string, homeName: string, awayName: string): Pick {
  const lower = text.toLowerCase();
  const home = homeName.toLowerCase();
  const away = awayName.toLowerCase();
  const mentionsDraw = /(draw|tie|平局|战平|握手言和)/i.test(text);
  const mentionsHome = lower.includes(home) || text.includes(homeName);
  const mentionsAway = lower.includes(away) || text.includes(awayName);

  if (mentionsDraw && !mentionsHome && !mentionsAway) return 'draw';
  if (mentionsHome && !mentionsAway) return 'home';
  if (mentionsAway && !mentionsHome) return 'away';
  if (mentionsDraw) return 'draw';
  return 'draw';
}

export function parseExpertPrediction(
  hit: SearchHit,
  homeName: string,
  awayName: string,
): ExpertPrediction | null {
  if (!hit.url || !/^https?:\/\//i.test(hit.url)) return null;
  const text = `${hit.title} ${hit.snippet}`;
  const scoreMatch = text.match(SCORE_RE);
  const pick = scoreMatch
    ? Number(scoreMatch[1]) > Number(scoreMatch[2])
      ? 'home'
      : Number(scoreMatch[1]) < Number(scoreMatch[2])
        ? 'away'
        : 'draw'
    : inferPick(text, homeName, awayName);

  return {
    sourceName: hit.sourceName || sourceFromUrl(hit.url),
    sourceUrl: hit.url,
    author: hit.sourceName || sourceFromUrl(hit.url),
    publishedAt: hit.publishedAt || new Date().toISOString(),
    predictionType: scoreMatch ? 'score' : 'winner',
    pick,
    scoreline: scoreMatch ? `${scoreMatch[1]}-${scoreMatch[2]}` : undefined,
    summaryZh: hit.snippet.trim().slice(0, 180) || hit.title.trim().slice(0, 180),
    confidence: scoreMatch ? 'medium' : 'low',
  };
}

export function dedupeExpertPredictions(predictions: ExpertPrediction[]): ExpertPrediction[] {
  const seen = new Set<string>();
  const out: ExpertPrediction[] = [];
  for (const prediction of predictions) {
    const key = `${prediction.sourceUrl}|${prediction.pick}|${prediction.scoreline || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(prediction);
  }
  return out;
}

export function buildSearchSources(hits: SearchHit[], kind: PrematchSource['kind']): PrematchSource[] {
  const fetchedAt = new Date().toISOString();
  return hits
    .filter((hit) => /^https?:\/\//i.test(hit.url))
    .map((hit) => ({
      title: hit.title,
      url: hit.url,
      sourceName: hit.sourceName || sourceFromUrl(hit.url),
      fetchedAt,
      kind,
    }));
}
