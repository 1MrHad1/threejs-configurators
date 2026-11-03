/**
 * Turns the configured card into a solid, watertight mesh and writes it out as STL or OBJ.
 *
 * On screen the engraving is a bump map: a shading trick with no geometry behind it. A
 * printable file cannot fake depth, so this rebuilds the card as real geometry. The same
 * mask canvas that drives the bump map drives a per-vertex displacement here, which cuts
 * the name, title, company and logo into the faces as actual recesses.
 *
 * The card is built as a height field over a regular grid. That keeps the triangulation
 * even enough for small text, and it makes closing the solid trivial: the outer ring of
 * the grid is the card outline, so the side wall is one strip between the two faces.
 * Grid points landing outside a rounded corner are projected onto the arc, which keeps
 * the outline exact; the zero-area triangles that creates are dropped on output.
 */

export interface PrintableOptions {
  width: number;
  height: number;
  radius: number;
  thickness: number;
  /** Depth of the deepest cut, in scene units. */
  engraveDepth: number;
  /** Target grid cell size, in scene units. Smaller means finer text and a bigger file. */
  cell: number;
  /** Engraving masks. White is untouched surface, dark is cut away. */
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  /** Scene units to millimetres. */
  scale: number;
}

export interface Printable {
  /** Triangle soup in millimetres: 9 floats per triangle. */
  positions: Float32Array;
  triangles: number;
  size: { x: number; y: number; z: number };
  /** Thinnest remaining material in mm, i.e. where both faces are cut at the same spot. */
  minWall: number;
  /** True when the engraving actually cut something. Printed cards come out as a plain slab. */
  engraved: boolean;
}

/** Pull a point inside the rounded rectangle, projecting onto the corner arc when outside. */
function clampToRoundedRect(x: number, y: number, hw: number, hh: number, r: number): [number, number] {
  const cx = Math.min(Math.max(x, -(hw - r)), hw - r);
  const cy = Math.min(Math.max(y, -(hh - r)), hh - r);
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d <= r || d === 0) return [x, y];
  return [cx + (dx / d) * r, cy + (dy / d) * r];
}

/** Bilinear reader over a mask canvas. Returns 1 for untouched surface, 0 for the deepest cut. */
function sampler(c: HTMLCanvasElement) {
  const w = c.width;
  const h = c.height;
  const data = c.getContext('2d')!.getImageData(0, 0, w, h).data;
  const at = (x: number, y: number) => data[(y * w + x) * 4]; // masks are greyscale, red is enough
  return (u: number, v: number) => {
    // Texture space has v running up, canvas rows run down.
    const fx = Math.min(Math.max(u, 0), 1) * (w - 1);
    const fy = Math.min(Math.max(1 - v, 0), 1) * (h - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
    const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
    return (top * (1 - ty) + bottom * ty) / 255;
  };
}

export function buildPrintableCard(o: PrintableOptions): Printable {
  const hw = o.width / 2;
  const hh = o.height / 2;
  const nx = Math.max(2, Math.round(o.width / o.cell) + 1);
  const ny = Math.max(2, Math.round(o.height / o.cell) + 1);
  const half = o.thickness / 2;
  // Never cut so deep that the two faces meet.
  const depth = Math.min(o.engraveDepth, o.thickness / 4);

  const front = sampler(o.front);
  const back = sampler(o.back);

  const n = nx * ny;
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const top = new Float64Array(n);
  const bottom = new Float64Array(n);
  let minWall = o.thickness;
  let cut = 0;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const [x, y] = clampToRoundedRect(
        -hw + (o.width * i) / (nx - 1),
        -hh + (o.height * j) / (ny - 1),
        hw,
        hh,
        o.radius,
      );
      vx[k] = x;
      vy[k] = y;

      // Keep the rim flat so the side wall meets both faces cleanly.
      const rim = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      const u = x / o.width + 0.5;
      const v = y / o.height + 0.5;
      const dFront = rim ? 0 : (1 - front(u, v)) * depth;
      // The back mesh is rotated 180 degrees about Y, so its texture runs the other way.
      const dBack = rim ? 0 : (1 - back(1 - u, v)) * depth;
      if (dFront > 1e-6 || dBack > 1e-6) cut++;
      top[k] = half - dFront;
      bottom[k] = -half + dBack;
      minWall = Math.min(minWall, top[k] - bottom[k]);
    }
  }

  const out: number[] = [];
  const push = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
  ) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const nX = uy * wz - uz * wy;
    const nY = uz * wx - ux * wz;
    const nZ = ux * wy - uy * wx;
    // Drop the degenerate triangles the corner projection leaves behind.
    if (nX * nX + nY * nY + nZ * nZ < 1e-12) return;
    out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = (j + 1) * nx + i + 1;
      const d = c - 1;
      // Top face, wound anticlockwise seen from +Z.
      push(vx[a], vy[a], top[a], vx[b], vy[b], top[b], vx[c], vy[c], top[c]);
      push(vx[a], vy[a], top[a], vx[c], vy[c], top[c], vx[d], vy[d], top[d]);
      // Bottom face, wound the other way so it faces -Z.
      push(vx[a], vy[a], bottom[a], vx[c], vy[c], bottom[c], vx[b], vy[b], bottom[b]);
      push(vx[a], vy[a], bottom[a], vx[d], vy[d], bottom[d], vx[c], vy[c], bottom[c]);
    }
  }

  // Outer ring of the grid, anticlockwise seen from +Z.
  const ring: number[] = [];
  for (let i = 0; i < nx - 1; i++) ring.push(i);
  for (let j = 0; j < ny - 1; j++) ring.push(j * nx + nx - 1);
  for (let i = nx - 1; i > 0; i--) ring.push((ny - 1) * nx + i);
  for (let j = ny - 1; j > 0; j--) ring.push(j * nx);

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    push(vx[a], vy[a], top[a], vx[a], vy[a], bottom[a], vx[b], vy[b], bottom[b]);
    push(vx[a], vy[a], top[a], vx[b], vy[b], bottom[b], vx[b], vy[b], top[b]);
  }

  const positions = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) positions[i] = out[i] * o.scale;

  // A closed mesh wound consistently outward encloses a positive signed volume.
  let volume = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (volume < 0) {
    for (let i = 0; i < positions.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const t = positions[i + 3 + k];
        positions[i + 3 + k] = positions[i + 6 + k];
        positions[i + 6 + k] = t;
      }
    }
  }

  return {
    positions,
    triangles: positions.length / 9,
    size: { x: o.width * o.scale, y: o.height * o.scale, z: o.thickness * o.scale },
    minWall: minWall * o.scale,
    engraved: cut > 0,
  };
}

/** Binary STL. Text STL would be roughly five times the size for the same mesh. */
export function encodeStl(p: Printable, header: string): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + p.triangles * 50);
  const view = new DataView(buffer);
  const text = header.slice(0, 79);
  for (let i = 0; i < text.length; i++) view.setUint8(i, text.charCodeAt(i) & 0x7f);
  view.setUint32(80, p.triangles, true);

  let at = 84;
  for (let t = 0; t < p.triangles; t++) {
    const i = t * 9;
    const ax = p.positions[i], ay = p.positions[i + 1], az = p.positions[i + 2];
    const bx = p.positions[i + 3], by = p.positions[i + 4], bz = p.positions[i + 5];
    const cx = p.positions[i + 6], cy = p.positions[i + 7], cz = p.positions[i + 8];
    let nX = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let nY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nZ = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const len = Math.hypot(nX, nY, nZ) || 1;
    nX /= len; nY /= len; nZ /= len;
    view.setFloat32(at, nX, true);
    view.setFloat32(at + 4, nY, true);
    view.setFloat32(at + 8, nZ, true);
    for (let k = 0; k < 9; k++) view.setFloat32(at + 12 + k * 4, p.positions[i + k], true);
    view.setUint16(at + 48, 0, true);
    at += 50;
  }
  return buffer;
}

/** Wavefront OBJ, with vertices shared so the file stays a sane size. */
export function encodeObj(p: Printable, name: string): string {
  const index = new Map<string, number>();
  const verts: string[] = [];
  const faces: string[] = [];
  const idFor = (x: number, y: number, z: number) => {
    const vx = x.toFixed(4), vy = y.toFixed(4), vz = z.toFixed(4);
    const key = `${vx} ${vy} ${vz}`;
    let id = index.get(key);
    if (id === undefined) {
      verts.push(`v ${key}`);
      id = verts.length;
      index.set(key, id);
    }
    return id;
  };
  for (let i = 0; i < p.positions.length; i += 9) {
    const a = idFor(p.positions[i], p.positions[i + 1], p.positions[i + 2]);
    const b = idFor(p.positions[i + 3], p.positions[i + 4], p.positions[i + 5]);
    const c = idFor(p.positions[i + 6], p.positions[i + 7], p.positions[i + 8]);
    faces.push(`f ${a} ${b} ${c}`);
  }
  return `# ${name}\n# units: millimetres\no ${name}\n${verts.join('\n')}\n${faces.join('\n')}\n`;
}
