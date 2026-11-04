// Sync team submissions and, optionally, a hackers tab from this spreadsheet.
//
// Setup (in the Sheet: Extensions > Apps Script):
// 1. Paste this file in.
// 2. Project Settings > Script Properties > add:
//      SYNC_URL         = https://<app-url>/api/sync
//      SYNC_HMAC_SECRET = <same value as in OpenBao>
//      SHEET_NAME       = <team submissions tab>
//      HACKERS_SHEET_NAME = <optional hackers tab with Full Name and Email Address columns>
// 3. Run pushToApp, then add a recurring time-driven trigger.

function pushToApp() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty("SYNC_URL");
  const secret = props.getProperty("SYNC_HMAC_SECRET");
  const sheetName = props.getProperty("SHEET_NAME");
  pushSheet(sheetName, url, secret);
  const hackersSheet = props.getProperty("HACKERS_SHEET_NAME");
  if (hackersSheet) pushSheet(hackersSheet, url.replace(/\/$/, "") + "/hackers", secret);
}

function pushSheet(sheetName, url, secret) {
  const rows = SpreadsheetApp.getActive()
    .getSheetByName(sheetName)
    .getDataRange()
    .getDisplayValues(); // strings, exactly as shown in the Sheet

  const body = JSON.stringify({ rows });
  const timestamp = String(Date.now());

  // Sign "timestamp.body" with the shared secret (must match the app's check)
  const sigBytes = Utilities.computeHmacSha256Signature(
    timestamp + "." + body, secret, Utilities.Charset.UTF_8,
  );
  // Apps Script returns signed bytes (-128..127); convert to hex
  const signature = sigBytes
    .map((b) => ((b + 256) % 256).toString(16).padStart(2, "0"))
    .join("");

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { "x-timestamp": timestamp, "x-signature": signature },
    payload: body,
    muteHttpExceptions: true,
  });
  console.log(res.getResponseCode(), res.getContentText());
  if (res.getResponseCode() >= 400) throw new Error("Sync failed for tab: " + sheetName);
}