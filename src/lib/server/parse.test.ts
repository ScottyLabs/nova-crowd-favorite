import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { findColumns, parseRow } from "./parse.ts";

void test("check-in forms collect all repeated member columns and ignore unlabeled helper columns", () => {
  const header = [
    "Timestamp",
    "Team Name",
    "Discord Username",
    "Name",
    "Email",
    "Do you have another team member to add?",
    "Name",
    "Email",
    "Name",
    "Email",
    "",
    "",
  ];
  const row = [
    "11/7/2026 9:56:50",
    "Example",
    "discord",
    " Alex and Sam ",
    "Alex@Example.com",
    "Yes",
    "Taylor",
    "taylor@example.com",
    "",
    "ALEX@example.com",
    "Wrong team",
    "wrong@example.com",
  ];
  const team = parseRow(row, findColumns(header));
  strictEqual(team?.responseId, "11/7/2026 9:56:50|example");
  strictEqual(team?.members, "Alex and Sam, Taylor");
  deepStrictEqual(team?.emails, ["alex@example.com", "taylor@example.com"]);
});

void test("existing submission headers preserve team identities and member parsing", () => {
  const cols = findColumns([
    "Timestamp",
    "Team Name",
    "Team Members",
    "Team Emails",
    "Github",
    "Slides",
    "Video",
  ]);
  deepStrictEqual(
    parseRow(
      [
        "date",
        "Team",
        "Alex and Sam; Taylor",
        "A@Example.com; B@example.com",
        "repo",
        "slides",
        "video",
      ],
      cols,
    ),
    {
      responseId: "date|team",
      name: "Team",
      members: "Alex, Sam, Taylor",
      emails: ["a@example.com", "b@example.com"],
      repoUrl: "repo",
      slidesUrl: "slides",
      videoUrl: "video",
    },
  );
  strictEqual(parseRow(["date", ""], cols), null);
});
