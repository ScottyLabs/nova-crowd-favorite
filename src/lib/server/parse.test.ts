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
  deepStrictEqual(team?.hackers, [
    { email: "alex@example.com", name: "Alex and Sam" },
    { email: "taylor@example.com", name: "Taylor" },
  ]);
  strictEqual(team?.checkedInAt, "11/7/2026 9:56:50");
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
      hackers: [],
      checkedInAt: "date",
      repoUrl: "repo",
      slidesUrl: "slides",
      videoUrl: "video",
    },
  );
  strictEqual(parseRow(["date", ""], cols), null);
});

void test("missing and ambiguous check-in member fields never assign another person's name", () => {
  const cols = findColumns([
    "Timestamp",
    "Team Name",
    "Name",
    "Email",
    "Name",
    "Email",
    "Name",
    "Other",
    "Email",
  ]);
  const team = parseRow(
    [
      "date",
      "Team",
      "",
      "a@example.com",
      "Sam",
      "sam@example.com other@example.com",
      "Taylor",
      "",
      "t@example.com",
    ],
    cols,
  );
  deepStrictEqual(team?.hackers, []);
});
