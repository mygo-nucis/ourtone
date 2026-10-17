import './styles/base.css';
import './styles/studio.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { app } from './lib/state/app.svelte';
import { transport } from './lib/audio/transport.svelte';
import { engine } from './lib/audio/engine';
import { studio } from './lib/project/studio.svelte';
import { exporter } from './lib/project/exporter.svelte';
import { midiOf } from './lib/project/export';
import { setRenderer } from './lib/audio/voices';
import { workerRenderer } from './lib/audio/render-client';
import { bank } from './lib/audio/bank';
import { renderSong, renderSongSplit } from './lib/audio/offline';
import { makeBackup, readBackup, restoreBackup, resetAll } from './lib/state/backup';
import { allSongs, allSounds, allAudio } from './lib/state/db';
import { gen } from './lib/gen/panel.svelte';

setRenderer(workerRenderer());

// a handle for debugging in the console
(window as unknown as { __ut: unknown }).__ut = { app, transport, engine, studio, exporter, midiOf, bank, renderSong, renderSongSplit, backup: { makeBackup, readBackup, restoreBackup, resetAll }, db: { allSongs, allSounds, allAudio }, gen };

mount(App, { target: document.getElementById('app')! });
