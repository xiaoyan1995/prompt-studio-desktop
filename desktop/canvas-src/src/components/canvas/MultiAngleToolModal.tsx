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
  ChevronDown,
  HelpCircle,
} from "lucide-react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════ */

export interface MultiAngleToolSettings {
  azimuth: number;
  elevation: number;
  distance: number;
  lightEnabled: boolean;
  lightAzimuth: number;
  lightElevation: number;
  lightBrightness: number;
  lightColorTemp: number;
  lightRimLight: boolean;
}

const DEFAULT_SETTINGS: MultiAngleToolSettings = {
  azimuth: 0,
  elevation: 0,
  distance: 5,
  lightEnabled: false,
  lightAzimuth: 315,
  lightElevation: 30,
  lightBrightness: 50,
  lightColorTemp: 5600,
  lightRimLight: false,
};

const AZIMUTH_STEPS = [0, 45, 90, 135, 180, 225, 270, 315];

const AZ_I18N_KEY: Record<number, string> = {
  0: "front", 45: "rightFront", 90: "right", 135: "rightRear",
  180: "rear", 225: "leftRear", 270: "left", 315: "leftFront",
};
const EL_LABEL_KEY: Record<string, string> = {
  low: "lowAngle", eye: "eyeLevel", elevated: "elevated", high: "highAngle",
};
const DIST_LABEL_KEY: Record<string, string> = {
  wide: "wideShot", medium: "mediumShot", close: "closeUp",
};

function snapNearest(v: number, steps: number[]) {
  return steps.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

function elevationBucket(el: number) {
  if (el < -15) return "low";
  if (el < 15) return "eye";
  if (el < 45) return "elevated";
  return "high";
}

function distanceBucket(d: number) {
  if (d < 2) return "wide";
  if (d < 6) return "medium";
  return "close";
}

const PRESETS = [
  { key: "front", azimuth: 0, elevation: 0 },
  { key: "rightFront", azimuth: 45, elevation: 15 },
  { key: "right", azimuth: 90, elevation: 0 },
  { key: "rear", azimuth: 180, elevation: 0 },
  { key: "left", azimuth: 270, elevation: 0 },
  { key: "leftFront", azimuth: 315, elevation: 15 },
  { key: "topDown", azimuth: 0, elevation: 60 },
  { key: "bottomUp", azimuth: 0, elevation: -30 },
];

/* ═══════════════════════════════════════════════════════
   Prompt builder
   ═══════════════════════════════════════════════════════ */

const CLOCK_MAP: Record<number, string> = {
  0: "12 o'clock", 45: "1:30", 90: "3 o'clock", 135: "4:30",
  180: "6 o'clock", 225: "7:30", 270: "9 o'clock", 315: "10:30",
};

function azToClock(deg: number): string {
  const snapped = snapNearest(deg, AZIMUTH_STEPS);
  return CLOCK_MAP[snapped] ?? `${Math.round(deg / 30)} o'clock`;
}

export function buildMultiAnglePrompt(s: MultiAngleToolSettings): string {
  const hAngle = ((Math.round(s.azimuth) % 360) + 360) % 360;

  let hDir: string;
  if (hAngle < 22.5 || hAngle >= 337.5) hDir = "front";
  else if (hAngle < 67.5) hDir = "front-right";
  else if (hAngle < 112.5) hDir = "right side";
  else if (hAngle < 157.5) hDir = "back-right";
  else if (hAngle < 202.5) hDir = "back";
  else if (hAngle < 247.5) hDir = "back-left";
  else if (hAngle < 292.5) hDir = "left side";
  else hDir = "front-left";

  const clockPos = azToClock(hAngle);

  let vDir: string;
  if (s.elevation < -15) vDir = "low-angle shot";
  else if (s.elevation < 15) vDir = "eye-level shot";
  else if (s.elevation < 45) vDir = "elevated shot";
  else vDir = "high-angle shot";

  let dist: string;
  if (s.distance < 2) dist = "wide shot";
  else if (s.distance < 6) dist = "medium shot";
  else dist = "close-up";

  let result = `Show this subject from a ${hDir} view. Camera at the ${clockPos} position (${hAngle}° clockwise from front), ${vDir}, ${dist}. The attached reference diagram labels the ground plane: F=Front, B=Back, L=Left, R=Right.`;

  if (s.lightEnabled) {
    const lightParts: string[] = [];
    const LIGHT_DIR: Record<number, string> = {
      0: "front", 45: "right front", 90: "right side", 135: "right rear",
      180: "rear", 225: "left rear", 270: "left side", 315: "left front",
    };
    const lAz = snapNearest(s.lightAzimuth, AZIMUTH_STEPS);
    lightParts.push(`light source from the ${LIGHT_DIR[lAz] ?? "front"}`);

    if (s.lightColorTemp <= 3200) lightParts.push("warm golden tungsten light");
    else if (s.lightColorTemp <= 4500) lightParts.push("warm white indoor light");
    else if (s.lightColorTemp <= 5800) lightParts.push("natural neutral daylight");
    else if (s.lightColorTemp <= 7500) lightParts.push("cool daylight with slight blue tint");
    else lightParts.push("very cool blue overcast light");

    if (s.lightBrightness <= 25) lightParts.push("very dim low-key dramatic lighting");
    else if (s.lightBrightness <= 40) lightParts.push("dim moody lighting");
    else if (s.lightBrightness <= 60) lightParts.push("normal balanced brightness");
    else if (s.lightBrightness <= 80) lightParts.push("bright well-lit scene");
    else lightParts.push("very bright high-key lighting");

    if (s.lightRimLight) lightParts.push("with pronounced rim light and edge lighting");
    result += ` Lighting: ${lightParts.join(", ")}.`;
  }

  result += " Maintain the same subject identity, appearance and all details.";
  return result;
}

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const MULTIANGLE_MODELS = [
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
const DIST_MIN = 0;
const DIST_MAX = 10;
const DIST_STEPS = [0, 2, 5, 8, 10];

const COLORS = {
  azimuth: "#E93D82",
  elevation: "#00FFD0",
  distance: "#FFB800",
};
const C_AZ = 0xE93D82;
const C_EL = 0x00FFD0;
const C_DIST = 0xFFB800;
const C_LIGHT = 0xFFCC00;
const LIGHT_COLOR = "#FFCC00";

const LIGHT_DIST = 1.8;
const COLOR_TEMP_MIN = 2700;
const COLOR_TEMP_MAX = 9000;
const COLOR_TEMP_STEPS_LT = [2700, 3500, 4500, 5600, 7000, 9000];
const BRIGHTNESS_STEPS_LT = [0, 50, 100];

/* ═══════════════════════════════════════════════════════
   Three.js — Camera wireframe geometry
   ═══════════════════════════════════════════════════════ */

function useCameraWireframeGeo() {
  return useMemo(() => {
    const S = 0.15, H = S * 0.7, D = S * 0.5;
    const FL = 0.25, FS = 0.12, FH = FS * 0.7;
    const fz = D + FL;
    const pairs: number[] = [];
    const e = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => { pairs.push(x1, y1, z1, x2, y2, z2); };
    e(-S, -H, -D, S, -H, -D); e(S, -H, -D, S, H, -D);
    e(S, H, -D, -S, H, -D); e(-S, H, -D, -S, -H, -D);
    e(-S, -H, D, S, -H, D); e(S, -H, D, S, H, D);
    e(S, H, D, -S, H, D); e(-S, H, D, -S, -H, D);
    e(-S, -H, -D, -S, -H, D); e(S, -H, -D, S, -H, D);
    e(S, H, -D, S, H, D); e(-S, H, -D, -S, H, D);
    e(0, 0, D, -FS, -FH, fz); e(0, 0, D, FS, -FH, fz);
    e(0, 0, D, FS, FH, fz); e(0, 0, D, -FS, FH, fz);
    e(-FS, -FH, fz, FS, -FH, fz); e(FS, -FH, fz, FS, FH, fz);
    e(FS, FH, fz, -FS, FH, fz); e(-FS, FH, fz, -FS, -FH, fz);
    e(-S * 0.4, H, 0, 0, S * 1.2, 0); e(0, S * 1.2, 0, S * 0.4, H, 0);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pairs, 3));
    return geo;
  }, []);
}

/* ═══════════════════════════════════════════════════════
   Three.js — 3D Multi-Angle Scene
   ═══════════════════════════════════════════════════════ */

const CAM_DIST_BASE = 2.6;
const CAM_DIST_RANGE = 2.0;
const AZ_RING_R = 2.0;
const EL_ARC_R = 1.6;
const CENTER = new THREE.Vector3(0, 0.65, 0);
const LABEL_R = AZ_RING_R + 0.55;

function useDirectionLabelTexture(text: string) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = "bold 28px Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 6;
    ctx.fillText(text, 64, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [text]);
}

const GROUND_LABELS: { text: string; pos: [number, number, number] }[] = [
  { text: "Front", pos: [0, 0.15, LABEL_R] },
  { text: "Back",  pos: [0, 0.15, -LABEL_R] },
  { text: "Right", pos: [LABEL_R, 0.15, 0] },
  { text: "Left",  pos: [-LABEL_R, 0.15, 0] },
];

function GroundLabel({ text, position }: { text: string; position: [number, number, number] }) {
  const map = useDirectionLabelTexture(text);
  return (
    <sprite position={position} scale={[0.45, 0.22, 1]}>
      <spriteMaterial map={map} transparent depthTest={false} />
    </sprite>
  );
}

function visualDist(d: number) {
  return CAM_DIST_BASE - (d / DIST_MAX) * CAM_DIST_RANGE;
}

function useElevationArcGeo() {
  return useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = THREE.MathUtils.degToRad(-30 + (90 * i) / 48);
      pts.push(new THREE.Vector3(0, EL_ARC_R * Math.sin(a) + CENTER.y, EL_ARC_R * Math.cos(a)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 48, 0.025, 8, false);
  }, []);
}

function useDistanceLine() {
  return useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    return geo;
  }, []);
}

function useBeamConeGeo() {
  return useMemo(() => {
    const BEAM_H = 2.2;
    const g = new THREE.CylinderGeometry(0.15, 0.6, BEAM_H, 24, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, BEAM_H / 2);
    return g;
  }, []);
}

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
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

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
  return <spotLight ref={cb} intensity={6} distance={8} angle={Math.PI / 3} penumbra={1} decay={1} />;
}

/* ── Main 3D scene ── */
function AngleScene({
  azimuth, elevation, distance: dist,
  onAzimuthChange, onElevationChange, onSnap,
  imageUrl,
  lightEnabled, lightAzimuth, lightElevation,
  onLightAzimuthChange, onLightElevationChange,
}: {
  azimuth: number; elevation: number; distance: number;
  onAzimuthChange: (v: number) => void;
  onElevationChange: (v: number) => void;
  onSnap: (az: number, el: number) => void;
  imageUrl: string;
  lightEnabled: boolean;
  lightAzimuth: number; lightElevation: number;
  onLightAzimuthChange: (v: number) => void;
  onLightElevationChange: (v: number) => void;
}) {
  const { camera, gl } = useThree();

  const cameraGroupRef = useRef<THREE.Group>(null);
  const azHandleRef = useRef<THREE.Mesh>(null);
  const elHandleRef = useRef<THREE.Mesh>(null);
  const elArcGroupRef = useRef<THREE.Group>(null);
  const lightBeadRef = useRef<THREE.Mesh>(null);
  const lightGroupRef = useRef<THREE.Group>(null);
  const spotRef = useRef<THREE.SpotLight>(null);

  const liveAz = useRef(azimuth);
  const liveEl = useRef(elevation);
  const targetAz = useRef(azimuth);
  const targetEl = useRef(elevation);
  const liveLA = useRef(lightAzimuth);
  const liveLE = useRef(lightElevation);
  const targetLA = useRef(lightAzimuth);
  const targetLE = useRef(lightElevation);
  const dragging = useRef<"az" | "el" | "light" | null>(null);
  const hoveredLight = useRef(false);

  useEffect(() => { targetAz.current = azimuth; }, [azimuth]);
  useEffect(() => { targetEl.current = elevation; }, [elevation]);
  useEffect(() => { targetLA.current = lightAzimuth; }, [lightAzimuth]);
  useEffect(() => { targetLE.current = lightElevation; }, [lightElevation]);

  const elevationArcGeo = useElevationArcGeo();
  const cameraWireGeo = useCameraWireframeGeo();
  const distLineGeo = useDistanceLine();
  const beamConeGeo = useBeamConeGeo();

  useEffect(() => {
    camera.position.set(4.5, 3.2, 4.5);
    camera.lookAt(CENTER);
  }, [camera]);

  useFrame(() => {
    const speed = dragging.current ? 0.5 : 0.12;
    liveAz.current += (targetAz.current - liveAz.current) * speed;
    liveEl.current += (targetEl.current - liveEl.current) * speed;
    liveLA.current += (targetLA.current - liveLA.current) * speed;
    liveLE.current += (targetLE.current - liveLE.current) * speed;

    const azRad = THREE.MathUtils.degToRad(liveAz.current);
    const elRad = THREE.MathUtils.degToRad(liveEl.current);
    const vd = visualDist(dist);

    const cx = vd * Math.sin(azRad) * Math.cos(elRad);
    const cy = vd * Math.sin(elRad) + CENTER.y;
    const cz = vd * Math.cos(azRad) * Math.cos(elRad);

    if (cameraGroupRef.current) {
      cameraGroupRef.current.position.set(cx, cy, cz);
      cameraGroupRef.current.lookAt(CENTER);
    }

    if (azHandleRef.current) {
      azHandleRef.current.position.set(AZ_RING_R * Math.sin(azRad), 0.05, AZ_RING_R * Math.cos(azRad));
    }

    if (elHandleRef.current) {
      const ez = EL_ARC_R * Math.cos(elRad);
      elHandleRef.current.position.set(
        ez * Math.sin(azRad),
        EL_ARC_R * Math.sin(elRad) + CENTER.y,
        ez * Math.cos(azRad),
      );
    }

    if (elArcGroupRef.current) {
      elArcGroupRef.current.rotation.y = azRad;
    }

    const pos = distLineGeo.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, CENTER.x, CENTER.y, CENTER.z);
    pos.setXYZ(1, cx, cy, cz);
    pos.needsUpdate = true;

    if (lightEnabled) {
      const laRad = THREE.MathUtils.degToRad(liveLA.current);
      const leRad = THREE.MathUtils.degToRad(liveLE.current);
      const lx = LIGHT_DIST * Math.sin(laRad) * Math.cos(leRad);
      const ly = LIGHT_DIST * Math.sin(leRad) + CENTER.y;
      const lz = LIGHT_DIST * Math.cos(laRad) * Math.cos(leRad);

      if (lightBeadRef.current) {
        lightBeadRef.current.position.set(lx, ly, lz);
        const targetScale = hoveredLight.current || dragging.current === "light" ? 1.4 : 1.0;
        const cur = lightBeadRef.current.scale.x;
        lightBeadRef.current.scale.setScalar(cur + (targetScale - cur) * 0.15);
      }
      if (lightGroupRef.current) {
        lightGroupRef.current.position.set(lx, ly, lz);
        lightGroupRef.current.lookAt(CENTER);
      }
      if (spotRef.current) {
        spotRef.current.position.set(lx, ly, lz);
      }
    }
  });

  /* ── Pointer drag ── */
  useEffect(() => {
    const dom = gl.domElement;
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const lightSphere = new THREE.Sphere(CENTER, LIGHT_DIST);

    const project = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    };

    const onDown = (e: PointerEvent) => {
      project(e);
      ray.setFromCamera(mouse, camera);
      const targets: THREE.Mesh[] = [];
      if (azHandleRef.current) targets.push(azHandleRef.current);
      if (elHandleRef.current) targets.push(elHandleRef.current);
      if (lightEnabled && lightBeadRef.current) targets.push(lightBeadRef.current);
      const hits = ray.intersectObjects(targets);
      if (hits.length > 0) {
        if (lightEnabled && hits[0].object === lightBeadRef.current) {
          dragging.current = "light";
        } else {
          dragging.current = hits[0].object === azHandleRef.current ? "az" : "el";
        }
        dom.setPointerCapture(e.pointerId);
        dom.style.cursor = "grabbing";
      }
    };

    const horizontalPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.05);

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) {
        project(e);
        ray.setFromCamera(mouse, camera);
        const targets: THREE.Mesh[] = [];
        if (azHandleRef.current) targets.push(azHandleRef.current);
        if (elHandleRef.current) targets.push(elHandleRef.current);
        if (lightEnabled && lightBeadRef.current) targets.push(lightBeadRef.current);
        const hits = ray.intersectObjects(targets);
        if (hits.length > 0) {
          hoveredLight.current = lightEnabled && hits[0].object === lightBeadRef.current;
          dom.style.cursor = "grab";
        } else {
          hoveredLight.current = false;
          dom.style.cursor = "default";
        }
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
      } else if (dragging.current === "el") {
        const azRad = THREE.MathUtils.degToRad(liveAz.current);
        const verticalPlane = new THREE.Plane(
          new THREE.Vector3(-Math.cos(azRad), 0, Math.sin(azRad)).normalize(), 0,
        );
        if (ray.ray.intersectPlane(verticalPlane, hit)) {
          const relY = hit.y - CENTER.y;
          const relZ = hit.x * Math.sin(azRad) + hit.z * Math.cos(azRad);
          let angle = THREE.MathUtils.radToDeg(Math.atan2(relY, relZ));
          angle = THREE.MathUtils.clamp(angle, -30, 60);
          targetEl.current = angle;
          onElevationChange(angle);
        }
      } else if (dragging.current === "light") {
        const sphereHit = ray.ray.intersectSphere(lightSphere, hit);
        if (!sphereHit) {
          ray.ray.closestPointToPoint(CENTER, hit);
          hit.sub(CENTER).normalize().multiplyScalar(LIGHT_DIST).add(CENTER);
        }
        const dx = hit.x - CENTER.x;
        const dy = hit.y - CENTER.y;
        const dz = hit.z - CENTER.z;
        let newAz = THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
        if (newAz < 0) newAz += 360;
        const h2 = Math.sqrt(dx * dx + dz * dz);
        const newEl = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.atan2(dy, h2)), -90, 90);
        targetLA.current = newAz;
        targetLE.current = newEl;
        onLightAzimuthChange(newAz);
        onLightElevationChange(newEl);
      }
    };

    const onUp = () => {
      if (!dragging.current) return;
      if (dragging.current === "az" || dragging.current === "el") {
        onSnap(targetAz.current, targetEl.current);
      }
      dragging.current = null;
      hoveredLight.current = false;
      dom.style.cursor = "default";
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
    };
  }, [camera, gl, onAzimuthChange, onElevationChange, onSnap, lightEnabled, onLightAzimuthChange, onLightElevationChange]);

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 8, 5]} intensity={0.7} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <shadowMaterial opacity={0.2} />
      </mesh>
      <gridHelper args={[6, 20, "#1a1a2e", "#12121a"]} />

      {GROUND_LABELS.map(({ text, pos }) => (
        <GroundLabel key={text} text={text} position={pos} />
      ))}

      <Suspense fallback={null}>
        <ImageCard imageUrl={imageUrl} />
      </Suspense>

      {/* Camera indicator */}
      <group ref={cameraGroupRef}>
        <lineSegments geometry={cameraWireGeo}>
          <lineBasicMaterial color={C_AZ} />
        </lineSegments>
        <mesh>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color={C_AZ} />
        </mesh>
      </group>

      {/* Distance line */}
      <lineSegments geometry={distLineGeo}>
        <lineBasicMaterial color={C_DIST} transparent opacity={0.5} />
      </lineSegments>

      {/* Azimuth ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <torusGeometry args={[AZ_RING_R, 0.025, 12, 64]} />
        <meshStandardMaterial color={C_AZ} emissive={C_AZ} emissiveIntensity={0.3} />
      </mesh>

      {/* Azimuth handle */}
      <mesh ref={azHandleRef}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color={C_AZ} emissive={C_AZ} emissiveIntensity={0.5} />
      </mesh>

      {/* Elevation arc */}
      <group ref={elArcGroupRef}>
        <mesh geometry={elevationArcGeo}>
          <meshStandardMaterial color={C_EL} emissive={C_EL} emissiveIntensity={0.3} />
        </mesh>
      </group>

      {/* Elevation handle */}
      <mesh ref={elHandleRef}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color={C_EL} emissive={C_EL} emissiveIntensity={0.5} />
      </mesh>

      {/* Light bead + beam cone */}
      {lightEnabled && (
        <>
          <mesh ref={lightBeadRef}>
            <sphereGeometry args={[0.10, 16, 16]} />
            <meshStandardMaterial color={C_LIGHT} emissive={C_LIGHT} emissiveIntensity={1.0} />
          </mesh>
          <group ref={lightGroupRef}>
            <mesh geometry={beamConeGeo}>
              <meshBasicMaterial
                color="#ffffff" transparent opacity={0.06}
                side={THREE.DoubleSide} depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </group>
          <SpotWithTarget spotRef={spotRef} />
        </>
      )}
    </>
  );
}

/* ── Wrapper: Canvas ── */
function AngleViewport({
  azimuth, elevation, distance: dist,
  onAzimuthChange, onElevationChange, onSnap,
  imageUrl,
  lightEnabled, lightAzimuth, lightElevation,
  onLightAzimuthChange, onLightElevationChange,
}: {
  azimuth: number; elevation: number; distance: number;
  onAzimuthChange: (v: number) => void;
  onElevationChange: (v: number) => void;
  onSnap: (az: number, el: number) => void;
  imageUrl: string;
  lightEnabled: boolean;
  lightAzimuth: number; lightElevation: number;
  onLightAzimuthChange: (v: number) => void;
  onLightElevationChange: (v: number) => void;
}) {
  return (
    <div className="w-full h-full" style={{ touchAction: "none" }}>
      <Canvas
        camera={{ fov: 45, near: 0.1, far: 100, position: [4.5, 3.2, 4.5] }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        shadows
        style={{ background: "#0a0a0f", borderRadius: 12 }}
      >
        <AngleScene
          azimuth={azimuth} elevation={elevation} distance={dist}
          onAzimuthChange={onAzimuthChange} onElevationChange={onElevationChange} onSnap={onSnap}
          imageUrl={imageUrl}
          lightEnabled={lightEnabled} lightAzimuth={lightAzimuth} lightElevation={lightElevation}
          onLightAzimuthChange={onLightAzimuthChange} onLightElevationChange={onLightElevationChange}
        />
      </Canvas>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   UI Sliders
   ═══════════════════════════════════════════════════════ */

const TRACK_W = 132;
const TRACK_PAD = 6;
const THUMB_R = 6;
const USABLE_W = TRACK_W - TRACK_PAD * 2;

function DistanceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const pct = (value - DIST_MIN) / (DIST_MAX - DIST_MIN);
  const thumbX = TRACK_PAD + pct * USABLE_W;
  const activeIdx = value < 2 ? 0 : value < 6 ? 1 : 2;

  const resolve = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left - TRACK_PAD) / USABLE_W));
    onChange(Math.round((DIST_MIN + p * (DIST_MAX - DIST_MIN)) * 10) / 10);
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
      <div className="absolute left-0 overflow-hidden pointer-events-none" style={{ top: 6, width: TRACK_W, height: 10, padding: 2, borderRadius: 18, background: "rgba(255,184,0,0.09)", backdropFilter: "blur(19px)" }}>
        <div className="relative flex w-full h-full">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex-1 rounded-lg transition-colors duration-200" style={{ background: i === activeIdx ? COLORS.distance : "transparent" }} />
          ))}
        </div>
      </div>
      <div className="absolute pointer-events-none rounded-full" style={{ width: THUMB_R * 2, height: THUMB_R * 2, top: 11 - THUMB_R, left: thumbX - THUMB_R, background: COLORS.distance, boxShadow: `0 0 6px ${COLORS.distance}88, 0 0 2px rgba(0,0,0,0.5)`, transition: isDragging.current ? "none" : "left 0.15s ease-out" }} />
      {DIST_STEPS.map((step) => {
        const sp = (step - DIST_MIN) / (DIST_MAX - DIST_MIN);
        return <div key={step} className="absolute rounded-full pointer-events-none" style={{ top: 18, left: TRACK_PAD + sp * USABLE_W, width: 2, height: 2, background: COLORS.distance, opacity: Math.abs(value - step) < 1.5 ? 0.7 : 0.2 }} />;
      })}
    </div>
  );
}

function BrightnessSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
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
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex-1 rounded-lg transition-colors duration-200" style={{ background: i === activeIdx ? "rgb(204,204,204)" : "transparent" }} />
          ))}
        </div>
      </div>
      <div className="absolute pointer-events-none rounded-full" style={{ width: THUMB_R * 2, height: THUMB_R * 2, top: 11 - THUMB_R, left: thumbX - THUMB_R, background: "#fff", boxShadow: "0 0 4px rgba(0,0,0,0.5)", transition: isDragging.current ? "none" : "left 0.15s ease-out" }} />
      {BRIGHTNESS_STEPS_LT.map((step) => {
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
  const activeIdx = COLOR_TEMP_STEPS_LT.findIndex((s, i) => { const next = COLOR_TEMP_STEPS_LT[i + 1]; if (!next) return true; return value < (s + next) / 2; });
  const stepColors = ["#D99A5D", "#D5AE55", "#F3DB90", "#F3F9FC", "#D4E6EE", "#C4E2F0"];
  const thumbColor = stepColors[activeIdx] ?? "#F3F9FC";

  const resolve = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left - TRACK_PAD) / USABLE_W));
    const temp = Math.round(COLOR_TEMP_MIN + p * (COLOR_TEMP_MAX - COLOR_TEMP_MIN));
    const snapped = COLOR_TEMP_STEPS_LT.reduce((prev, curr) => Math.abs(curr - temp) < Math.abs(prev - temp) ? curr : prev);
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
          {COLOR_TEMP_STEPS_LT.map((_, i) => (<div key={i} className="flex-1 rounded-lg transition-colors duration-200" style={{ background: i === activeIdx ? stepColors[activeIdx] : "transparent" }} />))}
        </div>
      </div>
      <div className="absolute pointer-events-none rounded-full" style={{ width: THUMB_R * 2, height: THUMB_R * 2, top: 11 - THUMB_R, left: thumbX - THUMB_R, background: thumbColor, boxShadow: `0 0 6px ${thumbColor}88, 0 0 2px rgba(0,0,0,0.5)`, transition: isDragging.current ? "none" : "left 0.15s ease-out" }} />
      {COLOR_TEMP_STEPS_LT.map((step, i) => {
        const stepPct = (step - COLOR_TEMP_MIN) / (COLOR_TEMP_MAX - COLOR_TEMP_MIN);
        return <div key={step} className="absolute rounded-full pointer-events-none" style={{ top: 18, left: TRACK_PAD + stepPct * USABLE_W, width: 2, height: 2, background: stepColors[i], opacity: i === activeIdx ? 0.7 : 0.2 }} />;
      })}
    </div>
  );
}

function ValueBox({ value, unit, min, max, step, color, onChange }: { value: number; unit: string; min: number; max: number; step: number; color: string; onChange: (v: number) => void }) {
  const startX = useRef(0);
  const startVal = useRef(0);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    startX.current = e.clientX; startVal.current = value;
    const onMove = (ev: PointerEvent) => { const dx = ev.clientX - startX.current; onChange(Math.max(min, Math.min(max, Math.round((startVal.current + dx / 2 * step) * 10) / 10))); };
    const onUp = () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
    document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp);
  }, [value, min, max, step, onChange]);
  return (
    <div className="flex items-center shrink-0 rounded-sm select-none" style={{ width: 68, height: 24, cursor: "ew-resize", touchAction: "none", background: `${color}15` }} onPointerDown={handlePointerDown}>
      <div className="flex-1 flex items-center pointer-events-none justify-center gap-0.5">
        <span className="text-sm font-medium leading-5" style={{ color }}>{typeof value === "number" && value % 1 !== 0 ? value.toFixed(1) : value}</span>
        <span className="text-sm font-semibold leading-5" style={{ color, opacity: 0.4 }}>{unit}</span>
      </div>
    </div>
  );
}

function LightValueBox({ icon: Icon, value, unit, min, max, step, onChange }: { icon: typeof Sun; value: number; unit: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
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
  initialSettings?: MultiAngleToolSettings;
  onClose: () => void;
  onGenerate: (prompt: string, imageSize: string, modelId: string, controlImage?: string) => void;
  onSettingsChange?: (s: MultiAngleToolSettings) => void;
  isGenerating?: boolean;
}

export function MultiAngleToolModal({
  imageUrl,
  imageSize,
  initialModelId,
  initialSettings,
  onClose,
  onGenerate,
  onSettingsChange,
  isGenerating,
}: Props) {
  const t = useTranslations("multiAngleTool");
  const tc = useTranslations("canvas");
  const [settings, setSettings] = useState<MultiAngleToolSettings>({ ...DEFAULT_SETTINGS, ...(initialSettings ?? {}) });
  const defaultModel = MULTIANGLE_MODELS.find(m => m.id === initialModelId) ? initialModelId! : "nano-banana-2";
  const [modelId, setModelId] = useState(defaultModel);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [showLightPicker, setShowLightPicker] = useState(false);
  const currentModel = MULTIANGLE_MODELS.find(m => m.id === modelId) ?? MULTIANGLE_MODELS[0];
  const { getQualityPrices } = useAllPricing();
  const priceMap = getQualityPrices(modelId) ?? MODEL_QUALITY_PRICE[modelId] ?? MODEL_QUALITY_PRICE["nano-banana-2"];
  const availableQualities = ALL_QUALITY_OPTIONS.filter(q => q in priceMap);
  const [quality, setQuality] = useState(() => {
    const preferred = imageSize || "2K";
    return priceMap[preferred] ? preferred : availableQualities[0] ?? "2K";
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const directionLabel = useMemo(() => {
    const azSnap = snapNearest(settings.azimuth, AZIMUTH_STEPS);
    const azKey = AZ_I18N_KEY[azSnap];
    const elKey = EL_LABEL_KEY[elevationBucket(settings.elevation)];
    return [azKey ? t(azKey) : "", elKey ? t(elKey) : ""].filter(Boolean).join(" · ");
  }, [settings.azimuth, settings.elevation, t]);

  const persist = useCallback((next: MultiAngleToolSettings) => {
    queueMicrotask(() => onSettingsChange?.(next));
  }, [onSettingsChange]);

  const update = useCallback(<K extends keyof MultiAngleToolSettings>(key: K, val: MultiAngleToolSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: val };
      persist(next);
      return next;
    });
  }, [persist]);

  const handleReset = useCallback(() => {
    const next = { ...DEFAULT_SETTINGS, lightEnabled: settings.lightEnabled };
    setSettings(next);
    persist(next);
  }, [persist, settings.lightEnabled]);

  const handleGenerate = useCallback(() => {
    if (isGenerating) return;
    const canvas = viewportRef.current?.querySelector("canvas");
    const controlImage = canvas?.toDataURL("image/png") ?? undefined;
    onGenerate(buildMultiAnglePrompt(settings), quality, modelId, controlImage);
  }, [settings, quality, modelId, onGenerate, isGenerating]);

  const handleModelChange = useCallback((id: string) => {
    setModelId(id);
    const newPriceMap = getQualityPrices(id) ?? MODEL_QUALITY_PRICE[id] ?? MODEL_QUALITY_PRICE["nano-banana-2"];
    if (!newPriceMap[quality]) {
      setQuality(Object.keys(newPriceMap)[0]);
    }
  }, [quality]);

  const handleAzimuthChange = useCallback((v: number) => {
    setSettings(prev => { const next = { ...prev, azimuth: v }; persist(next); return next; });
  }, [persist]);

  const handleElevationChange = useCallback((v: number) => {
    setSettings(prev => { const next = { ...prev, elevation: v }; persist(next); return next; });
  }, [persist]);

  const handleSnap = useCallback((az: number, el: number) => {
    setSettings(prev => { const next = { ...prev, azimuth: az, elevation: el }; persist(next); return next; });
  }, [persist]);

  const handleLightAzimuthChange = useCallback((v: number) => {
    setSettings(prev => { const next = { ...prev, lightAzimuth: v }; persist(next); return next; });
  }, [persist]);

  const handleLightElevationChange = useCallback((v: number) => {
    setSettings(prev => { const next = { ...prev, lightElevation: v }; persist(next); return next; });
  }, [persist]);

  const applyPreset = useCallback((preset: typeof PRESETS[0]) => {
    setSettings(prev => {
      const next = { ...prev, azimuth: preset.azimuth, elevation: preset.elevation };
      persist(next);
      return next;
    });
  }, [persist]);

  const toggleLight = useCallback(() => {
    setSettings(prev => {
      const next = { ...prev, lightEnabled: !prev.lightEnabled };
      if (!prev.lightEnabled) setShowLightPicker(true);
      persist(next);
      return next;
    });
  }, [persist]);

  const lightDirLabel = useMemo(() => {
    if (!settings.lightEnabled) return null;
    const azSnap = snapNearest(settings.lightAzimuth, AZIMUTH_STEPS);
    return AZ_I18N_KEY[azSnap] ? t(AZ_I18N_KEY[azSnap]) : "";
  }, [settings.lightEnabled, settings.lightAzimuth, t]);

  const LIGHT_PRESETS = useMemo(() => [
    { key: "front", az: 0, el: 0 },
    { key: "rightFront", az: 45, el: 15 },
    { key: "right", az: 90, el: 0 },
    { key: "rear", az: 180, el: 0 },
    { key: "left", az: 270, el: 0 },
    { key: "leftFront", az: 315, el: 15 },
    { key: "topDown", az: 0, el: 60 },
    { key: "bottomUp", az: 0, el: -60 },
  ], []);

  const applyLightPreset = useCallback((az: number, el: number) => {
    setSettings(prev => {
      const next = { ...prev, lightAzimuth: az, lightElevation: el, lightEnabled: true };
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
            ref={viewportRef}
            className="relative shrink-0 overflow-hidden"
            style={{ width: 460, height: 480, borderRadius: 16 }}
          >
            <AngleViewport
              azimuth={settings.azimuth} elevation={settings.elevation} distance={settings.distance}
              onAzimuthChange={handleAzimuthChange} onElevationChange={handleElevationChange} onSnap={handleSnap}
              imageUrl={imageUrl}
              lightEnabled={settings.lightEnabled} lightAzimuth={settings.lightAzimuth} lightElevation={settings.lightElevation}
              onLightAzimuthChange={handleLightAzimuthChange} onLightElevationChange={handleLightElevationChange}
            />

            <button
              className="absolute bottom-3 right-3 flex items-center gap-1 text-[11px] font-medium text-white/30 hover:text-white/60 transition-colors z-10"
              onClick={handleReset}
            >
              <RefreshCw size={12} />
              {t("reset")}
            </button>

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
          <div className="flex flex-col pt-1" style={{ width: 320, height: 480 }}>
            <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: "none" }}>

              {/* Presets */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-white">{t("presets")}</span>
                <div className="grid grid-cols-4 gap-1">
                  {PRESETS.map((p) => {
                    const isActive = Math.abs(settings.azimuth - p.azimuth) < 10 && Math.abs(settings.elevation - p.elevation) < 10;
                    return (
                      <button
                        key={p.key}
                        className={`h-6 rounded-sm text-[11px] font-semibold transition-colors overflow-hidden flex items-center justify-center ${
                          isActive
                            ? "text-[#ff6ba8] ring-1 ring-[#E93D82]/30"
                            : "bg-white/[0.06] text-zinc-400 hover:bg-white/10"
                        }`}
                        style={isActive ? { background: "rgba(233,61,130,0.15)" } : undefined}
                        onClick={() => applyPreset(p)}
                      >
                        {t(p.key)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-zinc-700/60" />

              {/* Angles display */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-white">{t("angles")}</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS.azimuth }} />
                    <span className="text-[11px] text-zinc-400">{t("horizontal")}</span>
                  </div>
                  <ValueBox value={Math.round(settings.azimuth)} unit="°" min={0} max={360} step={1} color={COLORS.azimuth} onChange={(v) => update("azimuth", v)} />
                  <div className="flex items-center gap-1.5 ml-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS.elevation }} />
                    <span className="text-[11px] text-zinc-400">{t("vertical")}</span>
                  </div>
                  <ValueBox value={Math.round(settings.elevation)} unit="°" min={-30} max={60} step={1} color={COLORS.elevation} onChange={(v) => update("elevation", v)} />
                </div>
              </div>

              <div className="h-px bg-zinc-700/60" />

              {/* Distance */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-white">{t("distance")}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500 shrink-0">{t("wideShot")}</span>
                  <DistanceSlider value={settings.distance} onChange={(v) => update("distance", v)} />
                  <span className="text-[10px] text-zinc-500 shrink-0">{t("closeUp")}</span>
                  <ValueBox value={settings.distance} unit="" min={DIST_MIN} max={DIST_MAX} step={0.5} color={COLORS.distance} onChange={(v) => update("distance", v)} />
                </div>
              </div>

              <div className="h-px bg-zinc-700/60" />

              {/* ── Lighting popover ── */}
              <div className="flex items-center justify-between">
                <div className="relative">
                  <button
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${showLightPicker ? "bg-white/10 text-white" : settings.lightEnabled ? "text-zinc-200 hover:bg-white/[0.06]" : "text-zinc-500 hover:bg-white/[0.06]"}`}
                    onClick={() => { setShowLightPicker(!showLightPicker); setShowModelPicker(false); setShowQualityPicker(false); }}
                  >
                    <Sun size={14} style={{ color: settings.lightEnabled ? LIGHT_COLOR : undefined }} />
                    <span>{t("lighting")}{settings.lightEnabled && lightDirLabel ? ` · ${lightDirLabel}` : ""}</span>
                    <ChevronDown size={12} className={`transition-transform ${showLightPicker ? "rotate-180" : ""}`} />
                  </button>

                  {showLightPicker && (
                    <div
                      className="absolute top-full mt-1.5 left-0 rounded-xl border border-zinc-700/60 p-2.5 z-30"
                      style={{ background: "#1c1c1c", width: 310 }}
                    >
                      {/* On/Off toggle */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-zinc-300">{t("lighting")}</span>
                        <button
                          type="button" role="switch" aria-checked={settings.lightEnabled}
                          onClick={toggleLight}
                          className={`inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors ${settings.lightEnabled ? "bg-zinc-100" : "bg-zinc-600"}`}
                        >
                          <span className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform ${settings.lightEnabled ? "translate-x-4 bg-zinc-900" : "translate-x-0 bg-zinc-200"}`} />
                        </button>
                      </div>

                      {settings.lightEnabled && (
                        <div className="flex flex-col gap-2">
                          {/* Direction presets */}
                          <div className="grid grid-cols-4 gap-1">
                            {LIGHT_PRESETS.map((p) => {
                              const isActive = Math.abs(settings.lightAzimuth - p.az) < 22 && Math.abs(settings.lightElevation - p.el) < 22;
                              return (
                                <button
                                  key={p.key}
                                  className={`h-6 rounded-sm text-[11px] font-semibold transition-colors overflow-hidden flex items-center justify-center ${
                                    isActive
                                      ? "ring-1"
                                      : "bg-white/[0.06] text-zinc-400 hover:bg-white/10"
                                  }`}
                                  style={isActive ? { background: `${LIGHT_COLOR}22`, color: LIGHT_COLOR, boxShadow: `inset 0 0 0 1px ${LIGHT_COLOR}44` } : undefined}
                                  onClick={() => applyLightPreset(p.az, p.el)}
                                >
                                  {t(p.key)}
                                </button>
                              );
                            })}
                          </div>

                          <div className="h-px bg-zinc-700/40" />

                          {/* Brightness */}
                          <div>
                            <span className="text-[11px] font-semibold text-zinc-400 mb-0.5 block">{t("brightness")}</span>
                            <div className="flex items-center justify-between">
                              <BrightnessSlider value={settings.lightBrightness} onChange={(v) => update("lightBrightness", v)} />
                              <LightValueBox icon={Sun} value={settings.lightBrightness} unit="%" min={0} max={100} step={1} onChange={(v) => update("lightBrightness", v)} />
                            </div>
                          </div>

                          {/* Color Temperature */}
                          <div>
                            <span className="text-[11px] font-semibold text-zinc-400 mb-0.5 block">{t("colorTemp")}</span>
                            <div className="flex items-center justify-between">
                              <ColorTempSlider value={settings.lightColorTemp} onChange={(v) => update("lightColorTemp", v)} />
                              <LightValueBox icon={Thermometer} value={settings.lightColorTemp} unit="K" min={COLOR_TEMP_MIN} max={COLOR_TEMP_MAX} step={100} onChange={(v) => update("lightColorTemp", v)} />
                            </div>
                          </div>

                          <div className="h-px bg-zinc-700/40" />

                          {/* Rim light */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold text-white">{t("rimLight")}</span>
                              <div className="relative group/tip">
                                <HelpCircle size={13} className="text-white/30 cursor-help" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 leading-relaxed w-[200px] opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity duration-150 z-[10001] shadow-lg">
                                  {t("rimLightTip")}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button" role="switch" aria-checked={settings.lightRimLight}
                              onClick={() => update("lightRimLight", !settings.lightRimLight)}
                              className={`inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors ${settings.lightRimLight ? "bg-zinc-100" : "bg-zinc-600"}`}
                            >
                              <span className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform ${settings.lightRimLight ? "translate-x-4 bg-zinc-900" : "translate-x-0 bg-zinc-200"}`} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px bg-zinc-700/60" />

              {/* Model + Quality row */}
              <div className="flex items-center justify-between">
                <div className="relative">
                  <button
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${showModelPicker ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/[0.06]"}`}
                    onClick={() => { setShowModelPicker(!showModelPicker); setShowQualityPicker(false); setShowLightPicker(false); }}
                  >
                    <span>{currentModel.name}</span>
                    <ChevronDown size={12} className={`transition-transform ${showModelPicker ? "rotate-180" : ""}`} />
                  </button>

                  {showModelPicker && (
                    <div
                      className="absolute bottom-full mb-1.5 left-0 w-52 rounded-xl border border-zinc-700/60 p-1 z-30"
                      style={{ background: "#1c1c1c" }}
                    >
                      {MULTIANGLE_MODELS.map((m) => (
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
                    onClick={() => { setShowQualityPicker(!showQualityPicker); setShowModelPicker(false); setShowLightPicker(false); }}
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
