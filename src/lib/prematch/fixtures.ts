import groupsData from '@/data/groups.json';
import teamsData from '@/data/teams.json';
import type { Team } from '@/lib/sim/types';
import type { PrematchFixture } from './types';

const GROUP_PAIRS: Array<[number, number]> = [
  [0, 1],
  [2, 3],
  [0, 2],
  [3, 1],
  [3, 0],
  [1, 2],
];

const groups = (groupsData as { groups: Record<string, string[]> }).groups;
const teams = (teamsData as { teams: Team[] }).teams;
const teamById = new Map(teams.map((team) => [team.id, team]));

export function getTeamById(teamId: string): Team {
  const team = teamById.get(teamId);
  if (!team) throw new Error(`Unknown team id: ${teamId}`);
  return team;
}

export function listPrematchFixtures(): PrematchFixture[] {
  const fixtures: PrematchFixture[] = [];
  for (const [group, ids] of Object.entries(groups)) {
    GROUP_PAIRS.forEach(([homeIdx, awayIdx], pairIdx) => {
      const homeId = ids[homeIdx];
      const awayId = ids[awayIdx];
      const home = getTeamById(homeId);
      const away = getTeamById(awayId);
      fixtures.push({
        id: `${group}:${pairIdx}`,
        stage: 'group',
        group,
        homeId,
        awayId,
        label: `${group}组 ${home.name_en} vs ${away.name_en}`,
      });
    });
  }
  return fixtures;
}

export function getPrematchFixture(fixtureId?: string | null): PrematchFixture {
  const fixtures = listPrematchFixtures();
  if (!fixtureId) return fixtures[0];
  return fixtures.find((fixture) => fixture.id === fixtureId) ?? fixtures[0];
}

