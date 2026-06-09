'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { Flag } from '@/components/Flag';
import { cn } from '@/lib/utils';
import type { PrematchFixture, PrematchReport } from '@/lib/prematch/types';

interface Props {
  initialReport: PrematchReport;
  fixtures: PrematchFixture[];
}

function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function decimal(value: number): string {
  return value > 0 ? value.toFixed(2) : '-';
}

function signedPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}pp`;
}

export function PrematchDashboard({ initialReport, fixtures }: Props) {
  const [report, setReport] = useState(initialReport);
  const [fixtureId, setFixtureId] = useState(initialReport.fixtureId);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState('缓存与模型已加载');

  const topPick = useMemo(() => {
    const { homeWin, draw, awayWin } = report.modelPrediction;
    if (homeWin >= draw && homeWin >= awayWin) return { label: report.teams.home.name_en, value: homeWin };
    if (awayWin >= draw) return { label: report.teams.away.name_en, value: awayWin };
    return { label: '平局', value: draw };
  }, [report]);

  const loadFixture = async (nextFixtureId: string) => {
    setFixtureId(nextFixtureId);
    setStatus('正在切换比赛...');
    const res = await fetch(`/api/prematch?fixtureId=${encodeURIComponent(nextFixtureId)}`);
    const nextReport = await res.json() as PrematchReport;
    setReport(nextReport);
    setStatus('缓存与模型已加载');
  };

  const refresh = async () => {
    setRefreshing(true);
    setStatus('正在刷新报告...');
    try {
      const res = await fetch('/api/prematch/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixtureId }),
      });
      const data = await res.json() as { report: PrematchReport; messageZh?: string };
      setReport(data.report);
      setStatus(data.messageZh || '刷新完成');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="prematch-apple-page relative mx-auto max-w-[1440px] px-4 pb-16 pt-28 sm:px-6 lg:pt-32">
      <div className="prematch-apple-backdrop fixed inset-0 z-0" aria-hidden />
      <div className="relative z-10 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="prematch-panel h-fit rounded-[28px] p-4 lg:sticky lg:top-24">
          <div className="mb-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold">Prematch Desk</div>
            <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-fg-0">世界杯赛前投注分析</h1>
            <p className="mt-2 text-xs leading-5 text-fg-2">概率、赔率偏差、专家观点和风险提示集中在一个赛前工作台。</p>
          </div>
          <nav className="space-y-1 text-sm">
            {['比赛选择', '模型预测', '赔率偏差', '球队动态', '新闻源', '专家共识', '风险提示'].map((item) => (
              <a key={item} href={`#${item}`} className="block rounded-xl px-3 py-2 text-fg-2 transition hover:bg-white/[0.045] hover:text-fg-0">
                {item}
              </a>
            ))}
          </nav>
          <div className="prematch-danger-pill mt-5 rounded-2xl p-3 text-xs leading-5 text-rose">
            真实资金交易：关闭。当前页面仅做信息分析和模拟决策参考。
          </div>
        </aside>

        <main className="space-y-4">
          <section id="比赛选择" className="prematch-panel rounded-[28px] p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-3">Fixture</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <TeamBadge name={report.teams.home.name_en} flag={report.teams.home.flag} />
                  <span className="font-display text-xl font-bold text-fg-3">vs</span>
                  <TeamBadge name={report.teams.away.name_en} flag={report.teams.away.flag} />
                </div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
                <select
                  value={fixtureId}
                  onChange={(event) => void loadFixture(event.target.value)}
                  className="min-h-11 rounded-2xl border prematch-hairline bg-white/[0.055] px-3 text-sm text-fg-0 outline-none transition focus:border-gold/50 sm:min-w-[320px]"
                >
                  {fixtures.map((fixture) => (
                    <option key={fixture.id} value={fixture.id}>{fixture.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={refreshing}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-gold/25 bg-gold/90 px-4 text-sm font-semibold text-bg-0 shadow-[0_14px_40px_-22px_rgba(69,224,204,0.9)] transition hover:bg-gold disabled:opacity-60"
                >
                  <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                  刷新报告
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-fg-3">
              <span className="prematch-muted-pill rounded-full px-3 py-1">生成时间 {new Date(report.generatedAt).toLocaleString('zh-CN')}</span>
              <span className="prematch-muted-pill rounded-full px-3 py-1">{status}</span>
              <span className="prematch-muted-pill rounded-full px-3 py-1">实时源 {report.sourceStatus?.filter((source) => source.status === 'ok').length ?? 0}/{report.sourceStatus?.length ?? 0}</span>
              <span className="prematch-danger-pill rounded-full px-3 py-1 text-rose">非投注建议</span>
            </div>
          </section>

          <section id="模型预测" className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="prematch-panel rounded-[28px] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-bold text-fg-0">模型预测</h2>
                  <p className="mt-1 text-sm text-fg-2">复用现有 ELO + Poisson + 伤停调整，专家观点不覆盖模型概率。</p>
                </div>
                <Activity className="h-6 w-6 text-gold" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <ProbabilityCard label={report.teams.home.name_en} value={report.modelPrediction.homeWin} tone="emerald" />
                <ProbabilityCard label="平局" value={report.modelPrediction.draw} tone="muted" />
                <ProbabilityCard label={report.teams.away.name_en} value={report.modelPrediction.awayWin} tone="violet" />
              </div>
              <div className="prematch-panel-soft mt-5 rounded-3xl p-4">
                <div className="mb-2 flex items-center justify-between text-xs text-fg-3">
                  <span>综合第一方向</span>
                  <span>{pct(topPick.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.075]">
                  <div className="h-full rounded-full bg-gold" style={{ width: pct(topPick.value, 2) }} />
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                  <Metric label="最可能比分" value={report.modelPrediction.mostLikelyScore} />
                  <Metric label="比分概率" value={pct(report.modelPrediction.mostLikelyScoreProb)} />
                  <Metric label="总进球期望" value={(report.modelPrediction.expectedGoalsHome + report.modelPrediction.expectedGoalsAway).toFixed(2)} />
                  <Metric label="大 2.5" value={pct(report.modelPrediction.over25)} />
                </div>
              </div>
            </div>

            <div className="prematch-panel rounded-[28px] p-5">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-gold" />
                <h2 className="font-display text-xl font-bold text-fg-0">历史交锋</h2>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label={report.teams.home.name_en} value={String(report.headToHead.homeWins)} />
                <Metric label="平局" value={String(report.headToHead.draws)} />
                <Metric label={report.teams.away.name_en} value={String(report.headToHead.awayWins)} />
              </div>
              <p className="mt-4 text-sm leading-6 text-fg-2">{report.headToHead.noteZh}</p>
              <div className="mt-4 space-y-2">
                {report.headToHead.matches.length === 0 ? (
                  <div className="prematch-panel-soft rounded-2xl p-3 text-sm text-fg-3">暂无结构化历史比分，等待刷新或人工复核。</div>
                ) : report.headToHead.matches.map((match) => (
                  <div key={`${match.date}-${match.score}`} className="prematch-panel-soft rounded-2xl p-3 text-sm">
                    <div className="font-mono text-xs text-fg-3">{match.date} · {match.competition}</div>
                    <div className="mt-1 text-fg-0">{match.home} {match.score} {match.away}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="赔率偏差" className="prematch-panel rounded-[28px] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-fg-0">赔率偏差</h2>
                <p className="mt-1 text-sm text-fg-2">Edge 和 EV 用于识别模型与市场的差异，不代表下注建议。</p>
              </div>
              <TrendingUp className="h-6 w-6 text-gold" />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-3">
                  <tr>
                    <th className="px-3 py-3 text-left">市场</th>
                    <th className="px-3 py-3 text-left">选项</th>
                    <th className="px-3 py-3 text-right">模型概率</th>
                    <th className="px-3 py-3 text-right">公平赔率</th>
                    <th className="px-3 py-3 text-right">市场赔率</th>
                    <th className="px-3 py-3 text-right">Edge</th>
                    <th className="px-3 py-3 text-right">EV</th>
                  </tr>
                </thead>
                <tbody>
                  {report.oddsMarkets.flatMap((market) => market.outcomes.map((outcome) => (
                    <tr key={`${market.id}-${outcome.side}`} className="prematch-table-row">
                      <td className="px-3 py-3 text-fg-2">{market.titleZh}</td>
                      <td className="px-3 py-3 text-fg-0">{outcome.label}</td>
                      <td className="px-3 py-3 text-right font-mono tabular">{pct(outcome.modelProb)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular">{decimal(outcome.fairOdds)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular">{decimal(outcome.marketOdds)}</td>
                      <td className={cn('px-3 py-3 text-right font-mono tabular', outcome.edge >= 0 ? 'text-emerald' : 'text-rose')}>
                        {signedPct(outcome.edge)}
                      </td>
                      <td className={cn('px-3 py-3 text-right font-mono tabular', outcome.ev >= 0 ? 'text-emerald' : 'text-rose')}>
                        {outcome.ev.toFixed(2)}
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="球队动态" className="grid gap-4 xl:grid-cols-2">
            <div className="prematch-panel rounded-[28px] p-5">
              <h2 className="font-display text-xl font-bold text-fg-0">预测阵容</h2>
              <div className="mt-4 grid gap-3">
                {report.predictedLineups ? (
                  [report.predictedLineups.home, report.predictedLineups.away].map((lineup) => (
                    <div key={lineup.teamId} className="prematch-panel-soft rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-fg-0">{lineup.teamId} · {lineup.formation}</div>
                          <p className="mt-1 text-sm leading-6 text-fg-2">{lineup.statusZh}</p>
                          <p className="mt-1 text-sm leading-6 text-fg-2">{lineup.availabilityZh}</p>
                        </div>
                        {lineup.sourceUrl ? (
                          <a href={lineup.sourceUrl} target="_blank" rel="noopener noreferrer" className="prematch-muted-pill rounded-full px-2 py-1 text-[10px] text-fg-2">
                            {lineup.sourceName || '来源'}
                          </a>
                        ) : (
                          <span className="prematch-muted-pill rounded-full px-2 py-1 text-[10px] text-fg-2">待确认</span>
                        )}
                      </div>
                      <div className="mt-3 space-y-1 text-xs leading-5 text-fg-3">
                        {lineup.notesZh.map((note) => <div key={note}>· {note}</div>)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="prematch-panel-soft rounded-2xl p-3 text-sm text-fg-3">暂无预测阵容源，等待刷新。</div>
                )}
              </div>
            </div>

            <div className="prematch-panel rounded-[28px] p-5">
              <h2 className="font-display text-xl font-bold text-fg-0">球队动态</h2>
              <div className="mt-4 space-y-3">
                {report.teamNews.map((item, idx) => (
                  <div key={`${item.teamId}-${idx}`} className="prematch-panel-soft rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-fg-0">{item.titleZh}</div>
                        <p className="mt-1 text-sm leading-6 text-fg-2">{item.detailZh}</p>
                      </div>
                      <span className={cn('rounded-full px-2 py-1 text-[10px]', item.impact === 'negative' ? 'prematch-danger-pill text-rose' : 'prematch-muted-pill text-fg-2')}>
                        {item.impact}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="新闻源" className="grid gap-4 xl:grid-cols-2">
            <div className="prematch-panel rounded-[28px] p-5">
              <h2 className="font-display text-xl font-bold text-fg-0">新闻源状态</h2>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {(report.sourceStatus ?? []).length === 0 ? (
                  <div className="prematch-panel-soft rounded-2xl p-3 text-sm text-fg-3">暂无实时源状态。</div>
                ) : report.sourceStatus!.map((source) => (
                  <a key={source.sourceName} href={source.url} target="_blank" rel="noopener noreferrer" className="prematch-panel-soft rounded-2xl p-3 transition hover:border-gold/30">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-fg-0">{source.sourceName}</span>
                      <span className={cn('rounded-full px-2 py-1 text-[10px]', source.status === 'ok' ? 'prematch-muted-pill text-emerald' : source.status === 'failed' ? 'prematch-danger-pill text-rose' : 'prematch-muted-pill text-fg-3')}>
                        {source.status} · {source.itemCount}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-fg-2">{source.messageZh}</p>
                  </a>
                ))}
              </div>
            </div>

            <div id="专家共识" className="prematch-panel rounded-[28px] p-5">
              <h2 className="font-display text-xl font-bold text-fg-0">新闻与专家观点</h2>
              {(report.newsFeed ?? []).length > 0 && (
                <div className="mt-4 max-h-[220px] space-y-3 overflow-y-auto pr-1">
                  {report.newsFeed!.slice(0, 5).map((item) => (
                    <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" className="prematch-panel-soft block rounded-2xl p-4 transition hover:border-gold/30">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-fg-0">{item.sourceName}</span>
                        <span className="prematch-muted-pill rounded-full px-2 py-1 text-[10px] text-fg-2">{item.kind}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-fg-2">{item.title}</p>
                    </a>
                  ))}
                </div>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label={report.teams.home.name_en} value={pct(report.expertConsensus.home, 0)} />
                <Metric label="平局" value={pct(report.expertConsensus.draw, 0)} />
                <Metric label={report.teams.away.name_en} value={pct(report.expertConsensus.away, 0)} />
              </div>
              <p className="mt-4 text-sm leading-6 text-fg-2">{report.expertConsensus.disagreementZh}</p>
              <div className="mt-4 max-h-[340px] space-y-3 overflow-y-auto pr-1">
                {report.expertConsensus.predictions.length === 0 ? (
                  <div className="prematch-panel-soft rounded-2xl p-3 text-sm text-fg-3">暂无带来源链接的专家预测。</div>
                ) : report.expertConsensus.predictions.map((prediction) => (
                  <a
                    key={`${prediction.sourceUrl}-${prediction.summaryZh}`}
                    href={prediction.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="prematch-panel-soft block rounded-2xl p-4 transition hover:border-gold/30"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-fg-0">{prediction.sourceName}</span>
                      <ExternalLink className="h-4 w-4 text-fg-3" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-fg-2">{prediction.summaryZh}</p>
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-3">
                      Pick {prediction.pick} {prediction.scoreline ? `· ${prediction.scoreline}` : ''}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>

          <section id="风险提示" className="glass rounded-2xl border-rose/30 p-5">
            <div className="mb-4 flex items-center gap-2 text-rose">
              <ShieldAlert className="h-5 w-5" />
              <h2 className="font-display text-xl font-bold">风险提示</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {report.riskFactors.map((risk) => (
                <div key={risk} className="prematch-danger-pill flex gap-3 rounded-2xl p-3 text-sm leading-6 text-fg-1">
                  <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-rose" />
                  <span>{risk}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-xs leading-5 text-fg-3">
              来源数：{report.sources.length}。所有外部来源应以原文链接、发布时间和作者信息为准；无法溯源的内容不会作为专家观点展示。
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function TeamBadge({ name, flag }: { name: string; flag: string }) {
  return (
    <div className="prematch-panel-soft flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2">
      <Flag code={flag} size={24} />
      <span className="truncate font-display text-lg font-bold text-fg-0">{name}</span>
    </div>
  );
}

function ProbabilityCard({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'muted' | 'violet' }) {
  const color = {
    emerald: 'prematch-panel-soft text-emerald',
    muted: 'prematch-panel-soft text-fg-1',
    violet: 'prematch-panel-soft text-violet',
  }[tone];
  return (
    <div className={cn('rounded-3xl border p-4', color)}>
      <div className="truncate text-xs opacity-80">{label}</div>
      <div className="mt-2 font-display text-3xl font-bold tabular">{pct(value)}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="prematch-panel-soft rounded-2xl px-3 py-3">
      <div className="truncate text-[11px] text-fg-3">{label}</div>
      <div className="mt-1 truncate font-mono text-lg font-semibold tabular text-fg-0">{value}</div>
    </div>
  );
}


