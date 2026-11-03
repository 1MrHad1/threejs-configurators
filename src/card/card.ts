/**
 * The NFC card: a rounded, bevelled slab plus two face planes that carry the artwork.
 *
 * Artwork is drawn to canvases on every change, then used as:
 *   map        colour (print ink, engraving colour, or the wood grain itself)
 *   bumpMap    engraving depth (metal + wood), so text catches light at an angle
 *   roughness  metal: brushed streaks, with rougher engraved areas
 */
import {
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three';
import { brushedRoughness, woodTexture } from '../shared/textures';
import type { Material, Surface, Tone } from './catalogue';

export const CARD_W = 8.56;
export const CARD_H = 5.4;
const RADIUS = 0.34;
const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * CARD_H) / CARD_W);

export interface CardDesign {
  material: Material;
  tone: Tone;
  surface?: Surface;
  name: string;
  title: string;
  company: string;
  layout: 'left' | 'center';
  logo: ImageBitmap | null;
}

function roundedRect(w: number, h: number, r: number) {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** ShapeGeometry UVs are in shape units; remap them to 0..1 across the card. */
function faceGeometry(shape: Shape) {
  const g = new ShapeGeometry(shape, 24);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) / CARD_W + 0.5, uv.getY(i) / CARD_H + 0.5);
  }
  return g;
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  return c;
}

export class NfcCard {
  readonly group = new Group();
  /** Chip position in card-local space (on the back face). */
  readonly chipLocal = new Vector3(2.35, 0.95, 0);

  private body: Mesh<ExtrudeGeometry, MeshPhysicalMaterial>;
  private front: Mesh<ShapeGeometry, MeshPhysicalMaterial>;
  private back: Mesh<ShapeGeometry, MeshPhysicalMaterial>;
  private readonly shape = roundedRect(CARD_W, CARD_H, RADIUS);
  private readonly faces = {
    front: { color: canvas(), mask: canvas(), rough: canvas() },
    back: { color: canvas(), mask: canvas(), rough: canvas() },
  };
  private readonly textures = new Map<string, CanvasTexture>();
  private thickness = 0;

  constructor() {
    const edge = new MeshPhysicalMaterial();
    this.body = new Mesh(new ExtrudeGeometry(this.shape, { depth: 0.01 }), edge);
    const faceGeo = faceGeometry(this.shape);
    this.front = new Mesh(faceGeo, this.faceMaterial('front'));
    this.back = new Mesh(faceGeo, this.faceMaterial('back'));
    this.back.rotation.y = Math.PI;
    this.group.add(this.body, this.front, this.back);
  }

  private faceMaterial(side: 'front' | 'back') {
    const f = this.faces[side];
    const map = this.texture(`${side}:color`, f.color, true);
    return new MeshPhysicalMaterial({
      map,
      bumpMap: this.texture(`${side}:mask`, f.mask),
      roughnessMap: this.texture(`${side}:rough`, f.rough),
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
  }

  private texture(key: string, c: HTMLCanvasElement, color = false) {
    const t = new CanvasTexture(c);
    t.anisotropy = 8;
    if (color) t.colorSpace = SRGBColorSpace;
    this.textures.set(key, t);
    return t;
  }

  /** Rebuild the slab only when the thickness changes (i.e. on material change). */
  private setThickness(t: number) {
    if (t === this.thickness) return;
    this.thickness = t;
    const bevel = Math.min(0.025, t * 0.25);
    const geo = new ExtrudeGeometry(this.shape, {
      depth: t - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 24,
    });
    geo.center();
    this.body.geometry.dispose();
    this.body.geometry = geo;
    this.front.position.z = t / 2 + 0.0015;
    this.back.position.z = -t / 2 - 0.0015;
  }

  apply(d: CardDesign) {
    const { material: m, tone: t, surface: s } = d;
    this.setThickness(m.thickness);

    const edge = this.body.material;
    const mats = [edge, this.front.material, this.back.material];
    const grain = Array.isArray(t.color) ? woodTexture(t.id, t.color, t.id.length * 13) : null;

    for (const mat of mats) {
      mat.clearcoat = 0;
      mat.sheen = 0;
      mat.bumpScale = 0;
      mat.envMapIntensity = 1;
      if (m.id === 'pvc') {
        const gloss = s?.id !== 'matte';
        mat.metalness = 0;
        mat.roughness = gloss ? 0.32 : 0.78;
        mat.clearcoat = gloss ? 1 : 0;
        mat.clearcoatRoughness = 0.06;
      } else if (m.id === 'metal') {
        const mirror = s?.id === 'mirror';
        mat.metalness = 1;
        mat.roughness = mirror ? 0.12 : 1; // brushed uses the roughness map
        mat.bumpScale = 1.2;
      } else {
        // Oiled wood: fairly rough, and a little less reflective than the studio default
        mat.metalness = 0;
        mat.roughness = 0.62;
        mat.envMapIntensity = 0.75;
        mat.bumpScale = 2.4;
      }
    }

    // Edge: same substance as the faces
    edge.map = grain;
    edge.roughnessMap = m.id === 'metal' && s?.id !== 'mirror' ? brushedRoughness() : null;
    edge.color.set(Array.isArray(t.color) ? '#ffffff' : t.color);
    edge.needsUpdate = true;

    this.drawFace('front', d, grain);
    this.drawFace('back', d, grain);
    const brushed = m.id === 'metal' && s?.id !== 'mirror';
    for (const side of ['front', 'back'] as const) {
      const mat = this[side].material;
      mat.color.set('#ffffff');
      mat.roughnessMap = brushed ? this.textures.get(`${side}:rough`)! : null;
      mat.needsUpdate = true;
    }
  }

  private drawFace(side: 'front' | 'back', d: CardDesign, grain: Texture | null) {
    const f = this.faces[side];
    const g = f.color.getContext('2d')!;
    const mask = f.mask.getContext('2d')!;
    const rough = f.rough.getContext('2d')!;
    const { material: m, tone: t } = d;

    // Background
    if (grain) {
      const img = grain.image as HTMLCanvasElement;
      g.drawImage(img, side === 'front' ? 0 : 200, 0, TEX_W, TEX_H, 0, 0, TEX_W, TEX_H);
    } else {
      g.fillStyle = t.color as string;
      g.fillRect(0, 0, TEX_W, TEX_H);
      if (m.id === 'pvc') {
        // A faint diagonal sheen band so print reads as a real card
        const band = g.createLinearGradient(0, 0, TEX_W, TEX_H);
        band.addColorStop(0, 'rgba(255,255,255,0.05)');
        band.addColorStop(0.5, 'rgba(255,255,255,0)');
        band.addColorStop(1, 'rgba(0,0,0,0.06)');
        g.fillStyle = band;
        g.fillRect(0, 0, TEX_W, TEX_H);
      }
    }
    // Engraving mask: white = surface, dark = engraved
    mask.fillStyle = '#ffffff';
    mask.fillRect(0, 0, TEX_W, TEX_H);
    // Roughness: brushed streaks, engraved areas rougher
    rough.drawImage(brushedRoughness().image as HTMLCanvasElement, 0, 0, TEX_W, TEX_H);

    const engrave = m.mode === 'engrave';
    const ink = t.ink;
    const paint = (fn: (ctx: CanvasRenderingContext2D, color: string) => void) => {
      if (engrave && m.id === 'wood') {
        g.save();
        g.shadowColor = 'rgba(30,14,4,0.85)';
        g.shadowBlur = 4;
        fn(g, ink);
        g.restore();
      } else {
        fn(g, ink);
      }
      fn(mask, engrave ? '#3a3a3a' : '#ffffff');
      fn(rough, engrave ? '#d8d8d8' : '#7a7a7a');
    };

    if (side === 'front') this.drawFront(paint, d);
    else this.drawBack(paint);

    for (const key of ['color', 'mask', 'rough']) this.textures.get(`${side}:${key}`)!.needsUpdate = true;
  }

  private drawFront(paint: (fn: (ctx: CanvasRenderingContext2D, color: string) => void) => void, d: CardDesign) {
    const center = d.layout === 'center';
    const pad = 86;
    const x = center ? TEX_W / 2 : pad;
    const align: CanvasTextAlign = center ? 'center' : 'left';
    const name = d.name.trim() || 'Your Name';
    const title = d.title.trim();
    const company = d.company.trim();

    paint((ctx, color) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';

      // Logo: uploaded image (tinted to the ink colour) or a monogram
      const logoSize = 92;
      const lx = center ? TEX_W / 2 - logoSize / 2 : pad;
      const ly = center ? 110 : pad;
      if (d.logo) {
        drawTintedLogo(ctx, d.logo, lx, ly, logoSize, color);
      } else {
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.roundRect(lx, ly, logoSize, logoSize, 22);
        ctx.stroke();
        ctx.font = '600 44px Geist, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials(name), lx + logoSize / 2, ly + logoSize / 2 + 2);
        ctx.textAlign = align;
        ctx.textBaseline = 'alphabetic';
      }

      const baseY = center ? 400 : 470;
      ctx.font = `600 ${fitFont(ctx, name, 64, TEX_W - pad * 2)}px Geist, system-ui, sans-serif`;
      ctx.fillText(name, x, baseY);
      ctx.font = '400 34px Geist, system-ui, sans-serif';
      if (title) ctx.fillText(title, x, baseY + 52);
      if (company) {
        ctx.font = '500 26px "Geist Mono", ui-monospace, monospace';
        ctx.fillText(company.toUpperCase(), x, baseY + (title ? 98 : 52));
      }

      // Contactless mark, top-right
      if (!center) drawContactless(ctx, TEX_W - pad - 24, pad + 40, 1);
    });
  }

  private drawBack(paint: (fn: (ctx: CanvasRenderingContext2D, color: string) => void) => void) {
    paint((ctx, color) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      drawContactless(ctx, TEX_W / 2, TEX_H / 2 - 40, 2.4);
      ctx.textAlign = 'center';
      ctx.font = '600 38px Geist, system-ui, sans-serif';
      ctx.fillText('Tap to connect', TEX_W / 2, TEX_H / 2 + 120);
      ctx.font = '400 24px "Geist Mono", ui-monospace, monospace';
      ctx.fillText('works with any NFC phone', TEX_W / 2, TEX_H / 2 + 162);
    });
  }

  /**
   * What the printable exporter needs: the slab it cuts into, and the engraving masks.
   * These are the same canvases that drive the bump map on screen, so the exported mesh
   * and the preview can never disagree about what is cut.
   */
  printableInput() {
    return {
      width: CARD_W,
      height: CARD_H,
      radius: RADIUS,
      thickness: this.thickness,
      front: this.faces.front.mask,
      back: this.faces.back.mask,
    };
  }

  /** World-space position of the chip (for the hotspot). */
  chipWorld(target = new Vector3()) {
    return target.set(-this.chipLocal.x, this.chipLocal.y, -this.thickness / 2 - 0.02).applyMatrix4(this.group.matrixWorld);
  }

  dispose() {
    this.textures.forEach((t) => t.dispose());
    this.body.geometry.dispose();
    this.front.geometry.dispose();
  }
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || 'YN'
  );
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, max: number, width: number) {
  let size = max;
  while (size > 30) {
    ctx.font = `600 ${size}px Geist, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= width) break;
    size -= 2;
  }
  return size;
}

function drawContactless(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 5 * scale;
  for (let i = 0; i < 4; i++) {
    const r = (10 + i * 12) * scale;
    ctx.beginPath();
    ctx.arc(x - 26 * scale, y, r, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw an uploaded logo as a single-colour silhouette in the ink colour. */
function drawTintedLogo(ctx: CanvasRenderingContext2D, logo: ImageBitmap, x: number, y: number, size: number, color: string) {
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = size * 2;
  const t = tmp.getContext('2d')!;
  const k = Math.min((size * 2) / logo.width, (size * 2) / logo.height);
  const w = logo.width * k;
  const h = logo.height * k;
  t.drawImage(logo, (size * 2 - w) / 2, (size * 2 - h) / 2, w, h);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = color;
  t.fillRect(0, 0, size * 2, size * 2);
  ctx.drawImage(tmp, x, y, size, size);
}
