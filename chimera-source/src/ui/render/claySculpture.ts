import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/* Sculpt coordinates: Y runs from the cut neck to the crown and +Z faces the viewer.
 * The dark recesses have their own depth below the softly rolled cut edges. */
type Curve = [number, number, number, number, number, number];
function silhouette(x: number, y: number, ...curves: Curve[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x, y);
  for (const [x1, y1, x2, y2, x3, y3] of curves) s.bezierCurveTo(x1, y1, x2, y2, x3, y3);
  s.closePath();
  return s;
}

const pigment = {
  slate: 0x77949a, rim: 0x8ba6aa, bowl: 0x415c63, crown: 0x434341,
  rose: 0xc67c72, salmon: 0xd99388, vermilion: 0xb96f64, blush: 0xe4a297,
  nasalShade: 0x814c47, throat: 0x693e3f, oralShadow: 0x432e32,
  cartilage: 0x9eafb0, cartilageShade: 0x627b81,
};

function clayMaterial(color: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.96, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vClayPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvClayPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vClayPos;
        float clayHash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float clayNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(mix(clayHash(i),clayHash(i+vec3(1,0,0)),f.x),
                         mix(clayHash(i+vec3(0,1,0)),clayHash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(clayHash(i+vec3(0,0,1)),clayHash(i+vec3(1,0,1)),f.x),
                         mix(clayHash(i+vec3(0,1,1)),clayHash(i+vec3(1)),f.x),f.y),f.z);
        }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float press = clayNoise(vClayPos * .18);
        float grain = clayNoise(vClayPos * 1.7);
        float mottling = (press-.5)*.065 + (grain-.5)*.048;
        diffuseColor.rgb *= 1.0 + mottling;`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        float clayHeight = press * .12 + grain * .037;
        vec3 qx=dFdx(-vViewPosition), qy=dFdy(-vViewPosition);
        vec3 sx=cross(qy, normal), sy=cross(normal,qx);
        float volume=dot(qx,sx);
        normal=normalize(max(abs(volume),.000001)*normal -
          sign(volume)*(dFdx(clayHeight)*sx+dFdy(clayHeight)*sy));`);
  };
  return material;
}

export function clayPiece(path: THREE.Shape, color: number, z: number, depth = 1.2, bevel = 1.2): THREE.Mesh {
  const slab = new THREE.ExtrudeGeometry(path, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel * .85,
    bevelSegments: 5, curveSegments: 9, steps: 1,
  });
  // Weld the rolled edges so light travels smoothly around a hand-rounded corner.
  slab.deleteAttribute("normal");
  slab.deleteAttribute("uv");
  const geometry = mergeVertices(slab, .0002);
  slab.dispose();
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, clayMaterial(color));
  mesh.position.z = z;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** A pressed-in cranial bowl. Its middle sits well behind the raised blue cut surface. */
function cranialBowl(path: THREE.Shape) {
  const outer = path.getSpacedPoints(96).slice(0, -1);
  const faces = THREE.ShapeUtils.triangulateShape(outer, []);
  const vertices: number[] = [], indices: number[] = [], colors: number[] = [], normals: number[] = [];
  const inner = new THREE.Color(0x3c5158), edge = new THREE.Color(0x6b8a90);
  const basePigment = new THREE.Color(pigment.bowl);
  const edgeDistance = (x: number, y: number) => {
    let nearest = Infinity;
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i], b = outer[(i + 1) % outer.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const u = THREE.MathUtils.clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx*dx + dy*dy), 0, 1);
      nearest = Math.min(nearest, (x-a.x-u*dx)**2 + (y-a.y-u*dy)**2);
    }
    return Math.sqrt(nearest);
  };
  const contourHeight = (d: number) => -2.55 + 8.95 * Math.exp(-d * .20);
  const welded = new Map<string, number>();
  function vertex(x: number, y: number) {
    const key = Math.round(x*10000) + "," + Math.round(y*10000);
    const previous = welded.get(key);
    if (previous !== undefined) return previous;
    const d = edgeDistance(x,y);
    const nx = contourHeight(edgeDistance(x-.35,y)) - contourHeight(edgeDistance(x+.35,y));
    const ny = contourHeight(edgeDistance(x,y-.35)) - contourHeight(edgeDistance(x,y+.35));
    const n = new THREE.Vector3(nx,ny,.7).normalize();
    const c = inner.clone().lerp(edge, Math.exp(-d*.18));
    const index = vertices.length / 3;
    welded.set(key,index);
    vertices.push(x,y,contourHeight(d));
    normals.push(n.x,n.y,n.z);
    colors.push(c.r/basePigment.r,c.g/basePigment.g,c.b/basePigment.b);
    return index;
  }
  // Triangulate the concave perimeter first; a centre fan would cross the inner notches.
  // The same subdivision on every shared edge gives a continuous rounded basin.
  const divisions = 18;
  for (const [ia,ib,ic] of faces) {
    const a = outer[ia], b = outer[ib], c = outer[ic], rows: number[][] = [];
    for (let i=0;i<=divisions;i++) {
      const row: number[] = [];
      for (let j=0;j<=divisions-i;j++) {
        row.push(vertex(a.x+(b.x-a.x)*i/divisions+(c.x-a.x)*j/divisions,
                        a.y+(b.y-a.y)*i/divisions+(c.y-a.y)*j/divisions));
      }
      rows.push(row);
    }
    for (let i=0;i<divisions;i++) {
      for (let j=0;j<divisions-i;j++) {
        indices.push(rows[i][j],rows[i+1][j],rows[i][j+1]);
        if (j<divisions-i-1) indices.push(rows[i+1][j],rows[i+1][j+1],rows[i][j+1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(indices);
  const mat = clayMaterial(pigment.bowl);
  mat.vertexColors = true; mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(g,mat);
  mesh.receiveShadow = true;
  return mesh;
}

export function createClaySculpture(): THREE.Group {
  const head = new THREE.Group();
  const add = (name: string, shape: THREE.Shape, color: number, z: number, d: number, bevel: number) => {
    const part = clayPiece(shape,color,z,d,bevel);
    part.name = name; head.add(part);
    return part;
  };

  // Side of the sliced block. The front of this solid stays behind every recess.
  const block = silhouette(-45,2,
    [-49,4,-49,18,-49,37],[-48,57,-51,91,-49,122],[-48,142,-38,154,-16,156],
    [5,159,20,148,24,132],[26,123,26,116,30,105],[32,99,45,86,47,81],
    [49,77,44,77,39,76],[34,75,31,70,32,65],[32,61,34,58,32,55],
    [30,51,31,45,34,40],[35,33,38,14,35,4],[34,1,31,0,23,0],
    [6,0,-20,0,-39,1],[-42,1,-44,1,-45,2]);
  add("slate body",block,pigment.slate,-13,7.4,2.15);

  const bowl = silhouette(-41.5,37,
    [-44,40,-43,61,-44.5,81],[-46,102,-47,124,-39,136],
    [-32,148,-15,151,1,148],[14,145,18.5,134,19.2,121.4],
    [20,113,11,109,1,108],[-4,108,-9,109,-12,104],
    [-15,98,-16,94,-19,93],[-23,92,-22,100,-24,101],
    [-27,101,-29,92,-33,84],[-38,73,-37,53,-39,40],[-39.5,37,-40.5,36,-41.5,37]);
  const skull = silhouette(-45,2.2,
    [-49,6,-49,22,-48.5,39],[-48,60,-50.5,97,-48.5,119],
    [-47.5,140,-39,150,-21,153.5],[-1,158,15,150,20.8,138],
    [25,130,24,119,27.2,111],[28.5,107,31,103.5,27.5,102.5],
    [23.5,102,19.5,104.8,15,105.8],[8,107,2,103,0,98.8],
    [-5,89,-14,87,-18.4,82],[-24,75,-22,63,-23,54],
    [-24,39,-28,17,-30,1.5],[-36,1.1,-41,1.2,-45,2.2]);
  skull.holes.push(bowl);
  add("cut cranial rim",skull,pigment.rim,.25,4.4,1.45);
  head.add(cranialBowl(bowl));

  // Uneven strip of charcoal clay folded over the top of the head.
  add("crown",silhouette(-49,114,
    [-53,115,-51,125,-48,134],[-44,151,-31,159,-14,159.5],
    [2,161,15,155,22,144],[27,137,28.5,127,25.3,124.7],
    [21.8,122.2,21.1,128.7,18.5,135.5],[14,145.5,4,150.6,-8.8,151],
    [-25,152,-37,145.8,-42,134],[-46,125,-45.5,115,-49,114]),pigment.crown,-2.2,6.1,1.75);

  add("chin",silhouette(-3.8,1.4,
    [-2.5,5.5,-1.2,14,-3.6,18.8],[-6.6,23.5,-12.6,23.3,-16.4,25.2],
    [-17,25.7,-17.4,27.8,-17.8,29],[-15.4,36,-12.4,40,-7,45],
    [-2,47,2,44.7,6,42.2],[10,40.2,23.5,40.5,28,40.2],
    [31.8,39.8,33,43.2,33,47],[32.8,51.5,30.8,59.5,31.5,66],
    [31.8,69.5,32.4,71.9,34.8,73.5],[36,71.6,35.2,68.4,34.8,66],
    [34.4,57,36,51,35.6,46],[34.7,40,36.8,32,37.7,22],
    [38.5,15,38,5,34.5,2],[32.5,.4,28.2,.4,23,.3],
    [14,.2,3.2,.5,-3.8,1.4]),pigment.slate,-.2,5.4,1.55);

  // Lining and the sectioned rear wall, extending up behind the mouth to the choana.
  add("pharyngeal channel",silhouette(-34,1,
    [-32,19,-29,39,-27.8,55],[-26.7,66,-29,77,-22.7,84.6],
    [-17,91,-10.8,91,-5.5,99],[-2,105,1.5,106.4,4,106.9],
    [6,107,7.5,103.8,7.1,100.7],[6,94,4,87,10,82.5],
    [16.2,78.6,25,76.3,31.3,69],[34.2,63,27.8,62.5,22,62.7],
    [11,63.1,3,62,-2,56],[-7.4,50,-13.7,41,-17.2,32.5],
    [-21,23,-20,10,-23,1],[-27,.2,-31,.5,-34,1]),pigment.rose,1.2,3.7,1.18);

  add("shadow inside pharynx",silhouette(-30.5,1.25,
    [-29.7,10,-25.5,35,-24.7,52],[-24.3,65,-24.7,74,-16.5,80.5],
    [-10.6,85.4,.4,85.2,4.5,83],[5.8,81.6,4.4,79.6,1.5,78.3],
    [-9.5,75.2,-17.3,68,-17.9,60],[-18.8,50,-17.9,45,-19.4,37.6],
    [-20.4,28,-24.7,12,-25.4,1],[-27.4,.6,-29.2,.9,-30.5,1.25]),pigment.throat,5.05,.42,.65);

  add("mouth recess",silhouette(-17.6,37,
    [-19.2,46.5,-17.4,58.5,-12,64.7],[-5.5,72.1,15.2,72.8,28.5,69.4],
    [32.7,68.6,33.4,65,33.1,60.6],[33.1,51.3,33.9,43.1,31.4,39.6],
    [29.3,37.7,17.3,39.1,9.4,39.2],[.8,39.2,-3.7,39.6,-7.7,38],
    [-11.1,36.8,-16,33.4,-17.6,37]),pigment.oralShadow,2.65,.9,.65);

  // A slim nose wedge projects beyond the midline. Its lower border curls over the nostril.
  add("external nose",silhouette(14,101.3,
    [18,104.2,23.9,106.3,27.5,103.8],[29.8,102.5,33.2,96,37,91.7],
    [41.4,86.6,47.2,82.9,48.2,79.8],[49.7,75.5,46.1,75.6,43.4,75.3],
    [39.4,75,37.4,72.7,35,71.8],[31.8,71.2,29.6,74.6,24,75.9],
    [18.6,77,11,76,7.4,79.4],[2.6,84.1,6.2,97,14,101.3]),pigment.salmon,.7,4.65,1.55);
  add("nostril",silhouette(37.7,74.6,
    [39.8,77.1,44.2,78.5,45.8,77.7],[47,77,45.6,76.4,43.8,76.1],
    [41.1,75.7,39.1,73.9,37.7,74.6]),0x86534f,6.7,.16,.25);

  add("nasal recess",silhouette(-18.8,80,
    [-17.2,87.1,-8.5,89.5,-4.9,96.2],[.2,106.1,10.9,107.3,18.5,104.3],
    [24.1,102.3,21.5,95.6,18.4,92.3],[15.7,89.4,11.5,87.2,11.1,85.8],
    [14.3,84.1,20.4,84.6,21.4,81.9],[21.5,79.6,16.6,78,10.7,78.1],
    [1.2,78.3,-9,80,-14.6,76.8],[-18.4,74.8,-20,76.4,-18.8,80]),pigment.nasalShade,4.75,.67,.84);
  add("upper shell of nasal cavity",silhouette(-16.3,84,
    [-13.4,89.4,-7.9,89.3,-4.2,97.9],[.5,108.5,10.4,108.7,18.5,105.6],
    [22.4,104,25,102,26.9,102.7],[26,100,22.1,101.1,17.4,102.5],
    [11.8,104.4,3.9,104.9,-.4,98],[-5.2,89.9,-12,87.5,-16.3,84]),pigment.rose,5.3,1.8,1.02);

  // The turbinates are continuous rolled sheets. A recessed spiral and long inferior fold
  // keep the cavities legible from the normal side-on playing position.
  add("middle turbinate",silhouette(-4.3,88,
    [-2.9,92,1.5,93.4,5.3,94.8],[11,96.6,12.9,99.8,10.6,101.1],
    [8.9,102.3,5.7,101.3,4.4,99.5],[3.3,98,4.3,97.4,5.6,97.7],
    [5.2,95.5,1.7,94.7,1,97.5],[.2,101.3,5.1,104,10.3,103.8],
    [16.6,103.7,19.3,100,18.2,96.4],[16.6,91.3,11.6,89.6,6.3,89.3],
    [2.6,89.1,-.5,89.3,-4.3,88]),pigment.salmon,6.4,1.55,.97);
  add("inferior turbinate",silhouette(-7.7,81.3,
    [-5.2,85.9,1.8,85.8,7.5,86.1],[12.1,86.3,16.2,87.4,19,88.2],
    [19.3,84.6,13.7,82,7.6,82],[2.4,81.8,-3.6,83.4,-7.7,81.3]),pigment.salmon,6.5,1.38,.86);

  add("hard palate",silhouette(-12.3,68.5,
    [-10.5,76.1,.7,79.8,12.7,79],[21.6,78.7,28.2,76.1,31.4,73.3],
    [33.7,71,32.9,68.1,31.8,65.4],[23.3,66.6,11.5,68,3.3,66.5],
    [-3.7,65.4,-9,62.8,-12,61.2],[-14.5,60,-13.5,65.5,-12.3,68.5]),pigment.rose,5.2,1.55,1.27);
  add("upper gum",silhouette(-5.3,66.1,
    [1.2,70.6,16.1,71.1,27.8,68.7],[30.8,68.2,31.7,66.1,31.3,64.6],
    [23.6,65.4,11.7,65.8,4.5,64.3],[.8,63.9,-2.6,62.6,-4.6,62.2],
    [-6.8,61.8,-7.2,64.4,-5.3,66.1]),pigment.salmon,6.2,1.25,.86);

  const soft = add("soft-palate",silhouette(-1.8,69.1,
    [-7.1,69.5,-12.3,67.7,-15.2,63.8],[-18.3,59.6,-18,55.4,-16.4,54.7],
    [-14.9,53.8,-13.2,56.2,-13.4,58.8],[-13.1,62,-11,63,-8.4,63.3],
    [-5.1,63.6,-2.5,65.2,-1.8,69.1]),pigment.salmon,6.35,1.2,.95);
  soft.geometry.translate(2,-68,0); soft.position.x=-2; soft.position.y=68;

  // The small larynx is set in a second blue socket above a stack of cartilage rings.
  add("tracheal socket",silhouette(-21,.9,
    [-22.2,7.4,-22.2,13,-20.7,17.9],[-19.6,22.6,-15.8,25.2,-11.9,24.8],
    [-6.8,23.9,-2.5,18.9,-2.4,13.3],[-2,8.5,-3.6,3.5,-5,.9],
    [-9.1,-.1,-16.5,.2,-21,.9]),0x3f555c,5.9,1.45,.76);
  for (let i=0;i<6;i++) {
    const y=2.05+i*2.95, x=-11.8+i*.2, width=5.75+Math.sin(i*.83)*.18;
    const band=silhouette(x-width,y+1.05,
      [x-width+.2,y+2.55,x-2.3,y+2.15,x,y+1.65],
      [x+2.5,y+1.32,x+width-1,y+2,x+width,y+1.35],
      [x+width+1,y+.35,x+width-.15,y-.95,x+width-1.55,y-1.25],
      [x+2,y-2.1,x-3.5,y-1.9,x-width+.75,y-.23],
      [x-width-.1,y+.28,x-width-.1,y+.7,x-width,y+1.05]);
    add("tracheal ring",band,pigment.cartilage,7.65,.8,.75);
  }
  const larynx = new THREE.Group();
  larynx.name="larynx";
  larynx.position.set(-10,19,0);
  head.add(larynx);
  const larynxPart = (name:string, shape:THREE.Shape, color:number, z:number, d:number, bevel:number) => {
    const m=clayPiece(shape,color,z,d,bevel);
    m.position.x=10; m.position.y=-19;
    m.name=name; larynx.add(m);
  };
  larynxPart("thyroid cartilage",silhouette(-18.8,35.4,
    [-22.1,39.8,-21,42.1,-19.7,41.7],[-18.1,41.6,-17.1,37.1,-13.7,37.8],
    [-10.1,39,-7.7,39.2,-4.8,37.7],[-2,36.6,.3,36.3,1.9,39.2],
    [4,43.1,3.7,46.1,5.6,46.3],[7.4,45.1,4.8,37.8,2.9,35],
    [1,31,-.7,24.8,-4.3,20.1],[-7.9,15.6,-14.6,16.1,-16.5,20.1],
    [-19.9,24.5,-17.8,31.3,-18.8,35.4]),pigment.cartilage,5.15,1.15,.78);
  larynxPart("laryngeal wall",silhouette(-17.6,34.8,
    [-15.4,36.5,-12.1,40.6,-9.4,40.5],[-6.1,40.1,-3.5,36.4,.1,35.8],
    [1,33.3,-2.6,25.1,-6,22.1],[-8.8,19.1,-14.2,19.5,-15.8,22.6],
    [-17.1,26.4,-16.4,30.1,-17.6,34.8]),pigment.vermilion,6.48,1.25,.9);
  larynxPart("laryngeal opening",silhouette(-17.2,34.2,
    [-14.8,36.4,-12.6,38.3,-10,38.6],[-7,38.8,-4.5,34.7,-1.3,34.3],
    [-2.9,31.9,-7,28.3,-9.6,27.9],[-12.9,27.8,-15.4,32.2,-17.2,34.2]),pigment.throat,7.9,.32,.65);
  larynxPart("rolled laryngeal rim",silhouette(-17.8,34.9,
    [-14.9,34.7,-12.6,30.6,-9.7,30.3],[-7.4,30,-3.5,32.7,-.1,34.4],
    [-1.6,31.7,-6.4,27.5,-9.8,27.2],[-13.4,27.1,-16.8,32,-17.8,34.9]),pigment.blush,8.35,.77,.6);
  return head;
}
