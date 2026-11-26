// Keyboard and mouse input. The plane answers to the arrow keys or WASD
// for pitch and roll, Shift to open the throttle, Q to close it, B to
// brake, and the mouse: hold and drag to steer toward the pointer. P
// pauses, R restarts, M mutes. Every key the game uses is listed here, so
// the help screen and the controls can never drift apart.

import { KEYS } from './config.js';

// A fresh input state. `held` is a set of physical key codes; `mouse` is
// the pointer position in canvas pixels, or null when it is not down.
export function makeInput() {
  return {
    held: new Set(),
    mouse: null,
    mouseStart: null,
    // Edge-triggered actions, set by the handlers and cleared by the game
    // after it reads them each frame.
    pressedPause: false,
    pressedRestart: false,
    pressedMute: false,
    pressedAny: false,
    pressedStart: false,
  };
}

function has(input, names) {
  return names.some((code) => input.held.has(code));
}

// Read the current control demand from the input state: pitch and roll in
// -1..1, throttle up/down and brake as 0/1. Mouse drag steers: dragging
// left or right banks, dragging up or down pitches.
export function readControls(input, canvasWidth, canvasHeight) {
  let pitch = 0;
  let roll = 0;
  if (has(input, KEYS.up)) pitch += 1;
  if (has(input, KEYS.down)) pitch -= 1;
  if (has(input, KEYS.left)) roll -= 1;
  if (has(input, KEYS.right)) roll += 1;
  if (input.mouse && input.mouseStart) {
    const dx = (input.mouse.x - input.mouseStart.x) / (canvasWidth * 0.25);
    const dy = (input.mouse.y - input.mouseStart.y) / (canvasHeight * 0.25);
    roll += Math.max(-1, Math.min(1, dx));
    pitch += Math.max(-1, Math.min(1, -dy));
  }
  return {
    pitch: Math.max(-1, Math.min(1, pitch)),
    roll: Math.max(-1, Math.min(1, roll)),
    throttleUp: has(input, KEYS.throttleUp) ? 1 : 0,
    throttleDown: has(input, KEYS.throttleDown) ? 1 : 0,
    brake: has(input, KEYS.brake) ? 1 : 0,
  };
}

// Wire the keyboard and mouse handlers onto the window and canvas.
// Returns a function that removes them again.
export function bindInput(input, canvas) {
  function onKeyDown(event) {
    if (event.repeat) return;
    input.held.add(event.code);
    input.pressedAny = true;
    if (KEYS.pause.includes(event.code)) input.pressedPause = true;
    if (KEYS.restart.includes(event.code)) input.pressedRestart = true;
    if (KEYS.mute.includes(event.code)) input.pressedMute = true;
    if (event.code === 'Enter' || event.code === 'Space') input.pressedStart = true;
    // Keep the page from scrolling on the keys the game owns.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    input.held.delete(event.code);
  }
  function onBlur() {
    input.held.clear();
    input.mouse = null;
    input.mouseStart = null;
  }
  function toCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }
  function onMouseDown(event) {
    const p = toCanvas(event);
    input.mouse = p;
    input.mouseStart = p;
    input.pressedAny = true;
  }
  function onMouseMove(event) {
    if (input.mouse) input.mouse = toCanvas(event);
  }
  function onMouseUp() {
    input.mouse = null;
    input.mouseStart = null;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  return function unbind() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}

// Clear the edge-triggered flags after the game has read them.
export function clearPressed(input) {
  input.pressedPause = false;
  input.pressedRestart = false;
  input.pressedMute = false;
  input.pressedAny = false;
  input.pressedStart = false;
}
