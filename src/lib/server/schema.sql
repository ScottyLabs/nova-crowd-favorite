CREATE TABLE IF NOT EXISTS teams (
  id           TEXT PRIMARY KEY,
  response_id  TEXT UNIQUE NOT NULL,  -- stable key from the form/Sheet
  name         TEXT NOT NULL,
  members      TEXT NOT NULL,         -- member names, for display
  repo_url     TEXT,
  slides_url   TEXT,
  video_url    TEXT,
  active       INTEGER NOT NULL DEFAULT 1,   -- 0 if removed from the Sheet, edge case (?) if teams are deleted/removed
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id  TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email    TEXT NOT NULL,
  PRIMARY KEY (team_id, email)
);

CREATE TABLE IF NOT EXISTS voters (
  email       TEXT PRIMARY KEY,
  token_hash  TEXT UNIQUE,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qr_codes (
  code        TEXT PRIMARY KEY,
  team_id     TEXT UNIQUE REFERENCES teams(id),  -- null until claimed
  claimed_by  TEXT REFERENCES voters(email),
  claimed_at  TEXT
);

CREATE TABLE IF NOT EXISTS collections (
  voter_email  TEXT NOT NULL REFERENCES voters(email),
  team_id      TEXT NOT NULL REFERENCES teams(id),
  note         TEXT,
  scanned_at   TEXT NOT NULL,
  PRIMARY KEY (voter_email, team_id)  -- can't collect a team twice
);

CREATE TABLE IF NOT EXISTS ballots (
  voter_email   TEXT PRIMARY KEY REFERENCES voters(email),
  rank_1 TEXT REFERENCES teams(id),
  rank_2 TEXT REFERENCES teams(id),
  rank_3 TEXT REFERENCES teams(id),
  rank_4 TEXT REFERENCES teams(id),
  rank_5 TEXT REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'draft', -- either 'draft' or 'submitted'
  submitted_at  TEXT NOT NULL -- timestamp of latest draft update or time of submission
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Organizer decisions are separate from Sheet-managed team data.
CREATE TABLE IF NOT EXISTS team_disqualifications (
  team_id TEXT PRIMARY KEY REFERENCES teams(id),
  reason TEXT NOT NULL
);

-- Keep the previous ballot when an organizer resets it.
CREATE TABLE IF NOT EXISTS ballot_resets (
  id INTEGER PRIMARY KEY,
  voter_email TEXT NOT NULL REFERENCES voters(email),
  rank_1 TEXT REFERENCES teams(id),
  rank_2 TEXT REFERENCES teams(id),
  rank_3 TEXT REFERENCES teams(id),
  rank_4 TEXT REFERENCES teams(id),
  rank_5 TEXT REFERENCES teams(id),
  status TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  reset_at TEXT NOT NULL
);
