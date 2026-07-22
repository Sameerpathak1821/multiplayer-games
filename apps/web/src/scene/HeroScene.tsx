import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, RoundedBox } from "@react-three/drei";
import { AdditiveBlending, type Group } from "three";
import { maxDpr } from "../lib/quality";

/**
 * Landing hero — a "Sunset Synthwave" arcade dreamscape: a glowing sun over a
 * retro grid horizon, with the launch games' pieces floating in front. Warm
 * coral→pink palette, emissive low-poly so it reads premium and runs fast on
 * phones.
 */

const CORAL = "#ff6b4a";
const PINK = "#ff3d81";
const TEAL = "#2dd4bf";
const PURPLE = "#c07cff";
const GOLD = "#ffd24a";
const SKY = "#5eb3ff";

function Sun() {
  return (
    <group position={[0, 1.4, -8]}>
      {/* Glow halo */}
      <mesh>
        <sphereGeometry args={[3.4, 32, 32]} />
        <meshBasicMaterial color={PINK} transparent opacity={0.16} blending={AdditiveBlending} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial color={CORAL} transparent opacity={0.22} blending={AdditiveBlending} />
      </mesh>
      {/* Core */}
      <mesh>
        <sphereGeometry args={[1.9, 48, 48]} />
        <meshStandardMaterial color={CORAL} emissive={PINK} emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      {/* Signature synthwave dark bands across the sun */}
      {[-0.4, 0.1, 0.55, 0.95].map((y, i) => (
        <mesh key={i} position={[0, y, 1.92]}>
          <boxGeometry args={[4.2, 0.12 + i * 0.03, 0.05]} />
          <meshBasicMaterial color="#120a1f" />
        </mesh>
      ))}
    </group>
  );
}

function RetroFloor() {
  const grid = useRef<Group>(null);
  useFrame((_, dt) => {
    // Scroll the grid toward the camera for a sense of motion.
    if (grid.current) {
      grid.current.position.z += dt * 1.4;
      if (grid.current.position.z > 4) grid.current.position.z -= 4;
    }
  });
  return (
    <group position={[0, -2.6, 0]}>
      <group ref={grid}>
        <gridHelper args={[60, 60, PINK, "#5a2c6b"]} position={[0, 0, -10]} />
      </group>
    </group>
  );
}

function NeonX(props: { position: [number, number, number]; scale?: number }) {
  return (
    <Float speed={1.4} rotationIntensity={0.6} floatIntensity={1.2}>
      <group position={props.position} rotation={[0.3, 0.4, 0]} scale={props.scale ?? 1}>
        {[Math.PI / 4, -Math.PI / 4].map((r, i) => (
          <RoundedBox key={i} args={[1.5, 0.4, 0.4]} radius={0.12} rotation={[0, 0, r]}>
            <meshStandardMaterial color="#7c2d12" emissive={CORAL} emissiveIntensity={0.7} />
          </RoundedBox>
        ))}
      </group>
    </Float>
  );
}

function NeonO(props: { position: [number, number, number]; scale?: number }) {
  return (
    <Float speed={1.1} rotationIntensity={0.8} floatIntensity={1.4}>
      <mesh position={props.position} rotation={[0.9, 0.2, 0]} scale={props.scale ?? 1}>
        <torusGeometry args={[0.62, 0.24, 24, 48]} />
        <meshStandardMaterial color="#831843" emissive={PINK} emissiveIntensity={0.7} />
      </mesh>
    </Float>
  );
}

function LetterCubes(props: { position: [number, number, number] }) {
  const offsets: [number, number, number][] = [
    [0, 0, 0],
    [0.95, 0.12, -0.1],
    [1.9, -0.05, 0.05],
    [0.95, 1.05, 0],
  ];
  return (
    <Float speed={0.9} rotationIntensity={0.35} floatIntensity={0.9}>
      <group position={props.position} rotation={[0.2, -0.5, 0.05]} scale={0.6}>
        {offsets.map((o, i) => (
          <RoundedBox key={i} args={[0.85, 0.85, 0.85]} radius={0.1} position={o}>
            <meshStandardMaterial
              color="#2a1a42"
              emissive={i === 1 ? TEAL : "#3d2a5c"}
              emissiveIntensity={i === 1 ? 0.6 : 0.3}
            />
          </RoundedBox>
        ))}
      </group>
    </Float>
  );
}

function Projectile(props: { position: [number, number, number] }) {
  return (
    <Float speed={1.8} rotationIntensity={1.1} floatIntensity={1.6}>
      <group position={props.position} rotation={[0.1, 0.6, -0.3]} scale={0.85}>
        <mesh>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#7f1d1d" emissive={GOLD} emissiveIntensity={0.7} />
        </mesh>
        {[0.85, 1.25, 1.6].map((d, i) => (
          <mesh key={i} position={[-d, d * 0.22, 0]} scale={1 - i * 0.24}>
            <sphereGeometry args={[0.14, 16, 16]} />
            <meshStandardMaterial
              color={GOLD}
              emissive={GOLD}
              emissiveIntensity={0.9}
              transparent
              opacity={0.85 - i * 0.25}
            />
          </mesh>
        ))}
      </group>
    </Float>
  );
}

function Orb(props: { position: [number, number, number]; color: string; scale?: number }) {
  return (
    <Float speed={1.3} rotationIntensity={0.4} floatIntensity={1.5}>
      <mesh position={props.position} scale={props.scale ?? 1}>
        <sphereGeometry args={[0.42, 24, 24]} />
        <meshStandardMaterial color={props.color} emissive={props.color} emissiveIntensity={0.8} />
      </mesh>
    </Float>
  );
}

function Coin(props: { position: [number, number, number] }) {
  return (
    <Float speed={1.6} rotationIntensity={1.4} floatIntensity={1.1}>
      <mesh position={props.position} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.1, 32]} />
        <meshStandardMaterial color="#a16207" emissive={GOLD} emissiveIntensity={0.6} metalness={0.4} />
      </mesh>
    </Float>
  );
}

function Diamond(props: { position: [number, number, number]; color: string }) {
  return (
    <Float speed={1.5} rotationIntensity={1.2} floatIntensity={1.3}>
      <mesh position={props.position}>
        <octahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial color={props.color} emissive={props.color} emissiveIntensity={0.7} flatShading />
      </mesh>
    </Float>
  );
}

function Swarm() {
  const group = useRef<Group>(null);
  useFrame((state, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * 0.06;
    const targetX = state.pointer.y * 0.12;
    const targetY = state.pointer.x * 0.2;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.04;
    group.current.position.x += (targetY - group.current.position.x) * 0.04;
  });

  // Positions memoized so they don't jump between renders.
  const layout = useMemo(
    () => ({
      x1: [-3.1, 0.9, 0.5] as [number, number, number],
      x2: [3.4, -1.6, -1] as [number, number, number],
      o1: [2.6, 1.5, -0.4] as [number, number, number],
      o2: [-2.2, -1.8, 0.6] as [number, number, number],
      cubes: [-1.4, -0.7, 1] as [number, number, number],
      proj: [2.1, -0.3, 1.2] as [number, number, number],
      orb1: [-3.6, -0.4, -0.5] as [number, number, number],
      orb2: [1.2, 2.1, 0.3] as [number, number, number],
      coin: [3.9, 0.6, 0.2] as [number, number, number],
      dia1: [-0.6, 2.2, -0.6] as [number, number, number],
      dia2: [0.4, -2.2, 0.8] as [number, number, number],
    }),
    [],
  );

  return (
    <group ref={group}>
      <NeonX position={layout.x1} />
      <NeonX position={layout.x2} scale={0.7} />
      <NeonO position={layout.o1} />
      <NeonO position={layout.o2} scale={0.8} />
      <LetterCubes position={layout.cubes} />
      <Projectile position={layout.proj} />
      <Orb position={layout.orb1} color={TEAL} />
      <Orb position={layout.orb2} color={SKY} scale={0.8} />
      <Coin position={layout.coin} />
      <Diamond position={layout.dia1} color={PURPLE} />
      <Diamond position={layout.dia2} color={PINK} />
    </group>
  );
}

export default function HeroScene() {
  return (
    <Canvas
      dpr={[1, maxDpr()]}
      camera={{ position: [0, 0.4, 8], fov: 44 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      className="!absolute inset-0"
    >
      <color attach="background" args={["#120a1f"]} />
      <fog attach="fog" args={["#120a1f", 10, 22]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 3]} intensity={0.9} color="#ffd9c2" />
      <pointLight position={[-6, 2, 2]} color={CORAL} intensity={40} />
      <pointLight position={[6, -2, 4]} color={PINK} intensity={34} />
      <pointLight position={[0, -3, 3]} color={PURPLE} intensity={20} />
      <Suspense fallback={null}>
        <Sun />
        <RetroFloor />
        <Swarm />
      </Suspense>
    </Canvas>
  );
}
