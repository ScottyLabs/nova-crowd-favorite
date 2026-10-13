import process from "node:process";

process.env.HOST ??= "0.0.0.0";
process.env.ORIGIN ??= process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`;

await import(new URL("./build/index.js", import.meta.url).href);
