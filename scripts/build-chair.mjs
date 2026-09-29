// Builds public/models/lounge-chair.glb: a configurable lounge chair assembled from parametric
// parts, tagged for the configurator via glTF "extras", then optimised with glTF-Transform.
//
//   extras.slot    which material slot a mesh uses (fabric | accent | frame | metal)
//   extras.part    parts the configurator can show/hide (arms, pillow)
//   extras.variant mutually exclusive alternatives within a part (legs: tapered | hairpin | swivel)
//   extras.hotspot empty nodes marking where UI hotspots attach
//
// Because the runtime reads these tags instead of hard-coding mesh names, a re-exported
// model (e.g. from Blender with the same custom properties) drops in without code changes.
import { writeFile, mkdir } from 'node:fs/promises';
import { CatmullRomCurve3, CylinderGeometry, Euler, Matrix4, Quaternion, TubeGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const OUT = 'public/models/lounge-chair.glb';

// ---------- parametric parts (metres, floor at y = 0) ----------
const at = (geo, pos = [0, 0, 0], rot = [0, 0, 0]) =>
  geo.applyMatrix4(new Matrix4().compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(1, 1, 1)));

const parts = [
  { name: 'Frame', slot: 'frame', geo: new RoundedBoxGeometry(0.8, 0.06, 0.7, 3, 0.02), pos: [0, 0.33, 0] },
  { name: 'Seat', slot: 'fabric', geo: new RoundedBoxGeometry(0.72, 0.14, 0.64, 5, 0.055), pos: [0, 0.43, 0.02] },
  { name: 'Back', slot: 'fabric', geo: new RoundedBoxGeometry(0.72, 0.5, 0.14, 5, 0.06), pos: [0, 0.73, -0.27], rot: [-0.2, 0, 0] },
  { name: 'Pillow', slot: 'accent', part: 'pillow', geo: new RoundedBoxGeometry(0.44, 0.26, 0.11, 5, 0.05), pos: [0, 0.63, -0.15], rot: [-0.26, 0, 0] },
  { name: 'Arm_L', slot: 'frame', part: 'arms', geo: new RoundedBoxGeometry(0.06, 0.26, 0.66, 3, 0.025), pos: [-0.39, 0.49, 0] },
  { name: 'Arm_R', slot: 'frame', part: 'arms', geo: new RoundedBoxGeometry(0.06, 0.26, 0.66, 3, 0.025), pos: [0.39, 0.49, 0] },
];

const corners = [[-0.33, -0.27], [0.33, -0.27], [-0.33, 0.27], [0.33, 0.27]];

// Tapered wooden legs, splayed slightly outwards (merged into one mesh = one draw call)
const tapered = mergeGeometries(
  corners.map(([x, z]) => at(new CylinderGeometry(0.022, 0.013, 0.31, 20), [x * 1.04, 0.155, z * 1.04], [z * 0.25, 0, -x * 0.25])),
);
// Hairpin legs: a steel rod bent into a narrow V
const hairpinCurve = new CatmullRomCurve3([
  new Vector3(-0.04, 0.31, 0), new Vector3(-0.016, 0.05, 0), new Vector3(0, 0.004, 0), new Vector3(0.016, 0.05, 0), new Vector3(0.04, 0.31, 0),
]);
const hairpin = mergeGeometries(
  corners.map(([x, z]) => at(new TubeGeometry(hairpinCurve, 48, 0.0065, 10), [x, 0, z], [0, Math.atan2(z, -x), 0])),
);
// Swivel: plate, column and a weighted disc base
const swivel = mergeGeometries([
  at(new CylinderGeometry(0.13, 0.13, 0.02, 48), [0, 0.295, 0]),
  at(new CylinderGeometry(0.035, 0.035, 0.27, 32), [0, 0.16, 0]),
  at(new CylinderGeometry(0.3, 0.32, 0.024, 64), [0, 0.012, 0]),
]);

const legs = [
  { name: 'Legs_Tapered', slot: 'frame', part: 'legs', variant: 'tapered', geo: tapered },
  { name: 'Legs_Hairpin', slot: 'metal', part: 'legs', variant: 'hairpin', geo: hairpin },
  { name: 'Legs_Swivel', slot: 'metal', part: 'legs', variant: 'swivel', geo: swivel },
];

const hotspots = [
  { name: 'Hotspot_Fabric', hotspot: 'fabric', pos: [0.2, 0.51, 0.3] },
  { name: 'Hotspot_Frame', hotspot: 'frame', pos: [0.42, 0.6, 0.25] },
  { name: 'Hotspot_Legs', hotspot: 'legs', pos: [0.34, 0.12, 0.3] },
  { name: 'Hotspot_Pillow', hotspot: 'pillow', pos: [0, 0.74, -0.08] },
];

// ---------- glTF document ----------
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('Chair');
const root = doc.createNode('LoungeChair').setExtras({ product: 'lounge-chair', units: 'metres' });
scene.addChild(root);

const materials = {
  fabric: doc.createMaterial('Fabric').setBaseColorFactor([0.85, 0.81, 0.75, 1]).setRoughnessFactor(0.9),
  accent: doc.createMaterial('Accent').setBaseColorFactor([0.7, 0.35, 0.23, 1]).setRoughnessFactor(0.9),
  frame: doc.createMaterial('Frame').setBaseColorFactor([0.62, 0.45, 0.3, 1]).setRoughnessFactor(0.6),
  metal: doc.createMaterial('Metal').setBaseColorFactor([0.1, 0.1, 0.11, 1]).setMetallicFactor(1).setRoughnessFactor(0.35),
};

function accessor(type, array) {
  return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

function meshFrom(name, g, material) {
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(g.attributes.position.array)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(g.attributes.normal.array)))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(g.attributes.uv.array)))
    .setMaterial(material);
  if (g.index) prim.setIndices(accessor('SCALAR', new Uint32Array(g.index.array)));
  return doc.createMesh(name).addPrimitive(prim);
}

for (const p of parts) {
  const q = new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0])));
  const node = doc
    .createNode(p.name)
    .setMesh(meshFrom(p.name, p.geo, materials[p.slot]))
    .setTranslation(p.pos)
    .setRotation([q.x, q.y, q.z, q.w])
    .setExtras({ slot: p.slot, ...(p.part ? { part: p.part } : {}) });
  root.addChild(node);
}
for (const l of legs) {
  root.addChild(
    doc.createNode(l.name).setMesh(meshFrom(l.name, l.geo, materials[l.slot])).setExtras({ slot: l.slot, part: l.part, variant: l.variant }),
  );
}
for (const h of hotspots) {
  root.addChild(doc.createNode(h.name).setTranslation(h.pos).setExtras({ hotspot: h.hotspot }));
}

// ---------- write raw + optimised ----------
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const raw = await io.writeBinary(doc);
await doc.transform(dedup(), weld(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const optimised = await io.writeBinary(doc);

await mkdir('public/models', { recursive: true });
await writeFile(OUT, optimised);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let tris = 0;
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives()) tris += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
const stats = { raw: raw.byteLength, optimised: optimised.byteLength, triangles: Math.round(tris), meshes: doc.getRoot().listMeshes().length };
await writeFile('public/models/lounge-chair.stats.json', JSON.stringify(stats, null, 2) + '\n');
console.log(`${OUT}: ${kb(raw.byteLength)} → ${kb(optimised.byteLength)} (${Math.round((1 - optimised.byteLength / raw.byteLength) * 100)}% smaller), ${stats.triangles} triangles, ${stats.meshes} meshes`);

