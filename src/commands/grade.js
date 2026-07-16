import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { getGrading, setGrading } from "../grading.js";
import { BRAND, heading } from "../brand.js";

export const data = new SlashCommandBuilder()
  .setName("grade")
  .setDescription("View or change the activity grading — the point cutoffs and tier names")
  .addIntegerOption((o) =>
    o.setName("lurker_under").setDescription("Points below this are the bottom tier (default 1000)").setMinValue(1)
  )
  .addIntegerOption((o) =>
    o.setName("developing_under").setDescription("Points below this are the middle tier; at/above is the top (default 2500)").setMinValue(2)
  )
  .addStringOption((o) => o.setName("lurker_name").setDescription("Name for the bottom tier (default Lurker)").setMaxLength(24))
  .addStringOption((o) => o.setName("developing_name").setDescription("Name for the middle tier (default Developing)").setMaxLength(24))
  .addStringOption((o) => o.setName("pillar_name").setDescription("Name for the top tier (default Pillar)").setMaxLength(24))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction) {
  const patch = {};
  const lurkerUnder = interaction.options.getInteger("lurker_under");
  const developingUnder = interaction.options.getInteger("developing_under");
  if (lurkerUnder != null) patch.lurkerUnder = lurkerUnder;
  if (developingUnder != null) patch.developingUnder = developingUnder;

  const nameNames = {};
  const l = interaction.options.getString("lurker_name");
  const d = interaction.options.getString("developing_name");
  const p = interaction.options.getString("pillar_name");
  if (l) nameNames.lurker = l.trim();
  if (d) nameNames.developing = d.trim();
  if (p) nameNames.pillar = p.trim();
  if (Object.keys(nameNames).length) patch.names = nameNames;

  const changing = Object.keys(patch).length > 0;

  if (!changing) {
    // View only — just show the current scale, privately.
    return interaction.reply({ embeds: [gradingEmbed(getGrading(), false)], ephemeral: true });
  }

  try {
    const updated = setGrading(patch);
    return interaction.reply({ embeds: [gradingEmbed(updated, true)] });
  } catch (err) {
    return interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
  }
}

function n(x) {
  return x.toLocaleString("en-US");
}

/** The grading scale as a report-styled embed. */
export function gradingEmbed(g, updated) {
  return new EmbedBuilder()
    .setColor(BRAND.accent)
    .setAuthor({ name: "Serene · Grading" })
    .setTitle(`${heading("Grading")}${updated ? "  ·  updated" : ""}`)
    .setDescription(
      [
        "Weekly points decide each member's tier:",
        "",
        `🔴 **${g.names.lurker}** — under ${n(g.lurkerUnder)}`,
        `🟡 **${g.names.developing}** — ${n(g.lurkerUnder)} to ${n(g.developingUnder - 1)}`,
        `🟢 **${g.names.pillar}** — ${n(g.developingUnder)} and up`,
      ].join("\n")
    )
    .setFooter({ text: "Change it: /grade lurker_under: developing_under: lurker_name: …" });
}
