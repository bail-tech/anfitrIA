'use client';
/* eslint-disable react-hooks/immutability -- three.js objects are mutated every frame inside
   useFrame by design (R3F); the canvas texture is created once and only its pixels change. */

/**
 * Anfi in 3D: a small house-shaped concierge with a screen face. Procedural geometry (no
 * asset to download), soft studio light, gentle idle motion; the face is a canvas texture
 * redrawn every frame from the assistant state and the voice levels.
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, RoundedBox } from '@react-three/drei';
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { drawFace, type Mood } from './face';

export interface Levels {
  mic: number;
  speaker: number;
}

function Anfi({ mood, levels }: { mood: Mood; levels: RefObject<Levels> }) {
  const group = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const key = useRef<THREE.Mesh>(null);
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, texture: tex };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const speaker = levels.current?.speaker ?? 0;
    const talking = speaker > 0.04;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawFace(ctx, 256, talking ? 'talking' : mood, t, speaker);
      texture.needsUpdate = true;
    }
    if (group.current) {
      const busy = mood === 'thinking' || mood === 'working';
      group.current.position.y = Math.sin(t * (busy ? 3 : 1.6)) * 0.04 + (mood === 'done' ? Math.abs(Math.sin(t * 6)) * 0.03 : 0);
      group.current.rotation.y = Math.sin(t * 0.5) * 0.18 + (mood === 'listening' ? 0.12 : 0);
      group.current.rotation.z = mood === 'error' ? Math.sin(t * 8) * 0.04 : 0;
    }
    const wave = mood === 'done' || mood === 'approval' ? Math.sin(t * 6) * 0.6 : Math.sin(t * 1.6) * 0.08;
    if (armR.current) armR.current.rotation.z = -0.25 - Math.max(0, wave);
    if (armL.current) armL.current.rotation.z = 0.25 + (talking ? speaker * 0.8 : 0);
    if (key.current) key.current.rotation.y = t * 1.2;
  });

  return (
    <group ref={group}>
      {/* body */}
      <RoundedBox args={[1.3, 1.25, 1]} radius={0.22} smoothness={6} position={[0, 0, 0]}>
        <meshStandardMaterial color="#f7f3ec" roughness={0.55} />
      </RoundedBox>
      {/* roof: a four-sided pyramid */}
      <mesh position={[0, 0.92, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.02, 0.62, 4]} />
        <meshStandardMaterial color="#d0693f" roughness={0.6} />
      </mesh>
      {/* chimney */}
      <mesh position={[0.32, 1.08, 0.1]}>
        <boxGeometry args={[0.14, 0.26, 0.14]} />
        <meshStandardMaterial color="#c79a3c" roughness={0.5} />
      </mesh>
      {/* screen face */}
      <mesh position={[0, 0.05, 0.505]}>
        <planeGeometry args={[0.9, 0.78]} />
        <meshStandardMaterial map={texture} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.55} roughness={0.35} />
      </mesh>
      {/* arms */}
      <mesh ref={armL} position={[-0.78, -0.05, 0]} rotation={[0, 0, 0.25]}>
        <capsuleGeometry args={[0.1, 0.42, 6, 12]} />
        <meshStandardMaterial color="#ece5d8" roughness={0.6} />
      </mesh>
      <mesh ref={armR} position={[0.78, -0.05, 0]} rotation={[0, 0, -0.25]}>
        <capsuleGeometry args={[0.1, 0.42, 6, 12]} />
        <meshStandardMaterial color="#ece5d8" roughness={0.6} />
      </mesh>
      {/* floating key, the host's emblem */}
      <mesh ref={key} position={[0, -0.85, 0.35]}>
        <torusGeometry args={[0.08, 0.025, 10, 24]} />
        <meshStandardMaterial color="#c79a3c" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

export default function AnfiScene({ mood, levels }: { mood: Mood; levels: RefObject<Levels> }) {
  return (
    <Canvas camera={{ position: [0, 0.3, 4.6], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} onCreated={({ camera }) => camera.lookAt(0, 0.12, 0)}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.5, 3, 2.5]} intensity={1.6} castShadow />
      <directionalLight position={[-2, 1, -1]} intensity={0.4} color="#f4e7c8" />
      <Anfi mood={mood} levels={levels} />
      <hemisphereLight args={['#fffaf0', '#c9b79c', 0.6]} />
      <ContactShadows position={[0, -1.05, 0]} opacity={0.35} scale={4} blur={2.6} far={2} />
    </Canvas>
  );
}
