import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ClayHead } from "../render/clayHead.ts";
import { Petting } from "../render/petting.ts";
import { drawReadouts } from "../render/readouts.ts";
import { faceHandles, type FaceView, type ViewFlags } from "../render/anatomy.ts";
import { engine } from "../../audio/AudioEngine.ts";
import { sameBody } from "../body.ts";
import { useStore } from "../store.ts";
import { VoiceModel } from "../analysis.ts";
import { useModel } from "../useModel.ts";
import { AnatomyView, articulatorSlots, tractInfo, type InfoFn, type OverlayFn, type SlotsFn } from "./AnatomyView.tsx";
import type { HumanArtic } from "../../wasm/engine.ts";
import type { TelemetryMessage } from "../../worklet/protocol.ts";

/** A recorded voice supplies its own body, articulators and clock on the duet page. */
export interface HeadFeed {
  model: VoiceModel;
  view: ViewFlags;
  frame(): { tele: TelemetryMessage | null; artic: HumanArtic; epoch: number };
  maxDpr?: number;
  facing?: 1 | -1;
}

interface Props {
  slots?: SlotsFn;
  info?: InfoFn;
  showFormants?: boolean;
  overlay?: OverlayFn;
  feed?: HeadFeed;
  readouts?: boolean;
}

function lightStudio(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xfff4e1, 0x998478, 1.55));
  const key = new THREE.DirectionalLight(0xfff1de, 2.1);
  key.position.set(-110, 240, 175);
  key.target.position.set(0, 75, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -124, right: 124, top: 124, bottom: -124, near: 20, far: 550 });
  key.shadow.normalBias = 0.26;
  key.shadow.bias = -0.0002;
  key.shadow.camera.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight(0xc9dfef, 0.60);
  fill.position.set(130, 110, 90);
  const rim = new THREE.DirectionalLight(0xffdfbd, 0.86);
  rim.position.set(70, 190, -65);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.ShadowMaterial({ color: 0x66533f, opacity: 0.24 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.9;
  ground.receiveShadow = true;
  scene.add(key, key.target, fill, rim, ground);
  return () => {
    ground.geometry.dispose();
    ground.material.dispose();
    key.shadow.dispose();
  };
}

function measureStage(w: number, h: number, readouts: boolean) {
  const compact = w < 625;
  const top = readouts && compact ? 58 : 0;
  const bottom = readouts && compact ? 85 : 0;
  const rail = readouts && !compact ? Math.min(235, Math.max(176, w * 0.25)) : 0;
  return { compact, top, width: Math.max(1, w - rail), height: Math.max(1, h - top - bottom) };
}

export function AnatomyView3D(props: Props) {
  const current = useRef(props);
  current.current = props;
  const model = useModel();
  const wrapRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = glRef.current!;
    const overlay = overlayRef.current!;
    const ctx = overlay.getContext("2d")!;
    let gl: THREE.WebGLRenderer;
    try {
      gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }
    gl.setClearColor(0xe8d9bd, 0);
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    const scene = new THREE.Scene();
    const releaseStudio = lightStudio(scene);
    const head = new ClayHead();
    scene.add(head.group);
    const camera = new THREE.OrthographicCamera(-80, 80, 100, -100, 1, 1500);
    const orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = true;
    orbit.minAzimuthAngle = -0.56;
    orbit.maxAzimuthAngle = 0.56;
    orbit.minPolarAngle = Math.PI / 2 - 0.35;
    orbit.maxPolarAngle = Math.PI / 2 + 0.10;
    orbit.minZoom = 0.72;
    orbit.maxZoom = 3.0;
    orbit.zoomSpeed = 0.7;
    orbit.target.set(0, 79, 0);
    camera.position.set(3, 87, 310);
    orbit.update();
    orbit.saveState();
    const home = () => orbit.reset();
    canvas.addEventListener("dblclick", home);

    let w = 0, h = 0, dpr = 1;
    let stage = measureStage(1, 1, true);
    const pixelRatio = () => Math.min(current.current.feed?.maxDpr ?? 2, window.devicePixelRatio || 1);
    const fit = () => {
      const box = wrap.getBoundingClientRect();
      w = box.width;
      h = box.height;
      dpr = pixelRatio();
      stage = measureStage(w, h, current.current.readouts ?? true);
      const aspect = stage.width / stage.height;
      const halfHeight = Math.max(90, 57 / aspect);
      Object.assign(camera, { left: -halfHeight * aspect, right: halfHeight * aspect, top: halfHeight, bottom: -halfHeight });
      camera.updateProjectionMatrix();
      gl.setPixelRatio(dpr);
      gl.setSize(stage.width, stage.height, false);
      Object.assign(canvas.style, { width: stage.width + "px", height: stage.height + "px", top: stage.top + "px" });
      overlay.width = Math.max(1, Math.round(w * dpr));
      overlay.height = Math.max(1, Math.round(h * dpr));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();

    const pen = new THREE.Vector3();
    /** Project the sculpture's own coordinates. The Duet head may be mirrored in world space. */
    const project = (p: THREE.Vector3) => {
      pen.copy(p);
      head.group.localToWorld(pen).project(camera);
      return { x: (pen.x + 1) * stage.width / 2, y: (1 - pen.y) * stage.height / 2 + stage.top };
    };
    const crownPoint = new THREE.Vector3(-6, 157, 5);
    const calloutEdge = new THREE.Vector3();
    let pet = new Petting(), lastPointer: [number, number] | null = null;
    let cmPx = 1;
    const hover = (e: PointerEvent) => {
      const crown = project(crownPoint);
      const x = e.offsetX, y = e.offsetY + stage.top;
      const near = e.buttons === 0 && e.pointerType !== "touch" && Math.hypot(x - crown.x, y - crown.y) < 4.5 * cmPx;
      if (near && lastPointer) pet.stroke(Math.hypot(x - lastPointer[0], y - lastPointer[1]) / cmPx);
      lastPointer = near ? [x, y] : null;
    };
    const leave = () => { lastPointer = null; };
    canvas.addEventListener("pointermove", hover);
    canvas.addEventListener("pointerleave", leave);

    let raf = 0, last = performance.now(), lastFormants = -Infinity, epoch = -1;
    let formants: number[] = [];
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { feed, readouts = true, info = tractInfo, slots = articulatorSlots, showFormants = true } = current.current;
      const st = useStore.getState();
      const m = feed?.model ?? model.current;
      if (m && w > 0 && h > 0) {
        if (pixelRatio() !== dpr) fit();
        const sample = feed?.frame();
        if (sample && sample.epoch !== epoch) {
          epoch = sample.epoch;
          pet = new Petting();
          lastFormants = -Infinity;
        }
        const tele = sample ? sample.tele : engine.latest && sameBody(engine.latest.body, st.body) ? engine.latest : null;
        const a = tele ? VoiceModel.articFromArray(tele.t.artic) : sample?.artic ?? st.artic;
        const f = m.frame(a);
        const view = feed?.view ?? st.view;
        const facing = feed?.facing ?? 1;
        head.group.scale.x = facing;
        head.update(m, f, a, tele, view, dt);
        orbit.update(dt);
        gl.render(scene, camera);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const unit = stage.height / (camera.top - camera.bottom) * camera.zoom;
        cmPx = 5.8 * unit;
        if (readouts) {
          if (now - lastFormants > 70) {
            formants = m.transfer(a).formants;
            lastFormants = now;
          }
          ctx.fillStyle = "#202825";
          if (stage.compact) {
            ctx.fillRect(0, 0, w, stage.top);
            ctx.fillRect(0, stage.top + stage.height, w, h - stage.top - stage.height);
          } else ctx.fillRect(stage.width, 0, w - stage.width, h);
          drawReadouts(ctx, { w, h, compact: stage.compact, slotX: stage.width + 10, slotY: h - Math.min(182, h * 0.32) }, showFormants ? formants : [], info(m, f, tele).map(s => s.toUpperCase()), slots(m, a, f, formants, tele));
        }

        if (view.calipers && head.measurement) {
          const p = project(head.measurement.point);
          const value = head.measurement.area <= 0.0005 ? "Closed" : head.measurement.area.toFixed(2) + " cm²";
          ctx.font = "11px Archivo, sans-serif";
          ctx.textBaseline = "middle";
          const width = ctx.measureText(value).width + 12;
          const shoulder = project(calloutEdge.set(-54, head.measurement.point.y + 9, 7));
          const x = facing > 0
            ? Math.max(4, Math.min(shoulder.x - width, p.x - width - 22))
            : Math.min(stage.width - width - 4, Math.max(shoulder.x, p.x + 22));
          const y = Math.max(stage.top + 4, Math.min(stage.top + stage.height - 22, shoulder.y - 9));
          // Route the measurement to the blank side of the stage so the tongue remains visible.
          if (p.x >= 0 && p.x <= stage.width && p.y >= stage.top && p.y <= stage.top + stage.height) {
            const near = facing > 0 ? x + width : x;
            ctx.strokeStyle = "rgba(64, 58, 50, 0.65)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(near + facing * 7, y + 9);
            ctx.lineTo(near, y + 9);
            ctx.stroke();
            ctx.fillStyle = "rgba(250, 243, 226, 0.94)";
            ctx.beginPath(); ctx.roundRect(x, y, width, 18, 4); ctx.fill();
            ctx.fillStyle = "#493e32"; ctx.fillText(value, x + 6, y + 9);
          }
        }

        if (current.current.overlay) {
          const anchor = project(head.mouth);
          const handles = faceHandles(m, f, a);
          const lips = handles.find(item => item.id === "lips")!.pos;
          const view: FaceView = {
            handles: () => handles,
            X: p => anchor.x + (p.x - lips.x) * cmPx * facing,
            Y: p => anchor.y - (p.y - lips.y) * cmPx,
            pxPerCm: cmPx,
          };
          // Mouth words use a light vector font. Give the transparent overlay its own ink shadow.
          ctx.save();
          ctx.shadowColor = "#3c302b";
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 1;
          current.current.overlay(ctx, view, m, f, a, { w: stage.width, h: stage.height + stage.top, dt });
          ctx.restore();
        }
        const crown = project(crownPoint);
        pet.update(dt, [crown.x + facing * 4 * cmPx, crown.y + cmPx], cmPx);
        pet.draw(ctx, facing, cmPx);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", hover);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("dblclick", home);
      orbit.dispose();
      head.dispose();
      releaseStudio();
      gl.dispose();
      gl.forceContextLoss();
    };
  }, [model]);

  if (failed && !props.feed) return <AnatomyView slots={props.slots} info={props.info} showFormants={props.showFormants} overlay={props.overlay} />;
  if (failed) return <div className="anatomy three"><p className="no-webgl">The clay head needs WebGL.</p></div>;
  return (
    <div ref={wrapRef} className="anatomy three" style={{ background: "radial-gradient(ellipse at 40% 35%, #f3ead8, #e8d9bd 67%, #d5c2a1)" }}>
      <canvas ref={glRef} style={{ position: "absolute", left: 0 }} role="img" aria-label="Clay cross section of the vocal tract. Drag to turn, scroll or pinch to zoom, double-click to reset." />
      <canvas ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true" />
    </div>
  );
}
