// Bootstrap and the main loop: the canvas, the overlays, the clock and
// the wiring between the input, the game, the renderer and the HUD. The
// loop runs at the display's refresh rate; the simulation step is clamped
// so a slow frame cannot teleport the plane.

import { VIEW_WIDTH, VIEW_HEIGHT, MISSIONS } from './config.js';
import { makeGame, updateGame, startMission, applyShotScene } from './game.js';
import { render } from './render.js';
import { drawHud } from './hud.js';
import { makeInput, bindInput, clearPressed } from './input.js';
import { makeAudio, startAudio, setMuted } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_WIDTH;
canvas.height = VIEW_HEIGHT;

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot') || null;

let game = makeGame(0);
if (shotMode) {
  game = applyShotScene(game, params);
} else {
  // Remember the best score per mission, across visits.
  game.best = loadBest();
}

const input = makeInput();
bindInput(input, canvas);
const audio = makeAudio();

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem('skyline-best') || '{}');
  } catch (err) {
    return {};
  }
}

function saveBest(game) {
  try {
    const best = loadBest();
    const key = String(game.mission.id);
    if (!best[key] || game.score > best[key]) best[key] = game.score;
    localStorage.setItem('skyline-best', JSON.stringify(best));
    game.best = best;
  } catch (err) {
    // Storage is a nicety; the game plays without it.
  }
}

// The overlay screens, one per state; the canvas keeps rendering behind
// them so the menu and the end screens stay alive.
const overlays = {
  menu: document.getElementById('menu'),
  pause: document.getElementById('pause'),
  end: document.getElementById('end'),
};

function showOverlay(name) {
  for (const [key, el] of Object.entries(overlays)) {
    if (el) el.classList.toggle('hidden', key !== name);
  }
}

function fillEndScreen() {
  const title = document.getElementById('end-title');
  const body = document.getElementById('end-body');
  if (!title || !body) return;
  if (game.state === 'crashed') {
    title.textContent = 'CRASHED';
    body.textContent = `${game.crashReason || 'Terrain strike'} — score ${game.score}.`;
  } else if (game.state === 'complete') {
    title.textContent = 'MISSION COMPLETE';
    body.textContent = `${game.mission.name} — score ${game.score}.`;
  } else if (game.state === 'gameover') {
    title.textContent = 'END OF THE VALLEY';
    body.textContent = `Score ${game.score}.`;
  }
  const best = document.getElementById('end-best');
  if (best) {
    const b = (game.best || {})[String(game.mission.id)] || 0;
    best.textContent = b > 0 ? `Best on ${game.mission.name}: ${b}` : '';
  }
}

// The mission cards on the menu: name, brief, rings and best score.
function fillMenu() {
  const list = document.getElementById('mission-list');
  if (!list) return;
  list.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const best = (game.best || {})[String(m.id)] || 0;
    const card = document.createElement('button');
    card.className = 'mission';
    card.type = 'button';
    card.innerHTML = `<span class="mission-key">${i + 1}</span>
      <span class="mission-name">${m.name}</span>
      <span class="mission-brief">${m.brief}</span>
      <span class="mission-meta">${m.rings} rings · best ${best}</span>`;
    card.addEventListener('click', () => launch(i));
    list.appendChild(card);
  });
}

function launch(missionIndex) {
  startAudio(audio);
  game = startMission(game, missionIndex);
  game.best = loadBest();
  showOverlay(null);
}

function restart() {
  startAudio(audio);
  game = startMission(game, game.missionIndex);
  game.best = loadBest();
  showOverlay(null);
}

// The clock: requestAnimationFrame with a clamped step.
let last = performance.now();
let shownEndFor = null;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;

  // Global keys, read once a frame.
  if (input.pressedMute) {
    setMuted(audio, !audio.muted);
  }
  if (input.pressedStart) startAudio(audio);
  if (game.state === 'menu' && input.pressedAny) startAudio(audio);

  if (game.state === 'menu' && !shotMode) {
    // Keys 1-3 pick a mission straight from the menu.
    for (let i = 0; i < MISSIONS.length; i++) {
      if (input.held.has(`Digit${i + 1}`) || input.held.has(`Numpad${i + 1}`)) {
        launch(i);
        break;
      }
    }
  }
  // P pauses from flight or from the takeoff roll, and resumes back to
  // the state it came from; it does nothing on the menu or end screens.
  if (input.pressedPause && (game.state === 'flying' || game.state === 'landed' || game.state === 'paused')) {
    if (game.state === 'paused') {
      game.state = game.pausedFrom || 'flying';
      game.pausedFrom = null;
    } else {
      game.pausedFrom = game.state;
      game.state = 'paused';
    }
  }
  if (input.pressedRestart && game.state !== 'menu') restart();

  updateGame(game, input, audio, dt);
  clearPressed(input);

  render(ctx, {
    plane: game.plane,
    track: game.track,
    mission: game.mission,
    time: game.time,
    particles: game.particles,
  });
  drawHud(ctx, {
    plane: game.plane,
    score: game.score,
    ringsLeft: game.ringsLeft,
    ringsTotal: game.mission.rings,
    mission: game.mission,
    banner: game.banner,
    muted: audio.muted,
  });

  // Signal a frame is on the canvas: the finalist hold loads the page
  // with each shots.json query and waits for this flag before framing.
  if (!window.__shotReady) window.__shotReady = true;

  // Overlays follow the state; the end screen fills once per ending.
  if (shotMode) {
    showOverlay(game.state === 'menu' ? 'menu' : null);
  } else if (game.state === 'menu') {
    showOverlay('menu');
  } else if (game.state === 'paused') {
    showOverlay('pause');
  } else if (game.state === 'crashed' || game.state === 'complete' || game.state === 'gameover') {
    if (shownEndFor !== game.state + game.score) {
      shownEndFor = game.state + game.score;
      saveBest(game);
      fillEndScreen();
    }
    showOverlay('end');
  } else {
    showOverlay(null);
  }

  requestAnimationFrame(frame);
}

fillMenu();
showOverlay(shotMode && game.state !== 'menu' ? null : 'menu');
requestAnimationFrame(frame);
