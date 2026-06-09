import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { listPrematchFixtures } from '../src/lib/prematch/fixtures';
import { parseExpertPrediction, buildSearchSources, type SearchHit } from '../src/lib/prematch/source-search';
import type { ExpertPrediction, PrematchSource } from '../src/lib/prematch/types';

const MAX_FIXTURES = Number(process.env.PREMATCH_FIXTURE_LIMIT || 12);
const OUT = path.join(process.cwd(), 'src', 'data', 'prematch-cache.json');

async function searchDuckDuckGo(query: string): Promise<SearchHit[]> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; WorldCupPrematchBot/0.1; +https://example.invalid)',
    },
  });
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  $('.result').slice(0, 6).each((_, el) => {
    const title = $(el).find('.result__title').text().replace(/\s+/g, ' ').trim();
    const rawUrl = $(el).find('.result__a').attr('href') || '';
    const snippet = $(el).find('.result__snippet').text().replace(/\s+/g, ' ').trim();
    if (!title || !rawUrl) return;
    let url = rawUrl;
    try {
      const parsed = new URL(rawUrl, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      url = uddg || parsed.toString();
    } catch {
      url = rawUrl;
    }
    hits.push({ title, url, snippet });
  });
  return hits;
}

async function buildFixtureCache(fixture: ReturnType<typeof listPrematchFixtures>[number]) {
  const query = `${fixture.homeId} ${fixture.awayId} World Cup 2026 prediction expert score`;
  let hits: SearchHit[] = [];
  try {
    hits = await searchDuckDuckGo(query);
  } catch (err) {
    console.warn(`[prematch] search failed for ${fixture.id}:`, err instanceof Error ? err.message : String(err));
  }

  const expertPredictions: ExpertPrediction[] = hits
    .map((hit) => parseExpertPrediction(hit, fixture.homeId, fixture.awayId))
    .filter((prediction): prediction is ExpertPrediction => prediction !== null)
    .slice(0, 5);
  const sources: PrematchSource[] = buildSearchSources(hits, 'search');

  return {
    headToHead: {
      matches: [],
      noteZh: '自动刷新未验证到可结构化写入的历史交锋比分；页面保留搜索来源，人工复核后可补充结构化结果。',
    },
    expertPredictions,
    teamNews: [],
    sources,
  };
}

async function main() {
  const fixtures = listPrematchFixtures().slice(0, MAX_FIXTURES);
  const entries = await Promise.all(fixtures.map(async (fixture) => [fixture.id, await buildFixtureCache(fixture)] as const));
  const file = {
    _meta: {
      updated_at: new Date().toISOString(),
      note: `Auto-generated from public web search for ${entries.length} fixture(s). Keep only source-linked items in UI.`,
    },
    fixtures: Object.fromEntries(entries),
  };
  await writeFile(OUT, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  console.log(`[prematch] wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

