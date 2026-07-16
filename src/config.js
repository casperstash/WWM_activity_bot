import "dotenv/config";

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    appId: process.env.APP_ID,
    guildId: process.env.GUILD_ID,
    channelId: process.env.CHANNEL_ID || null,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || null,
    // Rolling alias — avoids the "model retired for new users" 404 that a
    // pinned version eventually hits. Override with GEMINI_MODEL to pin.
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
  },
  sheets: {
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "./service-account.json",
    spreadsheetId: process.env.SPREADSHEET_ID,
    sheetName: process.env.SHEET_NAME || "Activity Points",
  },
  extraction: {
    mode: process.env.EXTRACTION_MODE || "hybrid", // hybrid | gemini | ocr
    ocrAcceptScore: Number(process.env.OCR_ACCEPT_SCORE ?? 0.75),
    minRowsPerImage: Number(process.env.MIN_ROWS_PER_IMAGE ?? 5),
    maxImageAgeHours: Number(process.env.MAX_IMAGE_AGE_HOURS ?? 48),
  },
  // Reactions placed on each screenshot message. Unicode by default; for a
  // custom server emote use its id or "name:id".
  emoji: {
    processing: process.env.EMOJI_PROCESSING || "⏳",
    done: process.env.EMOJI_DONE || "✅",
    failed: process.env.EMOJI_FAILED || "❌",
  },
};

/** Called by entry points that actually need these — not at import time,
 *  so the local extraction harness runs without bot credentials. */
// Treat an empty value OR a leftover .env.example placeholder ("your-…") as
// not-set, so running before setup gives a clear message instead of a
// confusing 401 from Discord / Google.
function isUnset(v) {
  return !v || /^your-/.test(v.trim());
}

export function assertVars(...names) {
  const missing = names.filter((n) => isUnset(process.env[n]));
  if (missing.length) {
    console.error(
      `Not set up yet — these still need real values in .env (see SETUP.md): ${missing.join(", ")}`
    );
    process.exit(1);
  }
}
