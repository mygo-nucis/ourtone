import type { PartData, Role, SongData } from './types';
import { PRESETS } from '../audio/presets';

/* names and window labels for parts, shared by the MIDI import and the studio */
export const ROLE_NAME: Record<Role, { zh: string; en: string }> = {
  melody: { zh: '主旋律', en: 'Melody' }, guitar: { zh: '吉他', en: 'Guitar' }, piano: { zh: '钢琴', en: 'Piano' },
  bass: { zh: '贝斯', en: 'Bass' }, drums: { zh: '鼓', en: 'Drums' }, other: { zh: '声部', en: 'Part' }
};
export const TAGS: Record<Role, { day: string; night: string }> = {
  melody: { day: 'MELODY', night: 'Melodia' }, guitar: { day: 'GUITAR', night: 'Chorda' }, piano: { day: 'PIANO', night: 'Clavis' },
  bass: { day: 'BASS', night: 'Fundus' }, drums: { day: 'DRUMS', night: 'Pulsus' }, other: { day: 'VOICE', night: 'Vox' }
};
/** the role a new part with this instrument most likely plays */
export function roleFor(presetId: string): Role {
  if (presetId === 'kit' || presetId === 'ekit') return 'drums';
  if (['bass', 'synthbass', 'sublow', 'drivebass', 'accordionbass'].includes(presetId)) return 'bass';
  if (['acoustic', 'nylon', 'cleangtr', 'drivegtr'].includes(presetId)) return 'guitar';
  if (['piano', 'egrand', 'epiano'].includes(presetId)) return 'piano';
  return 'other';
}
/** an empty part playing `presetId`, with an id and colour not yet used in the song */
export function newPart(song: Pick<SongData, 'parts'>, presetId: string, role: Role = roleFor(presetId)): PartData {
  const pr = PRESETS[presetId] || PRESETS.piano, used = new Set(song.parts.map(p => p.id));
  let n = 1, id = presetId;
  while (used.has(id)) id = presetId + ++n;
  const colors = new Set(song.parts.map(p => p.color));
  let color = 0;
  while (colors.has(color)) color++;
  const taken = song.parts.some(p => p.role === role);
  const name = role === 'other' || taken ? { ...pr.name } : { ...ROLE_NAME[role] };
  const tag = role === 'other' ? { day: pr.name.en.split(/[ ·]/)[0].toUpperCase().slice(0, 10), night: TAGS.other.night } : { ...TAGS[role] };
  return { id, role, name, inst: { ...pr.name }, tag, icon: role === 'melody' && pr.icon === 'piano' ? 'mic' : pr.icon, preset: pr.id, color, notes: [] };
}
