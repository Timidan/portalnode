import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

export type ShaderCtx = {
  uTime: TslNode;
  uAspect: TslNode;
  uPointer: TslNode;
  uScroll: TslNode;
  reduced: boolean;
};
export type ShaderBuild = (ctx: ShaderCtx) => {
  colorNode: TslNode;
  frame?: (t: number, pointer: THREE.Vector2) => void;
  dispose?: () => void;
};

async function webgpuUsable() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  return !!(await gpu.requestAdapter().catch(() => null));
}

/** Full-bleed TSL shader on three's WebGPURenderer; uses its WebGL2 backend when no WebGPU adapter exists. */
export function ShaderCanvas({ build, scroll = 0, className = '', buildKey }: { build: ShaderBuild; scroll?: number; className?: string; buildKey?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const uScroll = useRef(uniform(0));
  const [backend, setBackend] = useState('none');
  const [ready, setReady] = useState(false);

  useEffect(() => { uScroll.current.value = scroll; }, [scroll]);

  useEffect(() => {
    const canvas = ref.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const uTime = uniform(0);
    const uAspect = uniform(1);
    const pointer = new THREE.Vector2(0.5, 0.5);
    const uPointer = uniform(new THREE.Vector2(0.5, 0.5));
    let renderer: THREE.WebGPURenderer | undefined;
    let built: ReturnType<ShaderBuild> | undefined;
    let ro: ResizeObserver | undefined;
    let io: IntersectionObserver | undefined;
    let visible = true;
    let disposed = false;

    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
    };

    (async () => {
      const gpu = await webgpuUsable();
      if (disposed) return;
      try {
        renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL: !gpu });
        await renderer.init();
      } catch { return; }
      if (disposed) { renderer.dispose(); return; }
      setBackend(gpu ? 'webgpu' : 'webgl2');
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

      built = build({ uTime, uAspect, uPointer, uScroll: uScroll.current, reduced });
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const material = new THREE.MeshBasicNodeMaterial();
      material.colorNode = built.colorNode;
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

      const resize = () => {
        renderer!.setSize(canvas.clientWidth, canvas.clientHeight, false);
        uAspect.value = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
      };
      resize();
      ro = new ResizeObserver(resize); ro.observe(canvas);
      io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(canvas);
      addEventListener('pointermove', onPointer);

      const start = performance.now();
      renderer.setAnimationLoop(() => {
        if (!visible) return;
        const t = reduced ? 6 : (performance.now() - start) / 1000;
        uTime.value = t;
        (uPointer.value as THREE.Vector2).lerp(pointer, reduced ? 1 : 0.06);
        built!.frame?.(t, uPointer.value as THREE.Vector2);
        try { renderer!.render(scene, camera); } catch (e) { console.error('[ShaderCanvas] render', e); renderer!.setAnimationLoop(null); }
      });
      setReady(true);
    })().catch((e) => { console.error('[ShaderCanvas]', e); (window as unknown as { __shaderErr?: string }).__shaderErr = String((e as Error)?.stack ?? e); });

    return () => {
      disposed = true;
      removeEventListener('pointermove', onPointer);
      ro?.disconnect(); io?.disconnect();
      built?.dispose?.();
      if (renderer) { renderer.setAnimationLoop(null); renderer.dispose(); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildKey]);

  return (
    <canvas
      ref={ref}
      data-backend={backend}
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full transition-opacity duration-[1200ms] ${className}`}
      style={{ opacity: ready ? 1 : 0 }}
    />
  );
}
