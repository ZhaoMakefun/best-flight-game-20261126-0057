// The valley the plane flies through: a ribbon of segments with a curve,
// a ground height, a runway near the start, trees on its sides and the
// golden rings the pilot threads. Everything is built from the mission's
// seed, so the same mission always flies the same valley.

import { SEG_COUNT, SEG_LEN, RUNWAY_START, RUNWAY_END } from './config.js';
import { makeRng, range, clamp } from './random.js';

// One segment of the track ribbon.
function makeSegment(index, z, curve, height, runway) {
  return {
    index,
    z,
    curve,
    height,
    runway,
    // Trees stand beside the ribbon; each is a lateral offset from the
    // centre line and a size. Filled in by buildTrack.
    trees: [],
  };
}

// The ground height at a segment, from layered sine hills. The runway and
// the ground around it are flattened so takeoffs and landings are level.
function groundHeightAt(index, phases) {
  const i = index;
  let h = 16 * Math.sin(i * 0.021 + phases[0])
    + 9 * Math.sin(i * 0.047 + phases[1])
    + 5 * Math.sin(i * 0.113 + phases[2]);
  const flat = smoothFlat(i);
  return h * (1 - flat);
}

// 1 on and near the runway, fading to 0 away from it.
function smoothFlat(index) {
  const d = Math.min(
    Math.abs(index - RUNWAY_START),
    Math.abs(index - RUNWAY_END),
  );
  if (index >= RUNWAY_START && index <= RUNWAY_END) return 1;
  const t = clamp(1 - (d - 6) / 26, 0, 1);
  return t * t;
}

// The track's bend at a segment: gentle S-curves that grow with distance.
function curveAt(index, phases) {
  return 0.55 * Math.sin(index * 0.016 + phases[3])
    + 0.3 * Math.sin(index * 0.043 + phases[4]);
}

// Build the whole track for a mission: segments, rings and trees.
export function buildTrack(mission) {
  const rng = makeRng(mission.seed);
  const phases = [rng() * 6.28, rng() * 6.28, rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const segments = [];
  for (let i = 0; i < SEG_COUNT; i++) {
    const runway = i >= RUNWAY_START && i <= RUNWAY_END;
    segments.push(makeSegment(
      i,
      i * SEG_LEN,
      curveAt(i, phases),
      groundHeightAt(i, phases),
      runway,
    ));
  }

  // Trees beside the ribbon, denser in the low valley, sparse on the ridges.
  for (let i = 0; i < SEG_COUNT; i++) {
    const seg = segments[i];
    if (seg.runway) continue;
    const count = rng() < 0.45 ? 1 : rng() < 0.2 ? 2 : 0;
    for (let k = 0; k < count; k++) {
      const side = rng() < 0.5 ? -1 : 1;
      seg.trees.push({
        dx: side * (44 + rng() * 90),
        h: 9 + rng() * 14,
        w: 5 + rng() * 4,
      });
    }
  }

  // Rings: spread along the track past the runway, at reachable heights,
  // alternating sides so the pilot has to work the stick.
  const rings = [];
  const first = RUNWAY_END + 26;
  const last = SEG_COUNT - 30;
  for (let r = 0; r < mission.rings; r++) {
    const t = mission.rings === 1 ? 0.5 : r / (mission.rings - 1);
    const segIndex = Math.floor(first + t * (last - first));
    const seg = segments[segIndex];
    const side = r % 2 === 0 ? 1 : -1;
    rings.push({
      id: r,
      segment: segIndex,
      z: seg.z,
      x: side * (6 + rng() * 14),
      y: seg.height + 26 + rng() * 34,
      radius: 13,
      taken: false,
      pulse: rng() * 6.28,
    });
  }

  return { segments, rings, length: SEG_COUNT * SEG_LEN };
}

// The segment index at a world z, clamped to the track.
export function segmentAt(track, z) {
  const i = Math.floor(z / SEG_LEN);
  return track.segments[clamp(i, 0, SEG_COUNT - 1)];
}

// The ground height under a world z (the nearest segment's height).
export function groundAt(track, z) {
  return segmentAt(track, z).height;
}

// Whether a world z is over the runway ribbon.
export function onRunway(track, z) {
  return segmentAt(track, z).runway;
}
