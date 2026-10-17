export type Role = 'melody' | 'guitar' | 'piano' | 'bass' | 'drums' | 'other';
export type Lang = 'zh' | 'en';
export interface L10n { zh: string; en: string }
export type Mode = 'major' | 'minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian';

export interface PartData {
  id: string;
  role: Role;
  name: L10n;
  inst: L10n;
  tag: { day: string; night: string };
  icon: string;
  preset: string;
  color: number;
  /** flat runs of [tick, duration, pitch, velocity] */
  notes: number[];
  /** the studio mixer; absent means the automatic default mix */
  mix?: Mix;
  /** insert effects and macro knobs from the studio; absent means neutral */
  fx?: Partial<import('../audio/fx').Fx>;
  macro?: Partial<import('../audio/fx').Macros>;
  /** an edited sound (the sound view); absent means the preset as it is */
  patch?: import('../audio/patch').Patch;
  /** where the viewer split the part into passages (ticks, in order); rests of a bar or more split it anyway */
  cuts?: number[];
  /** play mode: stretches [from, to) in ticks where a note written long enough to hold is held, however soon the next
      note comes (set by hand for a built-in part, see the chart) */
  holds?: [number, number][];
  /** an audio track plays recordings and audio files instead of notes */
  kind?: 'notes' | 'audio';
  /** an audio track's clips, in time order */
  clips?: AudioClip[];
}

/** a stretch of recorded or imported audio on an audio track */
export interface AudioClip {
  /** the recording or file it plays: an id in the browser's audio store */
  src: string;
  /** where it starts in the song, in ticks */
  t: number;
  /** where in the source it starts, and how much of it plays, in seconds */
  off: number;
  dur: number;
  /** the file's or the take's name */
  name?: string;
}

/** a part's channel in the studio mixer */
export interface Mix {
  /** fader, dB */
  vol: number;
  /** -1 (left) .. 1 (right) */
  pan: number;
  /** reverb and delay sends, 0..1 */
  rev: number;
  dly: number;
  mute: boolean;
  solo: boolean;
}

export interface SongMeta {
  id: string;
  title: L10n;
  latin: string;
  artist: L10n;
  key: { tonic: number; mode: Mode };
  meter: [number, number];
  bpm: number;
  duration: number;
  parts: number;
  user?: boolean;
  /** for the viewer's own copy of a built-in song: the song it was copied from */
  from?: string;
  /** the note speed (level 1-6) play mode starts at until the player picks one; absent: 5 */
  speed?: number;
}

export interface SongData {
  v: 1;
  id: string;
  title: L10n;
  latin: string;
  artist: L10n;
  key: { tonic: number; mode: Mode };
  ppq: number;
  /** [tick, bpm] */
  tempos: [number, number][];
  /** [tick, numerator, denominator] */
  meters: [number, number, number][];
  end: number;
  /** mastering trim in dB, so every song plays at a similar loudness */
  gain?: number;
  parts: PartData[];
  user?: boolean;
  /** for the viewer's own copy of a built-in song: the song it was copied from */
  from?: string;
  /** a generated song: the style, seed and length that make it again */
  gen?: { style: string; seed: number; length: 'short' | 'full' };
  /** master fader in dB (studio) */
  master?: number;
  /** when this copy was last edited in the studio (ms since epoch) */
  edited?: number;
}
