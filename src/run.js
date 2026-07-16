import { config } from "./config.js";
import { readRoster, writeWeekColumn } from "./sheets.js";
import { buildRoster, needsReview } from "./roster.js";
import { extractBatch } from "./extract/pipeline.js";
import { buildReport, buildErrorReport } from "./report.js";
import { reportComponents, errorComponents } from "./review/components.js";
import { saveSession } from "./review/store.js";
import { markMessages } from "./reactions.js";

/**
 * The whole weekly flow, decoupled from how it was triggered.
 *
 * @param status  (text) => void         progress updates (throttle upstream)
 * @param finish  ({embeds,components}) => Promise<Message>   sends the result,
 *                returns the posted message so we can key its review session
 */
export async function runActivityProcess({ channel, date, scan, preview, admin, status, finish }) {
  const images = await collectImages(channel, scan);
  if (!images.length) {
    const msg = await finish({
      embeds: [
        buildErrorReport({
          date,
          headline: "No screenshots",
          reason: `No screenshots found in the last ${scan} messages (within ${config.extraction.maxImageAgeHours}h). Post them, then try again.`,
          detail: "no image attachments found",
        }),
      ],
      components: errorComponents(),
    });
    saveSession(msg.id, { date, scan });
    return;
  }

  // Unique screenshot messages — mark them "processing" while we work.
  const screenshotMessages = [...new Map(images.map((i) => [i.message.id, i.message])).values()];
  await markMessages(screenshotMessages, "processing");

  status?.(`Found ${images.length} screenshots — reading…`);
  for (const img of images) {
    const res = await fetch(img.url);
    img.buffer = Buffer.from(await res.arrayBuffer());
  }

  const roster = buildRoster(await readRoster());

  let lastEdit = 0;
  const batch = await extractBatch(images, roster, {
    onProgress: (m) => {
      const now = Date.now();
      if (now - lastEdit > 2500) {
        lastEdit = now;
        status?.(`Processing ${m}`);
      }
    },
  });

  // Nothing readable → failure embed, write nothing, keep retry context.
  if (batch.results.size === 0) {
    await markMessages(screenshotMessages, "failed");
    const detail = admin
      ? `tesseract failed to parse ${images.length} screenshot(s)` +
        (batch.stats.readErrors ? ` · ${batch.stats.readErrors} read error(s)` : "")
      : undefined;
    const msg = await finish({ embeds: [buildErrorReport({ date, detail })], components: errorComponents() });
    saveSession(msg.id, { date, scan });
    return;
  }

  let written = null;
  let flags = null;
  if (!preview) {
    const values = new Map();
    for (const [row, r] of batch.results) values.set(row, r.points);
    ({ written, flags } = await writeWeekColumn(date, values));
  }

  const review = [...batch.results.values()]
    .filter((r) => needsReview(r.score))
    .map((r) => ({ row: r.entry.row, uid: r.entry.uid, ign: r.entry.ign, points: r.points, extractedName: r.extractedName, score: r.score }));
  const missing = roster
    .filter((e) => !batch.results.has(e.row))
    .map((e) => ({ row: e.row, uid: e.uid, ign: e.ign, status: e.status }));
  // Readings the screenshots produced that matched nobody — offered when adding
  // a member by hand, so linking one both fills the value and learns the name.
  const unknowns = batch.unknowns.map((u) => ({ name: u.name, points: u.points }));

  const embed = buildReport({ date, preview, admin, batch, roster, written, flags });
  // Action buttons only make sense once values exist in the sheet.
  const components = preview ? [] : reportComponents({ review, missing });

  await markMessages(screenshotMessages, "done");

  const msg = await finish({ embeds: [embed], components });
  saveSession(msg.id, { date, scan, review, missing, unknowns, usedUnknowns: new Set() });
}

export async function collectImages(channel, scan) {
  const maxAgeMs = config.extraction.maxImageAgeHours * 3600_000;
  const cutoff = Date.now() - maxAgeMs;
  const images = [];
  let before;
  let scanned = 0;

  while (scanned < scan) {
    const page = await channel.messages.fetch({ limit: Math.min(100, scan - scanned), before });
    if (!page.size) break;
    for (const msg of page.values()) {
      if (msg.createdTimestamp < cutoff) return images.reverse();
      for (const att of msg.attachments.values()) {
        if (att.contentType?.startsWith("image/")) {
          images.push({ name: att.name, url: att.url, contentType: att.contentType, message: msg });
        }
      }
    }
    scanned += page.size;
    before = page.last().id;
  }
  return images.reverse();
}
