import '../shared/configurator.css';
import { Viewer, type CameraView } from '../shared/viewer';
import { choiceGroup, inr, rafThrottle, readState, writeState } from '../shared/ui';
import { mountCart } from '../shared/cart-ui';
import { resolveVariantId } from '../shared/shopify';
import { MATERIALS, material, pack, surface, swatchCss, tone } from './catalogue';
import { NfcCard, type CardDesign } from './card';
import { buildPrintableCard, encodeObj, encodeStl } from './printable';

const VIEWS: Record<string, CameraView> = {
  front: { position: [0, 0.3, 17.5], target: [0, 0, 0] },
  back: { position: [0, 0.3, 17.5], target: [0, 0, 0] },
  angle: { position: [10.5, 3.4, 12.5], target: [0, 0, 0] },
};

// ---------- state (shareable through the URL) ----------
const state = readState(
  { m: 'metal', t: 'black', s: 'brushed', name: 'Haseeb Ahmed Danish', title: 'Senior Full-Stack Developer', company: 'Studio', layout: 'left', qty: '1' },
  { m: MATERIALS.map((m) => m.id), layout: ['left', 'center'], qty: ['1', '10', '25', '50', '100'] },
);
// Values from an old or hand-edited link may not exist for the chosen material
{
  const m = material(state.m);
  state.t = tone(m, state.t).id;
  state.s = surface(m, state.s)?.id ?? '';
  state.qty = String(pack(m, Number(state.qty)).qty);
}
let logo: ImageBitmap | null = null;

const stageEl = document.getElementById('stage')!;
const viewer = new Viewer(stageEl, { minDistance: 8, maxDistance: 26, shadowRadius: 5.5 });
viewer.controls.maxPolarAngle = Math.PI * 0.62;
viewer.setShadow(-3.6, 5.4);

const card = new NfcCard();
viewer.stage.add(card.group);

// ---------- options ----------
const optionsEl = document.getElementById('options')!;
const current = () => material(state.m);

choiceGroup(optionsEl, {
  id: 'm',
  label: 'Material',
  value: state.m,
  choices: MATERIALS.map((m) => ({ value: m.id, label: m.label, note: `${m.note} · from ${inr(m.packs[0].price)}` })),
  onChange: (v) => {
    state.m = v;
    const m = current();
    state.t = m.tones[0].id;
    state.s = m.surfaces?.[0].id ?? '';
    if (!m.packs.some((p) => String(p.qty) === state.qty)) state.qty = String(m.packs[0].qty);
    refreshGroups();
    // A small turn so the new material catches the light
    viewer.tween(card.group.rotation, { y: card.group.rotation.y + Math.PI * 2, duration: 1.1, ease: 'power2.inOut' });
    update();
  },
});

const toneGroup = choiceGroup(optionsEl, { id: 't', label: '', value: '', choices: [], onChange: (v) => { state.t = v; update(); } });
const surfaceGroup = choiceGroup(optionsEl, { id: 's', label: '', value: '', choices: [], onChange: (v) => { state.s = v; update(); } });
const packGroup = choiceGroup(document.getElementById('packs')!, { id: 'qty', label: 'Pack size', value: '', choices: [], onChange: (v) => { state.qty = v; update(); } });

function refreshGroups() {
  const m = current();
  toneGroup.update({
    label: m.toneLabel,
    value: tone(m, state.t).id,
    choices: m.tones.map((t) => ({ value: t.id, label: t.label, swatch: swatchCss(m, t) })),
  });
  surfaceGroup.el.hidden = !m.surfaces;
  if (m.surfaces) {
    surfaceGroup.update({
      label: m.surfaceLabel!,
      value: surface(m, state.s)!.id,
      choices: m.surfaces.map((s) => ({ value: s.id, label: s.label })),
    });
  }
  packGroup.update({
    value: String(pack(m, Number(state.qty)).qty),
    choices: m.packs.map((p) => ({ value: String(p.qty), label: `${p.qty}`, note: inr(Math.round(p.price / p.qty)) + '/card' })),
  });
}

// ---------- personalisation ----------
const form = document.getElementById('personalise') as HTMLFormElement;
for (const key of ['name', 'title', 'company'] as const) {
  const input = form.elements.namedItem(key) as HTMLInputElement;
  input.value = state[key];
  input.addEventListener('input', rafThrottle(() => { state[key] = input.value; update(); }));
}
const layoutInputs = form.querySelectorAll<HTMLInputElement>('input[name="layout"]');
layoutInputs.forEach((i) => {
  i.checked = i.value === state.layout;
  i.addEventListener('change', () => { state.layout = i.value; update(); });
});
const logoInput = form.elements.namedItem('logo') as HTMLInputElement;
const logoClear = document.getElementById('logo-clear') as HTMLButtonElement;
logoInput.addEventListener('change', async () => {
  const file = logoInput.files?.[0];
  if (!file) return;
  if (file.size > 4_000_000) {
    alert('Please choose an image under 4 MB.');
    logoInput.value = '';
    return;
  }
  logo?.close();
  logo = await createImageBitmap(file, { resizeWidth: 256, resizeQuality: 'high' }).catch(() => null);
  logoClear.hidden = !logo;
  viewer.goTo(VIEWS.front);
  flipTo('front');
  update();
});
logoClear.addEventListener('click', () => {
  logo?.close();
  logo = null;
  logoInput.value = '';
  logoClear.hidden = true;
  update();
});

// ---------- views ----------
let side: 'front' | 'back' = 'front';
function flipTo(next: 'front' | 'back') {
  if (next === side) return;
  side = next;
  const base = Math.round(card.group.rotation.y / Math.PI) * Math.PI;
  viewer.tween(card.group.rotation, { y: base + Math.PI, duration: 0.9 });
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
  b.addEventListener('click', () => {
    const v = b.dataset.view!;
    document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (v === 'back') flipTo('back');
    else if (v === 'front') flipTo('front');
    viewer.goTo(VIEWS[v]);
  }),
);

viewer.addHotspot({
  id: 'chip',
  label: 'NFC chip inside: tap any phone to share your profile',
  position: () => card.chipWorld(),
});

// ---------- price, summary, cart ----------
const priceEl = document.getElementById('price')!;
const perEl = document.getElementById('per')!;

function design(): CardDesign {
  const m = current();
  return {
    material: m,
    tone: tone(m, state.t),
    surface: surface(m, state.s),
    name: state.name,
    title: state.title,
    company: state.company,
    layout: state.layout === 'center' ? 'center' : 'left',
    logo,
  };
}

function update() {
  const d = design();
  card.apply(d);
  const p = pack(d.material, Number(state.qty));
  priceEl.textContent = inr(p.price);
  perEl.textContent = p.qty > 1 ? `${p.qty} cards · ${inr(Math.round(p.price / p.qty))} each` : '1 card';
  refreshPrintNote();
  writeState(state);
  viewer.invalidate();
}

mountCart({
  viewer,
  line: () => {
    const d = design();
    const p = pack(d.material, Number(state.qty));
    return {
      id: resolveVariantId(p.sku, p.variantId),
      quantity: 1,
      properties: {
        Material: d.material.label,
        [d.material.toneLabel]: d.tone.label,
        ...(d.surface ? { [d.material.surfaceLabel!]: d.surface.label } : {}),
        Name: d.name,
        ...(d.title ? { Title: d.title } : {}),
        ...(d.company ? { Company: d.company } : {}),
        Layout: d.layout === 'center' ? 'Centred' : 'Left-aligned',
        ...(logo ? { Logo: 'Uploaded (sent separately)' } : {}),
        _sku: p.sku,
        _config: location.href,
      },
    };
  },
  filename: () => `nfc-card-${state.m}-${state.t}.png`,
});

// ---------- 3D print export ----------
// The engraving on screen is a bump map, so a naive export would be a blank slab.
// buildPrintableCard rebuilds the card as a closed mesh and cuts the same mask into
// it as real geometry, which is what a slicer needs.
const printNote = document.getElementById('print-note')!;
const printStatus = document.getElementById('print-status')!;

const SCENE_UNITS_TO_MM = 10; // the card is modelled at 8.56 x 5.4 units = 85.6 x 54 mm
const ENGRAVE_DEPTH = 0.025; // 0.25 mm, a realistic laser depth
const CELL = 0.03; // 0.3 mm grid: fine enough for the type, small enough to download

function exportMesh(format: 'stl' | 'obj') {
  const d = design();
  card.apply(d); // make sure the masks match what is on screen right now
  const input = card.printableInput();
  printStatus.textContent = 'Building mesh…';

  // Let the status paint before the synchronous build blocks the thread.
  requestAnimationFrame(() => {
    const started = performance.now();
    const mesh = buildPrintableCard({
      ...input,
      engraveDepth: ENGRAVE_DEPTH,
      cell: CELL,
      scale: SCENE_UNITS_TO_MM,
    });
    const name = `nfc-card-${state.m}-${state.t}`;
    const blob =
      format === 'stl'
        ? new Blob([encodeStl(mesh, name)], { type: 'model/stl' })
        : new Blob([encodeObj(mesh, name)], { type: 'model/obj' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.${format}`;
    a.click();
    URL.revokeObjectURL(url);

    const mb = (blob.size / 1_048_576).toFixed(1);
    const ms = Math.round(performance.now() - started);
    const mm = (v: number) => Number(v.toFixed(2));
    // Where the two faces are engraved in the same place the card is thinnest; say so,
    // because that is what fails on a printer rather than in the slicer.
    const thin = mesh.minWall < 0.8 ? ' ⚠ thin' : '';
    printStatus.textContent =
      `${format.toUpperCase()} · ${mesh.triangles.toLocaleString()} triangles · ${mb} MB · ` +
      `${mm(mesh.size.x)} × ${mm(mesh.size.y)} × ${mm(mesh.size.z)} mm · ` +
      `thinnest material ${mesh.minWall.toFixed(2)} mm${thin} · built in ${ms} ms`;
  });
}

document.getElementById('export-stl')!.addEventListener('click', () => exportMesh('stl'));
document.getElementById('export-obj')!.addEventListener('click', () => exportMesh('obj'));

function refreshPrintNote() {
  printNote.textContent =
    current().mode === 'engrave'
      ? 'Your name, title, company and logo are cut into the mesh as real recesses, 0.25 mm deep.'
      : 'PVC is printed rather than engraved, so the exported mesh is a plain slab. Pick metal or wood to cut real geometry.';
}

// ---------- boot ----------
refreshGroups();
viewer.setView({ position: [7, 2.4, 13], target: [0, 0, 0] });
card.group.rotation.y = -0.6;
document.fonts.ready.then(() => {
  update();
  viewer.tween(card.group.rotation, { y: 0, duration: 1.4, ease: 'power3.out' });
  viewer.goTo(VIEWS.front, 1.4);
  stageEl.classList.add('is-ready');
});
