// A tiny seeded random generator, so the valley, the rings and the clouds
// are the same every time a mission loads. Deterministic terrain matters:
// the screenshots must show the same valley the player flies.

// mulberry32: a small, fast seeded PRNG with a good spread.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A value in [min, max) from a rng.
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

// A whole number in [min, max] from a rng.
export function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

// Clamp a value into [min, max].
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

// Linear interpolation.
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Smoothstep easing between 0 and 1.
export function smooth(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
