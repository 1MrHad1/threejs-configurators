import '../shared/configurator.css';
import {
  Box3,
  Color,
  Group,
  LoadingManager,
  Mesh,
  MeshPhysicalMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Viewer, type CameraView } from '../shared/viewer';
import { choiceGroup, inr, readState, writeState } from '../shared/ui';
import { fabricBump, woodTexture } from '../shared/textures';
import { mountCart } from '../shared/cart-ui';
import {
  ARMS, BASE_PRICE, byId, COLOURS, FABRICS, LEGS, METALS, PILLOWS, SIZES, WOODS, type Finish,
} from './catalogue';

const VIEWS: Record<string, CameraView> = {
  angle: { position: [1.9, 1.15, 2.3], target: [0, 0.45, 0] },
  front: { position: [0, 0.8, 3.1], target: [0, 0.48, 0] },
  side: { position: [3.1, 0.8, 0], target: [0, 0.48, 0] },
  legs: { position: [1.05, 0.35, 1.2], target: [0.1, 0.18, 0] },
};

// ---------- state ----------
const ids = <T extends { id: string }>(l: T[]) => l.map((o) => o.id);
const state = readState(
  { fabric: 'boucle', colour: 'oat', wood: 'oak', metal: 'black', legs: 'tapered', arms: 'on', pillow: 'terracotta', size: 'm' },
  {
    fabric: ids(FABRICS), colour: ids(COLOURS), wood: ids(WOODS), metal: ids(METALS),
    legs: ids(LEGS), arms: ids(ARMS), pillow: ids(PILLOWS), size: ids(SIZES),
  },
);

// ---------- viewer ----------
const stageEl = document.getElementById('stage')!;
const loaderEl = stageEl.querySelector<HTMLElement>('.loader')!;
const viewer = new Viewer(stageEl, { minDistance: 1.2, maxDistance: 5, shadowRadius: 0.75 });
viewer.setShadow(0.001, 0.72);
viewer.setView({ position: [2.6, 1.5, 3.2], target: [0, 0.45, 0] });

// One material per slot. Every mesh tagged with that slot shares it, so a colour change is
// one uniform update, not a traversal.
const mat = {
  fabric: new MeshPhysicalMaterial(),
  accent: new MeshPhysicalMaterial(),
  frame: new MeshPhysicalMaterial(),
  metal: new MeshPhysicalMaterial({ metalness: 1 }),
};

// Configurable parts are wrapped in pivot groups. The configurator animates the pivots and
// never writes to the glTF nodes themselves: meshopt quantisation stores the dequantise
// factor in each node's scale/translation, so overwriting those would distort the mesh.
const parts = new Map<string, Group[]>();
const variants = new Map<string, Group>();
const pivots = new Map<string, Group>();
const hotspotNodes = new Map<string, Object3D>();
let baseDims = new Vector3();

function pivot(node: Object3D, anchor: 'center' | 'bottom') {
  const box = new Box3().setFromObject(node);
  const at = box.getCenter(new Vector3());
  if (anchor === 'bottom') at.y = box.min.y;
  const g = new Group();
  g.name = `${node.name}_pivot`;
  node.parent!.add(g);
  g.position.copy(at);
  g.userData.base = at.clone();
  g.attach(node); // keeps the node's world transform, re-parented under the pivot
  return g;
}

// ---------- load the model ----------
const manager = new LoadingManager();
manager.onProgress = (_url, loaded, total) => {
  loaderEl.dataset.progress = '';
  loaderEl.style.setProperty('--progress', `${Math.round((loaded / total) * 100)}%`);
};
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);

loader.load(
  `${import.meta.env.BASE_URL}models/lounge-chair.glb`,
  (gltf) => {
    const model = gltf.scene;
    const tagged: Object3D[] = [];
    model.traverse((o) => {
      const { slot, hotspot } = o.userData as Record<string, string | undefined>;
      if (hotspot) hotspotNodes.set(hotspot, o);
      if (o instanceof Mesh && slot && slot in mat) o.material = mat[slot as keyof typeof mat];
      if (o.userData.slot) tagged.push(o);
    });
    model.updateMatrixWorld(true);
    baseDims = new Box3().setFromObject(model).getSize(new Vector3());
    for (const o of tagged) {
      const { part, variant } = o.userData as Record<string, string | undefined>;
      const g = pivot(o, part === 'legs' ? 'bottom' : 'center');
      pivots.set(o.name, g);
      if (variant) variants.set(variant, g);
      else if (part) parts.set(part, [...(parts.get(part) ?? []), g]);
    }
    viewer.stage.add(model);
    addHotspots();
    apply({ animate: false });
    stageEl.classList.add('is-ready');
    viewer.goTo(VIEWS.angle, 1.3);
  },
  undefined,
  (err) => {
    console.error(err);
    loaderEl.innerHTML = '<p class="load-error">The 3D model failed to load. Please refresh.</p>';
  },
);

// ---------- materials ----------
function applyFabric(m: MeshPhysicalMaterial, colour: string) {
  const fabric = byId(FABRICS, state.fabric);
  const bump = fabricBump(fabric.kind);
  bump.repeat.set(3, 3);
  m.color.set(colour);
  m.bumpMap = bump;
  m.sheen = 0;
  m.clearcoat = 0;
  if (fabric.kind === 'boucle') {
    m.roughness = 0.95;
    m.bumpScale = 3;
  } else if (fabric.kind === 'velvet') {
    // Velvet: a bright, soft sheen at grazing angles is what sells it
    m.roughness = 0.75;
    m.sheen = 1;
    m.sheenRoughness = 0.35;
    m.sheenColor.copy(new Color(colour).lerp(new Color('#ffffff'), 0.45));
    m.bumpScale = 0.6;
  } else {
    m.roughness = 0.42;
    m.clearcoat = 0.25;
    m.clearcoatRoughness = 0.4;
    m.bumpScale = 1.4;
  }
  m.needsUpdate = true;
}

function applyWood(m: MeshPhysicalMaterial, w: Finish) {
  const tex = woodTexture(`chair-${w.id}`, w.color as [string, string], w.id.length * 17);
  tex.repeat.set(1, 1);
  m.map = tex;
  m.color.set('#ffffff');
  m.roughness = w.roughness;
  m.metalness = 0;
  m.needsUpdate = true;
}

function applyMetal(m: MeshPhysicalMaterial, f: Finish) {
  m.color.set(f.color as string);
  m.roughness = f.roughness;
  m.metalness = 1;
}

// ---------- apply the whole configuration ----------
let shownLegs = '';
function apply({ animate = true } = {}) {
  const colour = byId(COLOURS, state.colour).hex;
  applyFabric(mat.fabric, colour);
  const pillow = byId(PILLOWS, state.pillow);
  applyFabric(mat.accent, pillow.id === 'match' || pillow.id === 'none' ? colour : byId(COLOURS, pillow.id).hex);
  applyWood(mat.frame, byId(WOODS, state.wood));
  applyMetal(mat.metal, byId(METALS, state.metal));

  // Legs: exactly one variant visible; the new one grows into place
  if (state.legs !== shownLegs) {
    for (const [id, node] of variants) node.visible = id === state.legs;
    const legs = variants.get(state.legs);
    if (legs && animate) {
      legs.scale.y = 0.001;
      viewer.tween(legs.scale, { y: 1, duration: 0.7, ease: 'back.out(1.6)' });
    }
    shownLegs = state.legs;
  }

  toggle('arms', state.arms === 'on', animate);
  toggle('pillow', pillow.id !== 'none', animate);

  // Size: widen the body, move the arms out, spread the legs
  const s = byId(SIZES, state.size).scale;
  const d = animate ? 0.8 : 0;
  for (const name of ['Frame', 'Seat', 'Back']) {
    const g = pivots.get(name);
    if (g) viewer.tween(g.scale, { x: s, duration: d });
  }
  for (const name of ['Arm_L', 'Arm_R']) {
    const g = pivots.get(name);
    if (g) viewer.tween(g.position, { x: (g.userData.base as Vector3).x * s, duration: d });
  }
  for (const node of variants.values()) viewer.tween(node.scale, { x: s, duration: d });
  const fabricHotspot = hotspotNodes.get('fabric');
  if (fabricHotspot) viewer.tween(fabricHotspot.position, { x: 0.2 * s, duration: d });
  const frameHotspot = hotspotNodes.get('frame');
  if (frameHotspot) viewer.tween(frameHotspot.position, { x: 0.42 * s, duration: d });

  updateSummary();
  writeState(state);
  viewer.invalidate();
}

function toggle(part: string, on: boolean, animate: boolean) {
  for (const node of parts.get(part) ?? []) {
    if (on === node.visible && node.scale.y === 1) continue;
    if (!animate) {
      node.visible = on;
      continue;
    }
    if (on) {
      node.visible = true;
      node.scale.y = 0.001;
      viewer.tween(node.scale, { y: 1, duration: 0.5, ease: 'back.out(1.4)' });
    } else {
      viewer.tween(node.scale, { y: 0.001, duration: 0.35, ease: 'power2.in' }).then(() => {
        node.visible = false;
        node.scale.y = 1;
        viewer.invalidate();
      });
    }
  }
}

// ---------- hotspots ----------
function addHotspots() {
  const focus = (groupId: string, view?: CameraView) => {
    if (view) viewer.goTo(view);
    const el = document.getElementById(`group-${groupId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('is-flash');
    setTimeout(() => el?.classList.remove('is-flash'), 1200);
  };
  const world = (key: string) => () => hotspotNodes.get(key)!.getWorldPosition(new Vector3());
  viewer.addHotspot({ id: 'fabric', label: 'Upholstery: bouclé, velvet or leather', position: world('fabric'), onSelect: () => focus('fabric', VIEWS.angle) });
  viewer.addHotspot({ id: 'frame', label: 'Solid wood frame', position: world('frame'), visible: () => state.arms === 'on', onSelect: () => focus('wood', VIEWS.side) });
  viewer.addHotspot({ id: 'legs', label: 'Choose the legs', position: world('legs'), onSelect: () => focus('legs', VIEWS.legs) });
  viewer.addHotspot({ id: 'pillow', label: 'Lumbar pillow', position: world('pillow'), visible: () => state.pillow !== 'none', onSelect: () => focus('pillow', VIEWS.front) });
}

// ---------- UI ----------
const optionsEl = document.getElementById('options')!;
const swatch = (hex: string) => hex;
const woodSwatch = (w: Finish) => `repeating-linear-gradient(175deg, ${(w.color as string[])[0]} 0 4px, ${(w.color as string[])[1]} 4px 6px)`;
const metalSwatch = (f: Finish) => `linear-gradient(135deg, ${f.color}, #ffffff88 45%, ${f.color} 65%)`;
const priceNote = (p?: number) => (p ? `${p > 0 ? '+' : '−'}${inr(Math.abs(p))}` : undefined);

const set = (key: keyof typeof state) => (v: string) => {
  state[key] = v;
  if (key === 'legs') metalGroup.el.hidden = v === 'tapered';
  if (key === 'legs') viewer.goTo(VIEWS.legs);
  apply();
};

choiceGroup(optionsEl, { id: 'fabric', label: 'Upholstery', value: state.fabric, choices: FABRICS.map((f) => ({ value: f.id, label: f.label, note: priceNote(f.price) ?? f.note })), onChange: set('fabric') });
choiceGroup(optionsEl, { id: 'colour', label: 'Colour', value: state.colour, choices: COLOURS.map((c) => ({ value: c.id, label: c.label, swatch: swatch(c.hex) })), onChange: set('colour') });
choiceGroup(optionsEl, { id: 'legs', label: 'Legs', value: state.legs, choices: LEGS.map((l) => ({ value: l.id, label: l.label, note: priceNote(l.price) })), onChange: set('legs') });
choiceGroup(optionsEl, { id: 'wood', label: 'Wood finish', value: state.wood, choices: WOODS.map((w) => ({ value: w.id, label: w.label, swatch: woodSwatch(w) })), onChange: set('wood') });
const metalGroup = choiceGroup(optionsEl, { id: 'metal', label: 'Metal finish', value: state.metal, choices: METALS.map((m) => ({ value: m.id, label: m.label, swatch: metalSwatch(m) })), onChange: set('metal') });
metalGroup.el.hidden = state.legs === 'tapered';
choiceGroup(optionsEl, { id: 'arms', label: 'Arms', value: state.arms, choices: ARMS.map((a) => ({ value: a.id, label: a.label, note: priceNote(a.price) })), onChange: set('arms') });
choiceGroup(optionsEl, {
  id: 'pillow', label: 'Lumbar pillow', value: state.pillow,
  choices: PILLOWS.map((p) => {
    const c = COLOURS.find((x) => x.id === p.id);
    return c ? { value: p.id, label: `${p.label} pillow`, swatch: c.hex } : { value: p.id, label: p.label, note: priceNote(p.price) };
  }),
  onChange: set('pillow'),
});
const sizeGroup = choiceGroup(optionsEl, { id: 'size', label: 'Size', value: state.size, choices: [], onChange: set('size') });

const priceEl = document.getElementById('price')!;
const perEl = document.getElementById('per')!;

function dims(sizeId: string) {
  const s = byId(SIZES, sizeId).scale;
  const width = (state.arms === 'on' ? baseDims.x : 0.8) * s;
  return { w: Math.round(width * 100), d: Math.round(baseDims.z * 100), h: Math.round(baseDims.y * 100) };
}

function total() {
  return (
    BASE_PRICE +
    (byId(FABRICS, state.fabric).price ?? 0) +
    (byId(LEGS, state.legs).price ?? 0) +
    (byId(ARMS, state.arms).price ?? 0) +
    (byId(PILLOWS, state.pillow).price ?? 0) +
    (byId(SIZES, state.size).price ?? 0)
  );
}

function updateSummary() {
  if (baseDims.lengthSq() > 0) {
    sizeGroup.update({
      value: state.size,
      choices: SIZES.map((sz) => {
        const d = dims(sz.id);
        return { value: sz.id, label: sz.label, note: `${d.w} × ${d.d} × ${d.h} cm` };
      }),
    });
  }
  priceEl.textContent = inr(total());
  const d = baseDims.lengthSq() > 0 ? dims(state.size) : null;
  perEl.textContent = d ? `W ${d.w} · D ${d.d} · H ${d.h} cm` : '';
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    viewer.goTo(VIEWS[b.dataset.view!]);
  }),
);

mountCart({
  viewer,
  line: () => {
    const size = byId(SIZES, state.size);
    const d = dims(state.size);
    const pillow = byId(PILLOWS, state.pillow);
    return {
      id: size.variantId,
      quantity: 1,
      properties: {
        Upholstery: `${byId(FABRICS, state.fabric).label}, ${byId(COLOURS, state.colour).label}`,
        Legs: byId(LEGS, state.legs).label,
        'Wood finish': byId(WOODS, state.wood).label,
        ...(state.legs !== 'tapered' ? { 'Metal finish': byId(METALS, state.metal).label } : {}),
        Arms: byId(ARMS, state.arms).label,
        Pillow: pillow.id === 'none' ? 'None' : pillow.id === 'match' ? 'Matching' : `${pillow.label} contrast`,
        Size: `${size.label} (${d.w} × ${d.d} × ${d.h} cm)`,
        _sku: size.sku,
        _price_quote: String(total()),
        _config: location.href,
      },
    };
  },
  filename: () => `lounge-chair-${state.fabric}-${state.colour}.png`,
});

updateSummary();

if (new URLSearchParams(location.search).has('debug')) {
  const out = document.createElement('pre');
  out.className = 'debug';
  stageEl.append(out);
  setInterval(() => {
    const s = viewer.stats;
    out.textContent = `draw calls ${s.calls}\ntriangles ${s.triangles}\ngeometries ${s.geometries}\ntextures ${s.textures}`;
  }, 500);
}
