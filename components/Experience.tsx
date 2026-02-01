"use client";

import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";

/* ================= MEDIA ================= */
type MediaItem = { type: "image" | "video"; src: string; title: string };

const MEDIA: MediaItem[] = [
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
];

/* ================= HELPERS ================= */
function wrap(v: number, min: number, max: number) {
  const r = max - min;
  return ((v - min) % r + r) % r + min;
}
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
// ✅ 토러스(무한 반복)에서 최단거리 델타
function shortestDelta(a: number, b: number, period: number) {
  let d = a - b;
  d = ((d + period / 2) % period + period) % period - period / 2;
  return d;
}
function makePlaceholderTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2a2dff";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "700 22px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("LOADING", 74, 134);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/* ================= MEDIA LOADER ================= */
function useMediaTextures(items: MediaItem[]) {
  const placeholder = useMemo(() => makePlaceholderTexture(), []);
  const [usableTextures, setUsableTextures] = useState<THREE.Texture[]>([placeholder]);

  const videoElsRef = useRef<HTMLVideoElement[]>([]);
  const videoTexRef = useRef<THREE.VideoTexture[]>([]);

  useEffect(() => {
    let alive = true;

    for (const vt of videoTexRef.current) vt.dispose();
    for (const v of videoElsRef.current) {
      try {
        v.pause();
        v.src = "";
        v.load();
      } catch {}
    }
    videoElsRef.current = [];
    videoTexRef.current = [];

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    const loadedList: THREE.Texture[] = [];
    const commit = () => {
      if (!alive) return;
      setUsableTextures(loadedList.length ? loadedList.slice() : [placeholder]);
    };

    items.forEach((item) => {
      if (item.type === "image") {
        loader.load(
          item.src,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = true;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.needsUpdate = true;
            loadedList.push(tex);
            commit();
          },
          undefined,
          () => commit()
        );
      } else {
        const video = document.createElement("video");
        video.src = item.src;
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        video.preload = "auto";

        const onLoaded = async () => {
          try {
            await video.play();
          } catch {}

          const vtex = new THREE.VideoTexture(video);
          vtex.colorSpace = THREE.SRGBColorSpace;
          vtex.minFilter = THREE.LinearFilter;
          vtex.magFilter = THREE.LinearFilter;
          vtex.generateMipmaps = false;
          vtex.wrapS = THREE.ClampToEdgeWrapping;
          vtex.wrapT = THREE.ClampToEdgeWrapping;
          vtex.needsUpdate = true;

          videoElsRef.current.push(video);
          videoTexRef.current.push(vtex);

          loadedList.push(vtex);
          commit();
        };

        video.addEventListener("loadeddata", onLoaded, { once: true });
        video.addEventListener("error", () => commit(), { once: true });
        video.load();
      }
    });

    commit();
    return () => {
      alive = false;
    };
  }, [items, placeholder]);

  const tickVideos = () => {
    for (const vt of videoTexRef.current) vt.needsUpdate = true;
  };

  return { usableTextures, placeholder, tickVideos };
}

/* ================= GRID ================= */
type Tile = { id: number; baseX: number; baseY: number };

function GridScene() {
  const { gl, size, camera } = useThree();
  const cam = camera as THREE.OrthographicCamera;

  const { usableTextures, placeholder, tickVideos } = useMediaTextures(MEDIA);

  useEffect(() => {
    cam.zoom = 88;
    cam.position.set(0, 0, 10);
    cam.rotation.set(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [cam]);

  // config (px-based)
  const tilePx = 160;
  const gapPx = 100;
  const tileSize = tilePx / cam.zoom;
  const step = (tilePx + gapPx) / cam.zoom;

  const viewW = size.width / cam.zoom;
  const viewH = size.height / cam.zoom;

  // perf: tile count auto
  const periodCols = Math.max(18, Math.ceil(viewW / step) + 10);
  const periodRows = Math.max(12, Math.ceil(viewH / step) + 10);

  // ✅ 반복 주기(토러스) 크기
  const periodW = periodCols * step;
  const periodH = periodRows * step;

  const tiles = useMemo<Tile[]>(() => {
    const arr: Tile[] = [];
    let id = 0;
    for (let j = 0; j < periodRows; j++) {
      for (let i = 0; i < periodCols; i++) arr.push({ id: id++, baseX: i, baseY: j });
    }
    return arr;
  }, [periodCols, periodRows]);

  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const matRefs = useRef<(THREE.ShaderMaterial | null)[]>([]);

  // 타일별 현재 오프셋
  const curOff = useRef<Float32Array>(new Float32Array(0));
  useEffect(() => {
    curOff.current = new Float32Array(tiles.length * 2);
  }, [tiles.length]);

  // drag + inertia
  const drag = useRef({
    isDown: false,
    lastX: 0,
    lastY: 0,
    velX: 0,
    velY: 0,
    targetX: 0,
    targetY: 0,
  });

  const dragStartWorld = useRef<{ x: number; y: number } | null>(null);

  const pointer = useRef({ nx: 0.5, ny: 0.5 });
  const parallax = useRef({ x: 0, y: 0 });

  const pickTex = (t: Tile) => {
    const n = usableTextures.length || 1;
    const idx = (t.id * 7 + t.baseX * 13 + t.baseY * 17) % n;
    return usableTextures[idx] ?? placeholder;
  };

  // shader
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader = `
    precision highp float;
    uniform sampler2D uImage;
    uniform float uCorner;
    uniform float uBorderSoft;
    uniform float uHover;
    varying vec2 vUv;

    float roundedMask(vec2 uv, float r, float soft) {
      vec2 p = uv - 0.5;
      vec2 b = vec2(0.5 - r);
      vec2 q = abs(p) - b;
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      return 1.0 - smoothstep(0.0, soft, d);
    }

    vec3 applyContrast(vec3 c, float k) {
      return (c - 0.5) * k + 0.5;
    }

    void main() {
      vec3 col = texture2D(uImage, vUv).rgb;
      float v = smoothstep(0.95, 0.25, distance(vUv, vec2(0.5)));
      col += v * 0.04;

      float h = clamp(uHover, 0.0, 1.0);
      col *= mix(1.0, 1.08, h);
      col = applyContrast(col, mix(1.0, 1.10, h));

      float m = roundedMask(vUv, uCorner, uBorderSoft);
      gl_FragColor = vec4(col, m);
    }
  `;

  // pointer events
  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";

    const setPointerNorm = (clientX: number, clientY: number) => {
      const nx = clientX / size.width;
      const ny = 1 - clientY / size.height;
      pointer.current.nx = nx;
      pointer.current.ny = ny;
    };

    const clientToWorld = (clientX: number, clientY: number) => {
      const nx = clientX / size.width;
      const ny = 1 - clientY / size.height;
      return { x: (nx - 0.5) * viewW, y: (ny - 0.5) * viewH };
    };

    const onDown = (e: PointerEvent) => {
      drag.current.isDown = true;
      drag.current.lastX = e.clientX;
      drag.current.lastY = e.clientY;
      setPointerNorm(e.clientX, e.clientY);
      dragStartWorld.current = clientToWorld(e.clientX, e.clientY);
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      setPointerNorm(e.clientX, e.clientY);
      if (!drag.current.isDown) return;

      const dx = e.clientX - drag.current.lastX;
      const dy = e.clientY - drag.current.lastY;

      drag.current.lastX = e.clientX;
      drag.current.lastY = e.clientY;

      const scale = 1 / cam.zoom;
      drag.current.velX = dx * scale;
      drag.current.velY = -dy * scale;

      drag.current.targetX += drag.current.velX;
      drag.current.targetY += drag.current.velY;
    };

    const onUp = () => {
      drag.current.isDown = false;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl.domElement, size.width, size.height, cam.zoom, viewW, viewH]);

  const cornerUv = 0.12;
  const softUv = 0.008;

  useFrame((_, dt) => {
    tickVideos();

    const d = drag.current;

    // inertia
    if (!d.isDown) {
      d.velX *= 0.92;
      d.velY *= 0.92;
      d.targetX += d.velX;
      d.targetY += d.velY;
    }

    // parallax (drag 중 OFF)
    const parallaxPx = 45;
    const targetPX = d.isDown ? 0 : -(pointer.current.nx - 0.5) * (parallaxPx / cam.zoom);
    const targetPY = d.isDown ? 0 : -(pointer.current.ny - 0.5) * (parallaxPx / cam.zoom);

    const parFollow = 1 - Math.pow(0.001, dt);
    parallax.current.x += (targetPX - parallax.current.x) * parFollow;
    parallax.current.y += (targetPY - parallax.current.y) * parFollow;

    // wrap bounds
    const minX = -(periodCols * step) / 2;
    const maxX = -minX;
    const minY = -(periodRows * step) / 2;
    const maxY = -minY;

    // Framer duration 모델
    const baseDur = 0.01;
    const extraDur = 0.30;
    const maxDistPx = 1500;

    // push
    const vmag = Math.sqrt(d.velX * d.velX + d.velY * d.velY);
    const pushStrength = 0.55;
    const pushLen = Math.max(viewW, viewH) * 0.55;
    const pushWidth = Math.min(viewW, viewH) * 0.20;

    let gdirx = 0, gdiry = 0;
    if (vmag > 1e-6) {
      gdirx = d.velX / vmag;
      gdiry = d.velY / vmag;
    }

    const ds = dragStartWorld.current;
    const off = curOff.current;

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];

      const bx = (t.baseX - (periodCols - 1) / 2) * step;
      const by = (t.baseY - (periodRows - 1) / 2) * step;

      const wantX = d.targetX + parallax.current.x;
      const wantY = d.targetY + parallax.current.y;

      // ✅ 핵심 수정: 거리 계산을 "wrap된 목표 위치" 기준으로
      let distFactor = 0;
      if (ds) {
        const wantWX = wrap(bx + wantX, minX, maxX);
        const wantWY = wrap(by + wantY, minY, maxY);

        // ✅ 경계에서 최단거리로 계산 (위/아래 계속 드래그해도 ripple 유지)
        const dx = shortestDelta(wantWX, ds.x, periodW);
        const dy = shortestDelta(wantWY, ds.y, periodH);

        const distWorld = Math.sqrt(dx * dx + dy * dy);
        const distPx = distWorld * cam.zoom;

        distFactor = clamp01(distPx / maxDistPx);
      }

      const duration = baseDur + distFactor * extraDur;
      const alpha = 1 - Math.exp(-dt / Math.max(0.0001, duration));

      const ix = i * 2;
      const iy = ix + 1;

      off[ix] += (wantX - off[ix]) * alpha;
      off[iy] += (wantY - off[iy]) * alpha;

      let x = wrap(bx + off[ix], minX, maxX);
      let y = wrap(by + off[iy], minY, maxY);

      // push: 가까운 타일 위주
      if (vmag > 1e-6 && ds) {
        const rx = shortestDelta(x, ds.x, periodW);
        const ry = shortestDelta(y, ds.y, periodH);

        const along = rx * gdirx + ry * gdiry;
        if (along > 0) {
          const perp = Math.abs(rx * gdiry - ry * gdirx);
          const a = Math.exp(-along / pushLen);
          const p = Math.exp(-(perp * perp) / (2 * pushWidth * pushWidth));
          const f = a * p;

          const near = 1 - distFactor;
          const disp = vmag * pushStrength * f * (0.15 + 0.85 * near);

          x += gdirx * disp;
          y += gdiry * disp;
        }
      }

      const m = meshRefs.current[t.id];
      if (m) m.position.set(x, y, 0);

      const mat = matRefs.current[t.id];
      if (mat && ds) {
        const hx = shortestDelta(x, ds.x, periodW);
        const hy = shortestDelta(y, ds.y, periodH);
        const hoverRadius = Math.min(viewW, viewH) * 0.20;
        const dist = Math.sqrt(hx * hx + hy * hy);
        const h01 = 1 - clamp01(dist / hoverRadius);
        mat.uniforms.uHover.value = h01 * h01;
      }
    }
  });

  return (
    <group>
      {tiles.map((t) => {
        const tex = pickTex(t);
        return (
          <mesh key={t.id} ref={(m) => (meshRefs.current[t.id] = m)}>
            <planeGeometry args={[tileSize, tileSize]} />
            <shaderMaterial
              key={`${t.id}-${tex.uuid}`}
              ref={(m) => (matRefs.current[t.id] = m)}
              transparent
              depthWrite={false}
              uniforms={{
                uImage: { value: tex },
                uCorner: { value: cornerUv },
                uBorderSoft: { value: softUv },
                uHover: { value: 0 },
              }}
              vertexShader={vertexShader}
              fragmentShader={fragmentShader}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* ================= EXPERIENCE ================= */
export default function Experience() {
  return (
    <Canvas
      orthographic
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 10], zoom: 88 }}
      style={{ background: "#0b0b0c", touchAction: "none" }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
    >
      <ambientLight intensity={1} />
      <GridScene />
    </Canvas>
  );
}
