import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} from "discord.js";
import { BRAND } from "../brand.js";
import { confidencePct } from "../roster.js";

// customId scheme (":" separated): <ns>:<action>[:<sessionId>[:<row>]]
//   rv = review names, ms = add missing, rt = retry.
// sessionId is the report message id — carried on the ephemeral steppers so
// their buttons can find the session (their own message id differs).
export const ID = {
  reviewStart: "rv:start",
  missingStart: "ms:start",
  retry: "rt:start",
  reviewApprove: (sid, row) => `rv:ok:${sid}:${row}`,
  reviewDeny: (sid, row) => `rv:no:${sid}:${row}`,
  missingPick: (sid) => `ms:pick:${sid}`,
  missingLink: (sid, row) => `ms:link:${sid}:${row}`,
  missingSave: (sid, row) => `ms:save:${sid}:${row}`,
};

// Select value meaning "none of these — let me type it" in the link step.
export const MANUAL = "__manual__";

/** Unconsumed unmatched readings for this session. */
export function availableUnknowns(session) {
  return (session.unknowns ?? [])
    .map((u, i) => ({ ...u, i }))
    .filter((u) => !session.usedUnknowns?.has(u.i));
}

/** Buttons under a normal report: only shown for sections that have items. */
export function reportComponents({ review = [], missing = [] } = {}) {
  const row = new ActionRowBuilder();
  if (review.length) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(ID.reviewStart)
        .setLabel(`Double-check names (${review.length})`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔎")
    );
  }
  if (missing.length) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(ID.missingStart)
        .setLabel(`Add by hand (${missing.length})`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✍️")
    );
  }
  return row.components.length ? [row] : [];
}

/** Button under an error embed. */
export function errorComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(ID.retry).setLabel("Try again").setStyle(ButtonStyle.Danger).setEmoji("🔁")
    ),
  ];
}

/** One step of the approve/deny walkthrough for fuzzy name matches. */
export function reviewStep(session, sid) {
  const item = session.review.find((r) => !session.resolved.has(r.row));
  if (!item) {
    return {
      embeds: [new EmbedBuilder().setColor(BRAND.success).setDescription("✅ All names reviewed.")],
      components: [],
    };
  }
  const embed = new EmbedBuilder()
    .setColor(BRAND.accent)
    .setTitle("Is this the right member?")
    .setDescription(
      `The screenshot read **“${item.extractedName}”** (${confidencePct(item.score)}% match).\n` +
        `It was saved as **${item.ign} → ${item.points}**.\n\n` +
        `Approve to keep it, or deny to clear that value.`
    )
    .setFooter({ text: `${remaining(session)} left to check` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(ID.reviewApprove(sid, item.row)).setLabel("Approve").setStyle(ButtonStyle.Success).setEmoji("✅"),
    new ButtonBuilder().setCustomId(ID.reviewDeny(sid, item.row)).setLabel("Deny — clear it").setStyle(ButtonStyle.Danger).setEmoji("✖️")
  );
  return { embeds: [embed], components: [row] };
}

/** Select menu of members still missing a value (max 25 shown). */
export function missingSelect(session, sid) {
  const remaining = session.missing.filter((m) => !session.resolved.has(m.row));
  if (!remaining.length) {
    return {
      embeds: [new EmbedBuilder().setColor(BRAND.success).setDescription("✅ Everyone has a value now.")],
      components: [],
    };
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(ID.missingPick(sid))
    .setPlaceholder("Pick a member to add a value for")
    .addOptions(
      remaining.slice(0, 25).map((m) => ({ label: m.ign.slice(0, 100), description: m.status || undefined, value: String(m.row) }))
    );
  const embed = new EmbedBuilder()
    .setColor(BRAND.accent)
    .setDescription(
      `**${remaining.length}** member(s) still need a value.` +
        (remaining.length > 25 ? " Showing the first 25 — pick one, repeat for the rest." : " Pick one to type its points.")
    );
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

/**
 * After picking a member, offer the unmatched readings to link them to. Picking
 * one fills the value from that reading AND teaches the name for next week.
 * The last option drops to the type-it-yourself modal.
 */
export function unknownLinkSelect(session, sid, row, ign) {
  const options = availableUnknowns(session)
    .slice(0, 24)
    .map((u) => ({
      label: u.name.slice(0, 100),
      description: `${u.points} pts — tap to link & remember`.slice(0, 100),
      value: String(u.i),
    }));
  options.push({ label: "None of these — type the value myself", value: MANUAL, emoji: "✏️" });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(ID.missingLink(sid, row))
    .setPlaceholder(`Which reading is ${ign}?`.slice(0, 150))
    .addOptions(options);
  const embed = new EmbedBuilder()
    .setColor(BRAND.accent)
    .setDescription(
      `Pick the screenshot reading that is **${ign}** — I'll use its points and ` +
        `remember the name so it matches automatically next week. Or type it yourself.`
    );
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

/** Modal to type a value for one missing member (optionally teaching the name). */
export function missingModal(sid, row, ign) {
  return new ModalBuilder()
    .setCustomId(ID.missingSave(sid, row))
    .setTitle(`Add value — ${ign}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("points")
          .setLabel("Weekly activity points")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. 3200")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("reading")
          .setLabel("Name the screenshot showed (optional)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("I'll remember it so it matches next week")
          .setRequired(false)
      )
    );
}

function remaining(session) {
  return session.review.filter((r) => !session.resolved.has(r.row)).length;
}
