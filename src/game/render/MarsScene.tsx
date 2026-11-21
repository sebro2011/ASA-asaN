/**
 * The 3D scene.
 *
 * Owns the render loop: every frame it advances the engine, then writes the
 * resulting state into Three.js objects. It never calls setState — the HUD is fed
 * separately by the engine's throttled snapshot, which is what keeps React out of
 * the frame budget.
 *
 * Streaming is driven from here because it is a rendering concern: the visible ring
 * is chosen from the camera, while the engine keeps a wider physics ring so that an
 * object is solid before it is drawn.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MarsEngine } from '../engine';
import { sunDirection } from '../engine';
import type { InputIntent } from '../input/keyboard';
import { TerrainMaterial } from './TerrainMaterial';
import { cameraGroundClearance } from './cameraGround';
import { TerrainField } from './TerrainChunk';
import { SkyDome } from './Sky';
import { DustField } from './Dust';
import { RockField } from './RockField';
import { Astronaut } from './Astronaut';
import { Rover } from './Rover';
import { Stations } from './Stations';
import { MARS_PALETTE, SUN_IRRADIANCE } from './palette';
import { QUALITY_PRESETS } from '../quality';
import { chunksAround, chunkOf, distanceToChunk, resolutionForDistance, CHUNK_SIZE } from '../world/chunks';
import type { RockInstance } from '../world/rocks';

export interface MarsSceneProps {
  engine: MarsEngine;
  /** Read once per frame; never stored in state. */
  intentRef: React.MutableRefObject<InputIntent>;
  lookRef: React.MutableRefObject<{ x: number; y: number }>;
  quality: 'high' | 'balanced' | 'low';
  pixelRatio: number;
  onFrame?: (fps: number) => void;
  onRocksStreamed?: (rocks: RockInstance[]) => void;
}

/**
 * How far the visual ring reaches, in chunks, per preset.
 *
 * Radius 3 is a 448 m square — but the mountains that give this world its skyline
 * start ~180 m from the landing site and run to the horizon. With a radius of 3 the
 * player stood in a bowl of terrain whose far wall was simply *missing*, and the
 * fog painted the gap a flat dust colour. Radius 6 pushes the draw distance to
 * ~800 m, which is where the massifs actually live. The cost is entirely in the
 * far LOD: those 120 extra chunks are 8 m per vertex, ~128 triangles each, so the
 * whole addition is roughly 15 k triangles — cheaper than one high-LOD chunk.
 */
const VISUAL_RADIUS = { high: 6, balanced: 5, low: 4 } as const;

/** Edge of the sun's shadow box, metres. Small on purpose — see the note above. */
const SHADOW_BOX = 64;

export function MarsScene({ engine, intentRef, lookRef, quality, pixelRatio, onFrame }: MarsSceneProps) {
  const preset = QUALITY_PRESETS[quality];
  const { camera } = useThree();

  const terrainMaterial = useMemo(
    () =>
      new TerrainMaterial({
        fogColor: MARS_PALETTE.skyHorizon,
        // Mars is genuinely hazy, but not *this* hazy: the old 70–260 m band put
        // the mountains behind a wall of flat dust, which is what made the scene
        // read as an infinite dune rather than as a landscape. Real MER panoramas
        // show sharply defined ridges at several kilometres, softened but not
        // erased. The band now starts past the near field and reaches the visual
        // ring's far edge.
        fogNear: quality === 'low' ? 90 : 150,
        fogFar: quality === 'low' ? 340 : 620,
      }),
    // A new preset needs different fog distances.
    [quality],
  );

  const sky = useMemo(() => new SkyDome(quality === 'low' ? 420 : 900), [quality]);
  const dust = useMemo(() => new DustField(preset.dustCount), [preset.dustCount]);

  useEffect(() => {
    terrainMaterial.setQuality(quality);
    dust.setQuality(quality, pixelRatio);
  }, [terrainMaterial, dust, quality, pixelRatio]);

  useEffect(
    () => () => {
      terrainMaterial.dispose();
      sky.dispose();
      dust.dispose();
    },
    [terrainMaterial, sky, dust],
  );

  const sun = useMemo(() => new THREE.DirectionalLight(0xfff0dd, 2.2), []);
  // The sun is the only shadow caster. Its shadow camera is a *small* box that
  // follows the player: a 64 m box gives ~14 mm texels at 2048², which is enough
  // for astronaut and rock contact shadows, while a box large enough to cover a
  // whole chunk ring would blur them into nothing.
  const shadowEnabled = preset.shadowMapSize > 0;
  // Hemisphere fill. The *ground* colour matters as much as the sky colour on
  // Mars: the regolith is bright, so a large fraction of the light on a vertical
  // surface arrives from below, bounced off the plain. A dark brown ground leg
  // (the Earth-sky habit) made every rock face pointing away from the sun render
  // at rgb(15,8,4) — pure black, which is why the rock field read as flat black
  // cut-outs rather than stone.
  const ambient = useMemo(() => new THREE.HemisphereLight(0xa89484, 0x7a5636, 1.5), []);
  // Bounce light: a dim, warm directional pointing *upward* from below the player.
  //
  // The previous version was a cool side-fill aimed at the sun's opposite azimuth,
  // which is an Earth-photography habit and wrong here — on Mars the dominant
  // secondary source is the ground itself. A hemisphere light cannot express it
  // alone because it interpolates by normal.y, and a vertical rock face sits
  // exactly at that crossover. This gives those faces a floor of light so they
  // read as dusty stone rather than silhouettes.
  const bounce = useMemo(() => new THREE.DirectionalLight(0xb87b52, 0.55), []);
  const bounceTarget = useMemo(() => new THREE.Object3D(), []);

  const sunDir = useRef(new THREE.Vector3());
  const sunColor = useMemo(() => new THREE.Color(0xfff0dd), []);
  const sunDisc = useRef<THREE.Mesh>(null);

  /* ------------------------------------------------------------- streaming */

  const [ring, setRing] = useState<Array<{ cx: number; cz: number }>>(() => chunksAround(6, -14, VISUAL_RADIUS[quality]));
  const ringKey = useRef('');

  const refreshRing = (x: number, z: number, radius: number) => {
    const centre = chunkOf(x, z);
    const key = `${centre.cx}:${centre.cz}:${radius}`;
    if (key === ringKey.current) return;
    ringKey.current = key;
    setRing(chunksAround(x, z, radius));
  };

  // Rebuild immediately when the preset changes, so a downgrade frees memory at once.
  useEffect(() => {
    ringKey.current = '';
    refreshRing(engine.state.player.position.x, engine.state.player.position.z, VISUAL_RADIUS[quality]);
  }, [engine, quality]);

  const resolutions = useMemo(() => {
    const map = new Map<string, number>();
    const centreX = engine.state.player.position.x;
    const centreZ = engine.state.player.position.z;
    for (const chunk of ring) {
      const distance = distanceToChunk(centreX, centreZ, chunk.cx, chunk.cz);
      map.set(`${chunk.cx}:${chunk.cz}`, resolutionForDistance(distance));
    }
    return map;
  }, [ring, engine]);

  /* -------------------------------------------------------------- the loop */

  const clock = useRef(0);
  const lastRingCheck = useRef(0);

  useFrame((state, delta) => {
    clock.current += delta;

    // 1. Advance the simulation. Input is read from the mutable refs.
    engine.step(delta, intentRef.current, lookRef.current);
    lookRef.current.x = 0;
    lookRef.current.y = 0;

    const { player, camera: cameraState } = engine.state;

    // 2. Camera.
    positionCamera(camera, player.position, cameraState, delta, player.mode === 'rover' ? engine.state.rover : null);

    // 3. Sun and sky.
    const angle = engine.state.sunAngle;
    const direction = sunDirection(angle);
    sunDir.current.set(direction.x, direction.y, direction.z).normalize();
    const daylight = engine.state.daylight;

    sun.position.copy(sunDir.current).multiplyScalar(220);
    sun.position.x += player.position.x;
    sun.position.z += player.position.z;
    sun.target.position.set(player.position.x, player.position.y, player.position.z);
    sun.target.updateMatrixWorld();
    // Exposure discipline. Mars receives 43 % of Earth's irradiance, and its
    // regolith albedo is ~0.17, so the *product* is modest. The previous gains
    // (sun 2.57, ambient 1.10) pushed mid-tone albedos past 1.0 in the red
    // channel, where ACES tone mapping collapses every material to the same pale
    // cream — the surface had detail, it just had no contrast left to show it.
    // These values keep a lit ochre patch around 0.6–0.8 linear.
    sun.intensity = 1.55 * daylight * SUN_IRRADIANCE * 2.3;
    // Ambient is the *fill*: dusty sky plus strong ground bounce. It must stay
    // well below the sun or nothing casts a readable shadow.
    ambient.intensity = 0.16 + daylight * 0.34;

    if (shadowEnabled) {
      // Set once, then left alone (assigning every frame would reallocate).
      if (sun.shadow.mapSize.width !== preset.shadowMapSize) {
        sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
        if (sun.shadow.map) {
          sun.shadow.map.dispose();
          sun.shadow.map = null;
        }
      }
      // Re-aim the shadow camera at the player every frame. Moving the light with
      // the player (rather than the shadow camera alone) keeps the shadow map
      // centred on what the player can actually see.
      const half = SHADOW_BOX / 2;
      sun.shadow.camera.left = -half;
      sun.shadow.camera.right = half;
      sun.shadow.camera.top = half;
      sun.shadow.camera.bottom = -half;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 420;
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.bias = -0.0012;
      sun.shadow.normalBias = 0.045;
    }

    // Fill light sits opposite the sun and aims at the player, so its direction is
    // constant relative to the camera as the player travels.
    // 40 m below the player, aimed straight up: a cheap stand-in for the whole
    // sunlit plain radiating back at anything standing on it.
    bounce.position.set(player.position.x, player.position.y - 40, player.position.z);
    bounceTarget.position.set(player.position.x, player.position.y + 10, player.position.z);
    bounceTarget.updateMatrixWorld();
    bounce.target = bounceTarget;
    bounce.intensity = 0.10 + daylight * 0.45;

    // Keep the world's outer dissolve centred on the streamed ring, so the
    // horizon fades out at the same distance in every direction.
    // `chunksAround` is ordered nearest-first, so its element [0] is the chunk the
    // player is standing in — not the centre of the ring. Deriving the centre from
    // it put the fade circle 250 m away from the player, in the +x/+z direction,
    // which dissolved the terrain a few tens of metres to the player's right and
    // painted it flat sky colour. It rendered as a pale plane with a straight edge
    // cutting across the lower-right of the frame, which looked precisely like a
    // broken ground mesh.
    const centreChunk = chunkOf(player.position.x, player.position.z);
    terrainMaterial.setRing(
      (centreChunk.cx + 0.5) * CHUNK_SIZE,
      (centreChunk.cz + 0.5) * CHUNK_SIZE,
      VISUAL_RADIUS[quality],
      CHUNK_SIZE,
    );

    terrainMaterial.setSun(sunDir.current, sun.intensity, sunColor);
    // Night must actually get dark: the shader's ambient term scales with this.
    terrainMaterial.setDaylight(daylight);

    // Keep the visible sun in the same direction as the light, far enough away to
    // read as a celestial body but inside the camera's far plane.
    if (sunDisc.current) {
      sunDisc.current.position.set(
        camera.position.x + sunDir.current.x * 700,
        camera.position.y + sunDir.current.y * 700,
        camera.position.z + sunDir.current.z * 700,
      );
      sunDisc.current.visible = daylight > 0.15;
    }
    sky.update(sunDir.current, daylight);
    sky.setPosition(camera.position.x, 0, camera.position.z);
    dust.update(clock.current, camera.position);

    // Fog warms toward the sun and cools away from it.
    terrainMaterial.setFog(
      daylight > 0.5 ? MARS_PALETTE.skyHorizon : '#141b28',
      quality === 'low' ? 90 : 150,
      quality === 'low' ? 340 : 620,
    );

    // 4. Streamed ring: checked 4×/s, not every frame.
    lastRingCheck.current += delta;
    if (lastRingCheck.current > 0.25) {
      lastRingCheck.current = 0;
      refreshRing(player.position.x, player.position.z, VISUAL_RADIUS[quality]);
    }

    onFrame?.(state.clock.elapsedTime);
  });

  const sunTarget = useMemo(() => new THREE.Object3D(), []);

  return (
    <>
      <primitive object={sky.group} />
      {/*
        The shadow map size is set imperatively, not via `shadow-mapSize-width`.
        R3F only resolves dashed prop paths on its own intrinsic elements; on a
        `<primitive>` the prop is written straight onto the object as a literal
        key called "shadow-mapSize-width", which three.js ignores. The visible
        symptom is shadows that exist but are 512² regardless of preset, and at
        this shadow-box size that is soft to the point of invisible on rock.
      */}
      <primitive object={sun} castShadow={shadowEnabled} />
      <primitive object={sun.target} />
      <primitive object={ambient} />
      <primitive object={bounce} />
      <primitive object={bounceTarget} />
      <primitive object={dust.points} />

      <TerrainField
        chunks={ring}
        material={terrainMaterial}
        resolutions={resolutions}
        receiveShadow={shadowEnabled}
      />

      <RockField chunks={ring} />
      <Stations />
      <Rover engine={engine} />
      <Astronaut engine={engine} />

      {/*
        The sun, so the key light has a visible source.

        Size is angular, not metric: Mars' sun is about 0.35° across, smaller than
        its roughly 0.53° apparent diameter as seen from Earth. A 16 m sphere at 700 m subtends 2.6° —
        seven times too big — and it rendered as a pale disc several hundred pixels
        across. Worse, seen from a slope with the camera pitched down it filled the
        lower-right quadrant as a flat cream shape that looked like a broken
        ground plane. 3.4 m at 700 m is 0.28°: a small, hard-edged disc, which is
        what an astronaut on Mars would actually see.

        Repositioned in the frame loop, not here: reading sunDir during render
        would pin it to the morning position for the whole session.
      */}
      <mesh ref={sunDisc} frustumCulled={false}>
        <sphereGeometry args={[3.4, 12, 8]} />
        <meshBasicMaterial color="#fff3d8" toneMapped={false} />
      </mesh>

      <primitive object={sunTarget} />
    </>
  );
}

/**
 * Places the camera.
 *
 * Third person: an orbit behind the player, pulled in when the ground would
 * otherwise occlude the body (a mountain between the camera and the astronaut is
 * the most disorienting thing a third-person game can do).
 * First person: at eye height, with a small gait bob.
 *
 * `delta` is used only for smoothing, so a hitch does not teleport the camera.
 */
function positionCamera(
  camera: THREE.Camera,
  position: { x: number; y: number; z: number },
  state: { mode: 'third' | 'first'; yaw: number; pitch: number; distance: number },
  delta: number,
  rover: { position: { x: number; y: number; z: number }; heading: number } | null,
): void {
  const eyeHeight = rover ? 2.4 : 1.62;
  const target = rover
    ? new THREE.Vector3(rover.position.x, rover.position.y + eyeHeight, rover.position.z)
    : new THREE.Vector3(position.x, position.y + eyeHeight, position.z);

  if (state.mode === 'first') {
    const bob = Math.sin(performance.now() * 0.008) * 0.012;
    camera.position.set(target.x, target.y + bob, target.z);
    const forward = new THREE.Vector3(-Math.sin(state.yaw), -state.pitch, -Math.cos(state.yaw)).normalize();
    camera.lookAt(target.x + forward.x * 10, target.y + forward.y * 10, target.z + forward.z * 10);
    return;
  }

  const distance = rover ? state.distance + 5 : state.distance;
  const horizontal = Math.cos(state.pitch) * distance;
  const offsetX = Math.sin(state.yaw) * horizontal;
  const offsetZ = Math.cos(state.yaw) * horizontal;
  const offsetY = Math.sin(state.pitch) * distance + 1.1;

  const desired = new THREE.Vector3(target.x + offsetX, target.y + offsetY, target.z + offsetZ);

  // Smoothing: 12/s is fast enough to feel responsive and slow enough to absorb a
  // dropped frame without a visible jump.
  const smoothing = 1 - Math.exp(-12 * Math.min(delta, 0.1));
  camera.position.lerp(desired, smoothing);
  // Interpolation can place the camera inside an uphill slope. Front-face culling
  // then reveals the sky as a hard wedge across the screen; clamp after smoothing.
  camera.position.y = Math.max(camera.position.y, cameraGroundClearance(camera.position.x, camera.position.z));
  camera.lookAt(target.x, target.y + 0.15, target.z);
}
