// Mothlight's entry program for best-game-01 (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop browser
// loads offline (game/index.html and its ES modules, no library, no network request).
// This program hands it in: it checks the entry against the scorer's caps, copies
// game/ and screenshots/ from beside this file to /output, and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun
// library. It refuses an entry the scorer would refuse, instead of handing in
// something broken.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's caps (reference/gate.json): only text_max_bytes shapes the bytes;
// the others refuse an entry the scorer would refuse.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const SCREENSHOT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message) {
  throw new Error(`main.ts: ${message}`);
}

function walkGame(dir, prefix, found) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    const rel = prefix === '' ? name.name : `${prefix}/${name.name}`;
    if (name.isSymbolicLink()) fail(`game/${rel} is a symlink; game/ holds plain files only`);
    if (name.isDirectory()) {
      found.entries += 1;
      if (Buffer.byteLength(rel, 'utf8') > CAPS.game_path_max_bytes) fail(`game/${rel} path is over 1000 bytes`);
      walkGame(path, rel, found);
    } else if (name.isFile()) {
      found.entries += 1;
      if (Buffer.byteLength(rel, 'utf8') > CAPS.game_path_max_bytes) fail(`game/${rel} path is over 1000 bytes`);
      found.bytes += statSync(path).size;
    }
  }
  return found;
}

function checkShots(dir) {
  if (!existsSync(dir)) fail('screenshots/ is missing; the entry needs 3 or 4 screenshots');
  const names = readdirSync(dir).filter((name) => !name.startsWith('.'));
  if (names.length < 3 || names.length > CAPS.screenshots.max) {
    fail(`screenshots/ holds ${names.length} images; the entry needs 3 or 4`);
  }
  for (const name of names) {
    if (!SCREENSHOT_NAME.test(name)) fail(`screenshot name ${name} is not allowed`);
    const size = statSync(join(dir, name)).size;
    if (size > CAPS.screenshots.max_bytes) fail(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
  return names;
}

function checkGame(dir) {
  const index = join(dir, 'index.html');
  if (!existsSync(index) || !statSync(index).isFile()) fail('game/index.html is missing');
  if (statSync(index).size > 1048576) fail('game/index.html is over the 1 MiB cap');
  const found = walkGame(dir, '', { entries: 0, bytes: 0 });
  if (found.entries > CAPS.game_max_files) fail(`game/ holds ${found.entries} entries, over the 993 cap`);
  if (found.bytes > CAPS.game_max_bytes) fail(`game/ is ${found.bytes} bytes, over the 48 MiB cap`);
  return found;
}

const game = checkGame(join(here, 'game'));
const shots = checkShots(join(here, 'screenshots'));

mkdirSync(out, { recursive: true });
for (const sub of ['game', 'screenshots']) {
  const target = join(out, sub);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(
  `Mothlight handed in: game/ ${game.entries} entries, ${game.bytes} bytes; ` +
    `screenshots ${shots.join(', ')}; dossier.json ${dossier.length} bytes.`,
);
