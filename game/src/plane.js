// The aircraft itself: where it is, how fast it flies, and how the stick
// moves it. The model is arcade, not a simulator: throttle sets speed,
// pitch sets climb, bank sets the turn, and the track's curves push the
// plane sideways if the pilot does not hold it.

import {
  MIN_SPEED, MAX_SPEED, CRUISE_SPEED, THROTTLE_RATE, CLIMB_RATE,
  DESCEND_RATE, MAX_ALTITUDE, BANK_RATE, MAX_BANK, TURN_RATE,
  CURVE_PUSH, FUEL_MAX, FUEL_DRAIN, ROAD_HALF_WIDTH,
} from './config.js';
import { clamp } from './random.js';

// A fresh plane, sitting on the runway at the start of the track.
export function makePlane() {
  return {
    // Lateral offset from the track centre, in world units.
    x: 0,
    // Height above the ground under the plane.
    altitude: 0,
    // Distance along the track.
    z: 0,
    // Speed in world units per second.
    speed: 0,
    // Throttle lever, 0..1.
    throttle: 0,
    // Bank angle in radians; positive banks right.
    bank: 0,
    // Pitch in radians; positive climbs.
    pitch: 0,
    // Compass heading in radians; 0 is straight down the valley.
    heading: 0,
    // Fuel in units, FUEL_MAX at takeoff.
    fuel: FUEL_MAX,
    // True once the wheels have left the runway.
    airborne: false,
    // True while the plane is on the ground rolling.
    onGround: true,
  };
}

// One simulation step. `input` is { pitch, roll, throttle, brake } with
// pitch/roll in -1..1 and throttle/brake booleans-ish 0/1. `curve` is the
// track's bend at the plane's segment, `ground` the terrain height there.
// Returns nothing; mutates the plane. `dt` is seconds, clamped by the
// caller to a sane step.
export function stepPlane(plane, input, dt, curve, ground, topSpeed) {
  // Throttle lever moves toward the pilot's demand.
  if (input.throttleUp) plane.throttle = clamp(plane.throttle + THROTTLE_RATE * dt, 0, 1);
  if (input.throttleDown) plane.throttle = clamp(plane.throttle - THROTTLE_RATE * dt, 0, 1);
  if (input.brake) plane.throttle = clamp(plane.throttle - THROTTLE_RATE * 2.2 * dt, 0, 1);

  // Speed chases the throttle's target; drag grows with the square of speed.
  const target = MIN_SPEED + plane.throttle * (topSpeed - MIN_SPEED);
  const drag = 0.25 + (plane.speed / topSpeed) * 0.9;
  plane.speed += (target - plane.speed) * Math.min(1, drag * dt * 2.2);
  if (plane.speed < 0) plane.speed = 0;

  // Bank follows the stick and eases back to level when it is released.
  const bankTarget = input.roll * MAX_BANK;
  plane.bank += (bankTarget - plane.bank) * Math.min(1, BANK_RATE * dt * 2);

  // The bank turns the plane: heading changes with bank and speed.
  plane.heading += plane.bank * TURN_RATE * (plane.speed / topSpeed) * dt;
  plane.x += Math.sin(plane.heading) * plane.speed * dt;
  // The track's curve pushes the plane outward if it is not held.
  plane.x += curve * CURVE_PUSH * plane.speed * dt * 0.12;

  // Pitch follows the stick; climbing costs speed, descending gains a little.
  const pitchTarget = input.pitch * 0.42;
  plane.pitch += (pitchTarget - plane.pitch) * Math.min(1, 3.2 * dt);
  const climb = Math.sin(plane.pitch) * (plane.pitch > 0 ? CLIMB_RATE : DESCEND_RATE);
  if (plane.airborne || plane.pitch > 0.08) {
    plane.altitude += climb * dt * (0.55 + plane.speed / topSpeed);
  }
  if (plane.altitude < 0) plane.altitude = 0;
  if (plane.altitude > MAX_ALTITUDE) plane.altitude = MAX_ALTITUDE;

  // Liftoff: enough speed and a little pitch, or a hard pull at speed.
  if (!plane.airborne && plane.speed > 95 && plane.pitch > 0.05) {
    plane.airborne = true;
    plane.onGround = false;
  }
  // Touchdown: back on the ground when the altitude reaches the dirt.
  if (plane.altitude <= 0) {
    plane.altitude = 0;
    plane.onGround = true;
    plane.airborne = false;
  } else {
    plane.onGround = false;
  }

  // Fuel burns with the throttle; gliding sips it.
  plane.fuel -= FUEL_DRAIN * (0.25 + plane.throttle * 0.75) * dt;
  if (plane.fuel < 0) plane.fuel = 0;

  // Forward motion along the track.
  plane.z += plane.speed * dt;

  // Keep the plane inside the valley walls; the ridges stop it, softly.
  const wall = ROAD_HALF_WIDTH + 130;
  if (plane.x < -wall) { plane.x = -wall; plane.heading = Math.max(plane.heading, 0); }
  if (plane.x > wall) { plane.x = wall; plane.heading = Math.min(plane.heading, 0); }
}

// The plane's world height: ground plus altitude.
export function planeHeight(plane, ground) {
  return ground + plane.altitude;
}

// True when the plane is slow and low over the runway: a landing.
export function isLanding(plane, runway) {
  return runway && plane.altitude <= 0.4 && plane.speed < 120 && Math.abs(plane.x) < ROAD_HALF_WIDTH;
}

// True when the plane has hit the dirt: low over rough ground, or fast
// into the ground anywhere but a gentle runway touchdown.
export function isCrash(plane, runway) {
  if (plane.altitude > 0.4) return false;
  if (runway && plane.speed < 120 && Math.abs(plane.x) < ROAD_HALF_WIDTH) return false;
  return plane.speed > 30;
}
