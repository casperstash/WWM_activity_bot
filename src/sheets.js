import { google } from "googleapis";
import { config } from "./config.js";
import { activityFlag, FLAG_COLORS } from "./flag.js";

const { spreadsheetId, sheetName, keyFile } = config.sheets;

async function client() {
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function getSheetId(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets.find((s) => s.properties.title === sheetName);
  if (!sheet) throw new Error(`Tab "${sheetName}" not found in spreadsheet`);
  return sheet.properties.sheetId;
}

/**
 * Read the member rows: columns A:D (UID, IGN, Discord, Status).
 * Returns [{ row, uid, ign, discord, status }] — row is 1-based.
 * Stops treating rows as members once IGN is empty (the summary block
 * at the bottom of the tab has no IGN).
 */
export async function readRoster() {
  const sheets = await client();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:D`,
  });
  const rows = res.data.values ?? [];
  const members = [];
  for (let i = 1; i < rows.length; i++) {
    const [uid = "", ign = "", discord = "", status = ""] = rows[i];
    if (!ign.trim()) continue; // header/summary/blank rows
    members.push({ row: i + 1, uid: uid.trim(), ign: ign.trim(), discord, status });
  }
  return members;
}

/**
 * Insert a new week column at E (index 4 — right after Status, newest week
 * first, matching the sheet's existing convention), set its header, and
 * write points for each matched member row.
 *
 * values: Map<sheetRowNumber, number|string>
 */
export async function writeWeekColumn(label, values) {
  const sheets = await client();
  const sheetId = await getSheetId(sheets);

  // 1. Insert the column (shifts old weeks right)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 },
            inheritFromBefore: false,
          },
        },
      ],
    },
  });

  // 2. Header + per-row values in one batch
  const data = [{ range: `${sheetName}!E1`, values: [[label]] }];
  for (const [row, value] of values) {
    data.push({ range: `${sheetName}!E${row}`, values: [[value]] });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });

  // 3. Color-flag the freshly written cells by activity level. The inserted
  //    column starts blank (inheritFromBefore:false), so we only paint the
  //    red/yellow cells — anything ≥2500, 0, or blank keeps the default fill.
  //    Painting only column E (not whole rows) keeps each week's flags with
  //    that week and never touches identity columns or historical formatting.
  const flags = { red: 0, yellow: 0 };
  const formatRequests = [];
  for (const [row, value] of values) {
    const flag = activityFlag(value);
    if (!flag) continue;
    flags[flag]++;
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: 4, endColumnIndex: 5 },
        cell: { userEnteredFormat: { backgroundColor: FLAG_COLORS[flag] } },
        fields: "userEnteredFormat.backgroundColor",
      },
    });
  }
  if (formatRequests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: formatRequests } });
  }

  return { written: values.size, flags };
}

function colLetter(index0) {
  let n = index0 + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Locate the week column by its header label rather than assuming E. After a
// later week is inserted the newest column shifts right, so a review button
// clicked hours later still targets the correct week.
async function findWeekColumn(sheets, date) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!1:1` });
  const header = res.data.values?.[0] ?? [];
  const index0 = header.findIndex((h) => (h ?? "").trim() === date);
  if (index0 === -1) throw new Error(`week column “${date}” not found — was it renamed or removed?`);
  return { index0, letter: colLetter(index0) };
}

/** Write one member's value into an existing week column and color-flag it. */
export async function writeCell(date, row, value) {
  const sheets = await client();
  const sheetId = await getSheetId(sheets);
  const { index0, letter } = await findWeekColumn(sheets, date);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${letter}${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });

  const flag = activityFlag(value);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: index0, endColumnIndex: index0 + 1 },
            cell: { userEnteredFormat: flag ? { backgroundColor: FLAG_COLORS[flag] } : {} },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
      ],
    },
  });
  return { flag };
}

/** Clear one member's value + fill in an existing week column (deny a match). */
export async function clearCell(date, row) {
  const sheets = await client();
  const sheetId = await getSheetId(sheets);
  const { index0, letter } = await findWeekColumn(sheets, date);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${letter}${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[""]] },
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: index0, endColumnIndex: index0 + 1 },
            cell: { userEnteredFormat: {} },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
      ],
    },
  });
}
