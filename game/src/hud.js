// The heads-up display, drawn on the canvas so it shows in the
// screenshots: airspeed and altitude with lit dials, a compass strip with
// the heading, a fuel gauge, the throttle, the score and the rings left,
// plus the mission banner and the transient messages (ring taken, low
// fuel, landed). The instruments are drawn, not DOM, so the game is one
// canvas and nothing else to position.

import { VIEW_WIDTH as W, VIEW_HEIGHT as H, FUEL_MAX } from './config.js';
import { clamp } from './random.js';

// A small labelled readout: big value, small unit, dim label. The big
// value carries a soft dark shadow so it stays readable when a bright
// cloud drifts behind it.
function readout(ctx, x, y, label, value, unit, accent) {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(210, 225, 240, 0.75)';
  ctx.font = '600 12px sans-serif';
  ctx.fillText(label, x, y);
  ctx.save();
  ctx.shadowColor = 'rgba(4, 8, 14, 0.8)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#f4f8ff';
  ctx.font = '700 34px sans-serif';
  ctx.fillText(value, x, y + 34);
  ctx.restore();
  ctx.fillStyle = accent;
  ctx.font = '600 13px sans-serif';
  const vw = ctx.measureText(value).width;
  ctx.fillText(unit, x + vw + 8, y + 34);
}

// A horizontal bar gauge with a label and a low warning colour.
function gauge(ctx, x, y, w, label, frac, color, warnAt) {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(210, 225, 240, 0.75)';
  ctx.font = '600 12px sans-serif';
  ctx.fillText(label, x, y);
  ctx.fillStyle = 'rgba(8, 14, 24, 0.55)';
  ctx.fillRect(x, y + 6, w, 10);
  const low = frac < warnAt;
  ctx.fillStyle = low ? '#ff5a4d' : color;
  ctx.fillRect(x + 1, y + 7, Math.max(0, (w - 2) * clamp(frac, 0, 1)), 8);
  if (low && Math.floor(performance.now() / 450) % 2 === 0) {
    ctx.fillStyle = '#ff5a4d';
    ctx.font = '700 12px sans-serif';
    ctx.fillText('LOW', x + w + 8, y + 15);
  }
}

// The compass strip: cardinal points slide past the centre mark as the
// heading turns.
function compass(ctx, heading) {
  const cx = W / 2;
  const cy = 30;
  const points = [
    [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
    [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
  ];
  ctx.save();
  ctx.fillStyle = 'rgba(8, 14, 24, 0.5)';
  ctx.fillRect(cx - 170, 8, 340, 42);
  ctx.beginPath();
  ctx.rect(cx - 170, 8, 340, 42);
  ctx.clip();
  const deg = ((heading * 180) / Math.PI % 360 + 360) % 360;
  ctx.textAlign = 'center';
  ctx.font = '700 15px sans-serif';
  for (const [pdeg, name] of points) {
    let d = pdeg - deg;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const x = cx + d * 2.1;
    if (x < cx - 180 || x > cx + 180) continue;
    ctx.fillStyle = name.length === 1 ? '#ffd166' : 'rgba(230, 238, 248, 0.85)';
    ctx.fillText(name, x, cy + 6);
    ctx.fillStyle = 'rgba(230, 238, 248, 0.5)';
    ctx.fillRect(x - 0.5, cy + 12, 1, 8);
  }
  ctx.restore();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(cx, 8);
  ctx.lineTo(cx - 6, 18);
  ctx.lineTo(cx + 6, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4f8ff';
  ctx.font = '700 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(deg)}°`, cx, 66);
}

// A small attitude indicator: a ball that rolls with the bank and pitches
// with the climb, with a fixed aircraft mark in the middle.
function attitude(ctx, x, y, r, bank, pitch) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(bank);
  ctx.translate(0, pitch * r * 1.4);
  ctx.fillStyle = '#3f7ec2';
  ctx.fillRect(-r, -r, r * 2, r);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(-r, 0, r * 2, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(240, 244, 250, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(x - 16, y);
  ctx.lineTo(x - 4, y);
  ctx.lineTo(x, y - 5);
  ctx.lineTo(x + 4, y);
  ctx.lineTo(x + 16, y);
  ctx.lineTo(x + 12, y + 3);
  ctx.lineTo(x - 12, y + 3);
  ctx.closePath();
  ctx.fill();
}

// The whole HUD for one frame. `hud` carries the numbers; `banner` is a
// transient centre message or null; `mission` names the sortie.
export function drawHud(ctx, hud) {
  const { plane, score, ringsLeft, ringsTotal, mission, banner, muted } = hud;
  const knots = Math.round(plane.speed * 1.8);
  const feet = Math.round(plane.altitude * 3.28 * 10);
  const vspeed = Math.round(Math.sin(plane.pitch) * plane.speed * 1.8 * 10) / 10;

  // Soft dark corners so the text reads over any sky.
  const shade = ctx.createLinearGradient(0, 0, 0, 90);
  shade.addColorStop(0, 'rgba(6, 10, 18, 0.45)');
  shade.addColorStop(1, 'rgba(6, 10, 18, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, 90);
  const shadeB = ctx.createLinearGradient(0, H - 80, 0, H);
  shadeB.addColorStop(0, 'rgba(6, 10, 18, 0)');
  shadeB.addColorStop(1, 'rgba(6, 10, 18, 0.45)');
  ctx.fillStyle = shadeB;
  ctx.fillRect(0, H - 80, W, 80);

  compass(ctx, plane.heading);
  readout(ctx, 28, 34, 'AIRSPEED', String(knots), 'KT', '#ffd166');
  readout(ctx, W - 168, 34, 'ALTITUDE', String(feet), 'FT', '#7fd0ff');
  ctx.textAlign = 'right';
  ctx.fillStyle = vspeed >= 0 ? '#8be28b' : '#ff9a8a';
  ctx.font = '600 14px sans-serif';
  ctx.fillText(`${vspeed >= 0 ? '+' : ''}${vspeed} ft/s`, W - 28, 84);

  // Fuel, throttle and attitude, bottom left.
  gauge(ctx, 28, H - 66, 190, 'FUEL', plane.fuel / FUEL_MAX, '#37e08a', 0.25);
  gauge(ctx, 28, H - 34, 190, 'THROTTLE', plane.throttle, '#ffd166', -1);
  attitude(ctx, 268, H - 44, 26, plane.bank, plane.pitch);

  // Score and rings, bottom right.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(210, 225, 240, 0.75)';
  ctx.font = '600 12px sans-serif';
  ctx.fillText('SCORE', W - 28, H - 66);
  ctx.fillStyle = '#f4f8ff';
  ctx.font = '700 30px sans-serif';
  ctx.fillText(String(score), W - 28, H - 34);
  ctx.fillStyle = '#ffc93e';
  ctx.font = '700 15px sans-serif';
  const taken = ringsTotal - ringsLeft;
  ctx.fillText(`◉ ${taken} / ${ringsTotal} RINGS`, W - 28, H - 84);

  // Mission name, top left under the airspeed.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(230, 238, 248, 0.85)';
  ctx.font = '600 13px sans-serif';
  ctx.fillText(mission.name.toUpperCase(), 28, 108);

  if (muted) {
    ctx.fillStyle = 'rgba(230, 238, 248, 0.7)';
    ctx.font = '600 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('MUTED', W - 28, H - 108);
  }

  // Transient centre banner, fading with its own life.
  if (banner) {
    ctx.globalAlpha = clamp(banner.life, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = '700 34px sans-serif';
    ctx.fillStyle = banner.color || '#ffd166';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText(banner.text, W / 2, H * 0.3);
    if (banner.sub) {
      ctx.font = '600 16px sans-serif';
      ctx.fillStyle = '#f4f8ff';
      ctx.fillText(banner.sub, W / 2, H * 0.3 + 28);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}
