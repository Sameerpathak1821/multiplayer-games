import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Float, RoundedBox } from "@react-three/drei";
import type { Group } from "three";

/**
 * Landing hero: a slowly orbiting composition of the three launch games'
 * pieces — X & O (tic-tac-toe), letter cubes (crossword), and a neon
 * projectile rig (arena shooter). Materials are emissive low-poly so the
 * scene reads "premium" without HDR environments or postprocessing.
 */

function NeonX(props: { position: [number, number, number] }) {
  return (
    <Float speed={1.4} rotationIntensity={0.6} floatIntensity={1.2}>
      <group position={props.position} rotation={[0.3, 0.4, 0]}>
        <RoundedBox args={[1.6, 0.42, 0.42]} radius={0.12} rotation={[0, 0, Math.PI / 4]}>
          <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.55} />
        </RoundedBox>
        <RoundedBox args={[1.6, 0.42, 0.42]} radius={0.12} rotation={[0, 0, -Math.PI / 4]}>
          <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.55} />
        </RoundedBox>
      </group>
    </Float>
  );
}

function NeonO(props: { position: [number, number, number] }) {
  return (
    <Float speed={1.1} rotationIntensity={0.8} floatIntensity={1.4}>
      <mesh position={props.position} rotation={[0.9, 0.2, 0]}>
        <torusGeometry args={[0.62, 0.24, 24, 48]} />
        <meshStandardMaterial color="#6d28d9" emissive="#a78bfa" emissiveIntensity={0.55} />
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
      <group position={props.position} rotation={[0.2, -0.5, 0.05]} scale={0.62}>
        {offsets.map((o, i) => (
          <RoundedBox key={i} args={[0.85, 0.85, 0.85]} radius={0.09} position={o}>
            <meshStandardMaterial
              color="#1a2130"
              emissive={i === 1 ? "#34d399" : "#232c3f"}
              emissiveIntensity={i === 1 ? 0.5 : 0.25}
            />
          </RoundedBox>
        ))}
      </group>
    </Float>
  );
}

function ProjectileRig(props: { position: [number, number, number] }) {
  return (
    <Float speed={1.8} rotationIntensity={1.1} floatIntensity={1.6}>
      <group position={props.position} rotation={[0.1, 0.6, -0.3]} scale={0.8}>
        <mesh>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#9f1239" emissive="#fb7185" emissiveIntensity={0.6} />
        </mesh>
        {[0.85, 1.25, 1.6].map((d, i) => (
          <mesh key={i} position={[-d, d * 0.22, 0]} scale={1 - i * 0.24}>
            <sphereGeometry args={[0.14, 16, 16]} />
            <meshStandardMaterial
              color="#fb7185"
              emissive="#fb7185"
              emissiveIntensity={0.8}
              transparent
              opacity={0.85 - i * 0.25}
            />
          </mesh>
        ))}
      </group>
    </Float>
  );
}

function Composition() {
  const group = useRef<Group>(null);
  useFrame((state, dt) => {
    if (!group.current) return;
    // Slow idle orbit plus gentle parallax toward the pointer.
    group.current.rotation.y += dt * 0.12;
    const targetX = state.pointer.y * 0.08;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.05;
  });

  return (
    <group ref={group}>
      <NeonX position={[-2.1, 0.7, 0]} />
      <NeonO position={[2.2, 1.1, -0.6]} />
      <LetterCubes position={[-0.9, -1.2, 0.4]} />
      <ProjectileRig position={[1.7, -0.7, 0.8]} />
    </group>
  );
}

export default function HeroScene() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.4, 7], fov: 42 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      className="!absolute inset-0"
    >
      <color attach="background" args={["#0b0e14"]} />
      <fog attach="fog" args={["#0b0e14", 9, 16]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <pointLight position={[-6, 2, 2]} color="#22d3ee" intensity={30} />
      <pointLight position={[6, -2, 4]} color="#a78bfa" intensity={25} />
      <Suspense fallback={null}>
        <Composition />
        <ContactShadows position={[0, -2.6, 0]} opacity={0.45} scale={14} blur={2.4} far={4} />
      </Suspense>
    </Canvas>
  );
}
