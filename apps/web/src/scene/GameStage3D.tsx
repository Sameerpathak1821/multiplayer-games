import { useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Float, RoundedBox, useCursor } from "@react-three/drei";
import { MathUtils, Vector3, type Group, type Mesh, type MeshStandardMaterial } from "three";
import type { RoomPhase } from "@gamehub/shared";
import type { Cell, Seat } from "@gamehub/games/client";
import { maxDpr } from "../lib/quality";

/**
 * The persistent 3D stage: an "arcade table" the current game sits on.
 * In the lobby the camera hangs back while game pieces float over the
 * table; when a match starts it flies down into board view — one scene,
 * one camera, so the transition is a real flythrough.
 */

const SEAT_COLOR = { X: "#ff6b4a", O: "#2dd4bf" } as const;
const SEAT_BASE = { X: "#7c2d12", O: "#0f766e" } as const;

const CELL_SPACING = 1.16;
const PIECE_REST_Y = 0.3;

const CAMERA_POSES: Record<RoomPhase, { pos: Vector3; look: Vector3 }> = {
  lobby: { pos: new Vector3(0, 1.7, 7.2), look: new Vector3(0, 0.7, 0) },
  playing: { pos: new Vector3(0, 5.4, 4.4), look: new Vector3(0, 0, -0.2) },
  postgame: { pos: new Vector3(2.2, 4.6, 5.0), look: new Vector3(0, 0, 0) },
};

function CameraRig({ phase }: { phase: RoomPhase }) {
  const { camera } = useThree();
  const look = useRef(CAMERA_POSES.lobby.look.clone());

  useFrame((_, dt) => {
    const target = CAMERA_POSES[phase];
    camera.position.x = MathUtils.damp(camera.position.x, target.pos.x, 2.4, dt);
    camera.position.y = MathUtils.damp(camera.position.y, target.pos.y, 2.4, dt);
    camera.position.z = MathUtils.damp(camera.position.z, target.pos.z, 2.4, dt);
    look.current.x = MathUtils.damp(look.current.x, target.look.x, 2.4, dt);
    look.current.y = MathUtils.damp(look.current.y, target.look.y, 2.4, dt);
    look.current.z = MathUtils.damp(look.current.z, target.look.z, 2.4, dt);
    camera.lookAt(look.current);
  });
  return null;
}

function cellPosition(i: number): [number, number] {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return [(col - 1) * CELL_SPACING, (row - 1) * CELL_SPACING];
}

/** Drops a freshly placed piece onto the board with an ease-out-back pop. */
function DropIn({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  const start = useRef<number | null>(null);

  useFrame((state) => {
    if (!ref.current) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / 0.45);
    const fall = 1 - Math.pow(1 - t, 3);
    ref.current.position.y = 2.2 - (2.2 - PIECE_REST_Y) * fall;
    const c1 = 1.70158;
    const back = 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    ref.current.scale.setScalar(0.65 + 0.35 * back);
  });

  return (
    <group ref={ref} position={[0, 2.2, 0]}>
      {children}
    </group>
  );
}

/** Pulses the emissive channel of every mesh under it (winning pieces). */
function WinPulse({ active, children }: { active: boolean; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current || !active) return;
    const k = 0.7 + Math.sin(state.clock.elapsedTime * 6) * 0.45;
    ref.current.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) (mesh.material as MeshStandardMaterial).emissiveIntensity = k;
    });
  });
  return <group ref={ref}>{children}</group>;
}

function XPiece() {
  return (
    <group>
      {[Math.PI / 4, -Math.PI / 4].map((rot, i) => (
        <RoundedBox key={i} args={[0.82, 0.17, 0.22]} radius={0.07} rotation={[0, rot, 0]}>
          <meshStandardMaterial color={SEAT_BASE.X} emissive={SEAT_COLOR.X} emissiveIntensity={0.5} />
        </RoundedBox>
      ))}
    </group>
  );
}

function OPiece() {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.28, 0.11, 18, 36]} />
      <meshStandardMaterial color={SEAT_BASE.O} emissive={SEAT_COLOR.O} emissiveIntensity={0.5} />
    </mesh>
  );
}

interface BoardProps {
  board: Cell[];
  turnSeat: Seat | null;
  winLine: number[] | null;
  canPlay: boolean;
  onCellClick(i: number): void;
}

function Board3D({ board, turnSeat, winLine, canPlay, onCellClick }: BoardProps) {
  const group = useRef<Group>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const hoverValid = hovered !== null && canPlay && board[hovered] === null;
  useCursor(hoverValid);

  // Subtle tilt toward whichever seat is thinking; level out when finished.
  useFrame((_, dt) => {
    if (!group.current) return;
    const target = winLine || !turnSeat ? 0 : turnSeat === "X" ? 0.045 : -0.045;
    group.current.rotation.z = MathUtils.damp(group.current.rotation.z, target, 3, dt);
  });

  return (
    <group ref={group}>
      {board.map((cell, i) => {
        const [x, z] = cellPosition(i);
        const isHover = hoverValid && hovered === i;
        const inWin = winLine?.includes(i) ?? false;
        return (
          <group key={i} position={[x, 0, z]}>
            <RoundedBox
              args={[1.04, 0.16, 1.04]}
              radius={0.05}
              position={[0, 0.08, 0]}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(i);
              }}
              onPointerOut={() => setHovered((h) => (h === i ? null : h))}
              onClick={(e) => {
                e.stopPropagation();
                if (canPlay && board[i] === null) onCellClick(i);
              }}
            >
              <meshStandardMaterial
                color={isHover ? "#3a2456" : "#241539"}
                emissive={isHover ? "#ff6b4a" : inWin ? "#ff3d81" : "#120a1f"}
                emissiveIntensity={isHover ? 0.3 : inWin ? 0.25 : 0.12}
                roughness={0.5}
              />
            </RoundedBox>
            {cell && (
              <DropIn key={`${i}-${cell}`}>
                <WinPulse active={inWin}>{cell === "X" ? <XPiece /> : <OPiece />}</WinPulse>
              </DropIn>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** What floats over the table while everyone hangs out in the lobby. */
function LobbyCenterpiece() {
  const group = useRef<Group>(null);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.25;
  });
  return (
    <group ref={group} position={[0, 1.5, 0]}>
      <Float speed={1.4} rotationIntensity={0.7} floatIntensity={1.1}>
        <group position={[-1.1, 0.2, 0]} scale={1.15}>
          <XPiece />
        </group>
      </Float>
      <Float speed={1.1} rotationIntensity={0.9} floatIntensity={1.3}>
        <group position={[1.15, 0.45, 0]} scale={1.5}>
          <OPiece />
        </group>
      </Float>
      <Float speed={0.9} rotationIntensity={0.5} floatIntensity={0.9}>
        <RoundedBox args={[0.55, 0.55, 0.55]} radius={0.07} position={[0.1, -0.35, 0.9]}>
          <meshStandardMaterial color="#241539" emissive="#2dd4bf" emissiveIntensity={0.4} />
        </RoundedBox>
      </Float>
    </group>
  );
}

export interface GameStage3DProps {
  phase: RoomPhase;
  board: Cell[] | null;
  turnSeat: Seat | null;
  winLine: number[] | null;
  canPlay: boolean;
  onCellClick(i: number): void;
}

export default function GameStage3D({
  phase,
  board,
  turnSeat,
  winLine,
  canPlay,
  onCellClick,
}: GameStage3DProps) {
  const showBoard = board !== null && phase !== "lobby";

  return (
    <Canvas
      dpr={[1, maxDpr()]}
      camera={{ position: [0, 1.7, 7.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      className="!absolute inset-0"
    >
      <CameraRig phase={phase} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 7, 3]} intensity={1.1} color="#ffd9c2" />
      <pointLight position={[-5, 3, 3]} color="#ff6b4a" intensity={26} />
      <pointLight position={[5, 3, -2]} color="#ff3d81" intensity={22} />
      <pointLight position={[0, 2, -5]} color="#2dd4bf" intensity={14} />

      {/* The table */}
      <RoundedBox args={[7.4, 0.34, 7.4]} radius={0.12} position={[0, -0.26, 0]}>
        <meshStandardMaterial color="#1a1030" metalness={0.35} roughness={0.55} />
      </RoundedBox>
      <ContactShadows position={[0, -0.46, 0]} opacity={0.5} scale={16} blur={2.2} far={5} />

      {showBoard ? (
        <Board3D
          board={board}
          turnSeat={turnSeat}
          winLine={winLine}
          canPlay={canPlay}
          onCellClick={onCellClick}
        />
      ) : (
        <LobbyCenterpiece />
      )}
    </Canvas>
  );
}
