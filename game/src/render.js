// The chase-view renderer: sky, sun, clouds and far ridges, then the
// valley ribbon drawn back to front as projected trapezoids, then the
// runway, trees and rings, and finally the aircraft itself with its
// shadow and the speed lines. Everything is Canvas 2D, no images, so the
// game loads nothing but its own files.

import {
  VIEW_WIDTH as W, VIEW_HEIGHT as H, SEG_LEN, DRAW_DISTANCE,
  ROAD_HALF_WIDTH, CAMERA_HEIGHT, CAMERA_DEPTH, RUNWAY_START, RUNWAY_END,
} from './config.js';
import { makeRng, clamp, lerp } from './random.js';

// Per-mission scenery, built once and reused: cloud blobs and two ridge
// silhouettes, all from the mission seed so the valley never changes.
const sceneryCache = new Map();

function sceneryFor(mission) {
  if (sceneryCache.has(mission.seed)) return sceneryCache.get(mission.seed);
  const rng = makeRng(mission.seed * 7 + 3);
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    clouds.push({
      x: rng(), y: 0.06 + rng() * 0.22, s: 0.5 + rng() * 1.1, drift: 0.004 + rng() * 0.008,
    });
  }
  function ridge(points, minH, maxH) {
    const out = [];
    let h = (minH + maxH) / 2;
    for (let i = 0; i <= points; i++) {
      h = clamp(h + (rng() - 0.5) * (maxH - minH) * 0.7, minH, maxH);
      out.push({ x: i / points, h });
    }
    return out;
  }
  const scene = { clouds, farRidge: ridge(26, 0.05, 0.24), nearRidge: ridge(20, 0.02, 0.13) };
  sceneryCache.set(mission.seed, scene);
  return scene;
}

// Mix two colours by t (0 = a, 1 = b). Accepts #rrggbb or rgb(r,g,b)
// inputs and always returns #rrggbb, so a mix can feed into another
// mix — the field-boundary bands do exactly that, and feeding an rgb()
// string back into a hex-only parser came out near-black.
function mixHex(a, b, t) {
  const parse = (s) => {
    if (s.startsWith('rgb')) {
      return s.slice(4, -1).split(',').map(Number);
    }
    const p = parseInt(s.slice(1), 16);
    return [(p >> 16) & 255, (p >> 8) & 255, p & 255];
  };
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(lerp(ca[0], cb[0], t));
  const g = Math.round(lerp(ca[1], cb[1], t));
  const bl = Math.round(lerp(ca[2], cb[2], t));
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

// Project a world point into screen space. Returns null behind the camera.
function project(x, y, z, cam) {
  const dz = z - cam.z;
  if (dz < 1) return null;
  const scale = CAMERA_DEPTH / dz;
  return {
    x: W / 2 + scale * (x - cam.x) * (W / 2),
    y: H / 2 - scale * (y - cam.y) * (H / 2),
    w: scale * (W / 2),
    scale,
  };
}

// Draw the sky, sun, clouds and ridges for the mission's time of day.
function drawSky(ctx, mission, plane, time) {
  const p = mission.palette;
  const horizonY = H * 0.46 - plane.pitch * 160 - plane.altitude * 0.1;
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(0.62, p.skyMid);
  sky.addColorStop(1, p.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizonY + 40);

  // Sun, low and warm, with a soft halo.
  const sunX = W * 0.76;
  const sunY = horizonY - H * 0.16;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 150);
  glow.addColorStop(0, p.sunGlow);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 150, sunY - 150, 300, 300);
  ctx.fillStyle = p.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
  ctx.fill();

  // Drifting clouds, soft white ellipses in small clusters.
  const scene = sceneryFor(mission);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const c of scene.clouds) {
    const cx = (((c.x + time * c.drift) % 1.2) - 0.1) * W;
    const cy = c.y * H;
    const s = c.s * 46;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 1.6, s * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - s * 0.9, cy + s * 0.12, s * 0.9, s * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + s * 0.9, cy + s * 0.1, s * 1.0, s * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Two ridge layers, parallaxed by the camera's lateral drift.
  drawRidge(ctx, scene.farRidge, horizonY, p.far, plane.x * 0.12 + plane.heading * 60, 1);
  drawRidge(ctx, scene.nearRidge, horizonY, p.near, plane.x * 0.3 + plane.heading * 130, 0.72);
}

function drawRidge(ctx, ridge, horizonY, color, offset, heightScale) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-40, horizonY + 2);
  for (const pt of ridge) {
    const x = ((pt.x * 1.4 - (offset % 1.4) + 1.4) % 1.4 - 0.2) * W;
    ctx.lineTo(x, horizonY - pt.h * H * heightScale);
  }
  ctx.lineTo(W + 40, horizonY + 2);
  ctx.closePath();
  ctx.fill();
}

// The whole frame: sky first, then the ribbon far to near, then sprites,
// the plane, and the particles.
export function render(ctx, view) {
  const { plane, track, mission, time, particles } = view;
  const p = mission.palette;
  const groundHere = track.segments[Math.min(Math.floor(plane.z / SEG_LEN), track.segments.length - 1)].height;
  const camY = groundHere + plane.altitude + CAMERA_HEIGHT;
  const camZ = plane.z;

  // Cumulative centre-line offsets, so the ribbon bends with the track.
  const centre = new Float64Array(track.segments.length + 1);
  for (let i = 1; i <= track.segments.length; i++) {
    centre[i] = centre[i - 1] + track.segments[i - 1].curve * SEG_LEN * 0.055;
  }
  const camX = centre[Math.min(Math.floor(plane.z / SEG_LEN), track.segments.length - 1)] + plane.x;
  const cam = { x: camX, y: camY, z: camZ };

  drawSky(ctx, mission, plane, time);

  const planeSeg = Math.floor(plane.z / SEG_LEN);
  const horizonY = H * 0.46 - plane.pitch * 160 - plane.altitude * 0.1;

  // The valley floor behind the ribbon: a gradient from the horizon haze
  // down to the far ground colour, so no bare canvas shows at the edges
  // where the ribbon narrows toward the horizon.
  const floor = ctx.createLinearGradient(0, horizonY, 0, H);
  floor.addColorStop(0, p.horizon);
  floor.addColorStop(0.25, p.groundFar);
  floor.addColorStop(1, p.groundFar);
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizonY, W, H - horizonY);

  // Ground ribbon, far to near, one trapezoid per segment.
  for (let n = DRAW_DISTANCE; n > 0; n--) {
    const i = planeSeg + n;
    if (i >= track.segments.length - 1) continue;
    const s0 = track.segments[i];
    const s1 = track.segments[i + 1];
    const p0 = project(centre[i], s0.height, s0.z, cam);
    const p1 = project(centre[i + 1], s1.height, s1.z, cam);
    if (!p0 || !p1) continue;
    // Cull bands that project entirely into the sky: far segments over a
    // crest can sit above the horizon, and drawing them wastes fill.
    if (p0.y < horizonY - 140 && p1.y < horizonY - 140) continue;
    const depth = n / DRAW_DISTANCE;
    const fogT = depth * depth * 0.85;
    // Every eighth band is a field boundary, a touch darker, so the
    // valley floor reads as patchwork rather than one flat colour.
    let base = i % 2 === 0 ? p.groundA : p.groundB;
    if (i % 8 === 0) base = mixHex(base, '#1a2416', 0.18);
    ctx.fillStyle = mixHex(base, p.groundFar, Math.min(1, fogT + depth * 0.25));
    const half0 = p0.w * ROAD_HALF_WIDTH * 3.1;
    const half1 = p1.w * ROAD_HALF_WIDTH * 3.1;
    ctx.beginPath();
    ctx.moveTo(p0.x - half0, p0.y);
    ctx.lineTo(p0.x + half0, p0.y);
    ctx.lineTo(p1.x + half1, p1.y);
    ctx.lineTo(p1.x - half1, p1.y);
    ctx.closePath();
    ctx.fill();

    // The runway ribbon on its segments: dark asphalt, pale edges,
    // a dashed gold centre line.
    if (s0.runway) {
      const rw0 = p0.w * ROAD_HALF_WIDTH * 0.5;
      const rw1 = p1.w * ROAD_HALF_WIDTH * 0.5;
      ctx.fillStyle = mixHex(p.runway, p.groundFar, fogT);
      ctx.beginPath();
      ctx.moveTo(p0.x - rw0, p0.y);
      ctx.lineTo(p0.x + rw0, p0.y);
      ctx.lineTo(p1.x + rw1, p1.y);
      ctx.lineTo(p1.x - rw1, p1.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = mixHex(p.runwayEdge, p.groundFar, fogT);
      ctx.lineWidth = Math.max(1, p0.w * 1.6);
      ctx.beginPath();
      ctx.moveTo(p0.x - rw0, p0.y);
      ctx.lineTo(p1.x - rw1, p1.y);
      ctx.moveTo(p0.x + rw0, p0.y);
      ctx.lineTo(p1.x + rw1, p1.y);
      ctx.stroke();
      if (i % 4 < 2) {
        ctx.strokeStyle = mixHex(p.runwayMark, p.groundFar, fogT);
        ctx.lineWidth = Math.max(1, p0.w * 1.2);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
  }

  // Trees and rings, far to near, so nearer ones draw over farther ones.
  for (let n = DRAW_DISTANCE; n > 0; n--) {
    const i = planeSeg + n;
    if (i >= track.segments.length - 1) continue;
    const seg = track.segments[i];
    for (const tree of seg.trees) {
      const pt = project(centre[i] + tree.dx, seg.height, seg.z, cam);
      if (!pt || pt.y < horizonY - 4 || pt.y > H + 40) continue;
      const th = pt.scale * tree.h * (H / 2);
      const tw = pt.scale * tree.w * (W / 2);
      if (th < 1.5) continue;
      ctx.fillStyle = '#2c4a26';
      ctx.fillRect(pt.x - tw * 0.08, pt.y - th * 0.22, tw * 0.16, th * 0.22);
      ctx.fillStyle = '#33582c';
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - th);
      ctx.lineTo(pt.x - tw * 0.55, pt.y - th * 0.18);
      ctx.lineTo(pt.x + tw * 0.55, pt.y - th * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3d6a33';
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - th * 0.82);
      ctx.lineTo(pt.x - tw * 0.42, pt.y - th * 0.42);
      ctx.lineTo(pt.x + tw * 0.42, pt.y - th * 0.42);
      ctx.closePath();
      ctx.fill();
    }
  }
  for (const ring of track.rings) {
    if (ring.taken) continue;
    const segIndex = ring.segment;
    if (segIndex <= planeSeg || segIndex > planeSeg + DRAW_DISTANCE) continue;
    const pt = project(centre[segIndex] + ring.x, ring.y, ring.z, cam);
    if (!pt) continue;
    const r = Math.max(2, pt.scale * ring.radius * (W / 2));
    const pulse = 1 + 0.06 * Math.sin(time * 3 + ring.pulse);
    ctx.save();
    ctx.shadowColor = '#ffb52e';
    ctx.shadowBlur = 18 * pulse;
    ctx.strokeStyle = '#ffc93e';
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, r * 0.045);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Distance tag on the nearest ring ahead, only while it is close
    // enough to matter; a far ring's number is noise on the screen.
    if (ring === nextRing(track, plane) && ring.z - plane.z < 600) {
      ctx.fillStyle = 'rgba(255,201,62,0.95)';
      ctx.font = `bold ${Math.max(11, Math.min(20, r * 0.5))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.max(0, Math.round((ring.z - plane.z) / 10) * 10)}m`, pt.x, pt.y - r - 10);
    }
  }

  // The plane's shadow on the ground below it.
  const shadowPt = project(camX, groundHere, plane.z + 46, cam);
  if (shadowPt && plane.altitude > 0.5) {
    const shrink = clamp(1 - plane.altitude / 130, 0.25, 1);
    ctx.fillStyle = `rgba(10, 14, 20, ${0.34 * shrink})`;
    ctx.beginPath();
    ctx.ellipse(shadowPt.x, shadowPt.y, 52 * shrink * shadowPt.scale * 8, 10 * shrink * shadowPt.scale * 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPlane(ctx, plane, time);
  drawParticles(ctx, particles, cam, centre, plane, time);
  drawSpeedLines(ctx, plane);
}

// The nearest ring the plane has not taken yet.
export function nextRing(track, plane) {
  for (const ring of track.rings) {
    if (!ring.taken && ring.z > plane.z) return ring;
  }
  return null;
}

// The aircraft, drawn from behind and slightly above: cream fuselage with
// a red cheatline, wide wings, a tail, a spinning prop disc and lit
// navigation lights. It banks with the plane's bank and pitches a little.
function drawPlane(ctx, plane, time) {
  const px = W / 2 + plane.bank * 60;
  const py = H * 0.60 + plane.pitch * 34;
  const s = 1.0;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(plane.bank * 0.55);
  ctx.scale(s, s);

  // Propeller disc: a translucent blur that spins with the throttle.
  const spin = time * (14 + plane.throttle * 34);
  ctx.save();
  ctx.translate(0, -6);
  ctx.rotate(spin);
  ctx.fillStyle = 'rgba(220, 225, 235, 0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 74, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(60, 66, 78, 0.5)';
  ctx.fillRect(-2, -72, 4, 144);
  ctx.fillRect(-72, -2, 144, 4);
  ctx.restore();

  // Tailplane and fin, drawn first so the fuselage covers their roots.
  ctx.fillStyle = '#b8322a';
  ctx.beginPath();
  ctx.moveTo(-58, 26);
  ctx.lineTo(-30, 12);
  ctx.lineTo(-30, 30);
  ctx.lineTo(-58, 34);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(58, 26);
  ctx.lineTo(30, 12);
  ctx.lineTo(30, 30);
  ctx.lineTo(58, 34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c23a30';
  ctx.beginPath();
  ctx.moveTo(-4, -34);
  ctx.lineTo(10, -34);
  ctx.lineTo(16, 6);
  ctx.lineTo(-8, 6);
  ctx.closePath();
  ctx.fill();

  // Wings: broad, slightly swept, red above cream with white tips.
  ctx.fillStyle = '#d23b2e';
  ctx.beginPath();
  ctx.moveTo(-128, 18);
  ctx.lineTo(-96, 2);
  ctx.lineTo(-20, 8);
  ctx.lineTo(-20, 26);
  ctx.lineTo(-96, 34);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(128, 18);
  ctx.lineTo(96, 2);
  ctx.lineTo(20, 8);
  ctx.lineTo(20, 26);
  ctx.lineTo(96, 34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4ede0';
  ctx.beginPath();
  ctx.moveTo(-128, 18);
  ctx.lineTo(-112, 12);
  ctx.lineTo(-112, 30);
  ctx.lineTo(-128, 34);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(128, 18);
  ctx.lineTo(112, 12);
  ctx.lineTo(112, 30);
  ctx.lineTo(128, 34);
  ctx.closePath();
  ctx.fill();

  // Fuselage: a rounded body, cream with a red cheatline and a dark belly.
  ctx.fillStyle = '#f6efdd';
  ctx.beginPath();
  ctx.moveTo(0, -52);
  ctx.quadraticCurveTo(20, -40, 22, -6);
  ctx.quadraticCurveTo(23, 22, 12, 40);
  ctx.quadraticCurveTo(0, 48, -12, 40);
  ctx.quadraticCurveTo(-23, 22, -22, -6);
  ctx.quadraticCurveTo(-20, -40, 0, -52);
  ctx.fill();
  ctx.fillStyle = '#c23a30';
  ctx.beginPath();
  ctx.moveTo(-21, -2);
  ctx.quadraticCurveTo(0, 6, 21, -2);
  ctx.lineTo(21, 6);
  ctx.quadraticCurveTo(0, 13, -21, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2e3440';
  ctx.beginPath();
  ctx.ellipse(0, 44, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cockpit glass, lit from the sky, with a bright glint.
  ctx.fillStyle = '#1d2f45';
  ctx.beginPath();
  ctx.ellipse(0, -30, 13, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 210, 255, 0.75)';
  ctx.beginPath();
  ctx.ellipse(-4, -36, 5, 8, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Spinner cone and navigation lights.
  ctx.fillStyle = '#8c2f26';
  ctx.beginPath();
  ctx.arc(0, -6, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath();
  ctx.arc(-128, 24, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#37e08a';
  ctx.beginPath();
  ctx.arc(128, 24, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 44, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Burst sparks and smoke, projected from the world into the screen.
function drawParticles(ctx, particles, cam, centre, plane, time) {
  for (const pt of particles) {
    const age = 1 - pt.life / pt.maxLife;
    const segIndex = Math.min(Math.floor(pt.z / SEG_LEN), centre.length - 1);
    const p = project(centre[segIndex] + pt.x, pt.y, pt.z, cam);
    if (!p) continue;
    const r = Math.max(1.5, p.scale * pt.size * (W / 2) * (1 - age * 0.5));
    ctx.globalAlpha = Math.max(0, 1 - age);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Radial speed streaks at the screen edges when the plane is fast.
function drawSpeedLines(ctx, plane) {
  if (plane.speed < 190) return;
  const strength = clamp((plane.speed - 190) / 110, 0, 1);
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * strength})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + plane.bank * 0.4;
    const r0 = 330 + (i % 3) * 40;
    const r1 = r0 + 46 + strength * 60;
    ctx.beginPath();
    ctx.moveTo(W / 2 + Math.cos(angle) * r0, H * 0.55 + Math.sin(angle) * r0 * 0.7);
    ctx.lineTo(W / 2 + Math.cos(angle) * r1, H * 0.55 + Math.sin(angle) * r1 * 0.7);
    ctx.stroke();
  }
  ctx.restore();
}
