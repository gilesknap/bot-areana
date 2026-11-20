/**
 * Small procedural textures for effects (glows, smoke, beams, sweeps), drawn with Canvas 2D.
 * Most are white so the scene can tint them.
 */
import type Phaser from 'phaser';
import { PALETTE } from '../shared/palette';
import { drawBlurred } from './hall';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function make(textures: Phaser.Textures.TextureManager, key: string, w: number, h: number, draw: Draw): void {
  if (textures.exists(key)) return;
  const tex = textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.context, w, h);
  tex.refresh();
}

function radial(stops: Array<[number, string]>): Draw {
  return (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
}

function ring(dashes: number, width: number): Draw {
  return (ctx, w) => {
    const r = w / 2 - width - 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = width;
    if (dashes) {
      const c = 2 * Math.PI * r;
      ctx.setLineDash([(c / dashes) * 0.6, (c / dashes) * 0.4]);
    }
    ctx.beginPath();
    ctx.arc(w / 2, w / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  };
}

/** Pixels per cm for effect textures that are drawn at world size. */
export const FX_RES = 2;

/** Headlight beam: near end at the bottom centre, ±12 cm wide; far end 162 cm away, ±70 cm. */
export const BEAM = { w: 140, h: 162 };
/** Radar sweep texture radius in texture pixels. */
export const SWEEP_R = 256;

export function makeFxTextures(textures: Phaser.Textures.TextureManager): void {
  make(textures, 'fx-glow', 64, 64, radial([
    [0, 'rgba(255,255,255,1)'],
    [0.3, 'rgba(255,255,255,0.45)'],
    [1, 'rgba(255,255,255,0)'],
  ]));
  make(textures, 'fx-dot', 16, 16, radial([
    [0, 'rgba(255,255,255,1)'],
    [0.5, 'rgba(255,255,255,0.9)'],
    [1, 'rgba(255,255,255,0)'],
  ]));
  make(textures, 'fx-smoke', 64, 64, (ctx, w, h) => {
    for (let i = 0; i < 5; i++) {
      const x = w / 2 + Math.cos(i * 1.3) * 7;
      const y = h / 2 + Math.sin(i * 1.7) * 7;
      const g = ctx.createRadialGradient(x, y, 0, x, y, w / 2.6);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  });
  make(textures, 'fx-shadow', 64, 64, radial([
    [0, 'rgba(0,0,0,0.85)'],
    [0.55, 'rgba(0,0,0,0.55)'],
    [1, 'rgba(0,0,0,0)'],
  ]));
  make(textures, 'fx-scorch', 128, 128, (ctx, w, h) => {
    radial([
      [0, 'rgba(0,0,0,0.85)'],
      [0.6, 'rgba(5,7,10,0.5)'],
      [1, 'rgba(0,0,0,0)'],
    ])(ctx, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.sin(i * 7) * 0.2;
      const r0 = 14 + (i % 3) * 4;
      const r1 = 40 + ((i * 37) % 22);
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
      ctx.lineTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1);
      ctx.stroke();
    }
  });
  make(textures, 'fx-ring', 128, 128, ring(0, 5));
  make(textures, 'fx-dashring', 256, 256, ring(36, 3));
  make(textures, 'fx-shield', 128, 128, radial([
    [0, 'rgba(255,255,255,0)'],
    [0.62, 'rgba(255,255,255,0.06)'],
    [0.86, 'rgba(255,255,255,0.35)'],
    [0.93, 'rgba(255,255,255,0.8)'],
    [1, 'rgba(255,255,255,0)'],
  ]));
  make(textures, 'fx-flash', 64, 64, (ctx) => {
    // Eight-point muzzle star (Arena.dc.html), pointing up.
    ctx.translate(32, 32);
    ctx.scale(2, 2);
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const pts = [0, -14, 4, -3, 14, -1, 4, 3, 0, 14, -4, 3, -14, -1, -4, -3];
    for (let i = 0; i < pts.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](pts[i]!, pts[i + 1]!);
    ctx.closePath();
    ctx.fill();
  });
  make(textures, 'fx-bolt', 48, 16, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 4, 0, 0, Math.PI * 2);
    drawBlurred(ctx, 2, '#fff', () => ctx.fill());
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(w * 0.62, h / 2, w * 0.22, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  make(textures, 'fx-shard', 8, 5, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(8, 0);
    ctx.lineTo(6, 5);
    ctx.lineTo(1, 4);
    ctx.fill();
  });
  make(textures, 'fx-tread', 6, 4, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  });
  make(textures, 'fx-vignette', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.45, h / 2, 0, w * 0.45, h / 2, w * 0.75);
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  make(textures, 'fx-beam', BEAM.w * FX_RES, BEAM.h * FX_RES, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, 'rgba(232,251,255,0.30)');
    g.addColorStop(1, 'rgba(232,251,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 12 * FX_RES, h);
    ctx.lineTo(4 * FX_RES, 0);
    ctx.lineTo(w - 4 * FX_RES, 0);
    ctx.lineTo(w / 2 + 12 * FX_RES, h);
    ctx.closePath();
    drawBlurred(ctx, 3 * FX_RES, 'rgb(232,251,255)', () => ctx.fill());
  });
  make(textures, 'fx-sweep', SWEEP_R * 2, SWEEP_R * 2, (ctx, w, h) => {
    // Wedge trailing 50 degrees behind a leading edge that points along +x.
    const span = (50 * Math.PI) / 180;
    const g = ctx.createConicGradient(-span, w / 2, h / 2);
    g.addColorStop(0, 'rgba(91,227,154,0)');
    g.addColorStop(span / (Math.PI * 2), 'rgba(91,227,154,0.3)');
    g.addColorStop(span / (Math.PI * 2) + 0.0001, 'rgba(91,227,154,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.arc(w / 2, h / 2, w / 2, -span, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(91,227,154,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  });
  for (const team of ['player', 'enemy'] as const) {
    make(textures, `fx-wreck-${team}`, 64, 64, (ctx) => {
      ctx.translate(32, 32);
      ctx.scale(1.4, 1.4);
      ctx.fillStyle = '#1A1610';
      ctx.strokeStyle = team === 'player' ? '#1F5662' : '#5A4520';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const pts = [-16, -8, -8, -20, 6, -18, 16, -8, 14, 6, 2, 14, -12, 10];
      for (let i = 0; i < pts.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](pts[i]!, pts[i + 1]!);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(-6, -6);
      ctx.lineTo(0, 4);
      ctx.moveTo(4, -14);
      ctx.lineTo(2, -2);
      ctx.stroke();
      ctx.fillStyle = team === 'player' ? '#163A44' : '#3A2E1A';
      ctx.fillRect(8, 2, 5, 12);
    });
  }
  make(textures, 'fx-bracket', 64, 64, (ctx) => {
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(2, 22);
    ctx.lineTo(2, 2);
    ctx.lineTo(22, 2);
    ctx.stroke();
  });
}
