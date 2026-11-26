// Skyline Ridge Run — tuning constants, mission definitions and time-of-day
// palettes. One place for every number the rest of the game reads, so the
// flight model, the renderer and the missions all agree with each other.

// The canvas the game draws into (CSS scales it to the window).
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 800;

// The track is a ribbon of short segments the plane flies along. Each segment
// is SEG_LEN world units long; the plane moves forward along +z.
export const SEG_LEN = 40;
export const SEG_COUNT = 600;
export const DRAW_DISTANCE = 170;
export const ROAD_HALF_WIDTH = 34;

// Camera: how far ahead the projection looks, and how high the chase camera
// sits above the plane. cameraDepth comes from the field of view below.
export const CAMERA_HEIGHT = 7.5;
export const CAMERA_DEPTH = 0.84;

// Flight model limits. Speed is in world units per second; the HUD shows
// knots, roughly speed * 1.8.
export const MIN_SPEED = 26;
export const MAX_SPEED = 300;
export const CRUISE_SPEED = 150;
export const THROTTLE_RATE = 0.55;
export const CLIMB_RATE = 26;
export const DESCEND_RATE = 30;
export const MAX_ALTITUDE = 190;
export const BANK_RATE = 2.4;
export const MAX_BANK = 0.85;
export const TURN_RATE = 1.9;
export const CURVE_PUSH = 0.55;

// Fuel: 100 units at takeoff. A ring refunds some; landing on the runway
// refuels fully. Running dry forces a glide and then a crash.
export const FUEL_MAX = 100;
export const FUEL_DRAIN = 0.62;
export const FUEL_PER_RING = 7;
export const RING_SCORE = 100;
export const LANDING_SCORE = 250;

// The runway the plane takes off from and may land on again: segments
// RUNWAY_START..RUNWAY_END of the track, flat and striped.
export const RUNWAY_START = 24;
export const RUNWAY_END = 82;

// One mission: a name, the palette it flies in, how many rings to collect,
// how fast the plane may go, how much fuel it starts with, and the seed
// that shapes its terrain (a different seed, a different valley).
export const MISSIONS = [
  {
    id: 1,
    name: 'Dawn Patrol',
    brief: 'Fly the valley, thread 10 rings, and bring her home.',
    rings: 10,
    topSpeed: 210,
    fuel: 100,
    seed: 101,
    palette: {
      skyTop: '#5f9fd8', skyMid: '#a8cdf0', horizon: '#dceef8',
      sun: '#fff3c4', sunGlow: 'rgba(255, 240, 180, 0.55)',
      far: '#8fa8c8', near: '#6d8aa8',
      groundA: '#5d8a4a', groundB: '#547f43', groundFar: '#7ba05e',
      runway: '#3c4148', runwayEdge: '#e8e4d8', runwayMark: '#f2c14e',
      fog: 'rgba(220, 238, 248, 0.55)',
    },
  },
  {
    id: 2,
    name: 'Golden Hour Run',
    brief: 'Fourteen rings over the ridge before the light goes.',
    rings: 14,
    topSpeed: 265,
    fuel: 88,
    seed: 207,
    palette: {
      skyTop: '#2e4a7a', skyMid: '#c97a4e', horizon: '#f7a54a',
      sun: '#ffcf7d', sunGlow: 'rgba(255, 170, 80, 0.6)',
      far: '#7a5a7a', near: '#5c4468',
      groundA: '#7a6a3e', groundB: '#6e6036', groundFar: '#9a8250',
      runway: '#33302e', runwayEdge: '#efe6cf', runwayMark: '#f2c14e',
      fog: 'rgba(247, 165, 74, 0.4)',
    },
  },
  {
    id: 3,
    name: 'Dusk Landing',
    brief: 'Eight rings, then put her down on the strip at dusk.',
    rings: 8,
    topSpeed: 190,
    fuel: 74,
    seed: 313,
    palette: {
      skyTop: '#141c38', skyMid: '#5a3a68', horizon: '#e2607a',
      sun: '#ff8a6a', sunGlow: 'rgba(255, 120, 100, 0.5)',
      far: '#4a4468', near: '#38345a',
      groundA: '#3d4a3a', groundB: '#35422f', groundFar: '#55604a',
      runway: '#26262e', runwayEdge: '#d8d2c2', runwayMark: '#f2c14e',
      fog: 'rgba(90, 58, 104, 0.45)',
    },
  },
];

// Keys, kept in one place so input and the help screen agree.
export const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  throttleUp: ['ShiftLeft', 'ShiftRight', 'KeyE'],
  throttleDown: ['KeyQ', 'ControlLeft'],
  brake: ['KeyB'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
  mute: ['KeyM'],
};
