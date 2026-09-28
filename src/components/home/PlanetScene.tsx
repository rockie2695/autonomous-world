'use client';

// ============================================================================
// 3D 星球場景 — 自治世界 / three.js planet scene for the homepage
// ============================================================================
// A procedural deep-space vignette: textured world + cyan atmosphere rim,
// orbit paths carrying faction signal nodes, and a distant star shell.
//   - imported only in the browser (dynamic, ssr:false from PlanetCanvas)
//   - renders a single static frame under prefers-reduced-motion
//   - disposes geometry, materials, texture, listeners and renderer on unmount
// ============================================================================

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/** 環繞的勢力訊號點 / orbiting faction signal nodes — palette locked */
const NODES = [
  { color: 0x22d3ee, radius: 3.0, speed: 0.22, tilt: 0.32, phase: 0.4 },
  { color: 0xa855f7, radius: 3.4, speed: -0.16, tilt: -0.42, phase: 1.6 },
  { color: 0x3b82f6, radius: 2.75, speed: 0.3, tilt: 0.78, phase: 2.9 },
  { color: 0x67e8f9, radius: 3.7, speed: -0.12, tilt: -0.18, phase: 4.1 },
  { color: 0xe2e8f0, radius: 3.15, speed: 0.18, tilt: 1.15, phase: 5.4 },
] as const;

const BASE_TILT_X = 0.22;
const TEXTURE_URL = '/textures/world-mars-2k.jpg';

type NodeRig = {
  node: THREE.Mesh;
  radius: number;
  speed: number;
  phase: number;
};

function buildOrbitLine(radius: number, tilt: number, color: number): THREE.Line {
  const points: THREE.Vector3[] = [];
  const segments = 160;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.16,
  });
  const line = new THREE.Line(geometry, material);
  line.rotation.x = tilt;
  return line;
}

function buildStarField(): THREE.Points {
  const count = 850;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = 14 + Math.random() * 26;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

export default function PlanetScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = mount.clientWidth || 480;
    let height = mount.clientHeight || 480;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      renderer = null;
    }
    // WebGL unavailable — the CSS halo behind the canvas carries the section.
    if (!renderer) return;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 120);
    camera.position.set(0, 1.2, 11);
    camera.lookAt(0, 0, 0);

    // ── 光照 / lighting ────────────────────────────────────────────────────
    const keyLight = new THREE.DirectionalLight(0xfff6e8, 2.6);
    keyLight.position.set(5, 3, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x22d3ee, 1.4);
    rimLight.position.set(-5, -1.5, -4);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0x6b93c7, 0.5));

    // ── 星球 + 大氣 / planet + atmosphere ─────────────────────────────────
    const world = new THREE.Group();
    world.rotation.x = BASE_TILT_X;
    scene.add(world);

    const texture = new THREE.TextureLoader().load(TEXTURE_URL);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const planetGeometry = new THREE.SphereGeometry(2, 72, 72);
    const planetMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.92,
      metalness: 0.02,
    });
    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planet.rotation.z = 0.35;
    world.add(planet);

    const atmosphereGeometry = new THREE.SphereGeometry(2.22, 72, 72);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x22d3ee) } },
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
        '  vNormal = normalize(normalMatrix * normal);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'varying vec3 vNormal;',
        'void main() {',
        '  float intensity = pow(max(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);',
        '  gl_FragColor = vec4(uColor, 1.0) * intensity * 0.75;',
        '}',
      ].join('\n'),
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    world.add(atmosphere);

    // ── 軌道與據點 / orbit paths + signal nodes ───────────────────────────
    const rigs: NodeRig[] = [];
    const nodeGeometry = new THREE.SphereGeometry(0.08, 16, 16);
    const haloGeometry = new THREE.SphereGeometry(0.2, 16, 16);

    for (const spec of NODES) {
      world.add(buildOrbitLine(spec.radius, spec.tilt, spec.color));

      const pivot = new THREE.Object3D();
      pivot.rotation.x = spec.tilt;

      const material = new THREE.MeshBasicMaterial({ color: spec.color });
      const node = new THREE.Mesh(nodeGeometry, material);
      node.position.set(
        Math.cos(spec.phase) * spec.radius,
        0,
        Math.sin(spec.phase) * spec.radius,
      );

      const halo = new THREE.Mesh(
        haloGeometry,
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      node.add(halo);
      pivot.add(node);
      world.add(pivot);

      rigs.push({
        node,
        radius: spec.radius,
        speed: spec.speed,
        phase: spec.phase,
      });
    }

    const stars = buildStarField();
    scene.add(stars);

    // ── 指標視差 / pointer parallax ───────────────────────────────────────
    let targetX = BASE_TILT_X;
    let targetY = 0;

    const onPointerMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      targetY = nx * 0.35;
      targetX = BASE_TILT_X + ny * 0.18;
    };

    const onPointerLeave = () => {
      targetX = BASE_TILT_X;
      targetY = 0;
    };

    if (!reduceMotion) {
      mount.addEventListener('pointermove', onPointerMove);
      mount.addEventListener('pointerleave', onPointerLeave);
    }

    // ── 尺寸同步 / resize sync ────────────────────────────────────────────
    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width < 1 || rect.height < 1) return;
      width = rect.width;
      height = rect.height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (reduceMotion) renderer.render(scene, camera);
    });
    resizeObserver.observe(mount);

    // ── 顯示循環 / render loop ────────────────────────────────────────────
    let frame = 0;
    const clock = new THREE.Clock();

    const renderFrame = () => {
      frame = requestAnimationFrame(renderFrame);
      const delta = Math.min(clock.getDelta(), 0.05);

      planet.rotation.y += delta * 0.11;
      stars.rotation.y += delta * 0.006;

      for (const rig of rigs) {
        rig.phase += delta * rig.speed;
        rig.node.position.set(
          Math.cos(rig.phase) * rig.radius,
          0,
          Math.sin(rig.phase) * rig.radius,
        );
      }

      world.rotation.x += (targetX - world.rotation.x) * 0.06;
      world.rotation.y += (targetY - world.rotation.y) * 0.06;

      renderer.render(scene, camera);
    };

    if (reduceMotion) {
      renderer.render(scene, camera);
    } else {
      frame = requestAnimationFrame(renderFrame);
    }

    // ── 清理 / teardown ───────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mount.removeEventListener('pointermove', onPointerMove);
      mount.removeEventListener('pointerleave', onPointerLeave);

      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points ||
          object instanceof THREE.Line
        ) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) {
            for (const entry of material) entry.dispose();
          } else {
            material.dispose();
          }
        }
      });

      texture.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
