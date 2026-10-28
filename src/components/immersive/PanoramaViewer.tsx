"use client";

/**
 * Look-around viewer for 360° equirectangular photos (Wikimedia Commons,
 * Mapillary). Drag to look, scroll to zoom; drifts slowly until touched.
 */
import * as THREE from "three";
import { useEffect, useRef } from "react";

interface Props {
  url: string;
  onLoad?(): void;
  onFail?(): void;
}

export default function PanoramaViewer({ url, onLoad, onFail }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onLoad, onFail });
  useEffect(() => {
    callbacks.current = { onLoad, onFail };
  });

  useEffect(() => {
    const el = ref.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, el.clientWidth / el.clientHeight, 0.1, 1100);
    const geometry = new THREE.SphereGeometry(500, 80, 50);
    geometry.scale(-1, 1, 1); // look at the inside of the sphere
    const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    let disposed = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (texture) => {
        if (disposed) return texture.dispose();
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        callbacks.current.onLoad?.();
      },
      undefined,
      () => callbacks.current.onFail?.(),
    );

    // Look direction (degrees).
    let lon = 0;
    let lat = 0;
    let drifting = true;
    let dragging = false;
    let start = { x: 0, y: 0, lon: 0, lat: 0 };

    const down = (e: PointerEvent) => {
      dragging = true;
      drifting = false;
      start = { x: e.clientX, y: e.clientY, lon, lat };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const k = camera.fov / el.clientHeight;
      lon = start.lon - (e.clientX - start.x) * k;
      lat = Math.max(-80, Math.min(80, start.lat + (e.clientY - start.y) * k));
    };
    const up = () => {
      dragging = false;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.fov = Math.max(35, Math.min(95, camera.fov + e.deltaY * 0.04));
      camera.updateProjectionMatrix();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") lon -= 5;
      if (e.key === "ArrowRight") lon += 5;
      if (e.key === "ArrowUp") lat = Math.min(80, lat + 5);
      if (e.key === "ArrowDown") lat = Math.max(-80, lat - 5);
      drifting = false;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("keydown", key);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const target = new THREE.Vector3();
    const render = () => {
      if (drifting && !reduceMotion) lon += 0.02;
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon);
      target.set(500 * Math.sin(phi) * Math.cos(theta), 500 * Math.cos(phi), 500 * Math.sin(phi) * Math.sin(theta));
      camera.lookAt(target);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    const resize = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("keydown", key);
      material.map?.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);

  return <div ref={ref} className="pano" tabIndex={0} role="img" aria-label="360° view. Drag or use arrow keys to look around." />;
}
