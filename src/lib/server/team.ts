import { db } from "./db";

// Shared team and QR code helpers for /api/my-team, /api/collection and /api/qr/claim.// QR stickers are printed before the event with no team. The first teammate who
// taps "Scan my team" and scans one links it to their team (one code per team).

export interface TeamSummary {
  id: string;
  name: string;
  members: string;
}

export interface VoterTeam {
  team: TeamSummary;
  /** True once someone on the team has linked a QR code to it. */
  linked: boolean;
}

/** A QR code row. `teamId` is null until a team links it. */
export interface QrCode {
  code: string;
  teamId: string | null;
}

const selectVoterTeam = db.prepare(`
  SELECT teams.id, teams.name, teams.members,
    EXISTS (SELECT 1 FROM qr_codes WHERE qr_codes.team_id = teams.id) AS linked
  FROM team_members
  JOIN teams ON teams.id = team_members.team_id
  WHERE lower(team_members.email) = ? AND teams.active = 1
  ORDER BY teams.id
  LIMIT 1
`);

const selectTeam = db.prepare(`
  SELECT id, name, members FROM teams WHERE id = ? AND active = 1
`);

const selectQr = db.prepare(`
  SELECT code, team_id FROM qr_codes WHERE code = ?
`);

export function toTeam(row: Record<string, unknown>): TeamSummary | null {
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  return {
    id: row.id,
    name: row.name,
    members: typeof row.members === "string" ? row.members : "",
  };
}

/** The voter's team, or null if their email is not on any active team. */
export function voterTeam(email: string): VoterTeam | null {
  const row = selectVoterTeam.get(email);
  if (row === undefined) return null;
  const team = toTeam(row);
  if (team === null) return null;
  return { team, linked: row.linked === 1 };
}

/** An active team by id, or null. */
export function getTeam(teamId: string): TeamSummary | null {
  const row = selectTeam.get(teamId);
  return row === undefined ? null : toTeam(row);
}

/** The QR code row, or null if this code was never generated. */
export function getQr(code: string): QrCode | null {
  const row = selectQr.get(code);
  if (row === undefined || typeof row.code !== "string") return null;
  return { code: row.code, teamId: typeof row.team_id === "string" ? row.team_id : null };
}
