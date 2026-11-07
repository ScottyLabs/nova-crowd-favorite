import { eligibleVoterSql } from "../../../lib/server/voter-eligibility";
import { redirect } from "@sveltejs/kit";
import { db } from "../../../lib/server/db";
import { signedIn } from "../../../lib/server/organizer-session";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies, setHeaders }) => {
  setHeaders({ "cache-control": "no-store" });
  if (!signedIn(cookies, process.env.ORGANIZER_PASSWORD ?? "")) redirect(303, "/organizer");
  const rows = db
    .prepare(`
    SELECT h.name, c.voter_email AS email, COUNT(*) AS collected,
      RANK() OVER (ORDER BY COUNT(*) DESC) AS rank
    FROM collections c JOIN hackers h ON h.email = c.voter_email
    WHERE h.name IS NOT NULL AND trim(h.name) != '' AND ${eligibleVoterSql("c.voter_email")}
    GROUP BY c.voter_email
    ORDER BY collected DESC, voter_email
    LIMIT 10
  `)
    .all();
  return {
    leaders: rows.map((row) => ({
      name: String(row.name),
      collected: Number(row.collected),
      rank: Number(row.rank),
    })),
    updatedAt: new Date().toISOString(),
  };
};
