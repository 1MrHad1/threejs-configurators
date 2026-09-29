/**
 * Shared 3D viewer used by every configurator.
 *
 * - PBR lighting from a generated studio environment (no HDR download)
 * - Render-on-demand: a frame is drawn only when something changed, so an idle
 *   configurator costs ~0% GPU. Call `invalidate()` after mutating the scene.
 * - Animated camera presets, DOM hotspots pinned to 3D points, PNG snapshots
 */
import {
  CanvasTexture,
  Clock,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';

export interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
}

export interface Hotspot {
  id: string;
  label: string;
  /** World position, or a function so hotspots can follow parts that move or resize. */
  position: Vector3 | (() => Vector3);
  /** Hide the hotspot when this returns false (e.g. its part is switched off). */
  visible?: () => boolean;
  onSelect?: () => void;
}

interface ViewerOptions {
  fov?: number;
  minDistance?: number;
  maxDistance?: number;
  /** Radius of the soft contact shadow under the product (world units). */
  shadowRadius?: number;
}

export class Viewer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly stage = new Object3D();

  private dirty = true;
  private animating = 0;
  private readonly clock = new Clock();
  private readonly hotspotLayer: HTMLElement;
  private readonly hotspots: { spot: Hotspot; el: HTMLButtonElement }[] = [];
  private readonly raycaster = new Raycaster();
  private readonly shadow: Mesh;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private frameListeners: ((dt: number) => boolean)[] = [];

  constructor(private readonly host: HTMLElement, opts: ViewerOptions = {}) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Khronos PBR Neutral: keeps product colours close to their swatches (ACES desaturates them)
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    host.prepend(this.renderer.domElement);

    // Studio reflections for PBR materials, generated on the GPU once
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new PerspectiveCamera(opts.fov ?? 32, 1, 0.01, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = opts.minDistance ?? 1;
    this.controls.maxDistance = opts.maxDistance ?? 10;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.addEventListener('change', () => this.invalidate());

    // Soft contact shadow: one textured plane, far cheaper than real-time shadow maps
    this.shadow = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: radialShadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar((opts.shadowRadius ?? 1) * 2);
    this.shadow.renderOrder = -1;
    this.scene.add(this.shadow, this.stage);

    this.hotspotLayer = document.createElement('div');
    this.hotspotLayer.className = 'hotspots';
    host.append(this.hotspotLayer);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.loop();
  }

  /** Request a new frame. Cheap to call as often as you like. */
  invalidate() {
    this.dirty = true;
  }

  /** Run a callback every frame until it returns false (for custom animations). */
  onFrame(fn: (dt: number) => boolean) {
    this.frameListeners.push(fn);
    this.invalidate();
  }

  setShadow(y: number, radius: number) {
    this.shadow.position.y = y;
    this.shadow.scale.setScalar(radius * 2);
    this.invalidate();
  }

  /** Tween any object's properties and keep rendering while it runs. */
  tween(target: object, vars: gsap.TweenVars) {
    const duration = this.reducedMotion ? 0 : (vars.duration ?? 0.8);
    this.animating++;
    return gsap.to(target, {
      ease: 'power3.inOut',
      ...vars,
      duration,
      onUpdate: () => this.invalidate(),
      onComplete: () => {
        this.animating--;
        this.invalidate();
      },
    });
  }

  goTo(view: CameraView, duration = 1) {
    const [px, py, pz] = view.position;
    const [tx, ty, tz] = view.target;
    this.tween(this.camera.position, { x: px, y: py, z: pz, duration });
    this.tween(this.controls.target, { x: tx, y: ty, z: tz, duration });
  }

  setView(view: CameraView) {
    this.camera.position.set(...view.position);
    this.controls.target.set(...view.target);
    this.controls.update();
    this.invalidate();
  }

  addHotspot(spot: Hotspot) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hotspot';
    el.setAttribute('aria-label', spot.label);
    el.innerHTML = `<span class="hotspot-dot"></span><span class="hotspot-label">${spot.label}</span>`;
    el.addEventListener('click', () => spot.onSelect?.());
    this.hotspotLayer.append(el);
    this.hotspots.push({ spot, el });
    this.invalidate();
  }

  /** PNG of the current view, e.g. for a cart preview or "save design". */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  get stats() {
    const { render, memory } = this.renderer.info;
    return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private readonly tmp = new Vector3();

  private placeHotspots() {
    const { clientWidth: w, clientHeight: h } = this.host;
    const camDir = new Vector3();
    for (const { spot, el } of this.hotspots) {
      const p = typeof spot.position === 'function' ? spot.position() : spot.position;
      this.tmp.copy(p).project(this.camera);
      const visibleOnScreen = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.05 && Math.abs(this.tmp.y) < 1.05;

      // Hide the hotspot when the product itself is in front of it
      let occluded = false;
      if (visibleOnScreen) {
        camDir.copy(p).sub(this.camera.position);
        const dist = camDir.length();
        this.raycaster.set(this.camera.position, camDir.normalize());
        const hit = this.raycaster.intersectObject(this.stage, true)[0];
        occluded = !!hit && hit.distance < dist - 0.02;
      }

      el.style.transform = `translate(${((this.tmp.x + 1) / 2) * w}px, ${((1 - this.tmp.y) / 2) * h}px)`;
      el.classList.toggle('is-hidden', !visibleOnScreen || occluded || spot.visible?.() === false);
    }
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    const dt = this.clock.getDelta();
    const moving = this.controls.update();
    if (this.frameListeners.length) {
      this.frameListeners = this.frameListeners.filter((fn) => fn(dt));
      this.dirty = true;
    }
    if (!this.dirty && !moving && this.animating === 0) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.placeHotspots();
  };
}

function radialShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}
