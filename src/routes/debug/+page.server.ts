import { error } from "@sveltejs/kit";
import { dev } from "$app/env";
import { db } from "../../lib/server/db";

// DEV ONLY: lists the database tables. Shows "Not found" on the real site.

export function load() {
  if (!dev) error(404, "Not found");
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all();
  return { tables: rows.map((r) => String(r.name)) };
}
