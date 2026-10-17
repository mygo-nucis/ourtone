import type { L10n } from '../music/types';

/* titles for generated songs, made together in both languages (never translated word for word by a machine).
   the day's words are after-school and city things; the night's are the stage, glass and candlelight. */
type Rand = () => number;
const pick = <T>(r: Rand, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

const PLACES: [string, string][] = [
  ['高架桥', 'Overpass'], ['便利店', 'Corner Store'], ['天台', 'Rooftop'], ['海岸线', 'Coastline'], ['车站', 'Station'],
  ['游乐园', 'Funfair'], ['商店街', 'Shopping Street'], ['河堤', 'Riverbank'], ['电车', 'Tram'], ['霓虹街', 'Neon Street'], ['旧唱片店', 'Record Shop']
];
/** when: [zh, en, whether the English goes before the place] */
const TIMES: [string, string, boolean][] = [
  ['放学后', 'After School', false], ['星期五', 'Friday', true], ['夏夜', 'Summer Night', true], ['雨后', 'After the Rain', false],
  ['黄昏', 'at Dusk', false], ['清晨', 'Early Morning', true], ['周末', 'Weekend', true], ['午夜', 'Midnight', true]
];
const THINGS: [string, string][] = [
  ['汽水', 'Soda'], ['耳机', 'Headphones'], ['纸飞机', 'Paper Plane'], ['明信片', 'Postcard'], ['气泡', 'Bubbles'], ['磁带', 'Cassette'],
  ['风铃', 'Wind Chime'], ['星星糖', 'Star Candy'], ['橘子汽水', 'Orange Soda'], ['自行车', 'Bicycle'], ['晴天娃娃', 'Sunshine Doll']
];
const SUFFIX: [string, string][] = [['信号', 'Signal'], ['日记', 'Diary'], ['回声', 'Echo'], ['漫步', 'Stroll'], ['进行曲', 'March'], ['慢镜头', 'Slow Motion']];

const NIGHT_NOUNS: [string, string][] = [
  ['玻璃圣堂', 'Glass Cathedral'], ['假面', 'Masquerade'], ['月蚀', 'Eclipse'], ['黑色花园', 'Black Garden'], ['钟楼', 'Clock Tower'],
  ['人偶', 'Marionette'], ['荆棘', 'Thorns'], ['银烛', 'Silver Candle'], ['深红帷幕', 'Crimson Curtain'], ['镜厅', 'Hall of Mirrors'], ['废墟', 'Ruins']
];
const NIGHT_MODS: [string, string][] = [['午夜的', 'Midnight'], ['最后的', 'The Last'], ['无声的', 'Silent'], ['燃烧的', 'Burning'], ['沉睡的', 'Sleeping'], ['第十三个', 'The Thirteenth']];
const NIGHT_FORMS: [string, string][] = [['之歌', 'Song of the'], ['夜想曲', 'Nocturne for the'], ['挽歌', 'Elegy for the']];

export function songTitle(r: Rand, night: boolean): L10n {
  if (night) {
    const n = pick(r, NIGHT_NOUNS), k = r();
    if (k < .55) { const m = pick(r, NIGHT_MODS); return { zh: m[0] + n[0], en: `${m[1]} ${n[1]}` }; }
    const f = pick(r, NIGHT_FORMS);
    return { zh: n[0] + f[0], en: `${f[1]} ${n[1]}` };
  }
  const k = r();
  if (k < .4) { const t = pick(r, TIMES), p = pick(r, PLACES); return { zh: `${t[0]}的${p[0]}`, en: t[2] ? `${t[1]} ${p[1]}` : `${p[1]} ${t[1]}` }; }
  if (k < .7) { const p = pick(r, PLACES), t = pick(r, THINGS); return { zh: `${p[0]}的${t[0]}`, en: `${p[1]} ${t[1]}` }; }
  const t = pick(r, THINGS), s = pick(r, SUFFIX);
  return { zh: t[0] + s[0], en: `${t[1]} ${s[1]}` };
}
