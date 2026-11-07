/** Internal SQL expression for teams that can receive votes. */
export function eligibleTeamSql(team: string): string {
  return `${team}.active = 1
    AND NOT EXISTS (SELECT 1 FROM team_disqualifications d WHERE d.team_id = ${team}.id)
    AND NOT EXISTS (SELECT 1 FROM settings s WHERE s.key = 'team_unsubmitted:' || ${team}.id)`;
}
