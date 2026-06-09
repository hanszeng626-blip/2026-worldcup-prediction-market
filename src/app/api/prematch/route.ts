import { NextResponse } from 'next/server';
import { buildLivePrematchSignals } from '@/lib/prematch/live-sources';
import { buildPrematchReport } from '@/lib/prematch/report';
import { dedupeExpertPredictions } from '@/lib/prematch/source-search';
import type { ExpertConsensus, ExpertPrediction, Pick, PrematchReport, PrematchSource } from '@/lib/prematch/types';

export const dynamic = 'force-dynamic';

function dedupeSources(sources: PrematchSource[]): PrematchSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.kind === 'search' ? source.url : source.url.replace(/[#?].*$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeExpertConsensus(current: ExpertConsensus, livePredictions: ExpertPrediction[]): ExpertConsensus {
  const predictions = dedupeExpertPredictions([...livePredictions, ...current.predictions])
    .filter((prediction) => prediction.sourceName !== '公开搜索占位' && !prediction.summaryZh.includes('缓存尚未抓取'));
  const counts: Record<Pick, number> = { home: 0, draw: 0, away: 0 };
  const scoreCounts = new Map<string, number>();
  for (const prediction of predictions) {
    counts[prediction.pick] += 1;
    if (prediction.scoreline) scoreCounts.set(prediction.scoreline, (scoreCounts.get(prediction.scoreline) ?? 0) + 1);
  }
  const total = Math.max(1, predictions.length);
  return {
    predictions,
    home: counts.home / total,
    draw: counts.draw / total,
    away: counts.away / total,
    topScorelines: Array.from(scoreCounts.entries())
      .map(([scoreline, count]) => ({ scoreline, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
    disagreementZh: predictions.length === 0
      ? current.disagreementZh
      : '已接入实时媒体/专家观点；这些观点只作为解释因子，不覆盖模型概率。',
  };
}

async function withLiveSources(report: PrematchReport, enabled: boolean): Promise<PrematchReport> {
  if (!enabled) return report;
  try {
    const live = await buildLivePrematchSignals(report.teams.home, report.teams.away);
    return {
      ...report,
      teamNews: [...live.teamNews, ...report.teamNews],
      expertConsensus: mergeExpertConsensus(report.expertConsensus, live.expertPredictions),
      newsFeed: live.feedItems,
      predictedLineups: live.predictedLineups,
      sourceStatus: live.sourceStatus,
      sources: dedupeSources([...live.sources, ...report.sources]),
    };
  } catch (err) {
    return {
      ...report,
      sourceStatus: [{
        sourceName: 'live-source-layer',
        url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news?limit=20',
        status: 'failed',
        itemCount: 0,
        messageZh: err instanceof Error ? `实时新闻源聚合失败：${err.message}` : '实时新闻源聚合失败。',
        checkedAt: new Date().toISOString(),
      }],
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fixtureId = searchParams.get('fixtureId');
  const live = searchParams.get('live') !== '0';
  const report = await withLiveSources(buildPrematchReport(fixtureId), live);
  return NextResponse.json(report, {
    headers: {
      'Cache-Control': live ? 'public, s-maxage=180, stale-while-revalidate=600' : 'public, s-maxage=600',
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { fixtureId?: string; live?: boolean };
  const report = await withLiveSources(buildPrematchReport(body.fixtureId), body.live !== false);
  return NextResponse.json({
    report,
    refreshed: false,
    messageZh: '已刷新实时新闻源和媒体观点；完整缓存刷新仍通过 npm run fetch-prematch 执行。',
  });
}
