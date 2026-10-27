'use client';

import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { seeded } from './random';
import { DOT_POSITION, DOT_RADIUS } from './rig';

const COUNT = 40;
const GATHER_AFTER = 0.5;

export type SparksHandle = {
  /** Sparks fly out of the neck, then gather into the dot of the "i". */
  burst: (from: THREE.Vector3) => void;
  /** The dot breaks back into sparks that fade out. */
  release: () => void;
};

type Phase = 'idle' | 'burst' | 'release';

export function Sparks({ ref, dotMaterial }: { ref: Ref<SparksHandle>; dotMaterial: THREE.Material }) {
  const sparks = useRef<THREE.InstancedMesh>(null);
  const dot = useRef<THREE.Mesh>(null);
  const target = useMemo(() => new THREE.Vector3(...DOT_POSITION), []);
  const state = useRef({
    phase: 'idle' as Phase,
    t: 0,
    pos: new Float32Array(COUNT * 3),
    vel: new Float32Array(COUNT * 3),
    life: new Float32Array(COUNT),
    gathered: 0,
    dotScale: 0,
    flash: 0,
    flashed: false,
  });
  const scratch = useRef({ o: new THREE.Object3D(), v: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), random: seeded(7) });
  const glow = useMemo(() => {
    const m = (dotMaterial as THREE.MeshPhysicalMaterial).clone();
    m.emissive = new THREE.Color('#FDE047');
    m.emissiveIntensity = 0;
    return m;
  }, [dotMaterial]);

  const spawn = (from: THREE.Vector3, speed: number) => {
    const sim = state.current;
    const random = scratch.current.random;
    for (let i = 0; i < COUNT; i++) {
      sim.pos.set([from.x + (random() - 0.5) * 0.04, from.y, from.z + (random() - 0.5) * 0.04], i * 3);
      sim.vel.set([(random() - 0.5) * 2.4 * speed, (0.8 + random() * 1.4) * speed, (random() - 0.5) * 0.8 * speed], i * 3);
      sim.life[i] = 1;
    }
    sim.t = 0;
  };

  useImperativeHandle(ref, () => ({
    burst(from) {
      const sim = state.current;
      spawn(from, 1);
      sim.phase = 'burst';
      sim.gathered = 0;
      sim.dotScale = 0;
      sim.flashed = false;
    },
    release() {
      const sim = state.current;
      if (sim.dotScale < 0.05) return;
      spawn(target, 0.7);
      sim.phase = 'release';
    },
  }));

  const simulate = (dt: number) => {
    const mesh = sparks.current;
    if (!mesh) return;
    const sim = state.current;
    const tmp = scratch.current;
    sim.t += dt;
    let alive = 0;
    for (let i = 0; i < COUNT; i++) {
      if (sim.life[i] <= 0) continue;
      const k = i * 3;
      const gathering = sim.phase === 'burst' && sim.t > GATHER_AFTER + (i % 8) * 0.03;
      if (gathering) {
        for (let a = 0; a < 3; a++) {
          sim.vel[k + a] += (target.getComponent(a) - sim.pos[k + a]) * 40 * dt;
          sim.vel[k + a] *= 1 - 7 * dt;
        }
      } else {
        sim.vel[k + 1] -= 4.5 * dt;
        for (let a = 0; a < 3; a++) sim.vel[k + a] *= 1 - 1.2 * dt;
      }
      for (let a = 0; a < 3; a++) sim.pos[k + a] += sim.vel[k + a] * dt;
      if (gathering) {
        tmp.v.set(sim.pos[k], sim.pos[k + 1], sim.pos[k + 2]);
        if (tmp.v.distanceTo(target) < DOT_RADIUS * 0.6) {
          sim.life[i] = 0;
          sim.gathered += 1;
          continue;
        }
      }
      if (sim.phase === 'release') sim.life[i] -= dt * 1.6;
      alive += 1;
    }

    const wanted = sim.phase === 'burst' ? Math.min(1, sim.gathered / (COUNT * 0.6)) : 0;
    if (sim.phase === 'burst' && wanted >= 1 && !sim.flashed) {
      sim.flash = 1;
      sim.flashed = true;
    }
    sim.dotScale += (wanted - sim.dotScale) * Math.min(1, dt * (wanted > sim.dotScale ? 10 : 18));
    sim.flash = Math.max(0, sim.flash - dt * 1.5);
    if (dot.current) {
      (dot.current.material as THREE.MeshPhysicalMaterial).emissiveIntensity = sim.flash * 2.5;
      const s = sim.dotScale * (1 + sim.flash * 0.15);
      dot.current.scale.setScalar(s);
      dot.current.visible = s > 0.01;
    }

    for (let i = 0; i < COUNT; i++) {
      const k = i * 3;
      const life = Math.max(0, sim.life[i]);
      tmp.v.set(sim.vel[k], sim.vel[k + 1], sim.vel[k + 2]);
      const speed = tmp.v.length();
      tmp.o.position.set(sim.pos[k], sim.pos[k + 1], sim.pos[k + 2]);
      if (speed > 1e-4) tmp.o.quaternion.setFromUnitVectors(tmp.up, tmp.v.multiplyScalar(1 / speed));
      const w = 0.014 * life;
      tmp.o.scale.set(w, w + Math.min(speed, 3) * 0.035 * life, w);
      tmp.o.updateMatrix();
      mesh.setMatrixAt(i, tmp.o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = alive > 0;
  };

  useFrame((_, dt) => simulate(Math.min(dt, 1 / 30)));

  return (
    <>
      <instancedMesh ref={sparks} args={[undefined, undefined, COUNT]} frustumCulled={false} visible={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#FDE047" toneMapped={false} />
      </instancedMesh>
      <mesh ref={dot} position={DOT_POSITION} scale={0} visible={false} material={glow} castShadow>
        <sphereGeometry args={[DOT_RADIUS, 32, 16]} />
      </mesh>
    </>
  );
}
