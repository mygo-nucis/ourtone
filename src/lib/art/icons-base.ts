/* ported from the approved style frames. */
/* two bespoke instrument icon sets on a 24-unit grid.
   day (MyGO!!!!!): cut-out stickers — thick ink outlines, white bodies, a colour fill, glossy highlights, a little tilt.
   night (Ave Mujica): engravings — hairline gold/bone strokes, jewel glass panes, hatching, lozenges and pointed finials.
   placeholders: {I} ink / line colour, {W} base (paper or dark glass), {A} part colour, {G} gold, {H} highlight */
export const ICONS_DAY: Record<string, string> = {
  mic: `<g transform="rotate(-14 12 12)"><path d="M9.7 13.4h4.6l-.9 8a1.5 1.5 0 0 1-1.4 1.3 1.5 1.5 0 0 1-1.4-1.3Z" fill="{W}" stroke="{I}" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="9" y="12.4" width="6" height="2.1" rx="1" fill="{I}"/><circle cx="12" cy="7.4" r="5.4" fill="{A}" stroke="{I}" stroke-width="1.6"/>
    <g fill="{I}" opacity=".32"><circle cx="10" cy="5.6" r=".62"/><circle cx="12.4" cy="5.2" r=".62"/><circle cx="9" cy="8" r=".62"/><circle cx="11.3" cy="7.7" r=".62"/><circle cx="13.7" cy="7.4" r=".62"/><circle cx="15" cy="5.9" r=".62"/><circle cx="10.4" cy="10.2" r=".62"/><circle cx="12.8" cy="10" r=".62"/><circle cx="14.9" cy="9.4" r=".62"/></g>
    <path d="M8.7 5.3a4 4 0 0 1 2.6-2" fill="none" stroke="{H}" stroke-width="1.3" stroke-linecap="round"/><rect x="11.3" y="16" width="1.4" height="2.6" rx=".7" fill="{A}" stroke="{I}" stroke-width=".7"/></g>
    <path d="M20.2 2.2l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55Z" fill="{I}"/>`,
  cleangtr: `<path d="M12.6 12.4 19.6 4.2" stroke="{I}" stroke-width="3.4" stroke-linecap="round"/><path d="M12.6 12.4 19.6 4.2" stroke="{W}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M18.6 3.2l2.5-2.2 1.3 1-1.2 2.9-1.6.4Z" fill="{I}" stroke="{I}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M4.2 13.3c1.3-2.4 4.1-2.6 5.5-1.3.8.7 1.6.8 2.5.2 1.7-1 3.5.3 3.3 2.3-.1 1.3-1.1 1.9-1 3 .1 1.5 1.5 2.3.6 4.1-1 2.1-4.4 2.6-6.8 2-2.5-.6-4.6-2.2-4.7-4.4-.1-1.5.9-2.3.6-3.5-.2-.9-.8-1.3 0-2.4Z" fill="{A}" stroke="{I}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M5.8 14.4c1.2-1 2.8-.9 3.8.2l1.2 4.3c-1.1 1.3-3.1 1.5-4.4.6-1-.7-.7-1.9-.9-2.9-.1-1-.5-1.5.3-2.2Z" fill="{W}"/>
    <path d="M9.6 16.4l2.1-2.1M10.6 18.3l2.1-2.1" stroke="{I}" stroke-width="1.3" stroke-linecap="round"/><path d="M10.2 19.4 19.2 5.2" stroke="{I}" stroke-width=".35" opacity=".5"/>
    <circle cx="13.6" cy="20" r=".75" fill="{I}"/><circle cx="14.8" cy="18.5" r=".75" fill="{I}"/><path d="M7.2 20.6a2.4 2.4 0 0 1-1.6-1.4" fill="none" stroke="{H}" stroke-width="1" stroke-linecap="round" opacity=".8"/>`,
  acoustic: `<path d="M13.2 11.6 19.8 4.4" stroke="{I}" stroke-width="3.4" stroke-linecap="round"/><path d="M13.2 11.6 19.8 4.4" stroke="{W}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M19 3.6l2-2.1 1.5 1.3-1.7 2.2Z" fill="{I}" stroke="{I}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M9.4 8.9c2.5-.3 4.1 1.5 3.8 3.5-.1 1 .5 1.7 1.4 2.4 1.7 1.4 2.1 3.9.7 5.7-1.6 2.1-4.8 2.6-7.5 1.4-3-1.3-4.1-4.3-2.7-6.4.7-1.1 1.3-1.7 1.3-2.8 0-1.9 1.1-3.5 3-3.8Z" fill="{A}" stroke="{I}" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="10.4" cy="14.6" r="2.5" fill="none" stroke="{W}" stroke-width="1"/><circle cx="10.4" cy="14.6" r="1.6" fill="{I}"/>
    <path d="M6.6 18.4l2.6 1.6" stroke="{I}" stroke-width="1.5" stroke-linecap="round"/><path d="M6.1 12.2a3 3 0 0 1 1.3-1.7" fill="none" stroke="{H}" stroke-width="1" stroke-linecap="round" opacity=".85"/>`,
  piano: `<g transform="rotate(-7 12 13)"><rect x="2.2" y="7.6" width="19.6" height="11" rx="2.4" fill="{A}" stroke="{I}" stroke-width="1.6"/>
    <rect x="3.9" y="11.4" width="16.2" height="5.6" rx=".9" fill="{W}" stroke="{I}" stroke-width="1.1"/>
    <path d="M6.6 11.6v5.2M9.3 11.6v5.2M12 11.6v5.2M14.7 11.6v5.2M17.4 11.6v5.2" stroke="{I}" stroke-width=".7"/>
    <g fill="{I}"><rect x="5.7" y="11.4" width="1.7" height="3.1" rx=".4"/><rect x="8.4" y="11.4" width="1.7" height="3.1" rx=".4"/><rect x="13.8" y="11.4" width="1.7" height="3.1" rx=".4"/><rect x="16.5" y="11.4" width="1.7" height="3.1" rx=".4"/></g>
    <circle cx="5.2" cy="9.5" r=".75" fill="{I}"/><circle cx="7.3" cy="9.5" r=".75" fill="{I}"/><rect x="12.6" y="8.8" width="5.6" height="1.5" rx=".5" fill="{W}" stroke="{I}" stroke-width=".7"/>
    <path d="M3.4 17.7h3" stroke="{H}" stroke-width=".9" stroke-linecap="round" opacity=".8"/></g>`,
  bass: `<g transform="translate(24 0) scale(-1 1)"><path d="M11.8 13.2 20.8 3" stroke="{I}" stroke-width="3.2" stroke-linecap="round"/><path d="M11.8 13.2 20.8 3" stroke="{W}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M20 2.1l2.4-1.7 1 1.2-1.6 2.4Z" fill="{I}" stroke="{I}" stroke-width=".8" stroke-linejoin="round"/><path d="M21.6 1.3l.9.7M22.4 2.4l.8.6" stroke="{I}" stroke-width=".9" stroke-linecap="round"/>
    <path d="M3.4 14.2c1-2.6 3.8-3.4 5.5-2.3.9.6 1.8.5 2.7-.1 1.8-1.2 3.9.2 3.5 2.4-.2 1.3-1.2 2-1 3.2.2 1.5 1.3 2.5.3 4.3-1.2 2-4.6 2.4-7.1 1.7-2.6-.8-4.5-2.5-4.4-4.8 0-1.5.9-2.2.6-3.3-.2-.6-.5-.8-.1-1.1Z" fill="{A}" stroke="{I}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M5 15.4c1.1-1 2.7-1 3.8 0l1.4 4.8c-1.2 1.2-3.2 1.3-4.5.4-.9-.7-.6-1.8-.8-2.8-.2-1-.7-1.6.1-2.4Z" fill="{W}"/><path d="M9.2 17.8l2.6-2.6" stroke="{I}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M10.4 19.2 20.4 3.8M9.8 18.8 19.8 3.4" stroke="{I}" stroke-width=".3" opacity=".5"/><path d="M5.8 21.2a2.6 2.6 0 0 1-1.8-1.3" fill="none" stroke="{H}" stroke-width="1" stroke-linecap="round" opacity=".8"/></g>`,
  kit: `<path d="M5.2 4.4 12 11.2M18.8 4.4 12 11.2" stroke="{I}" stroke-width="2.4" stroke-linecap="round"/><path d="M5.2 4.4 12 11.2M18.8 4.4 12 11.2" stroke="{W}" stroke-width=".9" stroke-linecap="round"/>
    <circle cx="4.9" cy="4.1" r="1.3" fill="{W}" stroke="{I}" stroke-width="1"/><circle cx="19.1" cy="4.1" r="1.3" fill="{W}" stroke="{I}" stroke-width="1"/>
    <path d="M3.6 12.6v5.6c0 1.9 3.7 3.4 8.4 3.4s8.4-1.5 8.4-3.4v-5.6" fill="{A}" stroke="{I}" stroke-width="1.6" stroke-linejoin="round"/>
    <ellipse cx="12" cy="12.6" rx="8.4" ry="3.1" fill="{W}" stroke="{I}" stroke-width="1.6"/>
    <path d="M6.2 15.7v4M9 16.4v4.3M12 16.6v4.4M15 16.4v4.3M17.8 15.7v4" stroke="{I}" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M5.4 12.2a6 2 0 0 1 3-1.4" fill="none" stroke="{A}" stroke-width="1" stroke-linecap="round" opacity=".7"/>`,
  viola: `<path d="M3.2 21.4 20.4 4.6" stroke="{I}" stroke-width="1.6" stroke-linecap="round"/><path d="M4 21 20.2 5.3" stroke="{H}" stroke-width=".5" opacity=".9"/>
    <path d="M12.2 6.6c-2.6 0-4 1.3-4 2.9 0 1 .7 1.6.7 2.3 0 .9-1.8 1.6-1.8 3.8 0 2.7 2.2 4.5 5.1 4.5s5.1-1.8 5.1-4.5c0-2.2-1.8-2.9-1.8-3.8 0-.7.7-1.3.7-2.3 0-1.6-1.4-2.9-4-2.9Z" fill="{A}" stroke="{I}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12.2 6.6V2.6" stroke="{I}" stroke-width="2.2" stroke-linecap="round"/><circle cx="12.2" cy="1.9" r="1.1" fill="{W}" stroke="{I}" stroke-width=".9"/>
    <path d="M10.5 12.6c.5.5.5 1.2 0 1.8s-.5 1.3 0 1.8M13.9 12.6c-.5.5-.5 1.2 0 1.8s.5 1.3 0 1.8" fill="none" stroke="{I}" stroke-width=".8" stroke-linecap="round"/>
    <path d="M11.2 17.6h2" stroke="{I}" stroke-width="1.3" stroke-linecap="round"/><path d="M9.3 9.4a2.2 2.2 0 0 1 1.2-1.5" fill="none" stroke="{H}" stroke-width=".9" stroke-linecap="round"/>`,
  organ: `<rect x="3" y="17" width="18" height="4.6" rx="1.2" fill="{A}" stroke="{I}" stroke-width="1.5"/>
    <g stroke="{I}" stroke-width="1.3" fill="{W}"><path d="M4.4 17V9.4a1.3 1.3 0 0 1 2.6 0V17Z"/><path d="M7.8 17V5.6a1.3 1.3 0 0 1 2.6 0V17Z"/><path d="M11.2 17V3.2a1.3 1.3 0 0 1 2.6 0V17Z"/><path d="M14.6 17V5.6a1.3 1.3 0 0 1 2.6 0V17Z"/><path d="M18 17V9.4a1.3 1.3 0 0 1 2.6 0V17Z"/></g>
    <g fill="{I}"><path d="M5 13.2h1.4l-.7 1.2Z"/><path d="M8.4 11.2h1.4l-.7 1.2Z"/><path d="M11.8 9.6h1.4l-.7 1.2Z"/><path d="M15.2 11.2h1.4l-.7 1.2Z"/><path d="M18.6 13.2h1.4l-.7 1.2Z"/></g>
    <path d="M5 19.3h14" stroke="{W}" stroke-width=".9" stroke-dasharray="1.2 1.2"/>`,
  ocarina: `<path d="M5.4 10.4 1.8 9.6a.9.9 0 0 0-1.1.9v2.8a.9.9 0 0 0 1.1.9l3.8-.7Z" fill="{W}" stroke="{I}" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M4.6 12.4c0-3.4 3.9-6 8.7-6s8.2 2.6 8.2 5.8-3.6 5.9-8.4 5.9c-4.8 0-8.5-2.4-8.5-5.7Z" fill="{A}" stroke="{I}" stroke-width="1.6" stroke-linejoin="round"/><rect x="6.2" y="10.3" width="1.9" height="1.3" rx=".35" fill="{I}"/>
    <g fill="{I}"><circle cx="11" cy="9.6" r=".9"/><circle cx="13.7" cy="9.2" r=".9"/><circle cx="16.3" cy="9.7" r=".9"/><circle cx="18.5" cy="11" r=".85"/><circle cx="13.2" cy="14.8" r=".8"/></g>
    <path d="M8.4 8.2a6.6 6.6 0 0 1 3.6-1.3" fill="none" stroke="{H}" stroke-width="1.1" stroke-linecap="round"/><path d="M21.3 12.2c1.5.3 2.2 1.5 1.8 2.7" fill="none" stroke="{I}" stroke-width="1" stroke-linecap="round"/>`,
  chip: `<path d="M4.4 3.4h11.8l3.4 3.4v13.6a1.2 1.2 0 0 1-1.2 1.2H4.4a1.2 1.2 0 0 1-1.2-1.2V4.6a1.2 1.2 0 0 1 1.2-1.2Z" fill="{W}" stroke="{I}" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="5.4" y="6.2" width="11.8" height="8.6" rx="1" fill="{A}" stroke="{I}" stroke-width="1.1"/><path d="M6.8 12.4h2.2V8.6h3.1v3.8h3.1V8.6h1" fill="none" stroke="{I}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M6.2 18v2.6M8.4 18v2.6M10.6 18v2.6M12.8 18v2.6M15 18v2.6M17.2 18v2.6" stroke="{I}" stroke-width="1" stroke-linecap="round"/>`,
  musicbox: `<path d="M3 11.2h12.4v9.2H3Z" fill="{A}" stroke="{I}" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.4 11.2l3.6-2.8v9.2l-3.6 2.8Z" fill="{W}" stroke="{I}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M3 11.2 6.6 8.4H19l-3.6 2.8Z" fill="{W}" stroke="{I}" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 11.2 5.2 3.6h12.4L15.4 11.2" fill="none" stroke="{I}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M19 13h1.8v2.2" fill="none" stroke="{I}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 15.8h6.4" stroke="{I}" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M9.4 5.6v2.2" stroke="{I}" stroke-width=".9"/><circle cx="8.9" cy="7.9" r=".8" fill="{I}"/><path d="M9.4 5.6l1.6.7" stroke="{I}" stroke-width=".9" stroke-linecap="round"/>`,
  speaker: `<rect x="4.4" y="2.6" width="15.2" height="18.8" rx="2.6" fill="{W}" stroke="{I}" stroke-width="1.6"/><circle cx="12" cy="14.4" r="4.6" fill="{A}" stroke="{I}" stroke-width="1.4"/>
    <circle cx="12" cy="14.4" r="1.6" fill="{I}"/><circle cx="12" cy="6.9" r="1.7" fill="{A}" stroke="{I}" stroke-width="1.1"/><path d="M9.6 12.4a3.2 3.2 0 0 1 1.6-1.4" fill="none" stroke="{H}" stroke-width=".9" stroke-linecap="round"/>`
};
export const ICONS_NIGHT: Record<string, string> = {
  mic: `<path d="M12 2.2c2.2 0 3.6 1.9 3.6 4.4v2.6c0 2.5-1.4 4.4-3.6 4.4s-3.6-1.9-3.6-4.4V6.6c0-2.5 1.4-4.4 3.6-4.4Z" fill="{A}" fill-opacity=".55" stroke="{I}" stroke-width="1.1"/>
    <path d="M10.2 3.8v7.8M12 2.6v10.8M13.8 3.8v7.8" stroke="{I}" stroke-width=".5" opacity=".75"/><path d="M8.4 7.9h7.2" stroke="{I}" stroke-width=".7"/>
    <path d="M7 9c0 3.2 2.2 5.4 5 5.4s5-2.2 5-5.4" fill="none" stroke="{G}" stroke-width="1.1"/><path d="M12 14.4v5.2" stroke="{I}" stroke-width="1.1"/>
    <path d="M12 16.1l1 1.2-1 1.2-1-1.2Z" fill="{G}"/><path d="M7.6 21.6h8.8M9 21.6l3-2 3 2" fill="none" stroke="{I}" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 .2l.5 1-.5 1-.5-1Z" fill="{G}"/>`,
  cleangtr: `<path d="M13 11 20.2 3.2" stroke="{I}" stroke-width="2.2" stroke-linecap="butt"/><path d="M13 11 20.2 3.2" stroke="{W}" stroke-width="1" /><g fill="{G}"><path d="M15.3 8.7l.5.1-.2.5-.5-.1Z"/><path d="M17.1 6.8l.5.1-.2.5-.5-.1Z"/><path d="M18.8 4.9l.5.1-.2.5-.5-.1Z"/></g>
    <path d="M19.6 2.6 23.4.4 22 4.6 20.6 4.2Z" fill="{I}"/>
    <path d="M13.2 10.6 9.4 9.2 3.6 12.8l2.4 1.2-2.6 5.4 3-1.4 1.8 4.4 2.6-6.2 3.8-1.8 1.2-2.2Z" fill="{A}" fill-opacity=".6" stroke="{I}" stroke-width="1.1" stroke-linejoin="miter"/>
    <path d="M8.8 12.2l1.6 1.6M7.6 13.8l1.6 1.6" stroke="{G}" stroke-width="1"/><path d="M6.6 16.8 20 3.6" stroke="{I}" stroke-width=".3" opacity=".6"/><path d="M5.4 13.6 8 15.2" stroke="{I}" stroke-width=".4" opacity=".5"/>`,
  acoustic: `<path d="M13 11.6 19.6 4.4" stroke="{I}" stroke-width="2" /><path d="M13 11.6 19.6 4.4" stroke="{W}" stroke-width=".9"/><path d="M18.9 3.8l2.1-2.4 1.2 1.1-1.9 2.5Z" fill="{I}"/>
    <path d="M9.4 8.9c2.5-.3 4.1 1.5 3.8 3.5-.1 1 .5 1.7 1.4 2.4 1.7 1.4 2.1 3.9.7 5.7-1.6 2.1-4.8 2.6-7.5 1.4-3-1.3-4.1-4.3-2.7-6.4.7-1.1 1.3-1.7 1.3-2.8 0-1.9 1.1-3.5 3-3.8Z" fill="{A}" fill-opacity=".45" stroke="{I}" stroke-width="1.1"/>
    <circle cx="10.2" cy="14.8" r="2.4" fill="{W}" stroke="{G}" stroke-width=".9"/><g stroke="{G}" stroke-width=".45">${[0, 1, 2, 3, 4, 5, 6, 7].map((k: number) => { const a = k * Math.PI / 4; return `<path d="M${(10.2 + Math.cos(a) * .6).toFixed(2)} ${(14.8 + Math.sin(a) * .6).toFixed(2)}L${(10.2 + Math.cos(a) * 2.3).toFixed(2)} ${(14.8 + Math.sin(a) * 2.3).toFixed(2)}"/>`; }).join('')}</g><circle cx="10.2" cy="14.8" r=".6" fill="{G}"/>
    <path d="M6.2 18.8l2.6 1.6" stroke="{I}" stroke-width="1.1"/><path d="M5.4 16.4c.3 1.6 1.4 2.8 2.9 3.4M5.8 15.2c.3 1.9 1.5 3.3 3.3 4" fill="none" stroke="{I}" stroke-width=".4" opacity=".6"/>`,
  piano: `<path d="M2.6 12.6h13.2c1.4 0 1.9-1.9 3.4-2.1 1.9-.2 2.6 1.4 2.4 2.8-.2 1.6-1.6 2.3-3.2 2.3H2.6Z" fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M2.6 12.6 15 4.2" stroke="{I}" stroke-width="1.1"/><path d="M9.6 12.4 11.6 7.2" stroke="{G}" stroke-width=".8"/><path d="M2.6 12.6 15 4.2l1.2 8.4" fill="none" stroke="{I}" stroke-width=".4" opacity=".6"/>
    <path d="M2.6 15.6h16.2" stroke="{I}" stroke-width=".5"/><g stroke="{I}" stroke-width=".4" opacity=".7"><path d="M4 13.2v2.2M5.6 13.2v2.2M7.2 13.2v2.2M8.8 13.2v2.2M10.4 13.2v2.2M12 13.2v2.2M13.6 13.2v2.2"/></g>
    <path d="M4.4 15.6c.3 2.4-.4 3.6-1.2 5.2h2.2c.1-1.4.6-2.6 1-3.2M16 15.6c-.2 2.2.6 3.6 1.4 5.2h-2.2c-.2-1.4-.6-2.5-.9-3.2" fill="none" stroke="{I}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M4.8 18.4l.6.8-.6.8-.6-.8Z M15.8 18.4l.6.8-.6.8-.6-.8Z" fill="{G}"/>`,
  bass: `<g transform="translate(24 0) scale(-1 1)"><path d="M11.4 13.4 20.4 3.4" stroke="{I}" stroke-width="2" /><path d="M11.4 13.4 20.4 3.4" stroke="{W}" stroke-width=".9"/>
    <path d="M20 2.6c.9-1.4 2.6-1.6 3.2-.6.5.8-.1 1.9-1 1.8-.6 0-.7-.7-.3-1" fill="none" stroke="{I}" stroke-width="1"/><path d="M21.2 3.8l1 .8M20.4 4.8l1 .8" stroke="{G}" stroke-width=".8"/>
    <path d="M11.6 12.8 7.6 10.6 2.4 14.6l2.8.8-1.8 5.6 3.2-1.8 1.4 4 3-6 3.2-2.2 1-2.4Z" fill="{A}" fill-opacity=".6" stroke="{I}" stroke-width="1.1" stroke-linejoin="miter"/>
    <path d="M7.4 15.6l2.6 2" stroke="{G}" stroke-width="1.1"/><path d="M6.2 18.6 20 4M5.6 18 19.4 3.4" stroke="{I}" stroke-width=".3" opacity=".6"/></g>`,
  kit: `<path d="M4.4 3.6 12 11.4M19.6 3.6 12 11.4" stroke="{I}" stroke-width="1.1"/><path d="M4.4 3.6l-1.3-.3.3 1.3Z M19.6 3.6l1.3-.3-.3 1.3Z" fill="{G}" stroke="{G}" stroke-width=".6"/>
    <ellipse cx="12" cy="12.8" rx="8.2" ry="2.8" fill="{W}" stroke="{I}" stroke-width="1.1"/><path d="M3.8 12.8v5.6c0 1.6 3.7 2.9 8.2 2.9s8.2-1.3 8.2-2.9v-5.6" fill="{A}" fill-opacity=".45" stroke="{I}" stroke-width="1.1"/>
    <g fill="{G}"><path d="M6.4 16.2l.7 1-.7 1-.7-1Z"/><path d="M12 17l.7 1-.7 1-.7-1Z"/><path d="M17.6 16.2l.7 1-.7 1-.7-1Z"/></g><path d="M3.8 15.2c2.2 1.2 5 1.7 8.2 1.7s6-.5 8.2-1.7" fill="none" stroke="{I}" stroke-width=".5" opacity=".7"/>
    <path d="M5 13.8c.4 3 .4 5 0 5.6M6.4 14.3c.3 2.6.3 4.4 0 5.4" fill="none" stroke="{I}" stroke-width=".35" opacity=".6"/>`,
  viola: `<path d="M3 21.6 20.6 4.4" stroke="{I}" stroke-width=".9"/><path d="M3.6 21.9 20.9 5" stroke="{G}" stroke-width=".4"/>
    <path d="M12.2 6.6c-2.6 0-4 1.3-4 2.9 0 1 .7 1.6.7 2.3 0 .9-1.8 1.6-1.8 3.8 0 2.7 2.2 4.5 5.1 4.5s5.1-1.8 5.1-4.5c0-2.2-1.8-2.9-1.8-3.8 0-.7.7-1.3.7-2.3 0-1.6-1.4-2.9-4-2.9Z" fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width="1.1"/>
    <path d="M12.2 6.6V3" stroke="{I}" stroke-width="1.4"/><path d="M12.2 3c-1.2 0-1.6-1.4-.6-1.9 1-.5 1.9.5 1.3 1.3-.4.5-1.1.3-1-.3" fill="none" stroke="{I}" stroke-width=".8"/>
    <path d="M10.4 12.6c.5.5.5 1.2 0 1.8s-.5 1.3 0 1.8M14 12.6c-.5.5-.5 1.2 0 1.8s.5 1.3 0 1.8" fill="none" stroke="{G}" stroke-width=".7"/>
    <path d="M9 10c-.9.6-1.4 1.6-1.4 2.2M8.4 15.4c.1 1.6 1 2.8 2.4 3.4" fill="none" stroke="{I}" stroke-width=".35" opacity=".7"/>`,
  organ: `<path d="M2.6 21.6V9.6A9.4 9.4 0 0 1 12 1.2a9.4 9.4 0 0 1 9.4 8.4v12" fill="none" stroke="{I}" stroke-width="1.1"/>
    <g fill="{A}" fill-opacity=".55" stroke="{I}" stroke-width=".8"><path d="M5.4 18.6V10.4l.8-1.4.8 1.4v8.2Z"/><path d="M8.2 18.6V7.4l.8-1.4.8 1.4v11.2Z"/><path d="M11.2 18.6V4.6l.8-1.4.8 1.4v14Z"/><path d="M14.2 18.6V7.4l.8-1.4.8 1.4v11.2Z"/><path d="M17 18.6V10.4l.8-1.4.8 1.4v8.2Z"/></g>
    <g fill="{G}"><path d="M6.2 13.4l.5.8h-1Z"/><path d="M9 11.4l.5.8h-1Z"/><path d="M12 9.4l.5.8h-1Z"/><path d="M15 11.4l.5.8h-1Z"/><path d="M17.8 13.4l.5.8h-1Z"/></g>
    <path d="M2.6 18.6h18.8M2.6 21.6h18.8" stroke="{I}" stroke-width="1.1"/><path d="M4 20.1h16" stroke="{G}" stroke-width=".5" stroke-dasharray=".8 .8"/>`,
  ocarina: `<path d="M5.4 10.4 1.8 9.6a.9.9 0 0 0-1.1.9v2.8a.9.9 0 0 0 1.1.9l3.8-.7Z" fill="{W}" stroke="{I}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M4.6 12.4c0-3.4 3.9-6 8.7-6s8.2 2.6 8.2 5.8-3.6 5.9-8.4 5.9c-4.8 0-8.5-2.4-8.5-5.7Z" fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width="1.1"/><rect x="6.2" y="10.4" width="1.8" height="1.1" fill="{G}"/>
    <g fill="{G}"><path d="M11 8.8l.7.9-.7.9-.7-.9Z"/><path d="M13.7 8.4l.7.9-.7.9-.7-.9Z"/><path d="M16.3 8.9l.7.9-.7.9-.7-.9Z"/><path d="M18.5 10.2l.6.8-.6.8-.6-.8Z"/><path d="M13.2 14l.6.8-.6.8-.6-.8Z"/></g>
    <path d="M6.6 14.6c2.6 1.9 7.4 2.3 11 .6M8 8.4c1.6-1 3.4-1.4 5.2-1.4" fill="none" stroke="{I}" stroke-width=".45" opacity=".7"/>`,
  chip: `<path d="M5 22V7.4A7 7 0 0 1 12 1.6a7 7 0 0 1 7 5.8V22Z" fill="{W}" stroke="{I}" stroke-width="1.1"/><path d="M6.6 21V8a5.4 5.4 0 0 1 10.8 0v13Z" fill="none" stroke="{G}" stroke-width=".5"/>
    <path d="M7.6 15.4h2.2v-4.2h4.4v4.2h2.2" fill="none" stroke="{A}" stroke-width="1.4" stroke-linejoin="miter"/><path d="M7.6 15.4h2.2v-4.2h4.4v4.2h2.2" fill="none" stroke="{I}" stroke-width=".5" stroke-linejoin="miter"/>
    <path d="M12 3.6l.7 1-.7 1-.7-1Z M12 17.8l.7 1-.7 1-.7-1Z" fill="{G}"/>`,
  musicbox: `<path d="M3 11.6h14.4v9.6H3Z" fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width="1.1"/><path d="M3 11.6 10.2 4.2l7.2 7.4" fill="{W}" stroke="{I}" stroke-width="1.1" stroke-linejoin="miter"/>
    <path d="M10.2 4.2V2.2M9.4 2.9h1.6" stroke="{G}" stroke-width=".8"/><path d="M5.6 11.6v9.6M14.8 11.6v9.6" stroke="{G}" stroke-width=".5"/>
    <path d="M17.4 14.6h2.6v2.6" fill="none" stroke="{I}" stroke-width="1.1"/><circle cx="20" cy="17.8" r=".9" fill="{G}"/><path d="M10.2 14.2l1 1.2-1 1.2-1-1.2Z" fill="{G}"/><path d="M6.4 8.6l3.8-3.8 3.8 3.8" fill="none" stroke="{I}" stroke-width=".4" opacity=".6"/>`,
  speaker: `<path d="M2.8 17.2h11.6v4.6H2.8Z" fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width="1.1"/><path d="M4.2 19.5h8.8" stroke="{G}" stroke-width=".45" stroke-dasharray=".8 .8"/>
    <ellipse cx="8.6" cy="16.6" rx="5.4" ry="1.2" fill="{W}" stroke="{I}" stroke-width=".9"/><circle cx="8.6" cy="16.6" r=".5" fill="{G}"/>
    <path d="M12.6 16.4c.5-2.6 1.2-4.6 2.6-6.4" fill="none" stroke="{I}" stroke-width="1.1"/>
    <path d="M14.2 11.1c1.3-1.8 1.9-4.3 1.6-7 3 .2 6.1 2 7.2 4.9-2.6.1-5.1 1.1-6.9 2.9Z" fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M16.9 4.7c.4 2 .2 3.9-.6 5.4M19.6 5.7c-.2 1.7-.8 3.2-1.8 4.5" fill="none" stroke="{G}" stroke-width=".45"/><path d="M4 21.8l.6.9.6-.9M12.6 21.8l.6.9.6-.9" fill="none" stroke="{G}" stroke-width=".6"/>`
};

export const ICON: Record<string, string> = {
  mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7"/><path d="M9 6.5h2M9 9h2"/>',
  cleangtr: '<g transform="rotate(40 12 12)"><path d="M12 11.3V2.6"/><rect x="10.9" y=".8" width="2.2" height="2.4" rx=".6"/><path d="M9.3 11.6c-1.2-1.6-3.2-1.2-3.4.6-.1 1.1.6 2 .6 3-.1 1-1.3 1.7-1.3 3.4 0 2.3 2.9 3.4 6.8 3.4s6.8-1.1 6.8-3.4c0-1.7-1.2-2.4-1.3-3.4 0-1 .7-1.9.6-3-.2-1.8-2.2-2.2-3.4-.6Z"/><path d="M9.8 15h4.4M9.8 17.4h4.4"/></g>',
  acoustic: '<path d="M12 10.2V2.8"/><rect x="10.8" y="1" width="2.4" height="2.6" rx=".6"/><path d="M12 9.6c-2.4 0-3.9 1.3-3.9 3 0 1 .6 1.6.6 2.2 0 .7-1.7 1.4-1.7 3.3 0 2.2 2.2 3.5 5 3.5s5-1.3 5-3.5c0-1.9-1.7-2.6-1.7-3.3 0-.6.6-1.2.6-2.2 0-1.7-1.5-3-3.9-3Z"/><circle cx="12" cy="15.4" r="1.6"/><path d="M10.5 19.4h3"/>',
  piano: '<path d="M5 21V5.6A2.6 2.6 0 0 1 7.6 3H9c1.9 0 3 1.4 3.2 3.2.2 1.9 1.4 3 3.3 3.5 2.4.7 3.5 2.4 3.5 4.6V21Z"/><path d="M5 17.4h14"/><path d="M8.5 17.4v2.2M11.5 17.4v2.2M14.5 17.4v2.2"/>',
  bass: '<g transform="rotate(-38 12 12)"><path d="M12 12V1.8"/><path d="M10.8.6h2.4v4h-2.4z"/><path d="M9.9 1.4h.9M9.9 3.4h.9M13.2 1.4h.9M13.2 3.4h.9"/><path d="M9.6 12.3c-1-1.2-2.8-.8-2.9.8 0 .9.5 1.6.5 2.4 0 .8-1 1.4-1 2.8 0 2 2.6 3 5.8 3s5.8-1 5.8-3c0-1.4-1-2-1-2.8 0-.8.5-1.5.5-2.4-.1-1.6-1.9-2-2.9-.8Z"/><path d="M10.2 16.4h3.6"/></g>',
  kit: '<ellipse cx="12" cy="13" rx="7.5" ry="2.6"/><path d="M4.5 13v4.4c0 1.4 3.4 2.6 7.5 2.6s7.5-1.2 7.5-2.6V13"/><path d="M8 15.4v3.8M12 15.6v4.2M16 15.4v3.8"/><path d="M5 3.5l6 7M19 3.5l-6 7"/>',
  viola: '<path d="M12 7.2c-2.2 0-3.4 1.1-3.4 2.5 0 .9.6 1.4.6 2 0 .8-1.5 1.4-1.5 3.3 0 2.3 1.9 3.9 4.3 3.9s4.3-1.6 4.3-3.9c0-1.9-1.5-2.5-1.5-3.3 0-.6.6-1.1.6-2 0-1.4-1.2-2.5-3.4-2.5Z"/><path d="M12 7.2V3.2"/><circle cx="12" cy="2.4" r=".9"/><path d="M10.6 12.8v2.3M13.4 12.8v2.3M11 16.3h2"/><path d="M3.5 21.5 20.5 5"/>',
  organ: '<path d="M4 20.5V11l1.6-2 1.6 2v9.5M8.6 20.5V7l1.6-2 1.6 2v13.5M13.2 20.5V4.5l1.6-2 1.6 2v16M17.8 20.5V9l1.6-2 1.6 2v11.5"/><path d="M2.5 20.5h19"/>',
  ocarina: '<path d="M4.2 13.2c.3-3.8 4-6.4 8.6-6.4 4.1 0 7.2 2.3 7.2 5.4 0 3.3-3.3 5.3-7.6 5.3-2.4 0-4-.7-5.2-1.5L3 17.5l.9-3.1Z"/><circle cx="10.3" cy="10.9" r=".9"/><circle cx="13.4" cy="10.4" r=".9"/><circle cx="16.4" cy="11.3" r=".9"/><circle cx="12.6" cy="14.2" r=".9"/>',
  musicbox: '<path d="M3.5 11h13v8.5h-13z"/><path d="M3.5 11 6 7.5h13L16.5 11M16.5 19.5 19 16V7.5"/><path d="M7 15.2h6"/><path d="M19 11.5h2.2v3"/>',
  chip: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M6.5 14.5h2.6v-5h2.9v5h2.9v-5h2.6"/>',
  pen: '<path d="M4 20l1.2-4.6L15.8 4.8a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8Z"/><path d="M13.8 6.8l3.4 3.4"/>',
  select: '<path d="M5 4l12 6-5 1.6L9.4 17Z"/><path d="M12.4 12.6 17 18"/>',
  marker: '<path d="M6 18l-2 3h5l1.5-1.5"/><path d="M8.5 15.5l9-9a2.1 2.1 0 0 1 3 3l-9 9-4 1Z"/>',
  eraser: '<path d="M4 16.5 13.5 7a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L13 19.5H7Z"/><path d="M9.5 11l5.5 5.5M4 20h16"/>',
  scissors: '<circle cx="6.5" cy="17" r="2.6"/><circle cx="6.5" cy="7" r="2.6"/><path d="M8.7 8.4 20 17M8.7 15.6 20 7"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="9" cy="15" r="1.2"/><circle cx="15" cy="15" r="1.2"/>',
  wand: '<path d="M4.5 19.5 14.5 9.5"/><path d="M12.8 7.8l3.4 3.4"/><path d="M18 3.5v3M16.5 5h3M20.5 10v2M19.5 11h2M10.5 3.5v2M9.5 4.5h2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  play: '<path d="M8 5.5v13l10-6.5Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  back: '<path d="M6 5v14M18 5.5v13L9 12Z"/>',
  loop: '<path d="M4 12a6 6 0 0 1 6-6h8M16 3l3 3-3 3M20 12a6 6 0 0 1-6 6H6M8 21l-3-3 3-3"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  chevup: '<path d="M6 15l6-6 6 6"/>',
  spark: '<path d="M12 3.5l1.9 6.6 6.6 1.9-6.6 1.9L12 20.5l-1.9-6.6-6.6-1.9 6.6-1.9Z"/><path d="M19 3.5v3M17.5 5h3"/>',
  join: '<path d="M3 6h5v12H3"/><path d="M21 6h-5v12h5"/><path d="M9.5 12h5"/>',
  flip: '<path d="M12 3v18" stroke-dasharray="2 2.5"/><path d="M9 7 3.5 17H9ZM15 7l5.5 10H15Z"/>',
  up: '<path d="M12 20V5M6 11l6-6 6 6"/><path d="M5 20h14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  expand: '<path d="M4 9.5V4h5.5M14.5 4H20v5.5M20 14.5V20h-5.5M9.5 20H4v-5.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5Z"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  export: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5"/>',
  trash: '<path d="M4.5 7h15M10 4h4M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  // a piano's sustain pedal, seen from the side: the lever on its pivot, the floor under it
  pedal: '<path d="M3.5 15.5 19 11.2a1.6 1.6 0 0 1 .9 3.05L5.2 18.6"/><path d="M8.5 17.2V20"/><path d="M3 20.5h18"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 4h3.5v8a2.5 2.5 0 0 0 5 0V4H18"/><path d="M6 8h3.5M14.5 8H18"/>',
  follow: '<path d="M4 12h11"/><path d="M11 7l5 5-5 5"/><path d="M19.5 5v14"/>',
  note: '<ellipse cx="8.5" cy="17" rx="3.6" ry="2.7" transform="rotate(-20 8.5 17)"/><path d="M11.8 16V4.5c2.4.4 4.6 1.9 5.7 4"/>',
  more: '<circle cx="5.5" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="18.5" cy="12" r=".9"/>',
  rewind: '<path d="M11 6.5v11l-7-5.5Z"/><path d="M20 6.5v11l-7-5.5Z"/>',
  record: '<circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none"/>',
  keys: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v8M12 5v8M16 5v8"/><path d="M8 13v6M12 13v6M16 13v6"/>',
  sliders: '<path d="M6 4v16M12 4v16M18 4v16"/><rect x="4" y="13" width="4" height="3" rx="1"/><rect x="10" y="7" width="4" height="3" rx="1"/><rect x="16" y="11" width="4" height="3" rx="1"/>',
  split: '<path d="M12 3v18" stroke-dasharray="2.2 2.6"/><rect x="3.5" y="7.5" width="6" height="9" rx="1.5"/><rect x="14.5" y="7.5" width="6" height="9" rx="1.5"/>',
  wave: '<path d="M3 12c1.5-5 3-5 4.5 0s3 5 4.5 0 3-5 4.5 0 3 5 4.5 0"/>'
};
