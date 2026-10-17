import { th } from './ctx';
import { S, archD } from './svg';
import { ICONS_DAY, ICONS_NIGHT, ICON } from './icons-base';

/* instruments added for the full library, drawn to the same two briefs:
   day — cut-out stickers with thick ink outlines, white bodies, a colour fill and glossy highlights;
   night — hairline engravings with jewel glass, gold lozenges and pointed finials. */
Object.assign(ICONS_DAY, {
  harp: `<path d="M4.8 21.4V5.8" stroke="{I}" stroke-width="3" stroke-linecap="round"/><path d="M4.8 21.4V5.8" stroke="{W}" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M6.4 21.8h4.2L21.2 6 19.4 4.4Z" fill="{A}" stroke="{I}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M4 6.4c1.4-3.2 4.6-3.8 7.2-2 2.4 1.7 5 1.8 8.6.2" fill="none" stroke="{I}" stroke-width="3" stroke-linecap="round"/><path d="M4 6.4c1.4-3.2 4.6-3.8 7.2-2 2.4 1.7 5 1.8 8.6.2" fill="none" stroke="{W}" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M7.6 5v14.9M10 4.7v12M14.8 5.9v5.5M17.2 5.6v2.4" stroke="{I}" stroke-width=".7"/><path d="M12.4 5.4v8.3" stroke="{A}" stroke-width="1.1"/><path d="M12.4 5.4v8.3" stroke="{I}" stroke-width=".35"/>
    <path d="M3.4 21.8h8" stroke="{I}" stroke-width="1.6" stroke-linecap="round"/><path d="M9.6 19.4l7.6-11" stroke="{H}" stroke-width=".9" stroke-linecap="round" opacity=".85"/>`,
  flute: `<g transform="rotate(-36 12 12)"><rect x=".6" y="10.1" width="22.8" height="3.8" rx="1.9" fill="{A}" stroke="{I}" stroke-width="1.5"/>
    <rect x="3" y="9.3" width="4.4" height="5.4" rx="1.5" fill="{W}" stroke="{I}" stroke-width="1.3"/><ellipse cx="5.2" cy="12" rx="1" ry=".72" fill="{I}"/>
    <path d="M9.4 12h12.4" stroke="{I}" stroke-width=".5" opacity=".55"/><g fill="{W}" stroke="{I}" stroke-width=".9"><circle cx="10.8" cy="12" r="1.08"/><circle cx="13.4" cy="12" r="1.08"/><circle cx="16" cy="12" r="1.08"/><circle cx="18.6" cy="12" r="1.08"/></g>
    <path d="M9 10.9h12.6" stroke="{H}" stroke-width=".7" stroke-linecap="round" opacity=".85"/></g>
    <path d="M20.2 17.2l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55Z" fill="{I}"/>`,
  reed: `<g transform="rotate(18 12 12)"><path d="M11.3 .9h1.4l.5 3H10.8Z" fill="{W}" stroke="{I}" stroke-width="1" stroke-linejoin="round"/><rect x="10.8" y="3.7" width="2.4" height="1.7" rx=".4" fill="{I}"/>
    <path d="M10.6 5.4h2.8l.6 12c2 .5 3.1 1.9 3.1 3.7H7c0-1.8 1.2-3.2 3.1-3.7Z" fill="{A}" stroke="{I}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M10.5 9.5h3M10.4 14h3.2" stroke="{I}" stroke-width="1.1"/><g fill="{W}" stroke="{I}" stroke-width=".8"><circle cx="12" cy="7.5" r=".9"/><circle cx="12" cy="11.8" r=".9"/><circle cx="12" cy="16" r=".9"/></g>
    <path d="M11 6.2v1.8M11 12.8v1" stroke="{H}" stroke-width=".8" stroke-linecap="round"/><path d="M8.8 20.3c.8-.7 1.8-1 3-1" fill="none" stroke="{H}" stroke-width=".8" stroke-linecap="round" opacity=".85"/></g>`,
  horn: `<g transform="rotate(-10 12 12)"><path d="M1.2 11.5h2.6" stroke="{I}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M5.6 12.8v3.4a1.8 1.8 0 0 0 1.8 1.8h5.8a1.8 1.8 0 0 0 1.8-1.8v-3.4" fill="none" stroke="{I}" stroke-width="3" /><path d="M5.6 12.8v3.4a1.8 1.8 0 0 0 1.8 1.8h5.8a1.8 1.8 0 0 0 1.8-1.8v-3.4" fill="none" stroke="{W}" stroke-width="1.2"/>
    <path d="M3.4 10.2h11.2v2.6H3.4Z" fill="{W}" stroke="{I}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M14 10.4c2.7-.3 5.4-2.4 7.6-5.4v13c-2.2-3-4.9-4.8-7.6-5Z" fill="{A}" stroke="{I}" stroke-width="1.5" stroke-linejoin="round"/>
    <g fill="{W}" stroke="{I}" stroke-width="1.1"><rect x="6.2" y="6.2" width="1.8" height="4" rx=".5"/><rect x="8.8" y="6.2" width="1.8" height="4" rx=".5"/><rect x="11.4" y="6.2" width="1.8" height="4" rx=".5"/></g>
    <g fill="{I}"><rect x="5.8" y="5" width="2.6" height="1.3" rx=".55"/><rect x="8.4" y="5" width="2.6" height="1.3" rx=".55"/><rect x="11" y="5" width="2.6" height="1.3" rx=".55"/></g>
    <path d="M20.2 7.8v2.6" stroke="{H}" stroke-width=".9" stroke-linecap="round" opacity=".85"/></g>`,
  accordion: `<g transform="rotate(-7 12 12)"><path d="M7.2 6.4h9.6v11.6H7.2Z" fill="{A}" stroke="{I}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M9.1 6.4l.9 11.6M11 6.4l.9 11.6M12.9 6.4 12 18M14.8 6.4 14 18" stroke="{I}" stroke-width=".8"/>
    <path d="M7.2 6.4 8.2 5.2l1 1.2 1-1.2 1 1.2 1-1.2 1 1.2 1-1.2 1 1.2 1-1.2 1 1.2M7.2 18l1 1.2 1-1.2 1 1.2 1-1.2 1 1.2 1-1.2 1 1.2 1-1.2 1 1.2 1-1.2" fill="none" stroke="{I}" stroke-width="1" stroke-linejoin="round"/>
    <rect x="1.8" y="4.4" width="5.6" height="15.6" rx="1.4" fill="{W}" stroke="{I}" stroke-width="1.5"/><path d="M3.4 7.2h2.6M3.4 9.6h2.6M3.4 12h2.6M3.4 14.4h2.6M3.4 16.8h2.6" stroke="{I}" stroke-width="1" stroke-linecap="round"/>
    <rect x="16.6" y="4.4" width="5.6" height="15.6" rx="1.4" fill="{W}" stroke="{I}" stroke-width="1.5"/><g fill="{I}"><circle cx="18.4" cy="7.6" r=".75"/><circle cx="20.4" cy="9" r=".75"/><circle cx="18.4" cy="10.6" r=".75"/><circle cx="20.4" cy="12" r=".75"/><circle cx="18.4" cy="13.6" r=".75"/><circle cx="20.4" cy="15" r=".75"/></g>
    <path d="M2.9 6v3" stroke="{H}" stroke-width=".8" stroke-linecap="round"/></g>`,
  bells: `<g transform="rotate(-10 12 13)"><path d="M2 19.4 22 18" stroke="{I}" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="2.4" y="6.8" width="3.2" height="12.4" rx="1.1" fill="{A}" stroke="{I}" stroke-width="1.3"/><rect x="6.4" y="8.2" width="3.2" height="10.8" rx="1.1" fill="{W}" stroke="{I}" stroke-width="1.3"/>
    <rect x="10.4" y="9.6" width="3.2" height="9.2" rx="1.1" fill="{A}" stroke="{I}" stroke-width="1.3"/><rect x="14.4" y="11" width="3.2" height="7.6" rx="1.1" fill="{W}" stroke="{I}" stroke-width="1.3"/>
    <rect x="18.4" y="12.4" width="3.2" height="6" rx="1.1" fill="{A}" stroke="{I}" stroke-width="1.3"/>
    <g fill="{I}"><circle cx="4" cy="8.4" r=".5"/><circle cx="8" cy="9.8" r=".5"/><circle cx="12" cy="11.2" r=".5"/><circle cx="16" cy="12.6" r=".5"/><circle cx="20" cy="14" r=".5"/></g>
    <path d="M3.3 11v4" stroke="{H}" stroke-width=".8" stroke-linecap="round"/></g>
    <path d="M14.2 5.6 20.6 1.8" stroke="{I}" stroke-width="1.4" stroke-linecap="round"/><circle cx="13.4" cy="6.1" r="1.8" fill="{A}" stroke="{I}" stroke-width="1.2"/>`
});

/* the electronic family: an analog synth (knobs over a short keyboard) and a drum machine (a display over a grid of pads) */
Object.assign(ICONS_DAY, {
  synth: `<g transform="rotate(-8 12 12)"><rect x="1.6" y="6" width="20.8" height="12.6" rx="1.8" fill="{W}" stroke="{I}" stroke-width="1.6"/>
    <path d="M3.4 6h17.2a1.8 1.8 0 0 1 1.8 1.8V11H1.6V7.8A1.8 1.8 0 0 1 3.4 6Z" fill="{A}" stroke="{I}" stroke-width="1.4"/>
    <g fill="{W}" stroke="{I}" stroke-width="1"><circle cx="5" cy="8.5" r="1.3"/><circle cx="8.8" cy="8.5" r="1.3"/><circle cx="12.6" cy="8.5" r="1.3"/></g>
    <path d="M5 8.5V7.3M8.8 8.5l.8-.9M12.6 8.5l-.8-.9" stroke="{I}" stroke-width=".8" stroke-linecap="round"/>
    <path d="M15.6 9.6l1.3-2 1.3 2 1.3-2 1.3 2" fill="none" stroke="{I}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M4.2 11v7.6M6.8 11v7.6M9.4 11v7.6M12 11v7.6M14.6 11v7.6M17.2 11v7.6M19.8 11v7.6" stroke="{I}" stroke-width=".8"/>
    <g fill="{I}"><rect x="3.4" y="11" width="1.6" height="4.2" rx=".3"/><rect x="6" y="11" width="1.6" height="4.2" rx=".3"/><rect x="11.2" y="11" width="1.6" height="4.2" rx=".3"/><rect x="13.8" y="11" width="1.6" height="4.2" rx=".3"/><rect x="16.4" y="11" width="1.6" height="4.2" rx=".3"/></g>
    <path d="M3.4 7.6a2.4 2.4 0 0 1 1.4-.9" stroke="{H}" stroke-width=".9" stroke-linecap="round"/></g>
    <path d="M20.2 1.6l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55Z" fill="{I}"/>`,
  audio: `<g transform="rotate(-6 12 12)"><rect x="1.6" y="4.6" width="20.8" height="14.8" rx="3" fill="{W}" stroke="{I}" stroke-width="1.6"/>
    <rect x="1.6" y="4.6" width="20.8" height="3.6" rx="1.6" fill="{A}" stroke="{I}" stroke-width="1.2"/>
    <g stroke="{I}" stroke-width="1.5" stroke-linecap="round"><path d="M5 12.6v3M7.6 11v6.6M10.2 12v4.6M12.8 10.2v8.2M15.4 11.6v5.4M18 12.8v3"/></g>
    <path d="M3.6 6.2h3" stroke="{H}" stroke-width=".9" stroke-linecap="round"/></g>
    <path d="M20.4 1.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5Z" fill="{I}"/>`,
  pad: `<g transform="rotate(-6 12 12)"><rect x="1.8" y="5.2" width="20.4" height="13.6" rx="5.2" fill="{A}" stroke="{I}" stroke-width="1.6"/>
    <path d="M4.2 12c1.6-3.4 3.2-3.4 4.8 0s3.2 3.4 4.8 0 3.2-3.4 4.8 0" fill="none" stroke="{W}" stroke-width="3.2" stroke-linecap="round"/><path d="M4.2 12c1.6-3.4 3.2-3.4 4.8 0s3.2 3.4 4.8 0 3.2-3.4 4.8 0" fill="none" stroke="{I}" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M4.6 7.8a3.6 3.6 0 0 1 2.2-1.2" stroke="{H}" stroke-width=".9" stroke-linecap="round"/></g>
    <path d="M19.6 1.8l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5Z M3.4 18.8l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4Z" fill="{I}"/>`,
  drummachine: `<g transform="rotate(6 12 12)"><rect x="2.4" y="3.4" width="19.2" height="17.6" rx="2" fill="{W}" stroke="{I}" stroke-width="1.6"/>
    <rect x="4.4" y="5.4" width="8.4" height="3.6" rx=".6" fill="{I}"/><path d="M5.4 7.6h1.3l.8-1.3.8 2 .8-1.4h2.6" fill="none" stroke="{A}" stroke-width=".9" stroke-linejoin="round"/>
    <g fill="{W}" stroke="{I}" stroke-width="1"><circle cx="16" cy="7.2" r="1.4"/><circle cx="19.4" cy="7.2" r="1.1"/></g><path d="M16 7.2l.8-.9" stroke="{I}" stroke-width=".8" stroke-linecap="round"/>
    <g stroke="{I}" stroke-width="1.1"><rect x="4.3" y="10.6" width="3.4" height="3.4" rx=".7" fill="{A}"/><rect x="8.6" y="10.6" width="3.4" height="3.4" rx=".7" fill="{W}"/><rect x="12.9" y="10.6" width="3.4" height="3.4" rx=".7" fill="{A}"/><rect x="17.2" y="10.6" width="3.4" height="3.4" rx=".7" fill="{W}"/>
    <rect x="4.3" y="15.2" width="3.4" height="3.4" rx=".7" fill="{W}"/><rect x="8.6" y="15.2" width="3.4" height="3.4" rx=".7" fill="{A}"/><rect x="12.9" y="15.2" width="3.4" height="3.4" rx=".7" fill="{W}"/><rect x="17.2" y="15.2" width="3.4" height="3.4" rx=".7" fill="{A}"/></g>
    <path d="M5 11.4h1.6" stroke="{H}" stroke-width=".8" stroke-linecap="round"/></g>`
});
Object.assign(ICONS_NIGHT, {
  synth: `<path d="M1.8 17.8V8.4l1.8-1.8h16.8l1.8 1.8v9.4Z" fill="{W}" stroke="{I}" stroke-width="1.1"/><path d="M1.8 11.4h20.4" stroke="{G}" stroke-width=".5"/>
    <g fill="{A}" fill-opacity=".55" stroke="{I}" stroke-width=".8"><circle cx="5.2" cy="9.1" r="1.2"/><circle cx="8.8" cy="9.1" r="1.2"/><circle cx="12.4" cy="9.1" r="1.2"/></g>
    <path d="M15.4 9.9l1.2-1.8 1.2 1.8 1.2-1.8 1.2 1.8" fill="none" stroke="{G}" stroke-width=".6"/>
    <path d="M4.4 11.4v6.4M7 11.4v6.4M9.6 11.4v6.4M12.2 11.4v6.4M14.8 11.4v6.4M17.4 11.4v6.4M20 11.4v6.4" stroke="{I}" stroke-width=".45"/>
    <g fill="{I}"><rect x="3.7" y="11.4" width="1.4" height="3.6"/><rect x="6.3" y="11.4" width="1.4" height="3.6"/><rect x="11.5" y="11.4" width="1.4" height="3.6"/><rect x="14.1" y="11.4" width="1.4" height="3.6"/><rect x="16.7" y="11.4" width="1.4" height="3.6"/></g>
    <path d="M12 3.4l.7 1-.7 1-.7-1Z" fill="{G}"/><path d="M12 5.4v1.2" stroke="{G}" stroke-width=".45"/>
    <path d="M3 20.4h18" stroke="{G}" stroke-width=".45" stroke-dasharray=".8 .8"/>`,
  audio: `<path d="M2 19V6.6L4 4.6h16l2 2V19Z" fill="{W}" stroke="{I}" stroke-width="1.1"/><path d="M2 8.4h20" stroke="{G}" stroke-width=".5"/>
    <g stroke="{A}" stroke-width="1.5"><path d="M5.4 12.8v3.4M8 11.2v6.6M10.6 12.2v4.6M13.2 10.4v8.2M15.8 11.8v5.4M18.4 13v3"/></g>
    <g stroke="{I}" stroke-width=".45"><path d="M5.4 12.8v3.4M8 11.2v6.6M10.6 12.2v4.6M13.2 10.4v8.2M15.8 11.8v5.4M18.4 13v3"/></g>
    <path d="M12 1.2l.7 1-.7 1-.7-1Z" fill="{G}"/><path d="M12 3.2v1.4" stroke="{G}" stroke-width=".45"/>`,
  pad: `<path d="M2 18.4V8.2L5.6 4.6h12.8L22 8.2v10.2Z" fill="{W}" stroke="{I}" stroke-width="1.1"/><path d="M3.6 16.8V8.8l2.6-2.6h11.6l2.6 2.6v8Z" fill="{A}" fill-opacity=".45" stroke="{G}" stroke-width=".45"/>
    <path d="M4.6 12.2c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0" fill="none" stroke="{I}" stroke-width="1"/><path d="M12 1.2l.7 1-.7 1-.7-1Z" fill="{G}"/><path d="M12 3.2v1.4" stroke="{G}" stroke-width=".45"/>
    <path d="M4 20.6h16" stroke="{G}" stroke-width=".45" stroke-dasharray=".8 .8"/>`,
  drummachine: `<path d="M3 21V5.4l1.8-1.8h14.4L21 5.4V21Z" fill="{W}" stroke="{I}" stroke-width="1.1"/>
    <rect x="5" y="5.8" width="8" height="3" fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width=".6"/><path d="M5.8 7.6h1.3l.7-1 .7 1.6.7-1.2h2" fill="none" stroke="{G}" stroke-width=".5"/>
    <path d="M16.4 6.4l.8 1-.8 1-.8-1Z M19.2 6.5l.6.9-.6.9-.6-.9Z" fill="{G}"/>
    <g stroke="{I}" stroke-width=".8"><rect x="5" y="10.6" width="3" height="3" fill="{A}" fill-opacity=".55"/><rect x="9" y="10.6" width="3" height="3" fill="none"/><rect x="13" y="10.6" width="3" height="3" fill="{A}" fill-opacity=".55"/><rect x="17" y="10.6" width="2.4" height="3" fill="none"/>
    <rect x="5" y="15" width="3" height="3" fill="none"/><rect x="9" y="15" width="3" height="3" fill="{A}" fill-opacity=".55"/><rect x="13" y="15" width="3" height="3" fill="none"/><rect x="17" y="15" width="2.4" height="3" fill="{A}" fill-opacity=".55"/></g>
    <path d="M12 .8l.7 1-.7 1-.7-1Z" fill="{G}"/><path d="M4.4 19.8h15.2" stroke="{G}" stroke-width=".45" stroke-dasharray=".8 .8"/>`
});

Object.assign(ICONS_NIGHT, {
  harp: `<path d="M4.6 21.6V5.8" stroke="{I}" stroke-width="1.3"/><path d="M4.6 5.8l.9-1.5-.9-1.5-.9 1.5Z" fill="{G}"/>
    <path d="M6.6 21.6h3.6L20.8 5.6l-1.5-1.1Z" fill="{A}" fill-opacity=".55" stroke="{I}" stroke-width="1.1" stroke-linejoin="miter"/>
    <path d="M4.6 5.6c1.5-2.8 4.8-3.3 7.2-1.5 2.2 1.6 4.8 1.7 8-.2" fill="none" stroke="{I}" stroke-width="1.1"/>
    <g stroke="{G}" stroke-width=".45"><path d="M7.4 4.9v15.5M9.8 4.4v12.8M12.2 5.2v8.7M14.6 5.7v5.4M17 5.4v2.4"/></g>
    <path d="M3.2 21.6h8.2" stroke="{I}" stroke-width="1.1"/><path d="M12.4 16.2l.7.9-.7.9-.7-.9Z M16.4 10.3l.6.8-.6.8-.6-.8Z" fill="{G}"/><path d="M8.2 20.6 18.8 5.6" stroke="{I}" stroke-width=".35" opacity=".6"/>`,
  flute: `<g transform="rotate(-36 12 12)"><path d="M1 12l1.2-1.8h20.6v3.6H2.2Z" fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width="1.1"/>
    <path d="M3.6 9.6h3.6l.6 2.4-.6 2.4H3.6L3 12Z" fill="{W}" stroke="{I}" stroke-width=".9"/><path d="M5.4 11.2l.6.8-.6.8-.6-.8Z" fill="{G}"/>
    <g fill="{G}"><path d="M10.8 11.1l.7.9-.7.9-.7-.9Z"/><path d="M13.4 11.1l.7.9-.7.9-.7-.9Z"/><path d="M16 11.1l.7.9-.7.9-.7-.9Z"/><path d="M18.6 11.1l.7.9-.7.9-.7-.9Z"/></g>
    <path d="M9.4 10.9h13" stroke="{I}" stroke-width=".35" opacity=".6"/><path d="M22.8 10.2v3.6" stroke="{G}" stroke-width=".7"/></g>`,
  reed: `<g transform="rotate(18 12 12)"><path d="M11.4 .8h1.2l.4 3h-2Z" fill="{W}" stroke="{I}" stroke-width=".8"/><path d="M10.9 3.8h2.2v1.6h-2.2Z" fill="{G}"/>
    <path d="M10.7 5.4h2.6l.6 12.2 3 3.8H7.1l3-3.8Z" fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width="1.1" stroke-linejoin="miter"/>
    <path d="M10.5 9.5h3M10.4 14h3.2" stroke="{G}" stroke-width=".6"/><g fill="{G}"><path d="M12 6.8l.6.8-.6.8-.6-.8Z"/><path d="M12 11l.6.8-.6.8-.6-.8Z"/><path d="M12 15.2l.6.8-.6.8-.6-.8Z"/></g>
    <path d="M11 6v11.6" stroke="{I}" stroke-width=".35" opacity=".6"/></g>`,
  horn: `<g transform="rotate(-10 12 12)"><path d="M1.2 11.5h2.4" stroke="{I}" stroke-width="1.1"/>
    <path d="M5.6 12.8v3.4a1.8 1.8 0 0 0 1.8 1.8h5.8a1.8 1.8 0 0 0 1.8-1.8v-3.4" fill="none" stroke="{I}" stroke-width="1.1"/>
    <path d="M3.4 10.2h11.2v2.6H3.4Z" fill="{W}" stroke="{I}" stroke-width="1.1"/>
    <path d="M14 10.4 22.2 4.4v14.2L14 12.8Z" fill="{A}" fill-opacity=".55" stroke="{I}" stroke-width="1.1" stroke-linejoin="miter"/>
    <g fill="{G}"><path d="M7.1 5.6l.6.9-.6.9-.6-.9Z"/><path d="M9.7 5.6l.6.9-.6.9-.6-.9Z"/><path d="M12.3 5.6l.6.9-.6.9-.6-.9Z"/></g><path d="M7.1 7.4v2.8M9.7 7.4v2.8M12.3 7.4v2.8" stroke="{I}" stroke-width=".9"/>
    <path d="M16.4 8.8l3.8-2.6M16.4 14.4l3.8 2.6" stroke="{I}" stroke-width=".35" opacity=".6"/><path d="M22.2 4.4v14.2" stroke="{G}" stroke-width=".7"/></g>`,
  accordion: `<g transform="rotate(-7 12 12)"><path d="M7.2 6.4h9.6v11.6H7.2Z" fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width="1.1"/>
    <path d="M7.2 6.4 8.2 5l1 1.4 1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4M7.2 18l1 1.4 1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4 1-1.4" fill="none" stroke="{G}" stroke-width=".6"/>
    <path d="M9.1 6.4l.9 11.6M11 6.4l.9 11.6M12.9 6.4 12 18M14.8 6.4 14 18" stroke="{I}" stroke-width=".4" opacity=".7"/>
    <path d="M1.8 5.8 4.6 3.6l2.8 2.2V20H1.8Z" fill="{W}" stroke="{I}" stroke-width="1.1"/><path d="M3.4 8h2.4M3.4 10.4h2.4M3.4 12.8h2.4M3.4 15.2h2.4M3.4 17.6h2.4" stroke="{I}" stroke-width=".6"/>
    <path d="M16.6 5.8l2.8-2.2 2.8 2.2V20h-5.6Z" fill="{W}" stroke="{I}" stroke-width="1.1"/><g fill="{G}"><path d="M18.4 8l.5.7-.5.7-.5-.7Z"/><path d="M20.4 9.6l.5.7-.5.7-.5-.7Z"/><path d="M18.4 11.2l.5.7-.5.7-.5-.7Z"/><path d="M20.4 12.8l.5.7-.5.7-.5-.7Z"/><path d="M18.4 14.4l.5.7-.5.7-.5-.7Z"/></g></g>`,
  bells: `<g transform="rotate(-10 12 13)"><path d="M2 19.4 22 18" stroke="{I}" stroke-width="1.1"/>
    <g fill="{A}" fill-opacity=".5" stroke="{I}" stroke-width="1"><path d="M2.4 19.2V8.2l1.6-1.8 1.6 1.8v11Z"/><path d="M6.4 19V9.6l1.6-1.8 1.6 1.8V19Z"/><path d="M10.4 18.8V11l1.6-1.8 1.6 1.8v7.8Z"/><path d="M14.4 18.6v-6.2l1.6-1.8 1.6 1.8v6.2Z"/><path d="M18.4 18.4v-4.6l1.6-1.8 1.6 1.8v4.6Z"/></g>
    <g fill="{G}"><path d="M4 10.2l.5.7-.5.7-.5-.7Z"/><path d="M8 11.6l.5.7-.5.7-.5-.7Z"/><path d="M12 13l.5.7-.5.7-.5-.7Z"/><path d="M16 14.4l.5.7-.5.7-.5-.7Z"/><path d="M20 15.8l.5.7-.5.7-.5-.7Z"/></g></g>
    <path d="M14.4 5.4 20.6 1.8" stroke="{I}" stroke-width="1"/><path d="M13.4 3.6l1.3 2-1.3 2-1.3-2Z" fill="{A}" fill-opacity=".6" stroke="{G}" stroke-width=".7"/>`
});

export { ICONS_DAY, ICONS_NIGHT, ICON };

/** the instrument icon as SVG markup for the current theme */
export function iconSVG(id: string, night: boolean, col?: string) {
  const set = night ? ICONS_NIGHT : ICONS_DAY, src = set[id] || set.mic;
  const c: Record<string, string> = night
    ? { I: '#EDE6E1', W: '#0B0A0E', A: col || '#A3243A', G: '#D8B46A', H: '#FFF3EE' }
    : { I: '#1C2030', W: '#FFFFFF', A: col || '#95CEF3', G: '#1C2030', H: '#FFFFFF' };
  return src.replace(/\{(\w)\}/g, (m, k) => c[k] || m);
}
/** place an instrument icon */
export function picon(g: SVGElement, id: string, x: number, y: number, size: number, col?: string) {
  const e = S('g', { transform: `translate(${x} ${y}) scale(${size / 24})` });
  e.innerHTML = iconSVG(id, th.dark, col);
  g.append(e);
  return e;
}
/** a line icon for UI controls */
export function icon(g: SVGElement, id: string, x: number, y: number, size: number, stroke: string, sw: number) {
  const k = size / 24, e = S('g', { transform: `translate(${x} ${y}) scale(${k})`, fill: 'none', stroke, 'stroke-width': sw / k, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', color: stroke });
  e.innerHTML = ICON[id] || '';
  g.append(e);
  return e;
}
/** a part's badge: the bare sticker by day, the icon in a small dark arch by night */
export function partChip(g: SVGElement, x: number, y: number, s: number, col: string, ic: string) {
  if (th.dark) {
    g.append(S('path', { d: archD(x - s * .06, y - s * .22, s * 1.12, s * 1.3), fill: '#0B0A0E', stroke: 'rgba(216,180,106,.6)', 'stroke-width': 1 }));
    picon(g, ic, x + s * .04, y + s * .06, s * .92, col);
  } else picon(g, ic, x - s * .06, y - s * .06, s * 1.12, col);
}
/** inline SVG string for use in markup (Svelte {@html}) */
export function iconMarkup(id: string, night: boolean, col?: string, size = 24) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${iconSVG(id, night, col)}</svg>`;
}
export function uiIconMarkup(id: string, size = 24, sw = 2) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id] || ''}</svg>`;
}
