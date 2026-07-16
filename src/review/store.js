// In-memory review sessions, keyed by the report message id. A session holds
// what the message's buttons act on (fuzzy matches to approve/deny, missing
// members to fill, retry context). Reviews happen right after posting, so an
// in-process Map with a TTL is enough — a bot restart simply expires the
// buttons, and the handler tells the user to re-run /scan.

const TTL_MS = 2 * 60 * 60 * 1000; // 2h
const sessions = new Map();

function prune() {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expiresAt <= now) sessions.delete(k);
}

export function saveSession(messageId, data) {
  prune();
  sessions.set(messageId, {
    resolved: new Set(),
    ...data,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function getSession(messageId) {
  const s = sessions.get(messageId);
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    sessions.delete(messageId);
    return null;
  }
  return s;
}

export function markResolved(messageId, row) {
  const s = getSession(messageId);
  if (s) s.resolved.add(row);
}
