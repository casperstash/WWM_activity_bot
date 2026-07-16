import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { config } from "../config.js";
import { runActivityProcess } from "../run.js";

export const data = new SlashCommandBuilder()
  .setName("scan")
  .setDescription("Scan the screenshots in this channel and write the week's activity points to the sheet")
  .addStringOption((o) =>
    o.setName("date").setDescription("Week column header, e.g. 7/19 (default: today)")
  )
  .addIntegerOption((o) =>
    o.setName("messages").setDescription("How many recent messages to scan for images (default 50, max 300)")
  )
  .addBooleanOption((o) =>
    o.setName("preview").setDescription("Preview the results without writing to the sheet")
  )
  .addBooleanOption((o) =>
    o.setName("admin").setDescription("Show technical details (screenshots read, cells written, errors)")
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction) {
  if (config.discord.channelId && interaction.channelId !== config.discord.channelId) {
    return interaction.reply({ content: "Run this in the screenshots channel.", ephemeral: true });
  }

  const date =
    interaction.options.getString("date") ??
    `${new Date().getMonth() + 1}/${new Date().getDate()}`;
  const scan = Math.min(interaction.options.getInteger("messages") ?? 50, 300);
  const preview = interaction.options.getBoolean("preview") ?? false;
  const admin = interaction.options.getBoolean("admin") ?? false;

  await interaction.deferReply();

  await runActivityProcess({
    channel: interaction.channel,
    date,
    scan,
    preview,
    admin,
    status: (text) => interaction.editReply(text).catch(() => {}),
    finish: ({ embeds, components }) => interaction.editReply({ content: "", embeds, components }),
  });
}
