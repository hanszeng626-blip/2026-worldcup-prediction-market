import { setRequestLocale } from 'next-intl/server';
import { PrematchDashboard } from '@/components/prematch/PrematchDashboard';
import { buildLivePrematchSignals } from '@/lib/prematch/live-sources';
import { buildPrematchReport, listPrematchFixtures } from '@/lib/prematch/report';
import { dedupeExpertPredictions } from '@/lib/prematch/source-search';
import type { ExpertConsensus, ExpertPrediction, Pick, PrematchReport, PrematchSource } from '@/lib/prematch/types';

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

async function withInitialLive(report: PrematchReport): Promise<PrematchReport> {
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
  } catch {
    return report;
  }
}

export default async function PrematchPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const fixtures = listPrematchFixtures();
  const initialReport = await withInitialLive(buildPrematchReport(fixtures[0]?.id));

  return <PrematchDashboard fixtures={fixtures} initialReport={initialReport} />;
}
