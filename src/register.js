// One-time (and after any command change): node src/register.js
import { File as NodeFile } from "node:buffer";
if (typeof globalThis.File === "undefined") globalThis.File = NodeFile;

const { REST, Routes } = await import("discord.js");
const { config, assertVars } = await import("./config.js");
assertVars("DISCORD_TOKEN", "APP_ID", "GUILD_ID");
const scan = await import("./commands/scan.js");
const grade = await import("./commands/grade.js");

const rest = new REST().setToken(config.discord.token);
try {
  await rest.put(Routes.applicationGuildCommands(config.discord.appId, config.discord.guildId), {
    body: [scan.data.toJSON(), grade.data.toJSON()],
  });
  console.log("Registered /scan and /grade (guild-scoped — available immediately).");
} catch (err) {
  // Clean, friendly failure — and process.exitCode (not throw) lets Node tear
  // down normally, avoiding the noisy stack + intermittent Windows exit crash.
  if (err.status === 401) {
    console.error("Discord rejected the token. Check DISCORD_TOKEN and APP_ID in .env (SETUP.md §1).");
  } else if (err.status === 404) {
    console.error("Discord couldn't find that application/guild. Check APP_ID and GUILD_ID in .env (SETUP.md §1).");
  } else if (err.status === 403 || /missing access/i.test(err.message || "")) {
    console.error(
      "Missing Access — the bot was invited WITHOUT the 'applications.commands' scope\n" +
        "(or GUILD_ID isn't a server the bot is in).\n" +
        "Fix: OAuth2 → URL Generator → check BOTH 'bot' and 'applications.commands' in the\n" +
        "SCOPES section (separate from permissions), open the generated URL, and re-authorize\n" +
        "the bot on your server. Then run this again — no need to remove the bot first."
    );
  } else {
    console.error("Registration failed:", err.message);
  }
  process.exitCode = 1;
}
