import process from "node:process";

process.env.HOST ??= "0.0.0.0";
// Allow the organizer's database backup upload (limited to 50 MB in the action).
process.env.BODY_SIZE_LIMIT ??= "55M";
process.env.ORIGIN ??= process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`;

await import(new URL("./build/index.js", import.meta.url).href);
