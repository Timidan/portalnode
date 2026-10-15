import * as THREE from 'three/webgpu';
import {
  Fn, uv, vec2, vec3, float, sin, fract, dot, floor, mix, smoothstep, length, exp, clamp, texture, step,
} from 'three/tsl';
import type { ShaderBuild } from './ShaderCanvas';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;


/** Night shift: real footage (or a still) through a 4×4 ordered dither in amber, with scanlines and a pointer lamp. */
export function nightDither(src: string, isVideo: boolean, side: 'left' | 'right' | 'full' = 'left'): ShaderBuild {
  return ({ uTime, uAspect, uPointer, uScroll, reduced }) => {
    const placeholder = new THREE.DataTexture(new Uint8Array([40, 40, 40, 255]), 1, 1);
    placeholder.needsUpdate = true;
    const tex = texture(placeholder);
    let video: HTMLVideoElement | undefined;
    if (isVideo) {
      video = Object.assign(document.createElement('video'), { src, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
      video.addEventListener('canplay', () => { tex.value = new THREE.VideoTexture(video!); }, { once: true });
      if (!reduced) video.play().catch(() => {});
    } else {
      new THREE.TextureLoader().load(src, (t) => { t.colorSpace = THREE.SRGBColorSpace; tex.value = t; });
    }
    const bayer2 = (a: N): N => { const f: N = floor(a); return fract(f.x.div(2).add(f.y.mul(f.y).mul(0.75))); };
    const bayer4 = (a: N): N => bayer2(a.mul(0.5)).mul(0.25).add(bayer2(a));
    return {
      colorNode: Fn(() => {
        const p: N = uv();
        const drift = vec2(sin(uTime.mul(0.05)).mul(0.02), uTime.mul(0.004));
        const src2 = vec2(p.x.mul(0.9).add(0.05), float(1).sub(p.y)).add(drift);
        const lum = dot(tex.sample(src2).rgb, vec3(0.299, 0.587, 0.114));
        const lamp = exp(length(vec2(p.x.sub(uPointer.x).mul(uAspect), p.y.sub(uPointer.y))).mul(-3.2)).mul(0.45);
        const level = clamp(smoothstep(0.06, 0.7, lum).add(lamp).sub(uScroll.mul(0.5)), 0, 1);
        const cell = vec2(p.x.mul(uAspect), p.y).mul(260);
        const on = step(bayer4(cell), level);
        const scan = sin(p.y.mul(900)).mul(0.04).add(0.96);
        const amber = vec3(1.0, 0.69, 0.0);
        const ink = vec3(0.039, 0.039, 0.043);
        const fade = side === 'left'
          ? smoothstep(0.62, 0.2, p.x)
          : side === 'right'
            ? smoothstep(0.38, 0.8, p.x)
            : float(1).sub(smoothstep(0.84, 0.66, p.y).mul(smoothstep(0.8, 0.55, p.x)).mul(0.97)).sub(smoothstep(0.9, 1.0, p.y).mul(0.85)).max(0);
        return mix(ink, mix(ink, amber, on.mul(level.mul(0.65).add(0.35))), fade).mul(scan);
      })(),
      dispose: () => { video?.pause(); },
    };
  };
}

