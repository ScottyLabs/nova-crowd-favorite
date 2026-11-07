/** Internal SQL expression: membership in any disqualified team blocks participation. */
export function eligibleVoterSql(email: string): string {
  return `NOT EXISTS (SELECT 1 FROM team_members blocked_member
    JOIN team_disqualifications blocked_team ON blocked_team.team_id = blocked_member.team_id
    WHERE lower(blocked_member.email) = lower(${email}))`;
}
