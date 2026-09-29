/**
 * Procedural textures drawn on a canvas at runtime. They replace image files, so a
 * configurator ships no texture downloads, and every variant (wood species, fabric
 * weave) is a few lines of code. Results are cached per key.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

const cache = new Map<string, Texture>();

function make(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, color = false) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  if (color) t.colorSpace = SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Deterministic pseudo-random, so textures look identical on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Wood grain: long, gently wavering fibres with colour banding. `tone` is [light, dark]. */
export function woodTexture(key: string, tone: [string, string], seed = 7) {
  return make(`wood:${key}`, 1024, (g, s) => {
    const r = rng(seed);
    g.fillStyle = tone[0];
    g.fillRect(0, 0, s, s);
    // Broad colour bands (heartwood / sapwood variation)
    for (let i = 0; i < 14; i++) {
      g.globalAlpha = 0.05 + r() * 0.12;
      g.fillStyle = r() > 0.5 ? tone[1] : '#ffffff';
      g.fillRect(0, r() * s, s, 20 + r() * 90);
    }
    // Fibres: many thin, nearly straight lines
    for (let i = 0; i < 420; i++) {
      const y = r() * s;
      const amp = 0.6 + r() * 3.5;
      const freq = 0.002 + r() * 0.006;
      const phase = r() * 10;
      g.strokeStyle = tone[1];
      g.globalAlpha = 0.04 + r() * 0.16;
      g.lineWidth = 0.6 + r() * 1.8;
      g.beginPath();
      for (let x = 0; x <= s; x += 16) {
        const yy = y + Math.sin(x * freq + phase) * amp;
        x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
      }
      g.stroke();
    }
    // Pores
    g.fillStyle = tone[1];
    for (let i = 0; i < 9000; i++) {
      g.globalAlpha = 0.1 + r() * 0.2;
      g.fillRect(r() * s, r() * s, 1 + r() * 4, 1);
    }
    g.globalAlpha = 1;
  }, true);
}

/** Brushed-metal roughness map: fine horizontal streaks. */
export function brushedRoughness() {
  return make('brushed', 512, (g, s) => {
    const r = rng(3);
    g.fillStyle = 'rgb(90,90,90)';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) {
      const v = 60 + r() * 90;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.globalAlpha = 0.35;
      g.fillRect(0, r() * s, s, 1);
    }
    g.globalAlpha = 1;
  });
}

/** Grayscale bump map for fabrics. `kind` changes the weave. */
export function fabricBump(kind: 'boucle' | 'leather' | 'velvet') {
  return make(`fabric:${kind}`, 512, (g, s) => {
    const r = rng(kind.length * 31);
    g.fillStyle = 'rgb(128,128,128)';
    g.fillRect(0, 0, s, s);
    if (kind === 'boucle') {
      // Looped yarn: many small soft blobs
      for (let i = 0; i < 9000; i++) {
        const v = 90 + r() * 120;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.beginPath();
        g.arc(r() * s, r() * s, 1 + r() * 3.5, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 'leather') {
      // Pebbled grain: irregular cells
      for (let i = 0; i < 2600; i++) {
        const v = 110 + r() * 50;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.beginPath();
        g.ellipse(r() * s, r() * s, 3 + r() * 6, 2 + r() * 5, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // Velvet: very fine, soft noise
      for (let i = 0; i < 30000; i++) {
        const v = 115 + r() * 26;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(r() * s, r() * s, 1, 1);
      }
    }
  });
}
