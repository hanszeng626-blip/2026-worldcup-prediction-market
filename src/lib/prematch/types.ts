import type { Team } from '@/lib/sim/types';

export type Pick = 'home' | 'draw' | 'away';
export type OddsMarketType = '1x2' | 'total_goals' | 'both_teams_score';
export type FixtureStage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final' | '3rd';

export interface PrematchFixture {
  id: string;
  stage: FixtureStage;
  group?: string;
  homeId: string;
  awayId: string;
  label: string;
}

export interface ExpertPrediction {
  sourceName: string;
  sourceUrl: string;
  author: string;
  publishedAt: string;
  predictionType: 'winner' | 'score' | 'total_goals' | 'tactical';
  pick: Pick;
  scoreline?: string;
  summaryZh: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface PrematchSource {
  title: string;
  url: string;
  sourceName: string;
  fetchedAt: string;
  kind: 'expert' | 'team_news' | 'head_to_head' | 'odds' | 'search';
}

export interface HeadToHeadMatch {
  date: string;
  competition: string;
  home: string;
  away: string;
  score: string;
  sourceUrl?: string;
}

export interface HeadToHeadSummary {
  matches: HeadToHeadMatch[];
  homeWins: number;
  draws: number;
  awayWins: number;
  avgGoals: number;
  noteZh: string;
}

export interface TeamNewsItem {
  teamId: string;
  titleZh: string;
  detailZh: string;
  impact: 'positive' | 'neutral' | 'negative';
  sourceUrl?: string;
  updatedAt: string;
}

export interface PrematchFeedItem {
  title: string;
  url: string;
  sourceName: string;
  publishedAt?: string;
  summaryZh: string;
  kind: 'news' | 'lineup' | 'injury' | 'odds' | 'expert' | 'search';
  teams: string[];
}

export interface PredictedLineup {
  teamId: string;
  formation: string;
  statusZh: string;
  availabilityZh: string;
  sourceUrl?: string;
  sourceName?: string;
  updatedAt: string;
  notesZh: string[];
}

export interface PrematchSourceStatus {
  sourceName: string;
  url: string;
  status: 'ok' | 'empty' | 'failed' | 'fallback';
  itemCount: number;
  messageZh: string;
  checkedAt: string;
}

export interface ModelPrediction {
  homeWin: number;
  draw: number;
  awayWin: number;
  mostLikelyScore: string;
  mostLikelyScoreProb: number;
  expectedGoalsHome: number;
  expectedGoalsAway: number;
  over25: number;
  under25: number;
  bothTeamsScore: number;
}

export interface OddsOutcome {
  label: string;
  side: Pick | 'over_2_5' | 'under_2_5' | 'yes' | 'no';
  modelProb: number;
  fairOdds: number;
  marketOdds: number;
  edge: number;
  ev: number;
}

export interface OddsMarket {
  id: string;
  type: OddsMarketType;
  titleZh: string;
  book: string;
  fetchedAt: string;
  outcomes: OddsOutcome[];
}

export interface ExpertConsensus {
  predictions: ExpertPrediction[];
  home: number;
  draw: number;
  away: number;
  topScorelines: Array<{ scoreline: string; count: number }>;
  disagreementZh: string;
}

export interface PrematchReport {
  fixtureId: string;
  fixture: PrematchFixture;
  teams: {
    home: Team;
    away: Team;
  };
  modelPrediction: ModelPrediction;
  oddsMarkets: OddsMarket[];
  headToHead: HeadToHeadSummary;
  teamNews: TeamNewsItem[];
  expertConsensus: ExpertConsensus;
  newsFeed?: PrematchFeedItem[];
  predictedLineups?: {
    home: PredictedLineup;
    away: PredictedLineup;
  };
  sourceStatus?: PrematchSourceStatus[];
  riskFactors: string[];
  generatedAt: string;
  sources: PrematchSource[];
  realMoneyTradingEnabled: false;
}
