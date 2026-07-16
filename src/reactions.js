import { config } from "./config.js";

// One status reaction per screenshot message, mutually exclusive:
//   processing  →  done | failed
// Setting one removes the others the bot placed, so only one is ever true.

const ALL = () => [config.emoji.processing, config.emoji.done, config.emoji.failed];

async function setOne(message, want) {
  const botId = message.client.user.id;
  // Remove the bot's other status reactions first.
  for (const emoji of ALL()) {
    if (emoji === want) continue;
    const r = message.reactions.cache.get(emoji) ?? message.reactions.cache.find((x) => x.emoji.name === emoji);
    if (r) await r.users.remove(botId).catch(() => {});
  }
  await message.react(want).catch(() => {});
}

/**
 * Set the status reaction on every given message.
 * @param state "processing" | "done" | "failed"
 */
export async function markMessages(messages, state) {
  const want = config.emoji[state];
  if (!want || !messages?.length) return;
  await Promise.allSettled(messages.map((m) => setOne(m, want)));
}
