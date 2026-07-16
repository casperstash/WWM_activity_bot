import { EmbedBuilder } from "discord.js";
import { activityFlag } from "./flag.js";
import { getGrading } from "./grading.js";
import { confidencePct, needsReview } from "./roster.js";
import { BRAND, heading } from "./brand.js";

function countFlags(results) {
  const counts = { red: 0, yellow: 0 };
  for (const r of results.values()) {
    const f = activityFlag(r.points);
    if (f) counts[f]++;
  }
  return counts;
}

function flaggedList(results, flag) {
  return [...results.values()]
    .filter((r) => activityFlag(r.points) === flag)
    .sort((a, b) => a.points - b.points)
    .map((r) => `${r.entry.ign} — ${r.points}`);
}

function reviewList(results) {
  return [...results.values()]
    .filter((r) => needsReview(r.score))
    .sort((a, b) => a.score - b.score)
    .map((r) => `${r.entry.ign} — ${r.points}  ·  ${confidencePct(r.score)}% (read “${r.extractedName}”)`);
}

function chunkList(items, max = 1000) {
  const chunks = [];
  let cur = "";
  for (const item of items) {
    if (cur.length + item.length + 1 > max) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + item;
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : ["—"];
}

/**
 * The weekly report.
 *
 * Simplified by default — plain-language, about PEOPLE, not machinery. The
 * technical counts (screenshots read, cells written, unreadable images) only
 * appear when admin=true, so a non-technical officer sees just what to act on.
 */
export function buildReport({ date, preview, admin = false, batch, roster, written, flags }) {
  const { results, unknowns, conflicts, stats } = batch;

  const missing = roster.filter((e) => !results.has(e.row));
  const flagCounts = flags ?? countFlags(results);
  const healthy = Math.max(0, results.size - flagCounts.red - flagCounts.yellow);
  const flaggedRed = flaggedList(results, "red");
  const flaggedYellow = flaggedList(results, "yellow");
  const review = reviewList(results);
  const { names, lurkerUnder, developingUnder } = getGrading();

  const embed = new EmbedBuilder()
    .setColor(preview ? BRAND.muted : BRAND.success)
    .setAuthor({ name: "Serene · Weekly activity" })
    .setTitle(`${preview ? "Preview · " : ""}${heading("Activity")}  ·  ${date}`)
    .setDescription(
      [
        preview ? "_Preview — nothing has been saved yet._" : "Recorded. Here's who to keep an eye on:",
        `🔴 **${flagCounts.red}** ${names.lurker}    🟡 **${flagCounts.yellow}** ${names.developing}    🟢 **${healthy}** ${names.pillar}`,
      ].join("\n\n")
    );

  if (review.length) {
    for (const chunk of chunkList(review)) {
      embed.addFields({ name: `🔎 Double-check these names (${review.length})`, value: chunk });
    }
  }
  if (flaggedRed.length) {
    for (const chunk of chunkList(flaggedRed)) {
      embed.addFields({ name: `🔴 ${names.lurker} — under ${lurkerUnder} (${flaggedRed.length})`, value: chunk });
    }
  }
  if (flaggedYellow.length) {
    for (const chunk of chunkList(flaggedYellow)) {
      embed.addFields({ name: `🟡 ${names.developing} — ${lurkerUnder} to ${developingUnder - 1} (${flaggedYellow.length})`, value: chunk });
    }
  }
  if (missing.length) {
    for (const chunk of chunkList(missing.map((e) => `${e.ign} (${e.status})`))) {
      embed.addFields({ name: `✍️ Add by hand (${missing.length})`, value: chunk });
    }
  }
  if (unknowns.length) {
    for (const chunk of chunkList(unknowns.map((u) => `${u.name} → ${u.points}`))) {
      embed.addFields({ name: `❓ New members? (${unknowns.length})`, value: chunk });
    }
  }
  if (conflicts.length) {
    for (const chunk of chunkList(conflicts.map((c) => `${c.ign}: ${c.values.join(" / ")}`))) {
      embed.addFields({ name: `⚠️ Conflicting values (${conflicts.length})`, value: chunk });
    }
  }

  // Admin-only: the machinery. Hidden from the simplified view entirely.
  if (admin) {
    const bits = [
      `${results.size}/${roster.length} members matched`,
      `${stats.images} screenshots read`,
      written != null ? `${written} written to column E` : "not written (preview)",
    ];
    if (stats.readErrors) bits.push(`⚠️ ${stats.readErrors} unreadable`);
    embed.addFields({ name: "⚙️ Admin", value: bits.join("  ·  ") });
  }

  return embed;
}

/**
 * Failure embed — same visual language as the report, red bar.
 * User-facing message is plain and reassuring (nothing was saved); the raw
 * technical reason rides in the footer for whoever needs it.
 */
export function buildErrorReport({ date, headline, reason, detail }) {
  return new EmbedBuilder()
    .setColor(BRAND.error)
    .setAuthor({ name: "Serene · Weekly activity" })
    .setTitle(`⚠  ${heading(headline ?? "Couldn't read")}${date ? `  ·  ${date}` : ""}`)
    .setDescription(
      reason ??
        "Nothing was saved. The screenshots couldn't be read this time — please re-post clearer images and try again, or ask an admin for help."
    )
    .setFooter({ text: detail ?? "database failure · tesseract failed to parse screenshots" });
}
