import teamsData from '@/data/teams.json';
import cacheData from '@/data/prematch-cache.json';
import { currentAbsences, teamPenalty, DEFAULT_ABSENCE_WEIGHTS } from '@/lib/sim/absences';
import { HOST_BONUS } from '@/lib/sim/elo';
import { effectiveElo } from '@/lib/sim/match';
import { lambdaFor } from '@/lib/sim/goals';
import type { Team } from '@/lib/sim/types';
import { devig } from '@/lib/sim/market';
import { getPrematchFixture, listPrematchFixtures } from './fixtures';
import { isRealMoneyTradingEnabled } from './trading';
import { dedupeExpertPredictions } from './source-search';
import type {
  ExpertConsensus,
  ExpertPrediction,
  HeadToHeadMatch,
  HeadToHeadSummary,
  ModelPrediction,
  OddsMarket,
  OddsOutcome,
  Pick,
  PrematchReport,
  PrematchSource,
  TeamNewsItem,
} from './types';

const teams = (teamsData as { teams: Team[] }).teams;
const teamById = new Map(teams.map((team) => [team.id, team]));

interface CacheFixture {
  headToHead?: {
    matches?: HeadToHeadMatch[];
    noteZh?: string;
  };
  expertPredictions?: ExpertPrediction[];
  teamNews?: TeamNewsItem[];
  sources?: PrematchSource[];
}

const cache = cacheData as {
  _meta?: { updated_at?: string };
  fixtures?: Record<string, CacheFixture>;
};

function team(teamId: string): Team {
  const found = teamById.get(teamId);
  if (!found) throw new Error(`Unknown team id: ${teamId}`);
  return found;
}

function poissonPmf(lambda: number, maxGoals = 8): number[] {
  const probs: number[] = [];
  let sum = 0;
  for (let k = 0; k <= maxGoals; k++) {
    let factorial = 1;
    for (let i = 2; i <= k; i++) factorial *= i;
    const p = Math.exp(-lambda) * (lambda ** k) / factorial;
    probs.push(p);
    sum += p;
  }
  probs[maxGoals] += Math.max(0, 1 - sum);
  return probs;
}

export function buildModelPrediction(home: Team, away: Team): ModelPrediction {
  const lambdaHome = lambdaFor(effectiveElo(home, 'group'), effectiveElo(away, 'group'), home.is_host ? HOST_BONUS : 0);
  const lambdaAway = lambdaFor(effectiveElo(away, 'group'), effectiveElo(home, 'group'), away.is_host ? HOST_BONUS : 0);
  const homeGoals = poissonPmf(lambdaHome);
  const awayGoals = poissonPmf(lambdaAway);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  let bothTeamsScore = 0;
  let bestProb = 0;
  let bestScore = '0-0';

  for (let h = 0; h < homeGoals.length; h++) {
    for (let a = 0; a < awayGoals.length; a++) {
      const p = homeGoals[h] * awayGoals[a];
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      if (h + a >= 3) over25 += p;
      if (h > 0 && a > 0) bothTeamsScore += p;
      if (p > bestProb) {
        bestProb = p;
        bestScore = `${h}-${a}`;
      }
    }
  }

  return {
    homeWin,
    draw,
    awayWin,
    mostLikelyScore: bestScore,
    mostLikelyScoreProb: bestProb,
    expectedGoalsHome: lambdaHome,
    expectedGoalsAway: lambdaAway,
    over25,
    under25: 1 - over25,
    bothTeamsScore,
  };
}

function resultFromScore(match: HeadToHeadMatch, homeName: string, awayName: string): Pick {
  const [homeGoals, awayGoals] = match.score.split('-').map((value) => Number(value.trim()));
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals) || homeGoals === awayGoals) return 'draw';
  const matchHomeIsReportHome = match.home === homeName;
  const homeSideWon = homeGoals > awayGoals;
  if (matchHomeIsReportHome) return homeSideWon ? 'home' : 'away';
  return homeSideWon ? 'away' : 'home';
}

function buildHeadToHead(fixtureId: string, home: Team, away: Team): HeadToHeadSummary {
  const cached = cache.fixtures?.[fixtureId]?.headToHead;
  const matches = cached?.matches ?? [];
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let goals = 0;

  for (const match of matches) {
    const pick = resultFromScore(match, home.name_en, away.name_en);
    if (pick === 'home') homeWins += 1;
    else if (pick === 'away') awayWins += 1;
    else draws += 1;
    const [h, a] = match.score.split('-').map((value) => Number(value.trim()));
    if (Number.isFinite(h) && Number.isFinite(a)) goals += h + a;
  }

  return {
    matches,
    homeWins,
    draws,
    awayWins,
    avgGoals: matches.length > 0 ? goals / matches.length : 0,
    noteZh: cached?.noteZh || '暂无可审计的历史交锋缓存；刷新脚本会优先保留有来源链接的记录。',
  };
}

function fairOdds(probability: number): number {
  return probability > 0 ? 1 / probability : 0;
}

function buildOutcome(label: string, side: OddsOutcome['side'], modelProb: number, marketProb: number): OddsOutcome {
  const marketOdds = fairOdds(marketProb);
  return {
    label,
    side,
    modelProb,
    fairOdds: fairOdds(modelProb),
    marketOdds,
    edge: modelProb - marketProb,
    ev: modelProb * (marketOdds - 1) - (1 - modelProb),
  };
}

function buildOddsMarkets(model: ModelPrediction, home: Team, away: Team): OddsMarket[] {
  const now = new Date().toISOString();
  const nudged1x2 = devig([
    Math.max(0.02, model.homeWin * 0.97),
    Math.max(0.02, model.draw * 1.06),
    Math.max(0.02, model.awayWin * 0.98),
  ]);
  const nudgedTotals = devig([
    Math.max(0.02, model.over25 * 1.04),
    Math.max(0.02, model.under25 * 0.96),
  ]);
  const bttsNo = 1 - model.bothTeamsScore;
  const nudgedBtts = devig([
    Math.max(0.02, model.bothTeamsScore * 1.02),
    Math.max(0.02, bttsNo * 0.98),
  ]);

  return [
    {
      id: '1x2-consensus',
      type: '1x2',
      titleZh: '胜平负',
      book: '模型市场共识',
      fetchedAt: now,
      outcomes: [
        buildOutcome(home.name_en, 'home', model.homeWin, nudged1x2[0]),
        buildOutcome('平局', 'draw', model.draw, nudged1x2[1]),
        buildOutcome(away.name_en, 'away', model.awayWin, nudged1x2[2]),
      ],
    },
    {
      id: 'total-goals-25',
      type: 'total_goals',
      titleZh: '总进球 2.5',
      book: '模型市场共识',
      fetchedAt: now,
      outcomes: [
        buildOutcome('大 2.5', 'over_2_5', model.over25, nudgedTotals[0]),
        buildOutcome('小 2.5', 'under_2_5', model.under25, nudgedTotals[1]),
      ],
    },
    {
      id: 'btts',
      type: 'both_teams_score',
      titleZh: '双方进球',
      book: '模型市场共识',
      fetchedAt: now,
      outcomes: [
        buildOutcome('是', 'yes', model.bothTeamsScore, nudgedBtts[0]),
        buildOutcome('否', 'no', bttsNo, nudgedBtts[1]),
      ],
    },
  ];
}

function buildTeamNews(fixtureId: string, home: Team, away: Team): TeamNewsItem[] {
  const cached = cache.fixtures?.[fixtureId]?.teamNews ?? [];
  const now = new Date().toISOString();
  const absenceNews: TeamNewsItem[] = [home, away].flatMap<TeamNewsItem>((side) => {
    const absences = currentAbsences(side.id);
    const penalty = teamPenalty(absences, DEFAULT_ABSENCE_WEIGHTS, 'group');
    if (absences.length === 0) {
      return [{
        teamId: side.id,
        titleZh: `${side.name_en} 暂无关键伤停缓存`,
        detailZh: '当前伤停缓存为空；仍需赛前核对最终名单、训练报告和停赛信息。',
        impact: 'neutral' as const,
        updatedAt: now,
      }];
    }
    return [{
      teamId: side.id,
      titleZh: `${side.name_en} 伤停影响约 ${penalty.toFixed(0)} ELO`,
      detailZh: absences.slice(0, 3).map((item) => `${item.player}（${item.position}，${item.reason}）`).join('；'),
      impact: 'negative' as const,
      updatedAt: now,
    }];
  });
  return [...absenceNews, ...cached];
}

function buildConsensus(fixtureId: string, model: ModelPrediction): ExpertConsensus {
  const cached = dedupeExpertPredictions(cache.fixtures?.[fixtureId]?.expertPredictions ?? []);
  const predictions = cached.filter((prediction) => prediction.sourceUrl && prediction.publishedAt);
  const counts = { home: 0, draw: 0, away: 0 };
  const scoreCounts = new Map<string, number>();
  for (const prediction of predictions) {
    counts[prediction.pick] += 1;
    if (prediction.scoreline) scoreCounts.set(prediction.scoreline, (scoreCounts.get(prediction.scoreline) ?? 0) + 1);
  }
  const total = Math.max(1, predictions.length);
  const modelPick: Pick = model.homeWin >= model.awayWin && model.homeWin >= model.draw
    ? 'home'
    : model.awayWin >= model.draw
      ? 'away'
      : 'draw';
  const expertPick = counts.home >= counts.away && counts.home >= counts.draw
    ? 'home'
    : counts.away >= counts.draw
      ? 'away'
      : 'draw';

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
      ? '暂无可追溯专家预测；当前综合判断主要来自模型和赔率。'
      : modelPick === expertPick
        ? '专家倾向与模型第一选择方向一致，但不改变模型概率。'
        : '专家倾向与模型第一选择存在分歧，应重点核对阵容、临场状态和赔率变化。',
  };
}

function buildRiskFactors(model: ModelPrediction, news: TeamNewsItem[], experts: ExpertConsensus): string[] {
  const risks = [
    '赛前预测只反映当前公开数据和模型假设，不构成投注、投资或收益承诺。',
    '真实资金交易未启用；缺少持牌平台、KYC、地理围栏和合规审计时不得开放下单。',
  ];
  if (Math.max(model.homeWin, model.draw, model.awayWin) < 0.45) {
    risks.push('胜平负概率分散，比赛方向不够集中，比分预测不确定性较高。');
  }
  if (news.some((item) => item.impact === 'negative')) {
    risks.push('伤停缓存可能在赛前变化，需要核对最终名单和赛前发布会。');
  }
  if (experts.predictions.length < 3) {
    risks.push('专家观点样本不足，不能作为独立决策依据。');
  }
  return risks;
}

export function buildPrematchReport(fixtureId?: string | null): PrematchReport {
  const fixture = getPrematchFixture(fixtureId);
  const home = team(fixture.homeId);
  const away = team(fixture.awayId);
  const modelPrediction = buildModelPrediction(home, away);
  const headToHead = buildHeadToHead(fixture.id, home, away);
  const teamNews = buildTeamNews(fixture.id, home, away);
  const expertConsensus = buildConsensus(fixture.id, modelPrediction);
  const oddsMarkets = buildOddsMarkets(modelPrediction, home, away);
  const sources: PrematchSource[] = [
    ...(cache.fixtures?.[fixture.id]?.sources ?? []),
    ...headToHead.matches
      .filter((match) => match.sourceUrl)
      .map((match) => ({
        title: `${match.competition} ${match.home} ${match.score} ${match.away}`,
        url: match.sourceUrl!,
        sourceName: 'fixture-cache',
        fetchedAt: cache._meta?.updated_at || new Date().toISOString(),
        kind: 'head_to_head' as const,
      })),
    ...expertConsensus.predictions.map((prediction) => ({
      title: prediction.summaryZh,
      url: prediction.sourceUrl,
      sourceName: prediction.sourceName,
      fetchedAt: prediction.publishedAt,
      kind: 'expert' as const,
    })),
  ];

  return {
    fixtureId: fixture.id,
    fixture,
    teams: { home, away },
    modelPrediction,
    oddsMarkets,
    headToHead,
    teamNews,
    expertConsensus,
    riskFactors: buildRiskFactors(modelPrediction, teamNews, expertConsensus),
    generatedAt: new Date().toISOString(),
    sources,
    realMoneyTradingEnabled: isRealMoneyTradingEnabled(),
  };
}

export { listPrematchFixtures };
