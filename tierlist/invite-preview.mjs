// Owner/title are public preview metadata. The private invite stays fragment-only.
export const INVITE_PREVIEW = 'https://puzzle-invites.my-account-306.workers.dev/tierlist';
export function previewText(value, max) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) return null;
  try { encodeURIComponent(value); } catch { return null; }
  const text = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return text && text.length <= max ? text : null;
}
export function inviteLink({code, owner, title, direct}) {
  // A local/alternate-origin lobby must not send guests to the production app.
  if (new URL(direct).origin !== 'https://puzzle.seall.dev') return `${direct}#join=${code}`;
  owner = previewText(owner, 40); title = previewText(title, 120);
  if (!owner || !title) return `${direct}#join=${code}`;
  const url = new URL(INVITE_PREVIEW);
  url.search = new URLSearchParams({owner, title});
  url.hash = `join=${code}`;
  // Discord does not preview URLs longer than 2048 characters. Never truncate a capability.
  return url.href.length <= 2048 ? url.href : `${direct}#join=${code}`;
}
