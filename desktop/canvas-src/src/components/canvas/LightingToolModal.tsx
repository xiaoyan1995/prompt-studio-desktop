"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useAllPricing } from "@/hooks/use-pricing-promo";
import {
  X,
  Sun,
  Thermometer,
  ArrowUp,
  RefreshCw,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════ */

export interface LightingToolSettings {
  azimuth: number;
  elevation: number;
  brightness: number;
  colorTemp: number;
  rimLight: boolean;
}

const DEFAULT_SETTINGS: LightingToolSettings = {
  azimuth: 0,
  elevation: 0,
  brightness: 50,
  colorTemp: 5600,
  rimLight: false,
};

const AZIMUTH_STEPS = [0, 45, 90, 135, 180, 225, 270, 315];
const ELEVATION_STEPS = [-90, -45, 0, 45, 90];

const AZIMUTH_NAMES: Record<number, string> = {
  0: "Front", 45: "Right Front", 90: "Right", 135: "Right Rear",
  180: "Rear", 225: "Left Rear", 270: "Left", 315: "Left Front",
};
const AZ_I18N_KEY: Record<number, string> = {
  0: "az0", 45: "az45", 90: "az90", 135: "az135",
  180: "az180", 225: "az225", 270: "az270", 315: "az315",
};
const EL_I18N_KEY: Record<number, string> = { [-90]: "el-90", [-45]: "el-45", 0: "el0", 45: "el45", 90: "el90" };

function snapNearest(v: number, steps: number[]) {
  return steps.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/* ═══════════════════════════════════════════════════════
   Prompt builder
   ═══════════════════════════════════════════════════════ */

export function buildLightingPrompt(s: LightingToolSettings): string {
  const parts: string[] = [];

  const azSnap = snapNearest(s.azimuth, AZIMUTH_STEPS);
  const elSnap = snapNearest(s.elevation, ELEVATION_STEPS);
  const ELEVATION_EN: Record<number, string> = {
    [-90]: "directly below", [-45]: "below at 45 degrees",
    0: "", 45: "above at 45 degrees", 90: "directly above",
  };
  if (elSnap !== 0) {
    parts.push(`light source from ${ELEVATION_EN[elSnap] ?? "above"}`);
  } else {
    parts.push(`light source from the ${(AZIMUTH_NAMES[azSnap] ?? "Front").toLowerCase()}`);
  }

  if (s.colorTemp <= 3200) parts.push("warm golden tungsten light");
  else if (s.colorTemp <= 4500) parts.push("warm white indoor light");
  else if (s.colorTemp <= 5800) parts.push("natural neutral daylight");
  else if (s.colorTemp <= 7500) parts.push("cool daylight with slight blue tint");
  else parts.push("very cool blue overcast light");

  if (s.brightness <= 25) parts.push("very dim low-key dramatic lighting");
  else if (s.brightness <= 40) parts.push("dim moody lighting");
  else if (s.brightness <= 60) parts.push("normal balanced brightness");
  else if (s.brightness <= 80) parts.push("bright well-lit scene");
  else parts.push("very bright high-key lighting");

  if (s.rimLight) parts.push("with pronounced rim light and edge lighting on the subject");

  return `Relight this image: ${parts.join(", ")}. Keep all subjects, composition and details exactly the same, only change the lighting and atmosphere.`;
}

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const LIGHTING_MODELS = [
  { id: "nano-banana-2", name: "Nano Banana 2", descKey: "nanoBanana2Desc" },
  { id: "nano-banana-pro", name: "Nano Banana Pro", descKey: "nanoBananaProDesc" },
  { id: "doubao-seedream-5-0-260128", name: "SeeDream 5.0 Lite", descKey: "seedream50Desc" },
];

const MODEL_QUALITY_PRICE: Record<string, Record<string, number>> = {
  "nano-banana-2": { "1K": 9, "2K": 14, "4K": 20 },
  "nano-banana-pro": { "1K": 15, "2K": 15, "4K": 26 },
  "doubao-seedream-5-0-260128": { "2K": 6, "4K": 6 },
};

const ALL_QUALITY_OPTIONS = ["1K", "2K", "3K", "4K"] as const;
const BRIGHTNESS_STEPS = [0, 50, 100];
const COLOR_TEMP_STEPS = [2700, 3500, 4500, 5600, 7000, 9000];
const COLOR_TEMP_MIN = 2700;
const COLOR_TEMP_MAX = 9000;

/* ═══════════════════════════════════════════════════════
   Three.js — 3D Lighting Scene
   (azimuth ring + elevation arc + studio light + handles)
   ═══════════════════════════════════════════════════════ */

const LIGHT_DIST = 2.5;
const AZ_RING_R = 2.4;
const EL_ARC_R = 1.8;
const CENTER = new THREE.Vector3(0, 0.75, 0);

function azElToXYZ(az: number, el: number): THREE.Vector3 {
  const azRad = THREE.MathUtils.degToRad(az);
  const elRad = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(
    LIGHT_DIST * Math.sin(azRad) * Math.cos(elRad),
    LIGHT_DIST * Math.sin(elRad) + CENTER.y,
    LIGHT_DIST * Math.cos(azRad) * Math.cos(elRad),
  );
}

/* ── Elevation arc geometry (built once) ── */
function useElevationArcGeo() {
  return useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = THREE.MathUtils.degToRad(-90 + (180 * i) / 48);
      pts.push(new THREE.Vector3(0, EL_ARC_R * Math.sin(a) + CENTER.y, EL_ARC_R * Math.cos(a)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 48, 0.03, 8, false);
  }, []);
}

/* ── Beam cone (geometry baked like Qwen reference project) ── */
function BeamCone() {
  const geo = useMemo(() => {
    const BEAM_H = 2.5;
    const g = new THREE.CylinderGeometry(0.35, 1.2, BEAM_H, 32, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, BEAM_H / 2);
    return g;
  }, []);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial
        color="#ffffff" transparent opacity={0.10}
        side={THREE.DoubleSide} depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ── Image card ── */
function ImageCard({ imageUrl }: { imageUrl: string }) {
  const texture = useTexture(imageUrl);
  const img = texture.image as HTMLImageElement | undefined;
  const aspect = img ? img.width / img.height : 16 / 9;
  const maxS = 1.2;
  const w = aspect > 1 ? maxS : maxS * aspect;
  const h = aspect > 1 ? maxS / aspect : maxS;
  return (
    <mesh position={CENTER}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.5} />
    </mesh>
  );
}

/* ── Spot light with its target added to the scene ── */
function SpotWithTarget({ spotRef }: { spotRef: React.RefObject<THREE.SpotLight | null> }) {
  const { scene } = useThree();
  const targetObj = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.copy(CENTER);
    return o;
  }, []);

  useEffect(() => {
    scene.add(targetObj);
    return () => { scene.remove(targetObj); };
  }, [scene, targetObj]);

  const cb = useCallback((spot: THREE.SpotLight | null) => {
    if (spot) spot.target = targetObj;
    spotRef.current = spot;
  }, [targetObj, spotRef]);

  return (
    <spotLight
      ref={cb}
      intensity={8} distance={10} angle={Math.PI / 3}
      penumbra={1} decay={1} castShadow
    />
  );
}

/* ── Main 3D scene ── */
function LightScene({
  azimuth, elevation,
  onAzimuthChange, onElevationChange,
  onSnap,
  imageUrl,
}: {
  azimuth: number; elevation: number;
  onAzimuthChange: (v: number) => void;
  onElevationChange: (v: number) => void;
  onSnap: (az: number, el: number) => void;
  imageUrl: string;
}) {
  const { camera, gl } = useThree();

  /* ── Refs for animated objects ── */
  const lightGroupRef = useRef<THREE.Group>(null);
  const azHandleRef = useRef<THREE.Mesh>(null);
  const elHandleRef = useRef<THREE.Mesh>(null);
  const spotRef = useRef<THREE.SpotLight>(null);
  const elArcGroupRef = useRef<THREE.Group>(null);

  /* ── Live angles (mutated every frame for smooth lerp) ── */
  const liveAz = useRef(azimuth);
  const liveEl = useRef(elevation);
  const targetAz = useRef(azimuth);
  const targetEl = useRef(elevation);
  const dragging = useRef<"az" | "el" | null>(null);
  const snapping = useRef(false);

  useEffect(() => { targetAz.current = azimuth; }, [azimuth]);
  useEffect(() => { targetEl.current = elevation; }, [elevation]);

  const elevationArcGeo = useElevationArcGeo();

  /* ── Camera setup ── */
  useEffect(() => {
    camera.position.set(4.5, 3, 4.5);
    camera.lookAt(CENTER);
  }, [camera]);

  /* ── Per-frame update ── */
  useFrame(() => {
    const speed = dragging.current ? 0.6 : (snapping.current ? 0.12 : 0.12);
    liveAz.current += (targetAz.current - liveAz.current) * speed;
    liveEl.current += (targetEl.current - liveEl.current) * speed;

    if (snapping.current && Math.abs(liveAz.current - targetAz.current) < 0.5 && Math.abs(liveEl.current - targetEl.current) < 0.5) {
      snapping.current = false;
    }

    const az = liveAz.current;
    const el = liveEl.current;
    const azRad = THREE.MathUtils.degToRad(az);
    const elRad = THREE.MathUtils.degToRad(el);

    const lx = LIGHT_DIST * Math.sin(azRad) * Math.cos(elRad);
    const ly = LIGHT_DIST * Math.sin(elRad) + CENTER.y;
    const lz = LIGHT_DIST * Math.cos(azRad) * Math.cos(elRad);

    if (lightGroupRef.current) {
      lightGroupRef.current.position.set(lx, ly, lz);
      lightGroupRef.current.lookAt(CENTER);
    }

    if (spotRef.current) {
      spotRef.current.position.set(lx, ly, lz);
    }

    if (azHandleRef.current) {
      azHandleRef.current.position.set(AZ_RING_R * Math.sin(azRad), 0.05, AZ_RING_R * Math.cos(azRad));
    }

    if (elHandleRef.current) {
      const elZ = EL_ARC_R * Math.cos(elRad);
      elHandleRef.current.position.set(
        elZ * Math.sin(azRad),
        EL_ARC_R * Math.sin(elRad) + CENTER.y,
        elZ * Math.cos(azRad),
      );
    }

    if (elArcGroupRef.current) {
      elArcGroupRef.current.rotation.y = azRad;
    }
  });

  /* ── Pointer drag ── */
  useEffect(() => {
    const dom = gl.domElement;
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const project = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    };

    const onDown = (e: PointerEvent) => {
      project(e);
      ray.setFromCamera(mouse, camera);
      const targets = [azHandleRef.current, elHandleRef.current].filter(Boolean) as THREE.Mesh[];
      const hits = ray.intersectObjects(targets);
      if (hits.length > 0) {
        dragging.current = hits[0].object === azHandleRef.current ? "az" : "el";
        snapping.current = false;
        dom.setPointerCapture(e.pointerId);
        dom.style.cursor = "grabbing";
      }
    };

    const horizontalPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.05);

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) {
        project(e);
        ray.setFromCamera(mouse, camera);
        const targets = [azHandleRef.current, elHandleRef.current].filter(Boolean) as THREE.Mesh[];
        const hits = ray.intersectObjects(targets);
        dom.style.cursor = hits.length > 0 ? "grab" : "default";
        return;
      }

      project(e);
      ray.setFromCamera(mouse, camera);

      if (dragging.current === "az") {
        if (ray.ray.intersectPlane(horizontalPlane, hit)) {
          let angle = THREE.MathUtils.radToDeg(Math.atan2(hit.x, hit.z));
          if (angle < 0) angle += 360;
          targetAz.current = angle;
          onAzimuthChange(angle);
        }
      } else {
        const azRad = THREE.MathUtils.degToRad(liveAz.current);
        const verticalPlane = new THREE.Plane(
          new THREE.Vector3(-Math.cos(azRad), 0, Math.sin(azRad)).normalize(),
          0,
        );
        if (ray.ray.intersectPlane(verticalPlane, hit)) {
          const relY = hit.y - CENTER.y;
          const relZ = hit.x * Math.sin(azRad) + hit.z * Math.cos(azRad);
          let angle = THREE.MathUtils.radToDeg(Math.atan2(relY, relZ));
          angle = THREE.MathUtils.clamp(angle, -90, 90);
          targetEl.current = angle;
          onElevationChange(angle);
        }
      }
    };

    const onUp = () => {
      if (!dragging.current) return;
      const snapAz = snapNearest(targetAz.current, AZIMUTH_STEPS);
      const snapEl = snapNearest(targetEl.current, ELEVATION_STEPS);
      targetAz.current = snapAz;
      targetEl.current = snapEl;
      snapping.current = true;
      dragging.current = null;
      dom.style.cursor = "default";
      onSnap(snapAz, snapEl);
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
    };
  }, [camera, gl, onAzimuthChange, onElevationChange, onSnap]);

  return (
    <>
      <ambientLight intensity={0.12} />

      {/* Ground + grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <shadowMaterial opacity={0.25} />
      </mesh>
      <gridHelper args={[8, 16, "#333", "#222"]} />

      {/* Image card */}
      <Suspense fallback={null}>
        <ImageCard imageUrl={imageUrl} />
      </Suspense>

      {/* Studio light group (lookAt → local +Z faces CENTER) */}
      <group ref={lightGroupRef}>
        {/* Black housing (behind light face, at -Z) */}
        <mesh position={[0, 0, -0.05]}>
          <boxGeometry args={[0.7, 0.7, 0.08]} />
          <meshStandardMaterial color="#111" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* Emissive face (+Z = toward subject) */}
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[0.65, 0.65]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
        </mesh>
        {/*
          Volumetric beam — narrow at light (radiusTop=0.35), wide at subject (radiusBottom=1.2).
          rotateX(-π/2): top(+Y)→(-Z), bottom(-Y)→(+Z toward subject).
          Translate so narrow end sits at z≈0 (light face).
        */}
        <BeamCone />
      </group>

      {/* SpotLight (positioned via useFrame, target at CENTER) */}
      <SpotWithTarget spotRef={spotRef} />

      {/* Azimuth ring (yellow) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <torusGeometry args={[AZ_RING_R, 0.025, 12, 64]} />
        <meshStandardMaterial color="#cc0" emissive="#cc0" emissiveIntensity={0.3} />
      </mesh>

      {/* Azimuth handle (yellow) */}
      <mesh ref={azHandleRef}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color="#cc0" emissive="#cc0" emissiveIntensity={0.5} />
      </mesh>

      {/* Elevation arc (blue, rotates with azimuth) */}
      <group ref={elArcGroupRef}>
        <mesh geometry={elevationArcGeo}>
          <meshStandardMaterial color="#44f" emissive="#44f" emissiveIntensity={0.3} />
        </mesh>
      </group>

      {/* Elevation handle (blue) */}
      <mesh ref={elHandleRef}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color="#44f" emissive="#44f" emissiveIntensity={0.5} />
      </mesh>
    </>
  );
}

/* ── Wrapper: Canvas + view ── */
function LightViewport({
  azimuth, elevation,
  onAzimuthChange, onElevationChange, onSnap,
  imageUrl,
}: {
  azimuth: number; elevation: number;
  onAzimuthChange: (v: number) => void;
  onElevationChange: (v: number) => void;
  onSnap: (az: number, el: number) => void;
  imageUrl: string;
}) {
  return (
    <div className="w-full h-full" style={{ touchAction: "none" }}>
      <Canvas
        camera={{ fov: 50, near: 0.1, far: 100, position: [4.5, 3, 4.5] }}
        gl={{ antialias: true, alpha: false }}
        shadows
        style={{ background: "#1a1a1a", borderRadius: 12 }}
      >
        <LightScene
          azimuth={azimuth}
          elevation={elevation}
          onAzimuthChange={onAzimuthChange}
          onElevationChange={onElevationChange}
          onSnap={onSnap}
          imageUrl={imageUrl}
        />
      </Canvas>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Sliders (unchanged)
   ═══════════════════════════════════════════════════════ */

const TRACK_W = 132;
const TRACK_PAD = 6;
const THUMB_R = 6;
const USABLE_W = TRACK_W - TRACK_PAD * 2;

function BrightnessSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const segments = 3;
  const pct = value / 100;
  const thumbX = TRACK_PAD + pct * USABLE_W;
  const activeIdx = value <= 33 ? 0 : value <= 66 ? 1 : 2;

  const resolve = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left - TRACK_PAD) / USABLE_W));
    onChange(Math.round(p * 100));
  }, [onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    isDragging.current = true;
    resolve(e.clientX);
    const onMove = (ev: PointerEvent) => { if (isDragging.current) resolve(ev.clientX); };
    const onUp = () => { isDragging.current = false; document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [resolve]);

  return (
    <div ref={trackRef} className="relative select-none cursor-pointer" style={{ width: TRACK_W, height: 22, touchAction: "none" }} onPointerDown={handlePointerDown}>
      <div className="absolute left-0 overflow-hidden pointer-events-none" style={{ top: 6, width: TRACK_W, height: 10, padding: 2, borderRadius: 18, background: "rgba(255,255,255,0.09)", backdropFilter: "blur(19px)" }}>
        <div className="relative flex w-full h-full">
          {Array.from({ length: segments }).map((_, i) => (
            <div key={i} className="flex-1 rounded-lg transition-colors duration-200" style={{ background: i === activeIdx ? "rgb(204,204,204)" : "transparent" }} />
          ))}
        </div>
      </div>
      <div className="absolute pointer-events-none rounded-full" style={{ width: THUMB_R * 2, height: THUMB_R * 2, top: 11 - THUMB_R, left: thumbX - THUMB_R, background: "#fff", boxShadow: "0 0 4px rgba(0,0,0,0.5)", transition: isDragging.current ? "none" : "left 0.15s ease-out" }} />
      {BRIGHTNESS_STEPS.map((step) => {
        const sp = step / 100;
        return <div key={step} className="absolute rounded-full pointer-events-none" style={{ top: 18, left: TRACK_PAD + sp * USABLE_W, width: 2, height: 2, background: "rgb(204,204,204)", opacity: Math.abs(value - step) < 20 ? 0.7 : 0.2 }} />;
      })}
    </div>
  );
}

function ColorTempSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const pct = (value - COLOR_TEMP_MIN) / (COLOR_TEMP_MAX - COLOR_TEMP_MIN);
  const thumbX = TRACK_PAD + pct * USABLE_W;
  const activeIdx = COLOR_TEMP_STEPS.findIndex((s, i) => { const next = COLOR_TEMP_STEPS[i + 1]; if (!next) return true; return value < (s + next) / 2; });
  const stepColors = ["#D99A5D", "#D5AE55", "#F3DB90", "#F3F9FC", "#D4E6EE", "#C4E2F0"];
  const thumbColor = stepColors[activeIdx] ?? "#F3F9FC";

  const resolve = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left - TRACK_PAD) / USABLE_W));
    const temp = Math.round(COLOR_TEMP_MIN + p * (COLOR_TEMP_MAX - COLOR_TEMP_MIN));
    const snapped = COLOR_TEMP_STEPS.reduce((prev, curr) => Math.abs(curr - temp) < Math.abs(prev - temp) ? curr : prev);
    onChange(Math.abs(temp - snapped) < 200 ? snapped : temp);
  }, [onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    isDragging.current = true;
    resolve(e.clientX);
    const onMove = (ev: PointerEvent) => { if (isDragging.current) resolve(ev.clientX); };
    const onUp = () => { isDragging.current = false; document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [resolve]);

  return (
    <div ref={trackRef} className="relative select-none cursor-pointer" style={{ width: TRACK_W, height: 22, touchAction: "none" }} onPointerDown={handlePointerDown}>
      <div className="absolute left-0 overflow-hidden pointer-events-none" style={{ top: 6, width: TRACK_W, height: 10, padding: 2, borderRadius: 16, background: "rgba(173,176,178,0.1)", backdropFilter: "blur(19px)" }}>
        <div className="absolute rounded-[14px]" style={{ inset: 2, background: "linear-gradient(90deg, rgba(238,130,36,0.3) 0%, rgba(242,154,37,0.3) 20%, rgba(249,218,125,0.3) 41%, rgba(247,249,242,0.3) 63%, rgba(220,239,247,0.3) 81%, rgba(182,224,242,0.3) 99%)" }} />
        <div className="relative flex w-full h-full">
          {COLOR_TEMP_STEPS.map((_, i) => (<div key={i} className="flex-1 rounded-lg transition-colors duration-200" style={{ background: i === activeIdx ? stepColors[activeIdx] : "transparent" }} />))}
        </div>
      </div>
      <div className="absolute pointer-events-none rounded-full" style={{ width: THUMB_R * 2, height: THUMB_R * 2, top: 11 - THUMB_R, left: thumbX - THUMB_R, background: thumbColor, boxShadow: `0 0 6px ${thumbColor}88, 0 0 2px rgba(0,0,0,0.5)`, transition: isDragging.current ? "none" : "left 0.15s ease-out" }} />
      {COLOR_TEMP_STEPS.map((step, i) => {
        const stepPct = (step - COLOR_TEMP_MIN) / (COLOR_TEMP_MAX - COLOR_TEMP_MIN);
        return <div key={step} className="absolute rounded-full pointer-events-none" style={{ top: 18, left: TRACK_PAD + stepPct * USABLE_W, width: 2, height: 2, background: stepColors[i], opacity: i === activeIdx ? 0.7 : 0.2 }} />;
      })}
    </div>
  );
}

function ValueBox({ icon: Icon, value, unit, min, max, step, onChange }: { icon: typeof Sun; value: number; unit: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const startX = useRef(0);
  const startVal = useRef(0);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    startX.current = e.clientX; startVal.current = value;
    const onMove = (ev: PointerEvent) => { const dx = ev.clientX - startX.current; onChange(Math.max(min, Math.min(max, startVal.current + Math.round(dx / 2) * step))); };
    const onUp = () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
    document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp);
  }, [value, min, max, step, onChange]);
  return (
    <div className="flex items-center shrink-0 rounded-sm bg-white/[0.06] select-none" style={{ width: 84, height: 24, cursor: "ew-resize", touchAction: "none" }} onPointerDown={handlePointerDown}>
      <div className="flex-1 flex items-center pl-3 pointer-events-none justify-between pr-2">
        <div className="w-[14px] h-[14px] flex items-center justify-center text-zinc-300 shrink-0"><Icon size={14} /></div>
        <span className="text-sm font-medium text-zinc-100 leading-5">{value}</span>
        <span className="text-sm font-semibold text-zinc-100/[0.34] leading-5">{unit}</span>
      </div>
    </div>
  );
}

function CreditsIcon() {
  return (
    <img src="/infinite_logo.svg" width="16" height="16" alt="Xins" className="brightness-0 invert opacity-80" />
  );
}

/* ═══════════════════════════════════════════════════════
   Main Modal
   ═══════════════════════════════════════════════════════ */

interface Props {
  imageUrl: string;
  imageSize: string;
  aspectRatio: string;
  initialModelId?: string;
  initialSettings?: LightingToolSettings;
  onClose: () => void;
  onGenerate: (lightingPrompt: string, imageSize: string, modelId: string) => void;
  onSettingsChange?: (s: LightingToolSettings) => void;
  isGenerating?: boolean;
}

export function LightingToolModal({
  imageUrl,
  imageSize,
  initialModelId,
  initialSettings,
  onClose,
  onGenerate,
  onSettingsChange,
  isGenerating,
}: Props) {
  const t = useTranslations("lightingTool");
  const tc = useTranslations("canvas");
  const [settings, setSettings] = useState<LightingToolSettings>(initialSettings ?? { ...DEFAULT_SETTINGS });
  const defaultModel = LIGHTING_MODELS.find(m => m.id === initialModelId) ? initialModelId! : "nano-banana-2";
  const [modelId, setModelId] = useState(defaultModel);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const currentModel = LIGHTING_MODELS.find(m => m.id === modelId) ?? LIGHTING_MODELS[0];
  const { getQualityPrices } = useAllPricing();
  const priceMap = getQualityPrices(modelId) ?? MODEL_QUALITY_PRICE[modelId] ?? MODEL_QUALITY_PRICE["nano-banana-2"];
  const availableQualities = ALL_QUALITY_OPTIONS.filter(q => q in priceMap);
  const [quality, setQuality] = useState(() => {
    const preferred = imageSize || "2K";
    return priceMap[preferred] ? preferred : availableQualities[0] ?? "2K";
  });
  const panelRef = useRef<HTMLDivElement>(null);

  const directionLabel = useMemo(() => {
    const azSnap = snapNearest(settings.azimuth, AZIMUTH_STEPS);
    const elSnap = snapNearest(settings.elevation, ELEVATION_STEPS);
    const key = elSnap !== 0 ? EL_I18N_KEY[elSnap] : AZ_I18N_KEY[azSnap];
    return key ? t(key) : "";
  }, [settings.azimuth, settings.elevation, t]);

  const persist = useCallback((next: LightingToolSettings) => {
    queueMicrotask(() => onSettingsChange?.(next));
  }, [onSettingsChange]);

  const update = useCallback(<K extends keyof LightingToolSettings>(key: K, val: LightingToolSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: val };
      persist(next);
      return next;
    });
  }, [persist]);

  const handleReset = useCallback(() => {
    const next = { ...DEFAULT_SETTINGS };
    setSettings(next);
    persist(next);
  }, [persist]);

  const handleGenerate = useCallback(() => {
    if (isGenerating) return;
    onGenerate(buildLightingPrompt(settings), quality, modelId);
  }, [settings, quality, modelId, onGenerate, isGenerating]);

  const handleModelChange = useCallback((id: string) => {
    setModelId(id);
    const newPriceMap = getQualityPrices(id) ?? MODEL_QUALITY_PRICE[id] ?? MODEL_QUALITY_PRICE["nano-banana-2"];
    if (!newPriceMap[quality]) {
      setQuality(Object.keys(newPriceMap)[0]);
    }
  }, [quality, getQualityPrices]);

  const handleAzimuthChange = useCallback((v: number) => {
    setSettings(prev => {
      const next = { ...prev, azimuth: v };
      persist(next);
      return next;
    });
  }, [persist]);

  const handleElevationChange = useCallback((v: number) => {
    setSettings(prev => {
      const next = { ...prev, elevation: v };
      persist(next);
      return next;
    });
  }, [persist]);

  const handleSnap = useCallback((az: number, el: number) => {
    setSettings(prev => {
      const next = { ...prev, azimuth: az, elevation: el };
      persist(next);
      return next;
    });
  }, [persist]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const price = priceMap[quality] ?? 14;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
      onPointerDown={onClose}
    >
      <div
        ref={panelRef}
        className="relative shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-white/10"
        style={{ background: "rgb(31,31,31)", borderRadius: 24, padding: 8 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-3 top-3 p-1 hover:bg-white/10 rounded-md transition-colors text-white/40 hover:text-white z-10"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        <div className="flex gap-4">
          {/* ── Left: 3D viewport ── */}
          <div
            className="relative shrink-0 overflow-hidden"
            style={{ width: 380, height: 430, borderRadius: 16 }}
          >
            <LightViewport
              azimuth={settings.azimuth}
              elevation={settings.elevation}
              onAzimuthChange={handleAzimuthChange}
              onElevationChange={handleElevationChange}
              onSnap={handleSnap}
              imageUrl={imageUrl}
            />

            {/* Reset */}
            <button
              className="absolute bottom-3 right-3 flex items-center gap-1 text-[11px] font-medium text-white/30 hover:text-white/60 transition-colors z-10"
              onClick={handleReset}
            >
              <RefreshCw size={12} />
              {t("reset")}
            </button>

            {/* Direction label */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10">
              <div
                className="relative overflow-hidden flex items-center justify-center"
                style={{ background: "rgb(33,33,33)", borderRadius: "12px 12px 0 0", outline: "1px solid rgba(255,255,255,0.1)", outlineOffset: -1, height: 22, paddingLeft: 14, paddingRight: 14 }}
              >
                <span className="relative whitespace-nowrap" style={{ color: "rgb(180,180,180)", fontSize: 12, fontWeight: 500 }}>
                  {directionLabel}
                </span>
              </div>
            </div>
          </div>

          {/* ── Right: Controls ── */}
          <div className="flex flex-col pt-1" style={{ width: 280, height: 430 }}>
            <div className="flex flex-col gap-2.5 flex-1">
              {/* Global */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-white">{t("global")}</span>
                <div>
                  <span className="text-sm font-semibold text-zinc-100/[0.48] mb-0.5 block">{t("brightness")}</span>
                  <div className="flex items-center justify-between">
                    <BrightnessSlider value={settings.brightness} onChange={(v) => update("brightness", v)} />
                    <ValueBox icon={Sun} value={settings.brightness} unit="%" min={0} max={100} step={1} onChange={(v) => update("brightness", v)} />
                  </div>
                </div>
                <div>
                  <span className="text-sm font-semibold text-zinc-100/[0.48] mb-0.5 block">{t("colorTemp")}</span>
                  <div className="flex items-center justify-between">
                    <ColorTempSlider value={settings.colorTemp} onChange={(v) => update("colorTemp", v)} />
                    <ValueBox icon={Thermometer} value={settings.colorTemp} unit="K" min={COLOR_TEMP_MIN} max={COLOR_TEMP_MAX} step={100} onChange={(v) => update("colorTemp", v)} />
                  </div>
                </div>
              </div>

              <div className="h-px bg-zinc-700/60" />

              {/* Azimuth presets */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-white">{t("azimuth")}</span>
                <div className="grid grid-cols-4 gap-1">
                  {AZIMUTH_STEPS.map((az) => (
                    <button
                      key={az}
                      className={`h-6 rounded-sm text-[11px] font-semibold transition-colors overflow-hidden flex items-center justify-center ${
                        snapNearest(settings.azimuth, AZIMUTH_STEPS) === az && snapNearest(settings.elevation, ELEVATION_STEPS) === 0
                          ? "bg-[#cc0]/20 text-[#ee0] ring-1 ring-[#cc0]/30"
                          : "bg-white/[0.06] text-zinc-400 hover:bg-white/10"
                      }`}
                      onClick={() => setSettings(prev => ({ ...prev, azimuth: az, elevation: 0 }))}
                    >
                      {t(AZ_I18N_KEY[az])}
                    </button>
                  ))}
                </div>
              </div>

              {/* Elevation presets */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-white">{t("elevation")}</span>
                <div className="grid grid-cols-5 gap-1">
                  {ELEVATION_STEPS.map((el) => (
                    <button
                      key={el}
                      className={`h-6 rounded-sm text-[11px] font-semibold transition-colors overflow-hidden flex items-center justify-center ${
                        snapNearest(settings.elevation, ELEVATION_STEPS) === el
                          ? "bg-[#44f]/20 text-[#88f] ring-1 ring-[#44f]/30"
                          : "bg-white/[0.06] text-zinc-400 hover:bg-white/10"
                      }`}
                      onClick={() => setSettings(prev => ({ ...prev, elevation: el }))}
                    >
                      {t(EL_I18N_KEY[el])}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-zinc-700/60" />

              {/* Rim light toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold text-white">{t("rimLight")}</span>
                  <div className="relative group/tip">
                    <HelpCircle size={14} className="text-white/30 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 leading-relaxed w-[200px] opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity duration-150 z-[10001] shadow-lg">
                      {t("rimLightTip")}
                    </div>
                  </div>
                </div>
                <button type="button" role="switch" aria-checked={settings.rimLight} onClick={() => update("rimLight", !settings.rimLight)}
                  className={`inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors ${settings.rimLight ? "bg-zinc-100" : "bg-zinc-600"}`}
                >
                  <span className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform ${settings.rimLight ? "translate-x-4 bg-zinc-900" : "translate-x-0 bg-zinc-200"}`} />
                </button>
              </div>

              <div className="h-px bg-zinc-700/60" />

              {/* Model + Quality row */}
              <div className="flex items-center justify-between">
                <div className="relative">
                  <button
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${showModelPicker ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/[0.06]"}`}
                    onClick={() => { setShowModelPicker(!showModelPicker); setShowQualityPicker(false); }}
                  >
                    <span>{currentModel.name}</span>
                    <ChevronDown size={12} className={`transition-transform ${showModelPicker ? "rotate-180" : ""}`} />
                  </button>

                  {showModelPicker && (
                    <div
                      className="absolute bottom-full mb-1.5 left-0 w-52 rounded-xl border border-zinc-700/60 p-1 z-30"
                      style={{ background: "#1c1c1c" }}
                    >
                      {LIGHTING_MODELS.map((m) => (
                        <button
                          key={m.id}
                          className={`w-full flex flex-col px-3 py-2 rounded-lg text-left transition-colors ${
                            modelId === m.id ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                          }`}
                          onClick={() => { handleModelChange(m.id); setShowModelPicker(false); }}
                        >
                          <span className="text-xs font-medium">{m.name}</span>
                          <span className="text-[10px] text-zinc-500">{tc(m.descKey)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${showQualityPicker ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/[0.06]"}`}
                    onClick={() => { setShowQualityPicker(!showQualityPicker); setShowModelPicker(false); }}
                  >
                    <span>{quality}</span>
                    <ChevronDown size={12} className={`transition-transform ${showQualityPicker ? "rotate-180" : ""}`} />
                  </button>

                  {showQualityPicker && (
                    <div
                      className="absolute bottom-full mb-1.5 right-0 min-w-[100px] rounded-xl border border-zinc-700/60 p-1 z-30"
                      style={{ background: "#1c1c1c" }}
                    >
                      {availableQualities.map((q) => (
                        <button
                          key={q}
                          className={`w-full px-3 py-1.5 rounded-lg text-left text-xs font-medium transition-colors ${
                            quality === q ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                          }`}
                          onClick={() => { setQuality(q); setShowQualityPicker(false); }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Generate */}
            <div className="flex items-center gap-1 rounded-full p-1 border border-white/10 w-fit mt-auto self-end" style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}>
              <div className="flex items-center text-sm text-zinc-200 font-medium box-border pl-1">
                <CreditsIcon />
                <span className="relative inline-flex min-w-[24px] justify-center tabular-nums text-xs">{price}</span>
              </div>
              <button type="button" disabled={isGenerating} className="aspect-square w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Generate" onClick={handleGenerate}>
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
