// Node 18.16 lacks the global File that newer undici (inside discord.js)
// expects — polyfill it from node:buffer before discord.js loads.
import { File as NodeFile } from "node:buffer";
if (typeof globalThis.File === "undefined") globalThis.File = NodeFile;

const { Client, GatewayIntentBits, Events } = await import("discord.js");
const { config, assertVars } = await import("./config.js");
assertVars("DISCORD_TOKEN", "APP_ID", "GUILD_ID", "SPREADSHEET_ID");
const scanCmd = await import("./commands/scan.js");
const gradeCmd = await import("./commands/grade.js");
const { handleComponent } = await import("./review/handlers.js");
const { shutdownOcr } = await import("./extract/ocr.js");

const commands = new Map([scanCmd, gradeCmd].map((c) => [c.data.name, c]));

// GuildMessages + MessageContent (privileged) are needed to read the uploaded
// screenshots from channel history — enable Message Content Intent in the portal.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag} — /scan and /grade are live`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Buttons, select menus, and modal submits from report messages.
  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    return handleComponent(interaction);
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(err);
    const msg = `Something broke: ${err.message}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

process.on("SIGINT", async () => {
  await shutdownOcr();
  client.destroy();
  process.exit(0);
});

client.login(config.discord.token);
