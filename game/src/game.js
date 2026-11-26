// The game itself: the state machine, the missions, the rings, the fuel,
// the landings and the crashes. It owns the plane, the track, the score
// and the particles, and it tells the renderer and the HUD what to draw.
// The menu runs an autopilot attract mode behind the title screen; the
// `?shot=` scenes set up fixed states for the screenshots.

import {
  MISSIONS, SEG_LEN, SEG_COUNT, FUEL_MAX, FUEL_PER_RING,
  RING_SCORE, LANDING_SCORE,
} from './config.js';
import { buildTrack, groundAt, onRunway, segmentAt } from './terrain.js';
import { makePlane, stepPlane, planeHeight, isLanding, isCrash } from './plane.js';
import { readControls } from './input.js';
import { ringChime, landingThud, crashNoise, updateEngine } from './audio.js';
import { clamp } from './random.js';

// A fresh game on a mission: the track, a plane on the runway, a full
// tank and no score yet. `missionIndex` picks from MISSIONS.
export function makeGame(missionIndex) {
  const mission = MISSIONS[missionIndex % MISSIONS.length];
  const track = buildTrack(mission);
  const plane = makePlane();
  plane.fuel = mission.fuel;
  plane.z = 24 * SEG_LEN;
  return {
    mission,
    missionIndex,
    track,
    plane,
    state: 'menu',
    score: 0,
    ringsLeft: mission.rings,
    banner: null,
    particles: [],
    time: 0,
    menuDrift: 0,
    // True once the pilot has taken off at least once this sortie.
    tookOff: false,
    // True once every ring is threaded; the sortie ends on the runway.
    ringsDone: false,
    completeBonus: false,
    crashReason: '',
    // Warned about the empty tank once, so the banner does not repeat.
    fuelWarned: false,
    // The state the game was in before a pause, so resuming returns
    // to it — a pause during the takeoff roll resumes the roll.
    pausedFrom: null,
  };
}

// Show a transient centre message for `seconds`.
function showBanner(game, text, sub, color, seconds) {
  game.banner = { text, sub: sub || '', color: color || '#ffd166', life: seconds || 2.2 };
}

// A burst of sparks at a world position.
function burst(game, x, y, z, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = Math.random() * Math.PI * 2;
    game.particles.push({
      x, y, z,
      vx: Math.cos(a) * speed * (0.4 + Math.random() * 0.6),
      vy: Math.sin(b) * speed * 0.6,
      vz: Math.sin(a) * speed * 0.5,
      life: 0.7 + Math.random() * 0.4,
      maxLife: 1.1,
      size: 0.5 + Math.random() * 0.9,
      color,
    });
  }
}

// Smoke for a crash: dark puffs that rise and fade.
function smoke(game, x, y, z) {
  for (let i = 0; i < 34; i++) {
    game.particles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + Math.random() * 4,
      z: z + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 5,
      vz: (Math.random() - 0.5) * 4,
      life: 1.2 + Math.random() * 0.8,
      maxLife: 2.0,
      size: 1.2 + Math.random() * 1.6,
      color: '#5a5a60',
    });
  }
}

// Step the particles: drift, fade, drop the dead ones.
function stepParticles(game, dt) {
  for (const p of game.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
}

// Thread a ring: score, fuel, sparks, a chime and a banner.
function takeRing(game, ring, audio) {
  ring.taken = true;
  game.ringsLeft -= 1;
  game.score += RING_SCORE;
  game.plane.fuel = clamp(game.plane.fuel + FUEL_PER_RING, 0, FUEL_MAX);
  burst(game, ring.x, ring.y, ring.z, '#ffc93e', 26, 26);
  ringChime(audio);
  showBanner(game, `RING +${RING_SCORE}`, `${game.ringsLeft} to go`, '#ffd166', 1.4);
  if (game.ringsLeft === 0) {
    game.ringsDone = true;
    showBanner(game, 'ALL RINGS!', 'Land on the runway to finish', '#8be28b', 3.0);
  }
}

// Put the plane down: refuel, score, and either back into the air or the
// end of the sortie.
function landPlane(game, audio) {
  const plane = game.plane;
  plane.fuel = FUEL_MAX;
  plane.speed = Math.min(plane.speed, 40);
  plane.throttle = 0;
  landingThud(audio);
  if (game.ringsDone && !game.completeBonus) {
    game.completeBonus = true;
    game.score += 500;
    game.state = 'complete';
    showBanner(game, 'MISSION COMPLETE', `+500 landing bonus — score ${game.score}`, '#8be28b', 4);
    return;
  }
  game.score += LANDING_SCORE;
  game.state = 'landed';
  showBanner(game, `LANDED +${LANDING_SCORE}`, 'Fuel full — throttle up to take off again', '#8be28b', 2.6);
}

// The plane hit the dirt.
function crashPlane(game, audio, reason) {
  const plane = game.plane;
  game.state = 'crashed';
  game.crashReason = reason;
  crashNoise(audio);
  smoke(game, plane.x, planeHeight(plane, groundAt(game.track, plane.z)), plane.z);
  showBanner(game, 'CRASHED', reason, '#ff5a4d', 3.5);
}

// One frame of the game. `input` is the input state, `audio` the sound
// state, `dt` seconds since the last frame (clamped by the caller).
export function updateGame(game, input, audio, dt) {
  game.time += dt;
  if (game.banner) {
    game.banner.life -= dt;
    if (game.banner.life <= 0) game.banner = null;
  }
  stepParticles(game, dt);

  const plane = game.plane;
  const controls = readControls(input, 1280, 800);

  if (game.state === 'menu') {
    // Attract mode: the plane flies itself down the valley behind the
    // title screen, gentle and slow, so the menu is alive.
    game.menuDrift += dt;
    plane.throttle = 0.55;
    const auto = {
      pitch: Math.sin(game.menuDrift * 0.35) * 0.25,
      roll: Math.sin(game.menuDrift * 0.22) * 0.4,
      throttleUp: 0, throttleDown: 0, brake: 0,
    };
    const seg = segmentAt(game.track, plane.z);
    stepPlane(plane, auto, dt, seg.curve, seg.height, game.mission.topSpeed);
    if (plane.z > game.track.length - 400) {
      plane.z = 24 * SEG_LEN;
      plane.altitude = 0;
      plane.speed = 0;
    }
    updateEngine(audio, plane.throttle, plane.speed, game.mission.topSpeed);
    return;
  }

  if (game.state === 'paused') return;

  if (game.state === 'crashed' || game.state === 'complete') {
    updateEngine(audio, 0, 0, game.mission.topSpeed);
    return;
  }

  if (game.state === 'landed') {
    // Throttle up to take off again; the plane rolls down the runway.
    const seg = segmentAt(game.track, plane.z);
    stepPlane(plane, controls, dt, seg.curve, seg.height, game.mission.topSpeed);
    if (plane.airborne) {
      game.state = 'flying';
      game.tookOff = true;
      showBanner(game, 'AIRBORNE', '', '#f4f8ff', 1.2);
    }
    updateEngine(audio, plane.throttle, plane.speed, game.mission.topSpeed);
    return;
  }

  // Flying: the sortie itself.
  const seg = segmentAt(game.track, plane.z);
  const ground = seg.height;
  const runway = seg.runway;
  if (plane.fuel <= 0) {
    // Out of fuel: the throttle dies and the plane glides down. Warn
    // once, so the pilot knows the glide is their last chance to land.
    if (!game.fuelWarned) {
      game.fuelWarned = true;
      showBanner(game, 'FUEL EMPTY', 'Gliding — find the runway', '#ff5a4d', 2.6);
    }
    plane.throttle = 0;
    controls.throttleUp = 0;
  }
  stepPlane(plane, controls, dt, seg.curve, ground, game.mission.topSpeed);
  if (plane.airborne) game.tookOff = true;
  game.score += Math.round(plane.speed * dt * 0.02);

  // Rings: thread one by flying through its disc.
  const py = planeHeight(plane, ground);
  for (const ring of game.track.rings) {
    if (ring.taken) continue;
    if (Math.abs(ring.z - plane.z) > 20) continue;
    const dx = plane.x - ring.x;
    const dy = py - ring.y;
    if (Math.sqrt(dx * dx + dy * dy) < ring.radius + 7) takeRing(game, ring, audio);
  }

  // Landing or crashing, decided by the ground under the wheels.
  if (isLanding(plane, runway)) {
    landPlane(game, audio);
  } else if (isCrash(plane, runway)) {
    crashPlane(game, audio, plane.fuel <= 0 ? 'Out of fuel' : 'Terrain strike');
  }

  // Out of valley: the sortie ends at the end of the track.
  if (plane.z >= game.track.length - SEG_LEN) {
    game.state = 'gameover';
    showBanner(game, 'END OF THE VALLEY', `Score ${game.score}`, '#f4f8ff', 4);
  }

  updateEngine(audio, plane.throttle, plane.speed, game.mission.topSpeed);
}

// Start a sortie from the menu, or restart the current one.
export function startMission(game, missionIndex) {
  const fresh = makeGame(missionIndex);
  fresh.state = 'flying';
  fresh.plane.throttle = 0.6;
  return fresh;
}

// Set up a fixed scene for the screenshots: `?shot=cover|menu|rings|landing`
// with an optional `&mission=1|2|3`. The scene starts flying at a chosen
// spot so the frame shows the game at its best, deterministically.
export function applyShotScene(game, params) {
  const shot = params.get('shot');
  if (!shot) return game;
  const missionIndex = Number(params.get('mission') || '2') - 1;
  const g = makeGame(missionIndex);
  if (shot === 'menu') {
    g.state = 'menu';
    g.plane.z = 30 * SEG_LEN;
    g.plane.altitude = 26;
    g.plane.speed = 120;
    g.plane.throttle = 0.55;
    return g;
  }
  g.state = 'flying';
  if (shot === 'cover') {
    // Golden hour, mid-valley, a ring dead ahead, throttle open.
    const ring = g.track.rings[4];
    g.plane.z = ring.z - 420;
    g.plane.x = ring.x * 0.4;
    g.plane.altitude = ring.y - groundAt(g.track, g.plane.z) - 6;
    g.plane.speed = 205;
    g.plane.throttle = 0.72;
  } else if (shot === 'rings') {
    // Dawn, just about to thread a ring low over the river valley.
    const ring = g.track.rings[2];
    g.plane.z = ring.z - 260;
    g.plane.x = ring.x * 0.5;
    g.plane.altitude = ring.y - groundAt(g.track, g.plane.z) - 4;
    g.plane.speed = 175;
    g.plane.throttle = 0.62;
  } else if (shot === 'landing') {
    // Dusk, on final approach: close enough that the runway fills the
    // frame ahead, gear down low, throttle nearly closed.
    g.plane.z = 20 * SEG_LEN;
    g.plane.x = -4;
    g.plane.altitude = 13;
    g.plane.speed = 100;
    g.plane.throttle = 0.3;
    g.plane.pitch = -0.06;
  }
  return g;
}
