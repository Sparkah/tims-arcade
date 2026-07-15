// Studio creation visibility has three distinct meanings:
//   unlisted: playable by anyone with the opaque link, absent from discovery
//   listed:   playable and eligible for the public Player Creations feed
//   disabled: unavailable, independently of its former listing state
//
// Legacy vibe records predate `visibility`. For those, `published` remains only
// the listing flag: false maps to unlisted, never to access denied.

export function studioCreationVisibility(rec) {
  if (!rec || rec.source !== 'vibe' || rec.status !== 'live' || rec.disabled === true) return 'disabled';
  const explicit = String(rec.visibility || '').toLowerCase();
  if (explicit === 'disabled') return 'disabled';
  if (explicit === 'listed' || explicit === 'unlisted') return explicit;
  return rec.published === true ? 'listed' : 'unlisted';
}

export function isPlayableStudioCreation(rec) {
  return studioCreationVisibility(rec) !== 'disabled';
}

export function isListedStudioCreation(rec) {
  return studioCreationVisibility(rec) === 'listed';
}
