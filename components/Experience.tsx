"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";

type MediaItem = { type: "image" | "video"; src: string; title: string };

function hash2(col: number, row: number, mod: number) {
  let x = col | 0;
  let y = row | 0;
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  h >>>= 0;
  return h % mod;
}

// 1,4,8,12… = Manhattan ring
function manhattanRing(col: number, row: number, ocol: number, orow: number) {
  return Math.abs(col - ocol) + Math.abs(row - orow);
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export default function Experience() {
  // ========= DEBUG =========
  const DEBUG = true;

  // ===== CONFIG =====
  const TILE_SIZE = 160;
  const GAP = 100;
  const CELL = TILE_SIZE + GAP;

  const OVERSCAN = 2;
  const RADIUS = 16;

  // img 움직일 때 빈틈 방지
  const MEDIA_SCALE = 1.16;

  // parallax
  const PARALLAX_STRENGTH = 50;

  // inertia
  const INERTIA_MIN_SPEED = 30;
  const INERTIA_STOP_SPEED = 8;
  const FRICTION_BASE = 0.06;

  // ripple follow
  const DRAG_BASE_TAU = 0.22; // ring0
  const DRAG_STEP_TAU = 0.028; // 멀리도 따라오게
  const DRAG_MAX_TAU = 0.55;

  const SETTLE_BASE_TAU = 0.12;
  const SETTLE_STEP_TAU = 0.03;
  const SETTLE_MAX_TAU = 0.4;

  const RIPPLE_STRENGTH = 1.25;
  const RIPPLE_MAX_OFFSET = 32;

  const SETTLE_EPS = 0.45;
  const SETTLE_STABLE_FRAMES = 12;

  // ✅ wrap이 화면 “밖”에서만 일어나도록 큰 마진
  //    - 기존처럼 minX=-CELL*3 같은 얕은 임계값이면, 타일이 아직 보이는 상태에서 wrap됨
  const WRAP_MARGIN = CELL * (OVERSCAN + 4) + TILE_SIZE; // 충분히 크게

  // ===== MEDIA =====
  const mediaList: MediaItem[] = useMemo(
    () => [
      { type: "image", src: "https://images.unsplash.com/photo-1669205022521-35fd91a450cc?w=400&h=400&fit=crop", title: "Project 1" },
      { type: "image", src: "https://images.unsplash.com/photo-1763142275482-f9f7f98b8bd6?w=400&h=400&fit=crop", title: "Project 2" },
      { type: "image", src: "https://images.unsplash.com/photo-1768638687895-b5ee4a586c7f?w=400&h=400&fit=crop", title: "Project 3" },
      { type: "image", src: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=400&h=400&fit=crop", title: "Project 4" },
      { type: "image", src: "https://images.unsplash.com/photo-1768268004424-0f30eb142ca3?w=400&h=400&fit=crop", title: "Project 5" },
      { type: "video", src: "https://res.cloudinary.com/dmtfoxbgo/video/upload/w_400,h_400,c_fill/samples/dance-2.mp4", title: "Dance Video" },
      { type: "video", src: "https://res.cloudinary.com/dmtfoxbgo/video/upload/w_400,h_400,c_fill/samples/sea-turtle.mp4", title: "Sea Turtle Video" },
      { type: "image", src: "https://images.unsplash.com/photo-1510832198440-a52376950479?w=400&h=400&fit=crop", title: "Project 6" },
      { type: "image", src: "https://images.unsplash.com/photo-1660563115496-8040aa23fc81?w=400&h=400&fit=crop", title: "Project 7" },
      { type: "image", src: "https://plus.unsplash.com/premium_photo-1674498703651-86f8f1e41df9?w=400&h=400&fit=crop", title: "Project 8" },
      { type: "image", src: "https://images.unsplash.com/photo-1484446991649-77f7fbd73f1f?w=400&h=400&fit=crop", title: "Project 9" },
      { type: "image", src: "https://images.unsplash.com/photo-1526511253005-9a4a8cde2956?w=400&h=400&fit=crop", title: "Project 10" },
      { type: "image", src: "https://plus.unsplash.com/premium_photo-1668638806052-4544af05f648?w=400&h=400&fit=crop", title: "Project 11" },
      { type: "image", src: "https://images.unsplash.com/photo-1499557354967-2b2d8910bcca?w=400&h=400&fit=crop", title: "Project 12" },
      { type: "image", src: "https://images.unsplash.com/photo-1534083220759-4c3c00112ea0?w=400&h=400&fit=crop", title: "Project 13" },
      { type: "image", src: "https://images.unsplash.com/photo-1575186083127-03641b958f61?w=400&h=400&fit=crop", title: "Project 14" },
    ],
    []
  );

  // ===== refs =====
  const rootRef = useRef<HTMLDivElement | null>(null);

  const viewport = useRef({ w: 0, h: 0 });
  const [poolDims, setPoolDims] = useState<{ cols: number; rows: number }>({ cols: 0, rows: 0 });

  const resizing = useRef(false);
  const resizeTimer = useRef<number | null>(null);

  const dragging = useRef(false);

  const panTarget = useRef({ x: 0, y: 0 });
  const view = useRef({ x: 0, y: 0 });

  const parallax = useRef({ x: 0, y: 0 });

  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  const inertia = useRef({ vx: 0, vy: 0, active: false });
  const lastMove = useRef<{ x: number; y: number; t: number } | null>(null);

  // ripple
  const rippleOrigin = useRef<{ col: number; row: number } | null>(null);
  const rippleMode = useRef<"idle" | "drag" | "settle">("idle");
  const settleStable = useRef(0);
  const ringFollow = useRef<Map<number, { x: number; y: number }>>(new Map());

  // debug counters
  const dbg = useRef({ wraps: 0, swaps: 0, maxOff: 0 });
  const dbgElRef = useRef<HTMLDivElement | null>(null);
  const dbgSetText = useRef<((v: string) => void) | null>(null);

  type PoolCell = {
    setTX: (v: number) => void;
    setTY: (v: number) => void;
    setMX: (v: number) => void;
    setMY: (v: number) => void;

    col: number;
    row: number;

    mediaKey: string;
    ring: number;

    img: HTMLImageElement;
  };

  const pool = useRef<PoolCell[]>([]);

  // ===== pool dims init/resize =====
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      viewport.current = { w, h };

      const cols = Math.ceil(w / CELL) + OVERSCAN * 2 + 1;
      const rows = Math.ceil(h / CELL) + OVERSCAN * 2 + 1;

      setPoolDims({ cols, rows });
    };

    compute();

    const onResize = () => {
      resizing.current = true;

      inertia.current.active = false;
      inertia.current.vx = 0;
      inertia.current.vy = 0;

      if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
      resizeTimer.current = window.setTimeout(() => {
        compute();
        resizing.current = false;
      }, 140);
    };

    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
    };
  }, [CELL]);

  // ===== parallax =====
  useEffect(() => {
    let rafId: number | null = null;
    let mx = 0;
    let my = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (dragging.current) return;

        const { w, h } = viewport.current;
        const cx = w / 2;
        const cy = h / 2;
        const nx = (mx - cx) / cx;
        const ny = (my - cy) / cy;

        parallax.current.x = -nx * PARALLAX_STRENGTH;
        parallax.current.y = -ny * PARALLAX_STRENGTH;
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // ===== pointer drag =====
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onDown = (ev: PointerEvent) => {
      (ev.target as HTMLElement)?.setPointerCapture?.(ev.pointerId);

      dragging.current = true;
      inertia.current.active = false;

      dragStart.current = { x: ev.clientX, y: ev.clientY };
      panStart.current = { ...panTarget.current };
      lastMove.current = { x: ev.clientX, y: ev.clientY, t: performance.now() };

      const worldX = ev.clientX - view.current.x;
      const worldY = ev.clientY - view.current.y;
      const col = Math.round(worldX / CELL);
      const row = Math.round(worldY / CELL);
      rippleOrigin.current = { col, row };

      // seed followers from current view (jump 방지)
      ringFollow.current.clear();
      ringFollow.current.set(0, { x: view.current.x, y: view.current.y });

      // drag 중 parallax off
      parallax.current.x = 0;
      parallax.current.y = 0;

      rippleMode.current = "drag";
      settleStable.current = 0;
    };

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;

      const dx = ev.clientX - dragStart.current.x;
      const dy = ev.clientY - dragStart.current.y;

      panTarget.current.x = panStart.current.x + dx;
      panTarget.current.y = panStart.current.y + dy;

      const now = performance.now();
      const prev = lastMove.current;
      if (prev) {
        const dms = Math.max(1, now - prev.t);
        inertia.current.vx = ((ev.clientX - prev.x) / dms) * 1000;
        inertia.current.vy = ((ev.clientY - prev.y) / dms) * 1000;
      }
      lastMove.current = { x: ev.clientX, y: ev.clientY, t: now };
    };

    const onUp = () => {
      if (!dragging.current) return;

      dragging.current = false;
      lastMove.current = null;

      const speed = Math.hypot(inertia.current.vx, inertia.current.vy);
      if (speed > INERTIA_MIN_SPEED) {
        inertia.current.active = true;
      } else {
        inertia.current.active = false;
        inertia.current.vx = 0;
        inertia.current.vy = 0;
      }

      rippleMode.current = "settle";
      settleStable.current = 0;
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [CELL, INERTIA_MIN_SPEED]);

  // ===== pool nodes =====
  const poolNodes = useMemo(() => {
    const { cols, rows } = poolDims;
    if (!cols || !rows) return [];

    const total = cols * rows;
    return new Array(total).fill(0).map((_, i) => (
      <div
        key={`p-${i}`}
        data-pool-index={i}
        style={{
          position: "absolute",
          width: TILE_SIZE,
          height: TILE_SIZE,
          borderRadius: RADIUS,
          overflow: "hidden",
          background: "rgba(255,255,255,0.06)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          willChange: "transform",
        }}
      >
        <img
          data-media
          draggable={false}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            borderRadius: RADIUS,
            willChange: "transform",
          }}
        />
      </div>
    ));
  }, [poolDims.cols, poolDims.rows]);

  // ===== capture pool refs + init stable col/row =====
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (DEBUG && dbgElRef.current && !dbgSetText.current) {
      dbgSetText.current = gsap.quickSetter(dbgElRef.current, "textContent") as any;
    }

    const tiles = Array.from(root.querySelectorAll<HTMLDivElement>("[data-pool-index]"));
    if (!tiles.length) return;

    const cols = poolDims.cols;
    const rows = poolDims.rows;
    if (!cols || !rows) return;

    pool.current = new Array(cols * rows);

    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = tiles[idx];
        const img = tile.querySelector<HTMLImageElement>("[data-media]")!;
        gsap.set(tile, { x: 0, y: 0, force3D: true });
        gsap.set(img, { x: 0, y: 0, scale: MEDIA_SCALE, transformOrigin: "50% 50%", force3D: true });

        const setTX = gsap.quickSetter(tile, "x", "px") as any;
        const setTY = gsap.quickSetter(tile, "y", "px") as any;
        const setMX = gsap.quickSetter(img, "x", "px") as any;
        const setMY = gsap.quickSetter(img, "y", "px") as any;

        // 초기 월드 좌표(고정)
        const worldCol = c - OVERSCAN;
        const worldRow = r - OVERSCAN;

        pool.current[idx] = {
          setTX,
          setTY,
          setMX,
          setMY,
          col: worldCol,
          row: worldRow,
          mediaKey: "",
          ring: 0,
          img,
        };

        idx++;
      }
    }

    // reset motion
    panTarget.current = { x: 0, y: 0 };
    view.current = { x: 0, y: 0 };
    inertia.current = { vx: 0, vy: 0, active: false };
    parallax.current = { x: 0, y: 0 };

    rippleMode.current = "idle";
    rippleOrigin.current = null;
    ringFollow.current.clear();
    settleStable.current = 0;

    dbg.current.wraps = 0;
    dbg.current.swaps = 0;
    dbg.current.maxOff = 0;
  }, [poolDims.cols, poolDims.rows, DEBUG]);

  // ===== main RAF =====
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;

      if (resizing.current) {
        raf = requestAnimationFrame(tick);
        return;
      }

      dbg.current.wraps = 0;
      dbg.current.swaps = 0;
      dbg.current.maxOff = 0;

      // inertia
      if (!dragging.current && inertia.current.active) {
        const friction = Math.pow(FRICTION_BASE, dt);
        inertia.current.vx *= friction;
        inertia.current.vy *= friction;

        panTarget.current.x += inertia.current.vx * dt;
        panTarget.current.y += inertia.current.vy * dt;

        const speed = Math.hypot(inertia.current.vx, inertia.current.vy);
        if (speed < INERTIA_STOP_SPEED) {
          inertia.current.active = false;
          inertia.current.vx = 0;
          inertia.current.vy = 0;
        }
      }

      const desiredX = panTarget.current.x + (dragging.current ? 0 : parallax.current.x);
      const desiredY = panTarget.current.y + (dragging.current ? 0 : parallax.current.y);

      if (dragging.current) {
        view.current.x = desiredX;
        view.current.y = desiredY;
      } else {
        const viewTau = 0.085;
        const a = 1 - Math.exp(-dt / viewTau);
        view.current.x += (desiredX - view.current.x) * a;
        view.current.y += (desiredY - view.current.y) * a;
      }

      const { w, h } = viewport.current;
      const cols = poolDims.cols;
      const rows = poolDims.rows;
      const cells = pool.current;
      if (!cols || !rows || !cells.length) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // wrap thresholds (완전히 화면 밖)
      const minX = -WRAP_MARGIN;
      const maxX = w + WRAP_MARGIN;
      const minY = -WRAP_MARGIN;
      const maxY = h + WRAP_MARGIN;

      const origin = rippleOrigin.current;
      const mode = rippleMode.current;
      const ringsThisFrame = new Set<number>();

      // 1) tile position + wrap + src swap(=wrap된 것만)
      for (const cell of cells) {
        if (!cell) continue;

        let tx = cell.col * CELL + view.current.x;
        let ty = cell.row * CELL + view.current.y;

        let wrapped = false;

        while (tx < minX) {
          cell.col += cols;
          tx = cell.col * CELL + view.current.x;
          wrapped = true;
        }
        while (tx > maxX) {
          cell.col -= cols;
          tx = cell.col * CELL + view.current.x;
          wrapped = true;
        }
        while (ty < minY) {
          cell.row += rows;
          ty = cell.row * CELL + view.current.y;
          wrapped = true;
        }
        while (ty > maxY) {
          cell.row -= rows;
          ty = cell.row * CELL + view.current.y;
          wrapped = true;
        }

        if (wrapped) {
          dbg.current.wraps += 1;
          cell.mediaKey = ""; // wrap된 경우만 swap 허용
        }

        cell.setTX(tx);
        cell.setTY(ty);

        // media: wrap된 셀만 새 src로 갱신 (화면 안쪽은 절대 바뀌지 않음)
        if (cell.mediaKey === "") {
          const mediaIdx = hash2(cell.col, cell.row, mediaList.length);
          const media = mediaList[mediaIdx];
          if (media.type === "image") {
            cell.img.src = media.src;
            cell.mediaKey = `${mediaIdx}`;
            dbg.current.swaps += 1;
          } else {
            // video는 img-pool로는 안정적으로 못 섞음(다음 단계에서 video pool 분리)
            // 여기선 그냥 다음 이미지로 대체
            const fallbackIdx = (mediaIdx + 1) % mediaList.length;
            cell.img.src = mediaList[fallbackIdx].src;
            cell.mediaKey = `${fallbackIdx}`;
            dbg.current.swaps += 1;
          }
        }

        if (origin) {
          cell.ring = manhattanRing(cell.col, cell.row, origin.col, origin.row);
          ringsThisFrame.add(cell.ring);
        } else {
          cell.ring = 0;
        }
      }

      // 2) ripple
      let maxOff = 0;

      if ((mode === "drag" || mode === "settle") && origin) {
        ringsThisFrame.forEach((ring) => {
          if (!ringFollow.current.has(ring)) {
            ringFollow.current.set(ring, { x: view.current.x, y: view.current.y });
          }
        });

        ringsThisFrame.forEach((ring) => {
          const rf = ringFollow.current.get(ring)!;

          const tauRaw =
            mode === "drag"
              ? DRAG_BASE_TAU + ring * DRAG_STEP_TAU
              : SETTLE_BASE_TAU + ring * SETTLE_STEP_TAU;

          const tau =
            mode === "drag"
              ? clamp(tauRaw, DRAG_BASE_TAU, DRAG_MAX_TAU)
              : clamp(tauRaw, SETTLE_BASE_TAU, SETTLE_MAX_TAU);

          const a = 1 - Math.exp(-dt / tau);

          rf.x += (view.current.x - rf.x) * a;
          rf.y += (view.current.y - rf.y) * a;
        });

        for (const cell of cells) {
          if (!cell) continue;

          const rf = ringFollow.current.get(cell.ring);
          if (!rf) {
            cell.setMX(0);
            cell.setMY(0);
            continue;
          }

          let rx = (rf.x - view.current.x) * RIPPLE_STRENGTH;
          let ry = (rf.y - view.current.y) * RIPPLE_STRENGTH;

          rx = clamp(rx, -RIPPLE_MAX_OFFSET, RIPPLE_MAX_OFFSET);
          ry = clamp(ry, -RIPPLE_MAX_OFFSET, RIPPLE_MAX_OFFSET);

          cell.setMX(rx);
          cell.setMY(ry);

          const d = Math.hypot(rx, ry);
          if (d > maxOff) maxOff = d;
        }

        if (mode === "settle") {
          if (maxOff < SETTLE_EPS) settleStable.current += 1;
          else settleStable.current = 0;

          if (settleStable.current >= SETTLE_STABLE_FRAMES) {
            rippleMode.current = "idle";
            rippleOrigin.current = null;
            ringFollow.current.clear();
            settleStable.current = 0;

            for (const cell of cells) {
              if (!cell) continue;
              cell.setMX(0);
              cell.setMY(0);
              cell.ring = 0;
            }
          }
        }
      } else {
        for (const cell of cells) {
          if (!cell) continue;
          cell.setMX(0);
          cell.setMY(0);
        }
      }

      dbg.current.maxOff = maxOff;

      // debug HUD
      if (DEBUG && dbgSetText.current) {
        dbgSetText.current(
          `POOL-WRAP ACTIVE
drag=${dragging.current ? "1" : "0"} mode=${rippleMode.current}
view=(${view.current.x.toFixed(1)}, ${view.current.y.toFixed(1)})
wraps=${dbg.current.wraps} swaps=${dbg.current.swaps}
maxRippleOffset=${dbg.current.maxOff.toFixed(2)}`
        );
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [poolDims.cols, poolDims.rows]);

  return (
    <div
      ref={rootRef}
      style={{
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        position: "relative",
        background: "#0a0a0a",
        touchAction: "none",
        cursor: "grab",
      }}
    >
      {DEBUG && (
        <div
          ref={dbgElRef}
          style={{
            position: "fixed",
            left: 12,
            top: 12,
            zIndex: 999999,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            lineHeight: 1.25,
            color: "#fff",
            background: "rgba(0,0,0,0.55)",
            padding: "10px 12px",
            borderRadius: 10,
            pointerEvents: "none",
            whiteSpace: "pre",
          }}
        />
      )}

      {poolNodes}
    </div>
  );
}
