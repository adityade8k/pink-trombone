import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { VoiceModel } from "../analysis.ts";
import type { HumanArtic, HumanFrame } from "../../wasm/types.ts";
import type { TelemetryMessage } from "../../worklet/protocol.ts";
import type { ViewFlags } from "./anatomy.ts";
import { ClayAirway } from "./clayAirway.ts";
import { clayPiece, createClaySculpture } from "./claySculpture.ts";

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;

function pigment(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.93, metalness: 0 });
}

/** A continuous surface joins the anchored root to the mobile blade and rounded tip. */
class ClayTongue {
  private readonly columns = 48;
  private readonly sides = 32;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new THREE.BufferAttribute(
    new Float32Array((this.columns + 1) * this.sides * 3), 3
  ).setUsage(THREE.DynamicDrawUsage);
  readonly mesh = new THREE.Mesh(this.geometry, pigment(0xd7897e));

  constructor() {
    const triangles: number[] = [];
    for (let c = 0; c < this.columns; c++) {
      for (let j = 0; j < this.sides; j++) {
        const a = c * this.sides + j;
        const b = c * this.sides + (j + 1) % this.sides;
        triangles.push(a, b, a + this.sides, b, b + this.sides, a + this.sides);
      }
    }
    this.geometry.setIndex(triangles);
    this.geometry.setAttribute("position", this.positions);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  pose(m: VoiceModel, f: HumanFrame, a: HumanArtic) {
    const center = m.tract.unP(f.tongueCenter.x, f.tongueCenter.y);
    const tip = m.tract.unP(f.tip.x, f.tip.y);
    const advance = center.x - 2.9;
    const lift = center.y - 6.85;
    const end = clamp(25 + (tip.x - 6.45) * 4.3, 12, 31);
    const root = -8.5 + a.root * 1.45 + advance * 1.1;
    const bladeLift = clamp((tip.y - 7.3) * 3.45, -7, 10);

    for (let c = 0; c <= this.columns; c++) {
      // Cosine spacing rounds both ends and avoids a sharp seam at the tip.
      const u = (1 - Math.cos(Math.PI * c / this.columns)) / 2;
      const lobe = Math.pow(Math.max(0.00001, Math.sin(Math.PI * u)), 0.43);
      const belly = Math.exp(-((u - 0.38) ** 2) / 0.12);
      const blade = u * u;
      const x = mix(root, end, u) + advance * 1.25 * Math.sin(Math.PI * u);
      const base = 45.8 + 6.9 * u + 1.7 * Math.sin(u * Math.PI) + belly * lift * 2.0 + blade * bladeLift;
      const height = (7.2 + 2.2 * belly - 2.45 * u + belly * lift * 0.8) * lobe;
      for (let j = 0; j < this.sides; j++) {
        const angle = j * Math.PI * 2 / this.sides;
        const vertical = Math.cos(angle);
        const y = base + vertical * height - a.dorsum * 2.4 * belly * Math.max(0, vertical);
        const z = 8.4 + 4.15 * lobe * Math.sin(angle);
        this.positions.setXYZ(c * this.sides + j, x, y, z);
      }
    }
    this.positions.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

/** The cut floor of the mouth joins the mobile tongue root to the lower gingiva. */
function mouthFloor() {
  const outline = new THREE.Shape();
  outline.moveTo(-9.2, 46.5);
  outline.bezierCurveTo(-10.2, 52.0, -5.3, 55.0, 1.0, 54.0);
  outline.bezierCurveTo(6.6, 52.8, 9.7, 47.4, 13.5, 44.8);
  outline.bezierCurveTo(18.8, 41.2, 27.8, 43.4, 31.7, 43.4);
  outline.quadraticCurveTo(33.6, 41.4, 31.2, 39.4);
  outline.bezierCurveTo(26.0, 37.5, 17.0, 39.3, 9.2, 38.7);
  outline.bezierCurveTo(0.2, 37.0, -7.6, 38.0, -9.2, 46.5);
  return clayPiece(outline, 0xce877a, 6.0, 1.5, 1.15);
}

function teeth(upper: boolean): THREE.Group {
  const row = new THREE.Group();
  const centers = upper ? [4.6, 10.0, 15.5, 20.8, 25.7, 30.3] : [16.5, 21.5, 26.3, 30.8];
  const gum = new THREE.Shape();
  const x0 = centers[0] - 2.0;
  const y = upper ? 64 : 41.5;
  const sign = upper ? 1 : -1;
  gum.moveTo(x0, y);
  gum.bezierCurveTo(x0 - 2, y + sign * 4.0, 14, y + sign * 5.0, 30.5, y + sign * 2.8);
  gum.quadraticCurveTo(34, y + sign * 1.8, 31.8, y);
  gum.quadraticCurveTo(18, y - sign * 1.3, x0, y);
  row.add(clayPiece(gum, upper ? 0xbc7770 : 0xcb8a7e, 5.7, 1.7, 0.85));
  const shades = [0xd9bf9e, 0xe5cbae, 0xe1c6a8, 0xe8d1b5, 0xe3c9ae, 0xead5ba];
  centers.forEach((x, i) => {
    const t = i / (centers.length - 1);
    const width = (upper ? 5.1 : 4.65) - t * 0.55;
    const height = (upper ? 3.85 : 3.25) + 0.85 * t;
    const crown = new THREE.Mesh(new RoundedBoxGeometry(width, height, 3.35, 3, 1.22), pigment(shades[i]));
    crown.position.set(x, y - sign * (height / 2 - 0.2) + Math.sin(t * Math.PI) * 0.5, 8.0);
    crown.rotation.set(0, 0.07 * Math.cos(i * 1.7), (t - 0.55) * sign * 0.09);
    crown.castShadow = crown.receiveShadow = true;
    row.add(crown);
  });
  return row;
}

function lip(upper: boolean) {
  // Local origin is the attachment to the cut edge of the face.
  const p = new THREE.Shape();
  p.moveTo(-1.5, 0);
  if (upper) {
    p.bezierCurveTo(0, 2.7, 1.6, 6.8, 4.8, 7.0);
    p.bezierCurveTo(7.5, 6.8, 8.0, 3.3, 6.2, 1.2);
    p.bezierCurveTo(4.6, -0.05, 1.0, -0.4, -1.5, 0);
  } else {
    p.bezierCurveTo(1.0, 0.95, 4.4, 0.55, 6.1, -0.5);
    p.bezierCurveTo(9.3, -2.4, 7.1, -5.5, 4.4, -6.45);
    p.bezierCurveTo(2.0, -7.1, -0.1, -3.2, -1.5, 0);
  }
  return clayPiece(p, upper ? 0xc77670 : 0xd3897c, 0, 2.1, 1.05);
}

export class ClayHead {
  readonly group = new THREE.Group();
  readonly mouth = new THREE.Vector3();
  private readonly sculpture = createClaySculpture();
  private readonly tongue = new ClayTongue();
  private readonly lowerRow = teeth(false);
  private readonly floor = mouthFloor();
  private readonly upperLip = lip(true);
  private readonly lowerLip = lip(false);
  private readonly airway = new ClayAirway();
  private readonly softPalate = this.sculpture.getObjectByName("soft-palate");
  private readonly larynx = this.sculpture.getObjectByName("larynx");
  private readonly larynxHeight = this.larynx?.position.y ?? 0;
  private lastFrame: HumanFrame | null = null;

  get measurement() { return this.airway.measurement; }

  constructor() {
    this.group.add(this.sculpture, this.floor, this.lowerRow, teeth(true), this.tongue.mesh, this.upperLip, this.lowerLip, this.airway.group);
  }

  update(m: VoiceModel, f: HumanFrame, a: HumanArtic, tele: TelemetryMessage | null, view: ViewFlags, dt: number) {
    if (this.lastFrame !== f) {
      this.lastFrame = f;
      this.tongue.pose(m, f, a);
      const jaw = a.jaw - 0.6;
      this.lowerRow.position.y = -jaw * 2.4;
      this.lowerRow.rotation.z = -0.022 * jaw;
      this.floor.rotation.z = -0.055 * jaw;
      this.floor.position.y = -0.6 * jaw;
      const gap = clamp(a.lipAp * 6.6, 0, 13);
      const lipX = 32.2 + (a.lipProt - 0.2) * 2.4;
      const centerY = 54 - jaw * 1.25;
      this.upperLip.position.set(lipX, centerY + gap * 0.36, 6.3);
      this.lowerLip.position.set(lipX - a.labiodental * 2.6, centerY - gap * 0.64 + a.labiodental * 1.8, 6.3);
      this.upperLip.scale.x = this.lowerLip.scale.x = 1 + (0.5 - a.lipWidth) * 0.30;
      this.mouth.set(lipX + 6.8, centerY, 8);
      if (this.softPalate) this.softPalate.rotation.z = clamp(a.velum, 0, 1.4) * 0.16;
      if (this.larynx) this.larynx.position.y = this.larynxHeight + a.larynx * 1.6;
    }
    this.airway.update(m, f, tele, view, dt);
  }

  dispose() {
    this.airway.group.removeFromParent();
    this.airway.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.group.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      geometries.add(part.geometry);
      for (const mat of Array.isArray(part.material) ? part.material : [part.material]) {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    for (const item of [...textures, ...materials, ...geometries]) item.dispose();
  }
}
