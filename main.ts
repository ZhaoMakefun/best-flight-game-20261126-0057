// Skyline Ridge Run — the entry program (Node 22, standard library only).
// It hands the game in: it copies this repository's game/ and screenshots/
// into the output directory and writes the dossier.json the judge reads,
// built by the kit's vendored library from exactly those files.
//
// The grader runs it twice in a fresh container with no network, a
// read-only copy of the repository and a writable output directory; both
// runs must write the same bytes. Outside the grader, MAKEFUN_OUTPUT_DIR
// stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root: the directory this file lives in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// The grader's output directory, or the local stand-in.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps the bounty's gate applies to the hand-in. Only text_max_bytes
// shapes the dossier's bytes; the others refuse an entry the scorer
// would refuse, so passing them here fails fast in the same places.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

// A directory that must exist in the repository, with a readable error
// when it does not, instead of a raw ENOENT from the copy below.
function requireDir(path: string, label: string): void {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`Skyline Ridge Run: ${label} is missing from the repository: ${path}`);
  }
}

function handIn(): void {
  requireDir(join(repoRoot, 'game'), 'game/');
  requireDir(join(repoRoot, 'screenshots'), 'screenshots/');

  mkdirSync(outputDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

  // The copy must have landed the page itself; a missing index.html
  // would hand in a game no browser can open, so fail loudly here.
  if (!existsSync(join(outputDir, 'game', 'index.html'))) {
    throw new Error('Skyline Ridge Run: game/index.html did not reach the output directory');
  }

  const dossier = buildDossier(outputDir, DOSSIER_CAPS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
}

handIn();
