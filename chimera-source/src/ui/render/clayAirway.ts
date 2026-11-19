import * as THREE from "three";
import type { HumanFrame } from "../../wasm/types.ts";
import type { TelemetryMessage } from "../../worklet/protocol.ts";
import type { VoiceModel } from "../analysis.ts";
import { pressureLevel } from "../colors.ts";
import type { ViewFlags } from "./anatomy.ts";

const annotationDepth = 12;
const throat = new THREE.CubicBezierCurve(
  new THREE.Vector2(-8, 26), new THREE.Vector2(-14, 31),
  new THREE.Vector2(-20, 46), new THREE.Vector2(-13, 53),
);
const mouth = new THREE.CubicBezierCurve(
  new THREE.Vector2(-13, 53), new THREE.Vector2(-7, 65),
  new THREE.Vector2(18, 60), new THREE.Vector2(36, 54),
);

function section(s: number, split: number, length: number, centre: THREE.Vector2, tangent: THREE.Vector2) {
  const inThroat = s < split;
  const progress = inThroat ? s / split : (s - split) / Math.max(0.001, length - split);
  const curve = inThroat ? throat : mouth;
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  curve.getPoint(t, centre);
  curve.getTangent(t, tangent);
}

function acousticValue(values: Float32Array, positions: Float64Array, s: number) {
  if (positions.length !== values.length || !values.length) return 0;
  let low = 0;
  let high = values.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (positions[mid] <= s) low = mid;
    else high = mid;
  }
  const t = THREE.MathUtils.clamp((s - positions[low]) / Math.max(1e-6, positions[high] - positions[low]), 0, 1);
  return THREE.MathUtils.lerp(values[low], values[high], t);
}

function attribute(count: number) {
  return new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
}

/** Acoustic gauges on the cut plane. Distances along the sculpted path are registered to
 * the solver at the glottis, the pharynx/oral junction and the lips. */
export class ClayAirway {
  readonly group = new THREE.Group();
  measurement: {point: THREE.Vector3; area: number} | null = null;
  private readonly marker = { point: new THREE.Vector3(), area: 0 };
  private readonly lineGeometry = new THREE.BufferGeometry();
  private readonly lineMaterial = new THREE.LineBasicMaterial({vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false});
  private readonly pointsGeometry = new THREE.BufferGeometry();
  private readonly pointMaterial = new THREE.PointsMaterial({color: 0xffe5b9, size: 1.05, transparent: true, opacity: 0.75, depthWrite: false});
  private readonly particles = Array.from({length: 30}, (_, i) => ({ fraction: i / 30, lane: 0.35 * Math.sin(i * 2.4) }));
  private readonly pointPositions = attribute(this.particles.length);
  private readonly cold = new THREE.Color(0x8baaa3);
  private readonly warm = new THREE.Color(0xffbc69);
  private readonly white = new THREE.Color(0xfff8ed);
  private readonly color = new THREE.Color();
  private readonly centre = new THREE.Vector2();
  private readonly tangent = new THREE.Vector2();
  private lastClock = -1;

  constructor() {
    this.pointsGeometry.setAttribute("position", this.pointPositions);
    for (const item of [
      new THREE.LineSegments(this.lineGeometry, this.lineMaterial),
      new THREE.Points(this.pointsGeometry, this.pointMaterial),
    ]) {
      item.frustumCulled = false;
      this.group.add(item);
    }
  }

  update(model: VoiceModel, frame: HumanFrame, tele: TelemetryMessage | null, view: ViewFlags, dt: number) {
    this.measurement = null;
    const grid = frame.grid;
    const length = frame.lipS;
    const split = THREE.MathUtils.clamp(frame.pharynxLength, 0.01, Math.max(0.01, length - 0.01));
    this.group.visible = grid.length > 1 && length > 0.02 && (view.grid || view.calipers || (!!tele && (view.pressure || view.particles)));
    if (!this.group.visible) return;
    const nodes = tele && (view.pressure || view.particles) ? model.nodeS(tele.t.phLen, tele.t.orLen) : null;
    const required = grid.length * 2 + 6;
    if (!this.lineGeometry.hasAttribute("position") || this.lineGeometry.getAttribute("position").count < required) {
      this.lineGeometry.dispose();
      this.lineGeometry.setAttribute("position", attribute(required));
      this.lineGeometry.setAttribute("color", attribute(required));
    }
    const positions = this.lineGeometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = this.lineGeometry.getAttribute("color") as THREE.BufferAttribute;
    let lineCount = 0;
    const vertex = (x: number, y: number, color: THREE.Color) => {
      positions.setXYZ(lineCount, x, y, annotationDepth);
      colors.setXYZ(lineCount++, color.r, color.g, color.b);
    };

    let narrowest = -1;
    for (let i = 0; i < grid.length; i++) {
      const g = grid[i];
      if (view.calipers && i >= 2 && i < grid.length - 1 && g.area < 1.2 && (narrowest < 0 || g.area < grid[narrowest].area)) narrowest = i;
      if (i % 2) continue;
      const level = tele && nodes && view.pressure ? pressureLevel(acousticValue(tele.t.pressureRms, nodes, g.s)) : 0;
      if (!view.grid && level < 0.04) continue;
      section(g.s, split, length, this.centre, this.tangent);
      const radius = Math.min(4.1, Math.max(0.15, g.d * 1.65 / model.tract.scale));
      const dx = -this.tangent.y * radius;
      const dy = this.tangent.x * radius;
      this.color.copy(this.cold).lerp(this.warm, level);
      vertex(this.centre.x - dx, this.centre.y - dy, this.color);
      vertex(this.centre.x + dx, this.centre.y + dy, this.color);
    }
    if (narrowest >= 0) {
      const g = grid[narrowest];
      section(g.s, split, length, this.centre, this.tangent);
      const radius = Math.max(0.50, Math.min(4.5, g.d * 1.65 / model.tract.scale));
      const nx = -this.tangent.y * radius, ny = this.tangent.x * radius;
      for (const sign of [-1, 1]) {
        const x = this.centre.x + sign * nx, y = this.centre.y + sign * ny;
        vertex(x - this.tangent.x * 1.25, y - this.tangent.y * 1.25, this.white);
        vertex(x + this.tangent.x * 1.25, y + this.tangent.y * 1.25, this.white);
      }
      vertex(this.centre.x - nx, this.centre.y - ny, this.white);
      vertex(this.centre.x + nx, this.centre.y + ny, this.white);
      this.marker.point.set(this.centre.x + nx, this.centre.y + ny, annotationDepth);
      this.marker.area = g.area;
      this.measurement = this.marker;
    }
    positions.needsUpdate = colors.needsUpdate = true;
    this.lineGeometry.setDrawRange(0, lineCount);

    let pointCount = 0;
    if (tele && nodes && view.particles) {
      // Drop the transport history when seeking a recorded voice.
      if (tele.t.clock < this.lastClock) this.particles.forEach((p, i) => { p.fraction = i / this.particles.length; });
      this.lastClock = tele.t.clock;
      for (const p of this.particles) {
        const s = p.fraction * length;
        let lo = 0, hi = grid.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >>> 1;
          if (grid[mid].s <= s) lo = mid;
          else hi = mid;
        }
        const g = grid[lo];
        const speed = acousticValue(tele.t.flow, nodes, s) / Math.max(0.05, g.area);
        if (Math.abs(speed) < 3 || g.area < 0.015) continue;
        const travel = Math.sign(speed) * 2.2 * Math.log1p(Math.abs(speed) / 30) * dt;
        p.fraction = THREE.MathUtils.euclideanModulo(p.fraction + travel / length, 1);
        section(p.fraction * length, split, length, this.centre, this.tangent);
        const lateral = p.lane * Math.min(3.7, g.d * 1.65 / model.tract.scale);
        this.pointPositions.setXYZ(pointCount++, this.centre.x - this.tangent.y * lateral, this.centre.y + this.tangent.x * lateral, annotationDepth + 0.12);
      }
    }
    this.pointPositions.needsUpdate = true;
    this.pointsGeometry.setDrawRange(0, pointCount);
  }

  dispose() {
    this.lineGeometry.dispose();
    this.pointsGeometry.dispose();
    this.lineMaterial.dispose();
    this.pointMaterial.dispose();
  }
}
