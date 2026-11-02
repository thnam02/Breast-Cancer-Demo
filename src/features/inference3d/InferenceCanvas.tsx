import { AdaptiveDpr, Html, Line, OrbitControls, PerformanceMonitor, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, SMAA } from "@react-three/postprocessing";
import gsap from "gsap";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Box3,
  BoxGeometry,
  Camera,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  ACESFilmicToneMapping,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  ShaderMaterial,
  SpotLight,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGLRenderer,
  TubeGeometry,
  Vector3,
  type Material,
} from "three";
import { spectralRgb } from "../../lib/colormap";
import { clinicalBars } from "../../data/clinical";
import { isSeeded } from "../../data/seeded";
import { slideBitmap } from "../../lib/heCanvas";
import { playbackClock, readTimeline } from "../../lib/playback";
import { predictionProgress, shownProbability } from "../../lib/prediction";
import type { Timeline } from "../../lib/timeline";
import { caseAsset, type CaseFile, type Receptor } from "../../types/case";
import type { Line2 } from "three-stdlib";

interface SceneProps {
  caseData: CaseFile;
  showIhc: boolean;
  active?: boolean;
  overlayRef: RefObject<HTMLDivElement | null>;
  attentionHead?: number | "avg";
}

const GRAPHITE = "#1A1A22";
const AMBER = "#E8B04B";
const MINT = "#4FD1A5";
const ROSE = "#E86A92";
const VIOLET = "#8B7CF6";
const CORAL = "#FF5A5F";
const RECEPTORS: Receptor[] = ["ER", "PR", "HER2"];
const SLIDE_Y = -0.95;
const GREY = new Color("#8d8d98");
const COLOR_SCRATCH = new Color();

const POSES = [
  { x: 0, y: 9.4, z: 8.4, lx: 0, ly: -0.4, lz: -0.15 },
  { x: 0, y: 5.6, z: 5.4, lx: 0, ly: -0.75, lz: 0 },
  { x: 0.4, y: 4.2, z: 7.6, lx: 0, ly: 0.4, lz: 0 },
  { x: 0, y: 7.6, z: 11.4, lx: 0, ly: 0.15, lz: 0 },
  { x: 0, y: 4.2, z: 10.6, lx: 0, ly: 0.2, lz: -0.3 },
  { x: 0.2, y: 4.1, z: 7.8, lx: 0, ly: 2.15, lz: 0 },
  { x: 0, y: 5.4, z: 9.4, lx: 0, ly: 3.6, lz: 0 },
  { x: 0.15, y: 3.2, z: 7.4, lx: 0, ly: -0.4, lz: 0.05 },
] as const;

const MICRO = [
  { kicker: "Case", line: "Clinical, tissue, molecular" },
  { kicker: "Grid", line: "Valid patches lighting up" },
  { kicker: "UNI2-h", line: "Frozen foundation model" },
  { kicker: "MIL", line: "One shared tile-weight map" },
  { kicker: "MLP", line: "Clinical and gene branches" },
  { kicker: "Tokens", line: "Head-averaged attention" },
  { kicker: "Receptors", line: "" },
  { kicker: "Map", line: "Top tiles, one shared map" },
];

const ACTIVE: Record<number, string[]> = {
  0: ["slide", "clinical", "helix"],
  1: ["slide"],
  2: ["slide", "needles", "uni"],
  3: ["slide", "needles", "transformer", "wsi"],
  4: ["clinical", "helix", "mlp", "clinicalToken", "geneToken", "wsi"],
  5: ["clinicalToken", "geneToken", "wsi", "curves"],
  6: ["clinicalToken", "geneToken", "wsi", "trunk", "gauges"],
  7: ["slide"],
};

function introduced(id: string, scene: number) {
  if (id === "needles" || id === "uni") return scene >= 2;
  if (id === "transformer" || id === "wsi") return scene >= 3;
  if (id === "clinicalToken" || id === "geneToken" || id === "mlp") return scene >= 4;
  if (id === "curves") return scene >= 5;
  if (id === "trunk" || id === "gauges") return scene >= 6;
  return true;
}

const TOKEN_Y = [2.9, 2.05, 1.2] as const;
const TRUNK_Y = 3.28;
const TRUNK_STEP = 0.32;
const TRUNK_WIDTHS = [2.05, 1.6, 1.15, 0.75] as const;
const TRUNK_LABELS = [192, 128, 64, 32] as const;
const GAUGE_Y = 6.55;
const GAUGE_H = 1.36;
const GAUGE_X = [-1.15, 0, 1.15] as const;

const liveToken = {
  clinicalToken: new Vector3(-2.15, 0.42, 0.2),
  geneToken: new Vector3(2.15, 0.42, 0.2),
  wsi: new Vector3(0, 2.72, 0),
};

function focusLevel(id: string, timeline: Timeline) {
  if (!timeline.running) {
    if (id === "needles") return 0.7;
    return id === "slide" || id === "clinical" || id === "helix" ? 1 : 0;
  }
  const scene = timeline.stepIndex;
  if (id === "needles" && (scene < 2 || scene > 3)) return 0;
  if ((id === "helix" || id === "clinical") && (scene === 5 || scene === 6)) return 0;
  if (id === "trunk" && scene !== 6) return 0;
  if (id === "curves" && scene !== 5) return 0;
  if (id === "mlp" && scene !== 4) return 0;
  if (id === "gauges" && scene !== 6) return 0;
  if (!introduced(id, scene)) return 0;
  return ACTIVE[scene]?.includes(id) ? 1 : 0.15;
}

function Backdrop() {
  const { scene } = useThree();
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, "#050508");
      gradient.addColorStop(1, "#050508");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 2, 256);
    }
    const next = new CanvasTexture(canvas);
    next.colorSpace = SRGBColorSpace;
    next.magFilter = LinearFilter;
    return next;
  }, []);
  useEffect(() => {
    scene.background = texture;
    return () => {
      scene.background = null;
      texture.dispose();
    };
  }, [scene, texture]);
  return null;
}

function SoftFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.05, 0]}>
      <circleGeometry args={[16, 48]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        toneMapped={false}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          void main() {
            float radius = length(vUv - vec2(0.5));
            float alpha = 1.0 - smoothstep(0.08, 0.30, radius);
            gl_FragColor = vec4(0.055, 0.055, 0.07, alpha * 0.9);
          }
        `}
      />
    </mesh>
  );
}

function applyFocus(group: Group, fade: number) {
  group.visible = fade > 0.025;
  group.traverse((object) => {
    const mesh = object as Mesh;
    const materials = mesh.material;
    if (!materials) return;
    const list = Array.isArray(materials) ? materials : [materials];
    list.forEach((material) => {
      if (material.userData.skipFade) {
        const shader = material as ShaderMaterial;
        if (shader.uniforms?.uDim) shader.uniforms.uDim.value = fade;
        return;
      }
      const colored = material as MeshStandardMaterial;
      if (colored.color?.isColor) {
        if (!material.userData.baseColor) material.userData.baseColor = colored.color.clone();
        COLOR_SCRATCH.copy(material.userData.baseColor as Color).lerp(GREY, 1 - Math.min(1, fade));
        colored.color.copy(COLOR_SCRATCH);
      }
      if (material.userData.baseOpacity === undefined) material.userData.baseOpacity = material.opacity;
      material.opacity = Math.max(0, Math.min(1, (material.userData.baseOpacity as number) * fade));
      if (!material.transparent) {
        material.transparent = true;
        material.needsUpdate = true;
      }
      material.depthWrite = fade > 0.85;
    });
  });
}

const STATIC_BOUNDS: Record<string, Box3> = {
  slide: new Box3(new Vector3(-2.5, -1.15, -1.75), new Vector3(2.5, -0.02, 1.75)),
  clinical: new Box3(new Vector3(-3.6, -0.5, -1.5), new Vector3(-1.4, 1.3, 0.2)),
  helix: new Box3(new Vector3(3.15, -0.2, -1.6), new Vector3(4.25, 2.2, -0.2)),
  uni: new Box3(new Vector3(-1.3, 0.4, -0.8), new Vector3(1.3, 1.35, 0.8)),
  transformer: new Box3(new Vector3(-1.3, 1.3, -0.7), new Vector3(1.3, 2.6, 0.7)),
  mlp: new Box3(new Vector3(-2.6, 0.5, -0.8), new Vector3(2.6, 1.2, 0.1)),
  trunk: new Box3(new Vector3(-1.2, TRUNK_Y - 0.1, -0.4), new Vector3(1.2, TRUNK_Y + TRUNK_STEP * 3.4, 0.4)),
  gauges: new Box3(new Vector3(-1.6, GAUGE_Y - 0.9, -0.3), new Vector3(1.6, GAUGE_Y + 0.9, 0.3)),
};

const corner = new Vector3();

const liveBounds: Record<string, Box3> = {
  clinicalToken: new Box3(),
  geneToken: new Box3(),
  wsi: new Box3(),
};

function offscreen(id: string, camera: Camera, width: number, height: number) {
  const box = liveBounds[id]?.isEmpty() === false ? liveBounds[id] : STATIC_BOUNDS[id];
  if (!box || width < 2 || height < 2) return false;
  let seen = 0;
  let outside = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < 8; i += 1) {
    corner.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    );
    const projected = corner.clone().project(camera);
    if (projected.z < -1 || projected.z > 1 || projected.x < -1.04 || projected.x > 1.04 || projected.y < -1.04 || projected.y > 1.04) {
      outside += 1;
      continue;
    }
    x0 = Math.min(x0, (projected.x * 0.5 + 0.5) * width);
    y0 = Math.min(y0, (-projected.y * 0.5 + 0.5) * height);
    x1 = Math.max(x1, (projected.x * 0.5 + 0.5) * width);
    y1 = Math.max(y1, (-projected.y * 0.5 + 0.5) * height);
    seen += 1;
  }
  if (seen < 3 || outside > 0) return true;
  return y0 < 60 || y1 > height - 100 || x0 < -8 || x1 > width + 8;
}

function Focus({ id, showIhc, children }: { id: string; showIhc: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const fade = useRef(-1);
  const { camera, size } = useThree();
  void showIhc;
  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    const target = focusLevel(id, readTimeline());
    const next = target === 0 ? 0 : fade.current < 0 ? target : MathUtils.damp(fade.current, target, 5, delta);
    fade.current = next;
    const clipped = target > 0 && target < 0.5 && offscreen(id, camera, size.width, size.height);
    const shown = clipped ? 0 : next;
    if (Math.abs(shown - target) < 0.004 && !clipped && group.userData.applied === target) return;
    group.userData.applied = Math.abs(shown - target) < 0.004 && !clipped ? target : -1;
    applyFocus(group, shown);
  }, 1);
  return <group ref={ref}>{children}</group>;
}

function InferenceCanvas(props: SceneProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      resize={{ debounce: 0, scroll: false }}
      style={{ width: "100%", height: "100%", display: "block" }}
      frameloop={props.active === false ? "never" : "always"}
      camera={{ position: [0, 9.4, 8.4], fov: 32, near: 0.1, far: 40 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = SRGBColorSpace;
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        gl.setClearColor("#050508");
        gl.domElement.addEventListener("webglcontextlost", (event) => event.preventDefault(), { passive: false });
      }}
    >
      <InferenceScene {...props} />
    </Canvas>
  );
}

export default memo(InferenceCanvas);

function InferenceScene({ caseData, showIhc, overlayRef, attentionHead = "avg" }: SceneProps) {
  const texture = useSlideTexture(caseData);
  const matrix = attentionView(caseData, attentionHead);
  return (
    <>
      <Backdrop />
      <hemisphereLight args={["#d9d4cc", "#14141a", 0.45]} />
      <directionalLight position={[-6, 8, 6]} intensity={1.7} color="#f3efe8" />
      <directionalLight position={[5, 4, -6]} intensity={0.35} color="#9aa0b4" />
      <SweepLight />
      <CameraDirector />
      <SoftFloor />
      <SlideAssembly caseData={caseData} texture={texture} showIhc={showIhc} />
      <Streams caseData={caseData} />
      <Focus id="clinical" showIhc={showIhc}>
        <ClinicalSlab caseData={caseData} />
      </Focus>
      <Focus id="helix" showIhc={showIhc}>
        <GeneHelix caseData={caseData} />
      </Focus>
      <Focus id="mlp" showIhc={showIhc}>
        <MlpStacks caseData={caseData} />
      </Focus>
      <Focus id="uni" showIhc={showIhc}>
        <DashedBox position={[0, 0.85, 0]} size={[2.3, 0.72, 1.25]} color={ROSE} />
      </Focus>
      <Focus id="transformer" showIhc={showIhc}>
        <Transformer />
      </Focus>
      <Tokens showIhc={showIhc} matrix={matrix} caseData={caseData} />
      <Focus id="curves" showIhc={showIhc}>
        <AttentionCurves matrix={matrix} />
      </Focus>
      <Focus id="trunk" showIhc={showIhc}>
        <Trunk caseData={caseData} />
      </Focus>
      <Focus id="gauges" showIhc={showIhc}>
        <Gauges caseData={caseData} showIhc={showIhc} />
      </Focus>
      <OverlayDriver caseData={caseData} overlayRef={overlayRef} attentionHead={attentionHead} />
      <ResolutionControl />
      <StageComposer />
    </>
  );
}

function attentionView(caseData: CaseFile, head: number | "avg"): number[][] {
  if (head === "avg") return caseData.modalityAttention;
  return caseData.modalityAttentionPerHead?.[head] ?? caseData.modalityAttention;
}

function ResolutionControl() {
  const set = useThree((state) => state.set);
  const initial = useThree((state) => state.viewport.initialDpr);
  const apply = (factor: number) => {
    set((state) => ({ performance: { ...state.performance, current: factor } }));
  };
  const low = Math.min(1, 1.5 / Math.max(initial, 1));
  return (
    <PerformanceMonitor
      ms={250}
      iterations={8}
      threshold={0.75}
      bounds={() => [50, 55]}
      factor={1}
      step={0.25}
      flipflops={6}
      onDecline={() => apply(low)}
      onIncline={() => apply(1)}
      onFallback={() => apply(low)}
    >
      <AdaptiveDpr />
    </PerformanceMonitor>
  );
}

function StageComposer() {
  const samples = useThree((state) => state.gl.capabilities.maxSamples ?? 0);
  const msaa = samples >= 4;
  return (
    <EffectComposer multisampling={msaa ? 4 : 0} enableNormalPass={false}>
      {msaa ? null : <SMAA />}
      <Bloom intensity={0.3} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur radius={0.4} />
    </EffectComposer>
  );
}

function tuneTexture(texture: Texture, renderer: WebGLRenderer) {
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
}

function useSlideTexture(caseData: CaseFile): Texture {
  const renderer = useThree((state) => state.gl);
  const fallback = useMemo(() => {
    const next = new CanvasTexture(slideBitmap(caseData));
    tuneTexture(next, renderer);
    return next;
  }, [caseData, renderer]);
  const [texture, setTexture] = useState<Texture>(fallback);

  useEffect(() => {
    setTexture(fallback);
    if (caseData.mock) return;
    let live = true;
    const loaded = new TextureLoader().load(caseAsset(caseData.caseId, caseData.slide.thumb), (next) => {
      if (!live) {
        next.dispose();
        return;
      }
      tuneTexture(next, renderer);
      setTexture(next);
    });
    return () => {
      live = false;
      loaded.dispose();
    };
  }, [caseData, fallback, renderer]);

  useEffect(() => () => fallback.dispose(), [fallback]);
  return texture;
}

function scenePoints(scene: number): Vector3[] {
  const slide = [
    new Vector3(-2.5, -0.95, -1.7),
    new Vector3(2.5, -0.95, -1.7),
    new Vector3(-2.5, -0.15, 1.7),
    new Vector3(2.5, -0.15, 1.7),
  ];
  const clinical = [new Vector3(-3.4, -0.2, -1.2), new Vector3(-1.6, 0.9, -0.2)];
  const helix = [new Vector3(3.25, -0.05, -1.4), new Vector3(4.2, 2.05, -0.3)];
  const uni = [new Vector3(-1.2, 0.45, -0.7), new Vector3(1.2, 1.25, 0.7)];
  const transformer = [new Vector3(-1.2, 1.45, -0.6), new Vector3(1.2, 2.5, 0.6)];
  const tokens = scene >= 5
    ? [
        new Vector3(-1.05, TOKEN_Y[0], 0),
        new Vector3(1.05, TOKEN_Y[0], 0),
        new Vector3(-2.2, TOKEN_Y[1], 0),
        new Vector3(1.05, TOKEN_Y[2], 0),
      ]
    : [
        new Vector3(liveToken.clinicalToken.x - 1, liveToken.clinicalToken.y, liveToken.clinicalToken.z),
        new Vector3(liveToken.geneToken.x + 1, liveToken.geneToken.y, liveToken.geneToken.z),
        new Vector3(liveToken.wsi.x, liveToken.wsi.y + 0.2, liveToken.wsi.z),
        new Vector3(liveToken.wsi.x, liveToken.wsi.y - 0.2, liveToken.wsi.z),
      ];
  const arcs = [new Vector3(-2.15, TOKEN_Y[0], 0), new Vector3(-2.15, TOKEN_Y[2], 0), new Vector3(-0.9, TOKEN_Y[1], 0)];
  const trunk = TRUNK_WIDTHS.map((width, index) => new Vector3(width / 2 + 0.45, TRUNK_Y + index * TRUNK_STEP, 0));
  const gauges = GAUGE_X.flatMap((x) => [
    new Vector3(x, GAUGE_Y + GAUGE_H / 2, 0),
    new Vector3(x, GAUGE_Y - GAUGE_H / 2 - 0.55, 0),
  ]);
  if (scene === 0) return [...slide, ...clinical, ...helix];
  if (scene === 1) return slide;
  if (scene === 2) return [...slide, ...uni, new Vector3(0, 0.35, 0)];
  if (scene === 3) return [...slide, ...transformer, new Vector3(0, 2.9, 0)];
  if (scene === 4) return [...clinical, ...helix, new Vector3(-3.55, 0.45, 0), new Vector3(4.35, 0.55, 0), new Vector3(0, 2.9, 0)];
  if (scene === 5) return [...tokens, ...arcs];
  if (scene === 6) return [...tokens, ...trunk, ...gauges];
  return [...slide, new Vector3(0, 0.7, 0)];
}

function fitDistance(direction: Vector3, look: Vector3, points: Vector3[], width: number, height: number, fov: number, scene: number, baseDistance: number) {
  const scratch = new PerspectiveCamera(fov, width / Math.max(1, height), 0.1, 40);
  const sidePad = scene === 4 ? 0.14 : 0.12;
  const bottomReserve = scene === 7 ? 190 : 110;
  const top = 64;
  const bottom = height - bottomReserve;
  const safeH = Math.max(40, bottom - top);
  const padX = Math.max(width * sidePad, scene === 4 ? 250 : 214);
  const padY = safeH * 0.12;
  const limit = { l: padX, r: width - padX, t: top + padY, b: bottom - padY };
  const fits = (distance: number) => {
    scratch.position.copy(look).addScaledVector(direction, distance);
    scratch.lookAt(look);
    scratch.updateMatrixWorld();
    scratch.updateProjectionMatrix();
    return points.every((point) => {
      const view = point.clone().applyMatrix4(scratch.matrixWorldInverse);
      if (view.z > -0.15) return false;
      const projected = point.clone().project(scratch);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      return x >= limit.l && x <= limit.r && y >= limit.t && y <= limit.b;
    });
  };
  if (fits(baseDistance)) return { position: look.clone().addScaledVector(direction, baseDistance), look };
  let low = baseDistance;
  let high = 26;
  if (!fits(high)) return { position: look.clone().addScaledVector(direction, high), look };
  for (let step = 0; step < 12; step += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) high = mid;
    else low = mid;
  }
  return { position: look.clone().addScaledVector(direction, high), look };
}

function CameraDirector() {
  const { camera, size } = useThree();
  const controls = useRef<{
    enabled: boolean;
    enableDamping: boolean;
    autoRotate: boolean;
    target: Vector3;
    update: () => void;
  } | null>(null);
  const looked = useRef(new Vector3(0, -0.4, -0.3));
  const desired = useRef(new Vector3(0, 9.4, 8.4));
  const signature = useRef("idle");
  const userTurning = useRef(false);
  const resumeAt = useRef(0);

  useFrame(() => {
    const timeline = readTimeline();
    const orbit = controls.current;
    const now = performance.now();
    const idle = !timeline.running;
    if (orbit) {
      orbit.enabled = idle;
      orbit.enableDamping = idle;
      orbit.autoRotate = idle && !userTurning.current && now >= resumeAt.current;
    }
    if (idle) {
      if (signature.current !== "idle") {
        signature.current = "idle";
        gsap.killTweensOf(desired.current);
        if (orbit) {
          const heldPosition = camera.position.clone();
          const heldQuaternion = camera.quaternion.clone();
          orbit.enabled = true;
          orbit.autoRotate = false;
          orbit.enableDamping = false;
          orbit.target.copy(looked.current);
          orbit.update();
          camera.position.copy(heldPosition);
          camera.quaternion.copy(heldQuaternion);
          orbit.update();
          orbit.enableDamping = true;
          orbit.autoRotate = !userTurning.current && now >= resumeAt.current;
        }
      }
      return;
    }
    const pose = POSES[timeline.stepIndex] ?? POSES[0];
      const key = `${playbackClock.generation}:${timeline.stepIndex}:${size.width}x${size.height}:fit4`;
      if (signature.current !== key && size.width > 2 && size.height > 2) {
      if (signature.current === "idle" || signature.current === "") desired.current.copy(camera.position);
      signature.current = key;
      const look = new Vector3(pose.lx, pose.ly, pose.lz);
      const offset = new Vector3(pose.x - pose.lx, pose.y - pose.ly, pose.z - pose.lz);
      const direction = offset.clone().normalize();
      const fov = "fov" in camera ? camera.fov : 32;
      const fitted = fitDistance(direction, look, scenePoints(timeline.stepIndex), size.width, size.height, fov, timeline.stepIndex, offset.length());
      looked.current.copy(fitted.look);
      gsap.killTweensOf(desired.current);
      gsap.to(desired.current, {
        x: fitted.position.x,
        y: fitted.position.y,
        z: fitted.position.z,
        duration: 1.7,
        ease: "power2.inOut",
      });
    }
    camera.position.copy(desired.current);
    camera.lookAt(looked.current);
  }, 1);

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enablePan={false}
      minDistance={3.2}
      maxDistance={18}
      minPolarAngle={0.4}
      maxPolarAngle={Math.PI / 2.08}
      enableDamping
      dampingFactor={0.08}
      autoRotateSpeed={0.16}
      onStart={() => {
        userTurning.current = true;
        resumeAt.current = Number.POSITIVE_INFINITY;
      }}
      onEnd={() => {
        userTurning.current = false;
        resumeAt.current = performance.now() + 3000;
      }}
    />
  );
}

function SweepLight() {
  const light = useRef<SpotLight>(null);
  const target = useRef<Object3D>(null);
  useLayoutEffect(() => {
    if (light.current && target.current) light.current.target = target.current;
  }, []);
  useFrame(() => {
    const timeline = readTimeline();
    const on = timeline.running && timeline.stepIndex === 0;
    const sweep = on ? Math.sin(Math.min(1, timeline.local) * Math.PI) : 0;
    if (light.current) {
      light.current.intensity = sweep * 2.4;
      light.current.position.set(-5.2 + timeline.local * 10, 5.4, 3.4);
    }
    target.current?.position.set(-3.2 + timeline.local * 6.4, -0.55, 0);
  });
  return (
    <>
      <spotLight ref={light} angle={0.62} penumbra={1} color="#f7f1e8" intensity={0} distance={20} decay={2} />
      <object3D ref={target} />
    </>
  );
}

function SlideAssembly({ caseData, texture, showIhc }: { caseData: CaseFile; texture: Texture; showIhc: boolean }) {
  const aspect = caseData.slide.height / caseData.slide.width;
  return (
    <group position={[0, SLIDE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={0.78}>
      <Focus id="slide" showIhc={showIhc}>
        <RoundedBox args={[6.55, 6.55 * aspect + 0.18, 0.06]} radius={0.02} smoothness={2} position={[0, 0, -0.07]}>
          <meshStandardMaterial color={GRAPHITE} roughness={0.94} metalness={0.06} />
        </RoundedBox>
        <TileTerrain caseData={caseData} texture={texture} />
        <SlideGrid aspect={aspect} />
      </Focus>
      <Focus id="needles" showIhc={showIhc}>
        <Needles caseData={caseData} />
      </Focus>
    </group>
  );
}

function TileTerrain({ caseData, texture }: { caseData: CaseFile; texture: Texture }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const colors = useMemo(() => caseData.tiles.map(() => new Color()), [caseData]);
  const maxAttention = useMemo(() => Math.max(...caseData.tiles.map((tile) => tile.attn), 1e-9), [caseData]);
  const ranks = useMemo(() => {
    const order = caseData.tiles.map((tile, index) => ({ index, attn: tile.attn }));
    order.sort((a, b) => b.attn - a.attn);
    const rank = new Map<number, number>();
    order.forEach((item, index) => rank.set(item.index, index));
    return rank;
  }, [caseData]);
  const aspect = caseData.slide.height / caseData.slide.width;
  const geometry = useMemo(() => {
    const next = new BoxGeometry(1, 1, 1);
    const offsets = new Float32Array(caseData.tiles.length * 2);
    const scales = new Float32Array(caseData.tiles.length * 2);
    const sweep = new Float32Array(caseData.tiles.length);
    const ranked = caseData.tiles.map((tile, index) => ({ index, key: tile.x * 10000 + tile.y }));
    ranked.sort((a, b) => a.key - b.key);
    ranked.forEach((item, order) => {
      sweep[item.index] = order / Math.max(1, caseData.tiles.length - 1);
    });
    caseData.tiles.forEach((tile, index) => {
      offsets[index * 2] = tile.x / caseData.slide.width;
      offsets[index * 2 + 1] = 1 - (tile.y + tile.h) / caseData.slide.height;
      scales[index * 2] = tile.w / caseData.slide.width;
      scales[index * 2 + 1] = tile.h / caseData.slide.height;
    });
    next.setAttribute("uvOffset", new InstancedBufferAttribute(offsets, 2));
    next.setAttribute("uvScale", new InstancedBufferAttribute(scales, 2));
    next.setAttribute("aOrder", new InstancedBufferAttribute(sweep, 1));
    return next;
  }, [caseData]);
  const materials = useMemo(() => {
    const side = new MeshBasicMaterial({ color: 0xffffff });
    side.userData.skipFade = true;
    const top = new ShaderMaterial({
      uniforms: { map: { value: null }, uDim: { value: 1 }, uSweep: { value: 1 } },
      vertexShader: `
        attribute vec2 uvOffset;
        attribute vec2 uvScale;
        attribute float aOrder;
        varying vec2 vCropUv;
        varying float vOrder;
        void main() {
          vCropUv = uvOffset + uv * uvScale;
          vOrder = aOrder;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform float uDim;
        uniform float uSweep;
        varying vec2 vCropUv;
        varying float vOrder;
        void main() {
          vec4 texel = texture2D(map, vCropUv);
          float on = smoothstep(vOrder - 0.015, vOrder + 0.04, uSweep);
          vec3 color = mix(texel.rgb * 0.55, texel.rgb, on);
          gl_FragColor = vec4(color * mix(0.45, 1.0, uDim), 1.0);
        }
      `,
    });
    top.userData.skipFade = true;
    top.toneMapped = false;
    return { side, top, list: [side, side, side, side, top, side] as Material[] };
  }, []);

  useEffect(() => {
    materials.top.uniforms.map.value = texture;
  }, [materials, texture]);

  useEffect(() => {
    mesh.current?.instanceMatrix.setUsage(DynamicDrawUsage);
    return () => {
      geometry.dispose();
      materials.side.dispose();
      materials.top.dispose();
    };
  }, [geometry, materials]);

  useFrame(() => {
    const target = mesh.current;
    if (!target) return;
    const timeline = readTimeline();
    const scene = timeline.running ? timeline.stepIndex : -1;
    const sweep = !timeline.running || scene > 1 ? 1 : scene === 1 ? Math.min(1, timeline.local / 0.5) : 1;
    const terrain = scene >= 3 ? (scene === 3 ? timeline.local : 1) : 0;
    const fade = focusLevel("slide", timeline);
    materials.top.uniforms.uSweep.value = sweep;
    materials.top.uniforms.uDim.value = fade;
    caseData.tiles.forEach((tile, index) => {
      const nx = ((tile.x + tile.w / 2) / caseData.slide.width - 0.5) * 6.25;
      const ny = (0.5 - (tile.y + tile.h / 2) / caseData.slide.height) * 6.25 * aspect;
      const gap = scene === 1 ? 1.004 - timeline.local * 0.07 : 1.006;
      const width = (tile.w / caseData.slide.width) * 6.25 * gap;
      const height = (tile.h / caseData.slide.height) * 6.25 * aspect * gap;
      const attention = tile.attn / maxAttention;
      const rank = ranks.get(index) ?? 99;
      const lift = scene === 7 && rank < 6 ? (0.55 - rank * 0.06) * timeline.local : 0;
      const depth = 0.04 + attention * terrain * 0.95 + lift;
      dummy.position.set(nx, ny, depth / 2);
      dummy.scale.set(width, height, depth);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      target.setMatrixAt(index, dummy.matrix);
      if (terrain > 0.04) {
        const [r, g, b] = spectralRgb(attention);
        colors[index].setRGB(r / 255, g / 255, b / 255);
      } else colors[index].setRGB(0.16, 0.16, 0.18);
      colors[index].multiplyScalar(0.35 + fade * 0.65);
      target.setColorAt(index, colors[index]);
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, materials.list, caseData.tiles.length]} frustumCulled={false} />;
}

function SlideGrid({ aspect }: { aspect: number }) {
  const points = useMemo(() => {
    const pairs: Array<[number, number, number]> = [];
    const cols = 18;
    const rows = 12;
    const w = 6.2;
    const h = 6.2 * aspect;
    for (let i = 0; i <= cols; i += 1) {
      const x = -w / 2 + (w * i) / cols;
      pairs.push([x, -h / 2, -0.012], [x, h / 2, -0.012]);
    }
    for (let i = 0; i <= rows; i += 1) {
      const y = -h / 2 + (h * i) / rows;
      pairs.push([-w / 2, y, -0.012], [w / 2, y, -0.012]);
    }
    return pairs;
  }, [aspect]);
  const ref = useRef<Line2>(null);
  useFrame(() => {
    const material = ref.current?.material;
    if (!material || Array.isArray(material)) return;
    material.transparent = true;
    const timeline = readTimeline();
    const scene = timeline.running ? timeline.stepIndex : -1;
    material.opacity = scene === 1 ? timeline.local * 0.8 : scene > 1 ? 0.16 : 0;
  });
  return (
    <Line
      ref={ref}
      points={points}
      segments
      color="#e6e6ea"
      lineWidth={1}
      worldUnits={false}
      toneMapped={false}
      transparent
      depthWrite={false}
    />
  );
}

function Needles({ caseData }: { caseData: CaseFile }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const material = useMemo(() => {
    const next = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      vertexShader: `
        varying float vT;
        varying vec3 vColor;
        void main() {
          vT = position.z + 0.5;
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vT;
        varying vec3 vColor;
        void main() {
          float alpha = smoothstep(0.0, 0.22, vT) * mix(0.15, 0.95, vT);
          vec3 color = mix(vColor * 0.45, vColor, vT);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    next.userData.skipFade = true;
    return next;
  }, []);
  const norms = caseData.tileEmbedding?.norm ?? caseData.tiles.map((tile) => tile.attn);
  const maxNorm = useMemo(() => Math.max(...norms, 1e-9), [norms]);
  const pcaSpan = useMemo(() => {
    const column = caseData.tileEmbedding?.pca.map((row) => row[0]) ?? caseData.tiles.map((tile) => tile.attn);
    return { min: Math.min(...column), max: Math.max(...column), column };
  }, [caseData]);
  const aspect = caseData.slide.height / caseData.slide.width;
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ camera, size }) => {
    const target = mesh.current;
    if (!target) return;
    const timeline = readTimeline();
    const scene = timeline.running ? timeline.stepIndex : -1;
    const embed = scene === 2 || scene === 3;
    const idle = !timeline.running;
    target.visible = embed || idle;
    if (!embed && !idle) return;
    const rise = scene === 2 ? timeline.local : embed ? 1 : 0.34;
    const anchor = target.getWorldPosition(dummy.position);
    const distance = Math.max(0.5, camera.position.distanceTo(anchor));
    const fov = "fov" in camera ? (camera.fov * Math.PI) / 180 : 0.55;
    const thickness = Math.max(0.0045, (1.5 * 2 * Math.tan(fov / 2) * distance) / Math.max(1, size.height));
    caseData.tiles.forEach((tile, index) => {
      const nx = ((tile.x + tile.w / 2) / caseData.slide.width - 0.5) * 6.25;
      const ny = (0.5 - (tile.y + tile.h / 2) / caseData.slide.height) * 6.25 * aspect;
      const unit = (norms[index] ?? tile.attn) / maxNorm;
      const height = rise * (0.16 + unit * 0.7);
      dummy.position.set(nx, ny, 0.04 + height / 2);
      dummy.scale.set(thickness, thickness, Math.max(0.001, height));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      target.setMatrixAt(index, dummy.matrix);
      const span = pcaSpan.max - pcaSpan.min || 1;
      const [r, g, b] = spectralRgb(((pcaSpan.column[index] ?? 0) - pcaSpan.min) / span);
      COLOR_SCRATCH.setRGB(r / 255, g / 255, b / 255);
      target.setColorAt(index, COLOR_SCRATCH);
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, caseData.tiles.length]} material={material} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

function Streams({ caseData }: { caseData: CaseFile }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const start = useMemo(() => new Vector3(), []);
  const end = useMemo(() => new Vector3(), []);
  const aspect = caseData.slide.height / caseData.slide.width;
  const count = Math.min(40, caseData.tiles.length);
  useFrame((state) => {
    const target = mesh.current;
    if (!target) return;
    const timeline = readTimeline();
    const scene = timeline.running ? timeline.stepIndex : -1;
    const on = scene === 2 || scene === 3;
    target.visible = on;
    if (!on) return;
    end.set(0, scene === 2 ? 0.85 : 1.85, 0);
    for (let index = 0; index < count; index += 1) {
      const tile = caseData.tiles[Math.floor((index / count) * caseData.tiles.length)];
      const nx = ((tile.x + tile.w / 2) / caseData.slide.width - 0.5) * 6.25;
      const ny = (0.5 - (tile.y + tile.h / 2) / caseData.slide.height) * 6.25 * aspect;
      start.set(nx, SLIDE_Y + 0.2, -ny);
      const travel = (timeline.local * 0.85 + index / count + state.clock.elapsedTime * 0.08) % 1;
      dummy.position.lerpVectors(start, end, travel);
      dummy.scale.setScalar(0.035);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      target.setMatrixAt(index, dummy.matrix);
    }
    target.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={ROSE} toneMapped={false} />
    </instancedMesh>
  );
}

function ClinicalSlab({ caseData }: { caseData: CaseFile }) {
  const [hover, setHover] = useState(false);
  const { bars, label } = clinicalBars(caseData.clinical);
  return (
    <group position={[-2.55, -0.15, -0.7]} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
      <mesh>
        <boxGeometry args={[1.7, 0.08, 1.05]} />
        <meshStandardMaterial color={GRAPHITE} roughness={0.95} metalness={0.05} />
        <WireBox size={[1.7, 0.08, 1.05]} color={AMBER} lineWidth={1.25} />
      </mesh>
      {bars.map((value, index) => (
        <mesh key={index} position={[-0.54 + index * 0.36, 0.08 + value * 0.28, 0]}>
          <boxGeometry args={[0.06, 0.12 + value * 0.55, 0.06]} />
          <meshBasicMaterial color={AMBER} toneMapped={false} />
        </mesh>
      ))}
      {hover ? (
        <Html position={[0, 0.85, 0]} style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
          <div className="rounded-md bg-black/85 px-2 py-1 font-mono text-[11px] font-medium whitespace-nowrap text-white antialiased">{label}</div>
        </Html>
      ) : null}
    </group>
  );
}

function GeneHelix({ caseData }: { caseData: CaseFile }) {
  const group = useRef<Group>(null);
  const [geneLabel, setGeneLabel] = useState<string | null>(null);
  const strands = useMemo(() => [0, Math.PI].map((phase) => {
    const points: Array<[number, number, number]> = [];
    for (let i = 0; i <= 42; i += 1) {
      const t = i / 42;
      const angle = t * Math.PI * 5 + phase;
      points.push([Math.cos(angle) * 0.34, t * 1.7 - 0.85, Math.sin(angle) * 0.34]);
    }
    return points;
  }), []);
  const maxAbs = Math.max(...caseData.genes.map((gene) => Math.abs(gene.z)), 1);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.14;
  });
  return (
    <group position={[3.7, 0.2, -0.95]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.9, 0.08, 0.9]} />
        <meshStandardMaterial color={GRAPHITE} roughness={0.95} />
        <WireBox size={[0.9, 0.08, 0.9]} color={MINT} lineWidth={1.25} />
      </mesh>
      <group ref={group} position={[0, 0.95, 0]}>
        {strands.map((points) => (
          <Line key={points[0][0]} points={points} color={MINT} lineWidth={1} worldUnits={false} toneMapped={false} />
        ))}
        {caseData.genes.map((gene, index) => {
          const t = caseData.genes.length <= 1 ? 0.5 : index / (caseData.genes.length - 1);
          const y = t * 1.5 - 0.75;
          const length = 0.16 + (Math.abs(gene.z) / maxAbs) * 0.5;
          const mix = (gene.z / maxAbs + 1) / 2;
          COLOR_SCRATCH.set("#8B7CF6").lerp(new Color(MINT), mix);
          const color = `#${COLOR_SCRATCH.getHexString()}`;
          return (
            <mesh
              key={gene.symbol}
              position={[0, y, 0]}
              onPointerOver={(event) => {
                event.stopPropagation();
                setGeneLabel(`${gene.symbol} ${gene.z.toFixed(1)}`);
              }}
              onPointerOut={() => setGeneLabel(null)}
            >
              <boxGeometry args={[length, 0.035, 0.035]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          );
        })}
        {geneLabel ? (
          <Html position={[0.2, 0.95, 0]} style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
            <div className="rounded-md bg-black/85 px-2 py-1 font-mono text-[11px] font-medium whitespace-nowrap text-white antialiased">{geneLabel}</div>
          </Html>
        ) : null}
      </group>
    </group>
  );
}

function MlpStacks({ caseData }: { caseData: CaseFile }) {
  const clinical = splitLayers(caseData.activations?.clin_hidden ?? [], 2);
  const gene = splitLayers(caseData.activations?.gene_hidden ?? [], 2);
  return (
    <group>
      <EdgeSlab position={[-2.15, 0.72, -0.35]} size={[0.62, 0.045, 0.4]} color={AMBER} />
      <ActivationCells position={[-2.15, 0.72, -0.35]} size={[0.62, 0.045, 0.4]} values={clinical[0]} />
      <EdgeSlab position={[-2.15, 0.96, -0.35]} size={[0.46, 0.045, 0.3]} color={AMBER} />
      <ActivationCells position={[-2.15, 0.96, -0.35]} size={[0.46, 0.045, 0.3]} values={clinical[1]} />
      <EdgeSlab position={[2.15, 0.72, -0.35]} size={[0.62, 0.045, 0.4]} color={MINT} />
      <ActivationCells position={[2.15, 0.72, -0.35]} size={[0.62, 0.045, 0.4]} values={gene[0]} />
      <EdgeSlab position={[2.15, 0.96, -0.35]} size={[0.46, 0.045, 0.3]} color={MINT} />
      <ActivationCells position={[2.15, 0.96, -0.35]} size={[0.46, 0.045, 0.3]} values={gene[1]} />
    </group>
  );
}

function ActivationCells({
  values,
  size,
  position,
}: {
  values: number[];
  size: [number, number, number];
  position: [number, number, number];
}) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const scratch = useMemo(() => new Color(), []);
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target || values.length === 0) return;
    const columns = Math.ceil(Math.sqrt(values.length));
    const rows = Math.ceil(values.length / columns);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = Math.max(1e-6, max - min);
    const [width, height, depth] = size;
    const cellW = (width * 0.86) / columns;
    const cellD = (depth * 0.86) / rows;
    values.forEach((value, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      dummy.position.set(-width * 0.43 + cellW * (column + 0.5), height / 2 + 0.012, -depth * 0.43 + cellD * (row + 0.5));
      dummy.scale.set(Math.max(0.012, cellW * 0.72), 0.012, Math.max(0.012, cellD * 0.72));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      target.setMatrixAt(index, dummy.matrix);
      const bright = (value - min) / span;
      target.setColorAt(index, scratch.setRGB(bright, bright, bright));
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  }, [dummy, scratch, size, values]);
  if (values.length === 0) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, values.length]} position={position} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

function splitLayers(values: number[], parts: number): number[][] {
  if (parts <= 1) return [values];
  const size = Math.ceil(values.length / parts);
  return Array.from({ length: parts }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function trunkSlices(values: number[]): number[][] {
  if (values.length === 224) return [[], values.slice(0, 128), values.slice(128, 192), values.slice(192)];
  const counts = [0, 128, 64, 32];
  const budget = counts.reduce((sum, count) => sum + count, 0);
  let cursor = 0;
  return counts.map((count, index) => {
    if (count === 0) return [];
    const length = index === counts.length - 1 ? values.length - cursor : Math.round((count / budget) * values.length);
    const slice = values.slice(cursor, cursor + length);
    cursor += length;
    return slice;
  });
}

function boxEdges(size: [number, number, number]): Array<[number, number, number]> {
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const corners: Array<[number, number, number]> = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ];
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  return pairs.flatMap(([from, to]) => [corners[from], corners[to]]);
}

function WireBox({
  size,
  color,
  lineWidth,
  dashed = false,
}: {
  size: [number, number, number];
  color: string;
  lineWidth: number;
  dashed?: boolean;
}) {
  const points = useMemo(() => boxEdges(size), [size]);
  return (
    <Line
      points={points}
      segments
      color={color}
      lineWidth={lineWidth}
      worldUnits={false}
      dashed={dashed}
      dashSize={0.14}
      gapSize={0.08}
      toneMapped={false}
    />
  );
}
function EdgeSlab({ position, size, color }: { position: [number, number, number]; size: [number, number, number]; color: string }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={GRAPHITE} roughness={0.96} metalness={0.04} />
      <WireBox size={size} color={color} lineWidth={2} />
    </mesh>
  );
}

function DashedBox({ position, size, color }: { position: [number, number, number]; size: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <WireBox size={size} color={color} lineWidth={1.25} dashed />
    </group>
  );
}

function Transformer() {
  const cls = useRef<Mesh>(null);
  useFrame(() => {
    const timeline = readTimeline();
    const bright = timeline.running && timeline.stepIndex === 3 ? 0.65 + timeline.local * 0.7 : 0.4;
    if (cls.current) cls.current.scale.setScalar(bright);
  });
  return (
    <group position={[0, 1.55, 0]}>
      {[0, 1, 2, 3].map((layer) => (
        <EdgeSlab key={layer} position={[0, layer * 0.28, 0]} size={[2.15 - layer * 0.12, 0.045, 1.15]} color={VIOLET} />
      ))}
      <mesh ref={cls} position={[0.82, 0.84, 0]}>
        <octahedronGeometry args={[0.075, 0]} />
        <meshBasicMaterial color={VIOLET} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Tokens({ showIhc, matrix, caseData }: { showIhc: boolean; matrix: number[][]; caseData: CaseFile }) {
  const diag = [
    matrix[0]?.[0] ?? 0,
    matrix[1]?.[1] ?? 0,
    matrix[2]?.[2] ?? 0,
  ];
  const tokens = caseData.tokens;
  return (
    <>
      <Token id="clinicalToken" color={AMBER} showIhc={showIhc} glow={diag[0]} values={tokens?.clinical ?? []} />
      <Token id="geneToken" color={MINT} showIhc={showIhc} glow={diag[1]} values={tokens?.gene ?? []} />
      <Token id="wsi" color={ROSE} showIhc={showIhc} glow={diag[2]} values={tokens?.wsi ?? []} />
    </>
  );
}

function Token({ id, color, showIhc, glow, values }: { id: "clinicalToken" | "geneToken" | "wsi"; color: string; showIhc: boolean; glow: number; values: number[] }) {
  const ref = useRef<Group>(null);
  const glowRef = useRef<Mesh>(null);
  const goal = useMemo(() => new Vector3(), []);
  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    const timeline = readTimeline();
    const scene = timeline.running ? timeline.stepIndex : -1;
    const stacked = scene >= 5;
    if (id === "clinicalToken") goal.set(stacked ? 0 : -2.15, stacked ? TOKEN_Y[0] : 0.42, stacked ? 0 : 0.2);
    else if (id === "geneToken") goal.set(stacked ? 0 : 2.15, stacked ? TOKEN_Y[1] : 0.42, stacked ? 0 : 0.2);
    else goal.set(0, stacked ? TOKEN_Y[2] : 2.72, 0);
    liveToken[id].copy(group.position);
    if (glowRef.current) glowRef.current.visible = scene === 5;
    if (!timeline.running || !introduced(id, scene)) {
      group.position.copy(goal);
      liveToken[id].copy(goal);
      return;
    }
    group.position.x = MathUtils.damp(group.position.x, goal.x, 4.5, delta);
    group.position.y = MathUtils.damp(group.position.y, goal.y, 4.5, delta);
    group.position.z = MathUtils.damp(group.position.z, goal.z, 4.5, delta);
    liveBounds[id].setFromCenterAndSize(group.position, new Vector3(2.05, 0.42, 0.16));
  });
  return (
    <Focus id={id} showIhc={showIhc}>
      <group ref={ref}>
        <mesh ref={glowRef} position={[0, 0, -0.08]} visible={false}>
          <planeGeometry args={[2.35, 0.52]} />
          <meshBasicMaterial color={color} transparent opacity={Math.min(0.34, 0.06 + glow * 0.4)} depthWrite={false} toneMapped={false} />
        </mesh>
        <Barcode color={color} values={values} />
      </group>
    </Focus>
  );
}

function Barcode({ color, values }: { color: string; values: number[] }) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1e-6);
  useFrame(({ camera, size }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const anchor = mesh.getWorldPosition(dummy.position);
    const distance = Math.max(0.5, camera.position.distanceTo(anchor));
    const fov = "fov" in camera ? (camera.fov * Math.PI) / 180 : 0.55;
    const min = (1.5 * 2 * Math.tan(fov / 2) * distance) / Math.max(1, size.height);
    const width = 1.9;
    const count = Math.max(values.length, 1);
    for (let index = 0; index < count; index += 1) {
      const signed = (values[index] ?? 0) / maxAbs;
      const magnitude = Math.max(min, Math.abs(signed) * 0.28);
      const bar = Math.max((width / count) * 0.55, min);
      dummy.position.set(-width / 2 + (index + 0.5) * (width / count), signed >= 0 ? magnitude / 2 : -magnitude / 2, 0);
      dummy.scale.set(bar, magnitude, Math.max(0.02, min));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  const count = Math.max(values.length, 1);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry />
      <meshStandardMaterial color="#000000" emissive={color} emissiveIntensity={1} roughness={1} metalness={0} toneMapped={false} />
    </instancedMesh>
  );
}

function symmetrised(matrix: number[][], row: number, column: number) {
  return ((matrix[row]?.[column] ?? 0) + (matrix[column]?.[row] ?? 0)) / 2;
}

function AttentionCurves({ matrix }: { matrix: number[][] }) {
  const built = useMemo(() => {
    if (matrix.length !== 3 || matrix.some((row) => row.length !== 3)) return [];
    const left = -1.08;
    const pairs = [
      [0, 1],
      [1, 2],
      [0, 2],
    ] as const;
    return pairs.map(([from, to]) => {
      const weight = symmetrised(matrix, from, to);
      const start = new Vector3(left, TOKEN_Y[from], 0);
      const end = new Vector3(left, TOKEN_Y[to], 0);
      const mid = new Vector3(left - 0.42 - weight * 0.7, (TOKEN_Y[from] + TOKEN_Y[to]) / 2, 0);
      const curve = new CatmullRomCurve3([start, mid, end]);
      const geometry = new TubeGeometry(curve, 28, 0.004 + weight * 0.022, 5, false);
      return { curve, geometry, weight, count: Math.max(2, Math.round(2 + weight * 8)) };
    });
  }, [matrix]);
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const point = useMemo(() => new Vector3(), []);
  useEffect(() => () => built.forEach((item) => item.geometry.dispose()), [built]);
  useFrame((state) => {
    const target = mesh.current;
    if (!target || built.length === 0) return;
    const timeline = readTimeline();
    const on = timeline.running && timeline.stepIndex === 5;
    target.visible = on;
    if (!on) return;
    built.forEach((item, curveIndex) => {
      for (let index = 0; index < 10; index += 1) {
        const visible = index < item.count;
        const t = (state.clock.elapsedTime * (0.08 + item.weight * 0.12) + index / item.count) % 1;
        item.curve.getPoint(visible ? t : 0, point);
        dummy.position.copy(point);
        dummy.scale.setScalar(visible ? 0.028 : 0);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        target.setMatrixAt(curveIndex * 10 + index, dummy.matrix);
      }
    });
    target.instanceMatrix.needsUpdate = true;
  });
  if (built.length === 0) return null;
  return (
    <group>
      {built.map((item) => (
        <mesh key={item.geometry.uuid} geometry={item.geometry}>
          <meshBasicMaterial color={VIOLET} transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
      <instancedMesh ref={mesh} args={[undefined, undefined, built.length * 10]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#d9d4ff" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Trunk({ caseData }: { caseData: CaseFile }) {
  const slices = trunkSlices(caseData.activations?.trunk ?? []);
  return (
    <group position={[0, TRUNK_Y, 0]}>
      {TRUNK_WIDTHS.map((width, index) => (
        <group key={TRUNK_LABELS[index]}>
          <EdgeSlab position={[0, index * TRUNK_STEP, 0]} size={[width, 0.04, 0.62]} color={VIOLET} />
          <ActivationCells position={[0, index * TRUNK_STEP, 0]} size={[width, 0.04, 0.62]} values={slices[index] ?? []} />
        </group>
      ))}
    </group>
  );
}

function Gauges({ caseData, showIhc }: { caseData: CaseFile; showIhc: boolean }) {
  const fills = useRef<(Mesh | null)[]>([]);
  const fillGeometry = useMemo(() => {
    const geometry = new CylinderGeometry(0.052, 0.052, 1, 20);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const top = new Color("#ffb0aa");
    const bottom = new Color("#d23b42");
    for (let index = 0; index < position.count; index += 1) {
      const mix = position.getY(index) + 0.5;
      COLOR_SCRATCH.copy(bottom).lerp(top, mix);
      colors[index * 3] = COLOR_SCRATCH.r;
      colors[index * 3 + 1] = COLOR_SCRATCH.g;
      colors[index * 3 + 2] = COLOR_SCRATCH.b;
    }
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return geometry;
  }, []);
  useEffect(() => () => fillGeometry.dispose(), [fillGeometry]);
  useFrame(() => {
    RECEPTORS.forEach((receptor, index) => {
      const mesh = fills.current[index];
      if (!mesh) return;
      const shown = Math.max(0.001, shownProbability(caseData.pred[receptor]));
      mesh.scale.y = shown * GAUGE_H;
      mesh.position.y = -GAUGE_H / 2 + (GAUGE_H * shown) / 2;
    });
  });
  return (
    <group position={[0, GAUGE_Y, 0]}>
      {RECEPTORS.map((receptor, index) => (
        <group key={receptor} position={[GAUGE_X[index], 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.09, 0.09, GAUGE_H, 28, 1, true]} />
            <meshBasicMaterial color="#f4f4f6" transparent opacity={0.07} depthWrite={false} side={DoubleSide} toneMapped={false} />
          </mesh>
          <mesh position={[0, GAUGE_H / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.09, 0.008, 8, 28]} />
            <meshBasicMaterial color={CORAL} toneMapped={false} />
          </mesh>
          <mesh position={[0, -GAUGE_H / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.09, 0.008, 8, 28]} />
            <meshBasicMaterial color={CORAL} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[0.24, 0.012, 0.012]} />
            <meshBasicMaterial color="#f2f2f4" toneMapped={false} />
          </mesh>
          <mesh
            ref={(node) => {
              fills.current[index] = node;
            }}
            geometry={fillGeometry}
            position={[0, -GAUGE_H / 2, 0]}
          >
            <meshBasicMaterial
              vertexColors
              toneMapped={false}
              ref={(material) => {
                if (material) material.userData.skipFade = true;
              }}
            />
          </mesh>
          {receptor === "HER2" ? (
            <>
              <EdgeSlab position={[0, -GAUGE_H / 2 - 0.1, 0]} size={[0.46, 0.028, 0.3]} color={CORAL} />
              <EdgeSlab position={[0, -GAUGE_H / 2 - 0.22, 0]} size={[0.56, 0.028, 0.36]} color={CORAL} />
              <ActivationCells position={[0, -GAUGE_H / 2 - 0.22, 0]} size={[0.56, 0.028, 0.36]} values={caseData.activations?.her2_hidden ?? []} />
            </>
          ) : (
            <EdgeSlab position={[0, -GAUGE_H / 2 - 0.12, 0]} size={[0.42, 0.028, 0.28]} color={CORAL} />
          )}
          {showIhc ? (
            <mesh position={[0.14, caseData.ihc[receptor] ? GAUGE_H * 0.32 : -GAUGE_H * 0.32, 0]}>
              <boxGeometry args={[0.12, 0.012, 0.04]} />
              <meshBasicMaterial color={AMBER} toneMapped={false} />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  );
}

function OverlayDriver({
  caseData,
  overlayRef,
  attentionHead,
}: {
  caseData: CaseFile;
  overlayRef: RefObject<HTMLDivElement | null>;
  attentionHead: number | "avg";
}) {
  const scratch = useMemo(() => new Vector3(), []);
  const placed = useRef(0);
  const sceneStamp = useRef(-2);
    useFrame(({ camera, size }) => {
    const root = overlayRef.current;
    if (!root || size.width < 2) return;
    const now = performance.now();
    const timeline = readTimeline();
    const scene = timeline.running ? timeline.stepIndex : -1;
    if (sceneStamp.current !== scene) {
      sceneStamp.current = scene;
      placed.current = 0;
    }
    const fade = timeline.running ? Math.min(1, Math.max(0, (timeline.local - 0.34) / 0.16)) : 0;
    const bottom = scene === 7 ? 190 : 110;
    const refresh = now - placed.current > 90;
    if (refresh) placed.current = now;

    const callouts = [0, 1].map((index) => root.querySelector<HTMLElement>(`[data-callout="${index}"]`));
    const leaders = [0, 1].map((index) => root.querySelector<SVGLineElement>(`[data-leader="${index}"]`));
    callouts.forEach((node, index) => {
      if (!node || !leaders[index]) return;
      if (!refresh && node.style.opacity !== "0") return;
      node.style.opacity = "0";
      leaders[index]!.style.opacity = "0";
    });

    if (scene >= 0 && scene !== 6 && scene !== 7 && fade > 0 && refresh) {
      const specs = scene === 4
        ? [
            { kicker: "MLP", line: "Clinical branch", prefer: "left" as const, box: branchBounds("clinical") },
            { kicker: "MLP", line: "Gene branch", prefer: "right" as const, box: branchBounds("gene") },
          ]
        : [{ kicker: MICRO[scene].kicker, line: MICRO[scene].line, prefer: "top" as const, box: storyBounds(scene) }];
      const obstacles = activeBounds(scene).map((box) => projectBounds(box[0], box[1], camera, size.width, size.height, scratch)).filter((rect): rect is ScreenRect => rect !== null);
      const used: ScreenRect[] = [];
      specs.forEach((spec, index) => {
        const node = callouts[index];
        const leader = leaders[index];
        if (!node || !leader) return;
        const object = projectBounds(spec.box[0], spec.box[1], camera, size.width, size.height, scratch);
        if (!object) return;
        const spot = chooseCallout(object, spec.prefer, [...obstacles, ...used], size.width, size.height, bottom);
        if (!spot) return;
        const kicker = node.querySelector("[data-kicker]");
        const line = node.querySelector("[data-line]");
        if (kicker) kicker.textContent = spec.kicker;
        if (line) line.textContent = spec.line;
        const note = node.querySelector<HTMLElement>("[data-note]");
        if (note) {
          const text = illustrativeNote(scene, caseData, attentionHead);
          note.textContent = text;
          note.style.display = text ? "block" : "none";
        }
        node.style.opacity = fade.toFixed(3);
        node.style.left = `${Math.round(spot.x)}px`;
        node.style.top = `${Math.round(spot.y)}px`;
        const lead = leaderEnds(spot, object);
        leader.style.opacity = fade.toFixed(3);
        leader.setAttribute("x1", Math.round(lead.x1).toString());
        leader.setAttribute("y1", Math.round(lead.y1).toString());
        leader.setAttribute("x2", Math.round(lead.x2).toString());
        leader.setAttribute("y2", Math.round(lead.y2).toString());
        used.push(spot);
      });
    }

    let gaugeLabelBottom = 0;
    RECEPTORS.forEach((receptor) => {
      const node = root.querySelector<HTMLElement>(`[data-gauge="${receptor}"]`);
      if (!node) return;
      const value = node.querySelector("[data-value]");
      if (scene === 6) {
        const progress = predictionProgress();
        const probability = caseData.pred[receptor];
        if (value) value.textContent = progress >= 1 ? probability.toFixed(3) : shownProbability(probability).toFixed(3);
      }
      if (scene !== 6 || fade <= 0) {
        node.style.opacity = "0";
        return;
      }
      const index = RECEPTORS.indexOf(receptor);
      const rect = projectBounds(
        new Vector3(GAUGE_X[index] - 0.12, GAUGE_Y - GAUGE_H / 2 - 0.42, -0.12),
        new Vector3(GAUGE_X[index] + 0.12, GAUGE_Y + GAUGE_H / 2, 0.12),
        camera,
        size.width,
        size.height,
        scratch,
      );
      if (!rect) {
        node.style.opacity = "0";
        return;
      }
      const width = 56;
      const height = 36;
      let top = rect.b + 12;
      if (top + height > size.height - bottom) top = Math.max(rect.b + 12, size.height - bottom - height);
      node.style.opacity = fade.toFixed(3);
      node.style.left = `${Math.round((rect.x + rect.r) / 2 - width / 2)}px`;
      node.style.top = `${Math.round(top)}px`;
      node.style.width = `${width}px`;
      gaugeLabelBottom = Math.max(gaugeLabelBottom, top + height);
    });

    TRUNK_LABELS.forEach((label, index) => {
      const node = root.querySelector<HTMLElement>(`[data-trunk="${label}"]`);
      if (!node) return;
      if (scene !== 6 || fade <= 0) {
        node.style.opacity = "0";
        return;
      }
      scratch.set(TRUNK_WIDTHS[index] / 2, TRUNK_Y + index * TRUNK_STEP, 0).project(camera);
      const x = (scratch.x * 0.5 + 0.5) * size.width + 8;
      const y = (-scratch.y * 0.5 + 0.5) * size.height - 6;
      if (y < 64 || y > size.height - bottom) {
        node.style.opacity = "0";
        return;
      }
      node.style.opacity = fade.toFixed(3);
      node.style.left = `${Math.round(x)}px`;
      node.style.top = `${Math.round(y)}px`;
    });

    const half = root.querySelector<HTMLElement>("[data-half]");
    if (half) {
      if (scene !== 6 || fade <= 0) half.style.opacity = "0";
      else {
        scratch.set(GAUGE_X[0] - 0.18, GAUGE_Y, 0).project(camera);
        const x = (scratch.x * 0.5 + 0.5) * size.width;
        const y = (-scratch.y * 0.5 + 0.5) * size.height;
        half.style.opacity = fade.toFixed(3);
        half.style.left = `${Math.round(x - 28)}px`;
        half.style.top = `${Math.round(y - 6)}px`;
      }
    }

    const replay = root.querySelector<HTMLElement>("[data-replay]");
    if (replay) {
      if (scene !== 6 || fade <= 0) replay.style.opacity = "0";
      else {
        const x = size.width / 2;
        const y = gaugeLabelBottom + 2;
        replay.style.opacity = fade.toFixed(3);
        replay.style.left = `${Math.round(x)}px`;
        replay.style.top = `${Math.round(y)}px`;
      }
    }
  });
  return null;
}

function illustrativeNote(scene: number, caseData: CaseFile, head: number | "avg"): string {
  if (scene === 2 && isSeeded(caseData, "tileEmbedding")) return "illustrative";
  if (scene === 4 && isSeeded(caseData, "activations")) return "illustrative";
  if (scene === 5 && isSeeded(caseData, "tokens")) return "illustrative";
  if (scene === 5 && head !== "avg" && isSeeded(caseData, "modalityAttentionPerHead")) return "illustrative";
  return "";
}

interface ScreenRect {
  x: number;
  y: number;
  r: number;
  b: number;
}

function branchBounds(side: "clinical" | "gene"): [Vector3, Vector3] {
  if (side === "clinical") return [new Vector3(-3.5, -0.4, -1.35), new Vector3(-1.1, 1.15, 0.35)];
  return [new Vector3(1.15, -0.1, -1.45), new Vector3(4.2, 2.15, 0.35)];
}

function tokenBounds(id: keyof typeof liveToken): [Vector3, Vector3] {
  const center = liveToken[id];
  return [
    new Vector3(center.x - 1.02, center.y - 0.18, center.z - 0.08),
    new Vector3(center.x + 1.02, center.y + 0.18, center.z + 0.08),
  ];
}

function storyBounds(scene: number): [Vector3, Vector3] {
  if (scene === 2) return [new Vector3(-1.2, 0.45, -0.7), new Vector3(1.2, 1.3, 0.7)];
  if (scene === 3) return [new Vector3(-1.15, 1.4, -0.6), new Vector3(1.15, 2.55, 0.6)];
  if (scene === 5) return [new Vector3(-1.05, TOKEN_Y[2] - 0.2, -0.1), new Vector3(1.05, TOKEN_Y[0] + 0.2, 0.1)];
  return [new Vector3(-2.35, -1.0, -1.55), new Vector3(2.35, -0.12, 1.55)];
}

function activeBounds(scene: number): Array<[Vector3, Vector3]> {
  const slide: [Vector3, Vector3] = [new Vector3(-2.45, -1.02, -1.65), new Vector3(2.45, -0.08, 1.65)];
  if (scene === 0) return [slide, [new Vector3(-3.5, -0.4, -1.4), new Vector3(-1.5, 1.1, 0.1)], [new Vector3(1.7, -0.2, -1.4), new Vector3(3.4, 2.0, 0.1)]];
  if (scene === 1 || scene === 7) return [slide];
  if (scene === 2) return [slide, storyBounds(2)];
  if (scene === 3) return [slide, storyBounds(3), tokenBounds("wsi")];
  if (scene === 4) return [branchBounds("clinical"), branchBounds("gene"), tokenBounds("wsi"), slide, storyBounds(3)];
  if (scene === 5) return [tokenBounds("clinicalToken"), tokenBounds("geneToken"), tokenBounds("wsi"), [new Vector3(-2.2, TOKEN_Y[2], -0.2), new Vector3(-1.05, TOKEN_Y[0], 0.2)]];
  return [];
}

function projectBounds(min: Vector3, max: Vector3, camera: Camera, width: number, height: number, scratch: Vector3): ScreenRect | null {
  let x = Infinity;
  let y = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  let seen = 0;
  for (let index = 0; index < 8; index += 1) {
    scratch.set(index & 1 ? max.x : min.x, index & 2 ? max.y : min.y, index & 4 ? max.z : min.z);
    const viewZ = scratch.clone().applyMatrix4(camera.matrixWorldInverse).z;
    if (viewZ > -0.05) continue;
    const projected = scratch.clone().project(camera);
    const sx = (projected.x * 0.5 + 0.5) * width;
    const sy = (-projected.y * 0.5 + 0.5) * height;
    x = Math.min(x, sx);
    y = Math.min(y, sy);
    r = Math.max(r, sx);
    b = Math.max(b, sy);
    seen += 1;
  }
  if (seen < 2) return null;
  return { x, y, r, b };
}

function intersects(a: ScreenRect, b: ScreenRect) {
  return a.x < b.r - 1 && a.r > b.x + 1 && a.y < b.b - 1 && a.b > b.y + 1;
}

function chooseCallout(object: ScreenRect, prefer: "left" | "right" | "top", obstacles: ScreenRect[], width: number, height: number, bottom: number): ScreenRect | null {
  const boxW = 200;
  const boxH = 46;
  const gap = 30;
  const safe = { x: 8, y: 64, r: width - 8, b: height - bottom };
  const order = prefer === "left" ? ["left", "top", "right"] : prefer === "right" ? ["right", "top", "left"] : ["top", "left", "right"];
  const shifts = [0, -72, 72, -144, 144, -216, 216];
  for (const side of order) {
    for (const shift of shifts) {
      const raw = side === "left"
        ? { x: object.x - gap - boxW, y: (object.y + object.b) / 2 - boxH / 2 + shift }
        : side === "right"
          ? { x: object.r + gap, y: (object.y + object.b) / 2 - boxH / 2 + shift }
          : { x: (object.x + object.r) / 2 - boxW / 2 + shift, y: object.y - gap - boxH };
      const rect = {
        x: Math.max(safe.x, Math.min(safe.r - boxW, raw.x)),
        y: Math.max(safe.y, Math.min(safe.b - boxH, raw.y)),
        r: 0,
        b: 0,
      };
      rect.r = rect.x + boxW;
      rect.b = rect.y + boxH;
      if (rect.b > safe.b || rect.y < safe.y || rect.x < safe.x || rect.r > safe.r) continue;
      if (side === "left" && rect.r > object.x - 18) continue;
      if (side === "right" && rect.x < object.r + 18) continue;
      if (side === "top" && rect.b > object.y - 18) continue;
      if (intersects(rect, object) || obstacles.some((item) => intersects(rect, item))) continue;
      const lead = leaderEnds(rect, object);
      if (lead.length < 24) continue;
      return rect;
    }
  }
  return null;
}

function leaderEnds(label: ScreenRect, object: ScreenRect) {
  const from = { x: (label.x + label.r) / 2, y: (label.y + label.b) / 2 };
  if (label.r <= object.x) from.x = label.r;
  else if (label.x >= object.r) from.x = label.x;
  else if (label.b <= object.y) from.y = label.b;
  else from.y = label.y;
  const to = { x: (object.x + object.r) / 2, y: (object.y + object.b) / 2 };
  if (from.x <= object.x) to.x = object.x;
  else if (from.x >= object.r) to.x = object.r;
  if (from.y <= object.y) to.y = object.y;
  else if (from.y >= object.b) to.y = object.b;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const keep = Math.max(0, length - 6);
  const scale = length > 0 ? keep / length : 0;
  return { x1: from.x, y1: from.y, x2: from.x + dx * scale, y2: from.y + dy * scale, length: keep };
}
