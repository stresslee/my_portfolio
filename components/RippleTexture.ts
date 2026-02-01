import * as THREE from "three";

export class RippleTexture {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;

  w: number;
  h: number;

  // pointer in normalized [0..1]
  px = 0.5;
  py = 0.5;
  strength = 0;
  isDown = false;

  constructor(w = 256, h = 256) {
    this.w = w;
    this.h = h;

    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");
    this.ctx = ctx;

    // start black
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, w, h);

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
  }

  setPointerNorm(x: number, y: number) {
    this.px = Math.max(0, Math.min(1, x));
    this.py = Math.max(0, Math.min(1, y));
  }

  setDown(down: boolean) {
    this.isDown = down;
    if (!down) this.strength = 0;
  }

  step(dt: number) {
    const { ctx, w, h } = this;

    // fade old ripples
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(0, 0, w, h);

    // approach target strength
    const target = this.isDown ? 1.0 : 0.25;
    this.strength += (target - this.strength) * Math.min(1, dt * 12);

    // draw new ripple
    const x = this.px * w;
    const y = this.py * h;

    const r = this.isDown ? 26 : 18;

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.55 * this.strength})`);
    g.addColorStop(1, `rgba(0,0,0,0)`);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    this.tex.needsUpdate = true;
  }
}
