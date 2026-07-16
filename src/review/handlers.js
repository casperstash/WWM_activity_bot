import { PermissionFlagsBits } from "discord.js";
import { getSession, saveSession, markResolved } from "./store.js";
import { reviewStep, missingSelect, missingModal, unknownLinkSelect, availableUnknowns, MANUAL } from "./components.js";
import { writeCell, clearCell } from "../sheets.js";
import { setAlias, removeAlias } from "../aliases.js";
import { runActivityProcess } from "../run.js";

const EXPIRED = "This review has expired — run `/scan` again to get fresh buttons.";

/** Route every button / select / modal interaction from a report message. */
export async function handleComponent(interaction) {
  // Only officers (Manage Messages) may approve/deny/add/retry.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({ content: "Only officers can use these controls.", ephemeral: true });
  }

  const [ns, action] = interaction.customId.split(":");

  try {
    if (ns === "rt") return await onRetry(interaction);
    if (ns === "rv") return await onReview(interaction, action);
    if (ns === "ms") return await onMissing(interaction, action);
  } catch (err) {
    console.error("component handler error:", err);
    const msg = `Couldn't do that: ${err.message}`;
    if (interaction.deferred || interaction.replied) return interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
}

async function onRetry(interaction) {
  const session = getSession(interaction.message.id) ?? {};
  const date = session.date ?? `${new Date().getMonth() + 1}/${new Date().getDate()}`;
  const scan = session.scan ?? 50;
  await interaction.update({ content: "🔁 Re-processing…", embeds: [], components: [] });
  await runActivityProcess({
    channel: interaction.channel,
    date,
    scan,
    preview: false,
    admin: false,
    status: (text) => interaction.editReply({ content: text }).catch(() => {}),
    finish: ({ embeds, components }) => interaction.editReply({ content: "", embeds, components }),
  });
}

async function onReview(interaction, action) {
  if (action === "start") {
    const sid = interaction.message.id;
    const session = getSession(sid);
    if (!session) return interaction.reply({ content: EXPIRED, ephemeral: true });
    return interaction.reply({ ...reviewStep(session, sid), ephemeral: true });
  }

  // rv:ok:<sid>:<row>  /  rv:no:<sid>:<row>
  const [, , sid, rowStr] = interaction.customId.split(":");
  const row = Number(rowStr);
  const session = getSession(sid);
  if (!session) return interaction.update({ content: EXPIRED, embeds: [], components: [] });

  const item = session.review.find((r) => r.row === row);
  if (action === "no") {
    await clearCell(session.date, row); // wrong member — clear the value
    if (item) removeAlias(item.extractedName); // and forget any prior learning
  } else if (item?.uid) {
    // Approved — learn this reading so it auto-matches at 100% from now on.
    setAlias(item.extractedName, item.uid, item.ign);
  }
  markResolved(sid, row);
  return interaction.update(reviewStep(session, sid));
}

async function onMissing(interaction, action) {
  if (action === "start") {
    const sid = interaction.message.id;
    const session = getSession(sid);
    if (!session) return interaction.reply({ content: EXPIRED, ephemeral: true });
    return interaction.reply({ ...missingSelect(session, sid), ephemeral: true });
  }

  if (action === "pick") {
    // ms:pick:<sid> — member chosen. If there are unmatched readings to link,
    // offer them (learns the name); otherwise go straight to the modal.
    const [, , sid] = interaction.customId.split(":");
    const session = getSession(sid);
    if (!session) return interaction.reply({ content: EXPIRED, ephemeral: true });
    const row = Number(interaction.values[0]);
    const member = session.missing.find((m) => m.row === row);
    if (availableUnknowns(session).length) {
      return interaction.update(unknownLinkSelect(session, sid, row, member?.ign ?? "member"));
    }
    return interaction.showModal(missingModal(sid, row, member?.ign ?? "member"));
  }

  if (action === "link") {
    // ms:link:<sid>:<row> — pick a reading to attach to this member (or manual)
    const [, , sid, rowStr] = interaction.customId.split(":");
    const row = Number(rowStr);
    const session = getSession(sid);
    if (!session) return interaction.update({ content: EXPIRED, embeds: [], components: [] });
    const member = session.missing.find((m) => m.row === row);
    const pick = interaction.values[0];

    if (pick === MANUAL) {
      return interaction.showModal(missingModal(sid, row, member?.ign ?? "member"));
    }

    const idx = Number(pick);
    const unknown = session.unknowns?.[idx];
    if (!unknown) return interaction.update({ content: "That reading is gone — try again.", embeds: [], components: [] });

    await writeCell(session.date, row, unknown.points);
    if (member?.uid) setAlias(unknown.name, member.uid, member.ign); // learn it
    markResolved(sid, row);
    session.usedUnknowns?.add(idx);
    return interaction.update({
      content: `✅ Saved **${unknown.points}** for **${member?.ign ?? `row ${row}`}** and learned “${unknown.name}” → will match automatically next week.`,
      ...orDone(missingSelect(session, sid)),
    });
  }

  if (action === "save") {
    // ms:save:<sid>:<row> — modal submit (manual value, optional taught name)
    const [, , sid, rowStr] = interaction.customId.split(":");
    const row = Number(rowStr);
    const session = getSession(sid);
    if (!session) return interaction.reply({ content: EXPIRED, ephemeral: true });

    const raw = interaction.fields.getTextInputValue("points").trim();
    const value = Number(raw.replace(/[,\s]/g, ""));
    if (!Number.isFinite(value) || value < 0) {
      return interaction.reply({ content: `“${raw}” isn't a number — try again.`, ephemeral: true });
    }
    const member = session.missing.find((m) => m.row === row);
    await writeCell(session.date, row, value);

    // Optional: if they typed the screenshot's name, remember it for next week.
    const reading = interaction.fields.getTextInputValue("reading")?.trim();
    let learned = "";
    if (reading && member?.uid) {
      setAlias(reading, member.uid, member.ign);
      learned = ` and learned “${reading}”`;
    }
    markResolved(sid, row);
    return interaction.reply({
      content: `✅ Saved **${value}** for **${member?.ign ?? `row ${row}`}**${learned}.`,
      ...withComponents(missingSelect(session, sid)),
      ephemeral: true,
    });
  }
}

// For interaction.update: pass the re-offer select, or a "done" note if empty.
function orDone(sel) {
  return sel.components.length
    ? { embeds: sel.embeds, components: sel.components }
    : { embeds: [], components: [] };
}

// Only pass embeds/components through when the select still has options.
function withComponents(sel) {
  return sel.components.length ? { embeds: sel.embeds, components: sel.components } : {};
}

export { saveSession };
