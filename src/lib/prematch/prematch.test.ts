import { describe, expect, test } from 'vitest';
import { GET, POST } from '@/app/api/prematch/route';
import { POST as POST_REFRESH } from '@/app/api/prematch/refresh/route';
import { buildModelPrediction, buildPrematchReport } from './report';
import { getPrematchFixture, getTeamById } from './fixtures';
import { parseBingNewsRss, parseDuckDuckGoHtml } from './live-sources';
import { parseExpertPrediction, dedupeExpertPredictions } from './source-search';
import { computeEV, devig } from '@/lib/sim/market';
import { isRealMoneyTradingEnabled } from './trading';

describe('prematch expert parsing', () => {
  test('parses source-linked expert prediction and scoreline', () => {
    const prediction = parseExpertPrediction(
      {
        title: 'Spain vs Uruguay prediction: Spain to win 2-1',
        url: 'https://example.com/spain-uruguay',
        snippet: 'Technical analyst expects Spain control and a 2-1 result.',
        sourceName: 'Example Analyst',
        publishedAt: '2026-06-08T00:00:00.000Z',
      },
      'Spain',
      'Uruguay',
    );

    expect(prediction?.pick).toBe('home');
    expect(prediction?.scoreline).toBe('2-1');
    expect(prediction?.sourceUrl).toContain('https://');
  });

  test('deduplicates repeated source predictions', () => {
    const prediction = parseExpertPrediction(
      {
        title: 'Mexico vs South Africa prediction: Mexico 1-0',
        url: 'https://example.com/mex-rsa',
        snippet: 'Mexico are preferred.',
      },
      'Mexico',
      'South Africa',
    );
    expect(dedupeExpertPredictions([prediction!, prediction!])).toHaveLength(1);
  });
});

describe('prematch live source parsing', () => {
  test('parses Bing News RSS items with source links', () => {
    const rss = `<?xml version="1.0"?><rss><channel><item>
      <title><![CDATA[Spain predicted lineup and injury update]]></title>
      <link>https://www.bbc.com/sport/football/example</link>
      <description><![CDATA[Spain are monitoring one player before the match.]]></description>
      <pubDate>Tue, 09 Jun 2026 00:00:00 GMT</pubDate>
      <source>BBC Sport</source>
    </item></channel></rss>`;

    const items = parseBingNewsRss(rss, 'BBC Sport');
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('Spain predicted lineup');
    expect(items[0].url).toContain('bbc.com');
    expect(items[0].sourceName).toBe('BBC Sport');
  });

  test('parses DuckDuckGo HTML search results with redirected URLs', () => {
    const html = `<html><body><div class="result">
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fsports.sina.com.cn%2Ffootball%2Fexample.html">新浪体育：世界杯阵容预测</a>
      <a class="result__snippet">赛前阵容和伤停动态。</a>
    </div></body></html>`;

    const items = parseDuckDuckGoHtml(html, '新浪体育');
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://sports.sina.com.cn/football/example.html');
    expect(items[0].summary).toContain('伤停');
  });
});

describe('prematch model and odds math', () => {
  test('model probabilities are normalized and include totals', () => {
    const fixture = getPrematchFixture('A:0');
    const model = buildModelPrediction(getTeamById(fixture.homeId), getTeamById(fixture.awayId));
    expect(model.homeWin + model.draw + model.awayWin).toBeCloseTo(1, 4);
    expect(model.over25 + model.under25).toBeCloseTo(1, 4);
    expect(model.mostLikelyScore).toMatch(/^\d-\d$/);
  });

  test('devig and EV stay deterministic', () => {
    const fair = devig([0.52, 0.31, 0.24]);
    expect(fair.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 8);
    expect(computeEV(0.55, 2)).toBeCloseTo(0.1, 8);
  });
});

describe('prematch report and API', () => {
  test('report renders with partial cache and does not enable real-money trading', () => {
    const report = buildPrematchReport('A:0');
    expect(report.fixtureId).toBe('A:0');
    expect(report.realMoneyTradingEnabled).toBe(false);
    expect(isRealMoneyTradingEnabled()).toBe(false);
    expect(report.riskFactors.some((risk) => risk.includes('真实资金交易未启用'))).toBe(true);
  });

  test('GET /api/prematch returns a renderable report', async () => {
    const res = await GET(new Request('https://local.test/api/prematch?fixtureId=A%3A0&live=0'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fixtureId).toBe('A:0');
    expect(json.modelPrediction.mostLikelyScore).toBeTruthy();
  });

  test('POST /api/prematch/refresh returns cache refresh message', async () => {
    const res = await POST_REFRESH(new Request('https://local.test/api/prematch/refresh', {
      method: 'POST',
      body: JSON.stringify({ fixtureId: 'A:0', live: false }),
    }));
    const json = await res.json();
    expect(json.refreshed).toBe(false);
    expect(json.report.fixtureId).toBe('A:0');
  });
});
