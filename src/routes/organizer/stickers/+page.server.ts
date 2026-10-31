import { error } from "@sveltejs/kit";
import qrcode from "qrcode-generator";
import { db } from "../../../lib/server/db";
import { signedIn } from "../../../lib/server/organizer-session";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies, url }) => {
  if (!signedIn(cookies, process.env.ORGANIZER_PASSWORD ?? "")) error(401, "Sign in again.");
  const origin = process.env.APP_URL;
  if (origin === undefined || origin.length === 0) error(503, "APP_URL is not configured.");
  const selected = url.searchParams.get("code");
  const rows = db.prepare("SELECT code FROM qr_codes ORDER BY rowid").all();
  const stickers = rows.map((row, index) => {
    const code = String(row.code);
    if (selected !== null && selected !== code) return null;
    const link = new URL(`/t/${code}`, origin).href;
    const qr = qrcode(0, "M");
    qr.addData(link);
    qr.make();
    return {
      number: index + 1,
      code,
      image: `data:image/svg+xml,${encodeURIComponent(qr.createSvgTag(8, 32))}`,
    };
  });
  return { stickers: stickers.filter((sticker) => sticker !== null) };
};
