/**
 * Terrain shading.
 *
 * A hand-written `ShaderMaterial` rather than `MeshStandardMaterial`, for reasons
 * that are about this specific surface:
 *
 *  1. **Mars is a dusty planet, not a lit rock.** Twenty-three percent of the
 *     surface is fine dust that never clears; the rest is sand, gravel and
 *     exposed bedrock in different mixes. A single `MeshStandardMaterial` with one
 *     albedo map produces the plastic look the first pass had. This shader blends
 *     four *material families* by slope, height and a baked detail tile, which is
 *     what actually gives Mars its mottled, matte character.
 *  2. **Aerial perspective is directional.** Martian dust scatters light
 *     forward, so a ridge 2 km away is washed out when you look toward the sun and
 *     almost clear when you look away. A flat `fog` term cannot express that, and
 *     it is the single biggest cue that a scene has depth.
 *  3. **No downloads.** All detail is a 256² tile baked at startup (see
 *     `regolithTexture.ts`), sampled at four world scales. Zero network assets, so
 *     the first frame never waits on an image.
 *  4. **Determinism and cost.** Three analytic lights plus a bounce term are
 *     cheaper than a baked IBL and produce the same "nothing is black" result that
 *     the bright Martian ground bounce gives in real photographs.
 *
 * GLSL 1 only, for WebGL1 fallback on older Android drivers.
 */
import * as THREE from 'three';
import { MARS_PALETTE } from './palette';
import { regolithTexture } from './regolithTexture';

const VERTEX_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec2 vTerrainUv;

  #include <common>
  #include <shadowmap_pars_vertex>

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);

    // World-space UVs: detail repeats by *world position*, not by mesh, so two
    // adjacent chunks show continuous ground with no seam at the tile edge.
    vTerrainUv = worldPosition.xz;

    // The chunk declares the coordinate varyings only when the renderer has
    // actually created a shadow map, so this guard is required in both places.
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      vDirectionalShadowCoord[0] = directionalShadowMatrix[0] * worldPosition;
    #endif

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uSunTint;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uBasalt;
  uniform vec3 uOchre;
  uniform vec3 uHighland;
  uniform vec3 uDust;
  uniform vec3 uBedrock;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  /** Centre of the streamed ring, world XZ. */
  uniform vec2 uRingCentre;
  /** Radius where the ring starts dissolving, metres. */
  uniform float uRingFadeStart;
  /** Radius where it is fully dissolved, metres. */
  uniform float uRingFadeEnd;
  uniform float uDustCoverage;
  uniform float uGrain;
  uniform float uDetailScale;
  uniform sampler2D uRegolith;
  /** 0 at night, 1 in full day. Modulates ambient so nights are genuinely dark. */
  uniform float uDaylight;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec2 vTerrainUv;

  // Lighting and shadow declarations come from three.js itself. Hand-rolling the
  // uniform names is a losing game: the renderer supplies 'directionalLightShadows'
  // (a struct array carrying bias, radius and map size) plus the packed shadow
  // samplers, and none of it is guessable. Using the stock chunks means this
  // material behaves exactly like a MeshStandardMaterial as far as the shadow pass
  // is concerned, including normal bias and the multi-tap filter.
  #include <common>
  #include <packing>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>

  void main() {
    vec3 normal = normalize(vNormal);

    // ---------------------------------------------------------------- material
    // Three independent signals pick the material family, because a single one
    // cannot separate "steep sand dune" from "flat bedrock bench".
    float slope = 1.0 - clamp(normal.y, 0.0, 1.0);

    // Macro terrain character: very low frequency height variation, so whole
    // regions share a tone instead of every hill looking identical.
    float macro = texture2D(uRegolith, vTerrainUv * 0.0016).r;

    // Detail, sampled at four scales. The largest carries patchiness, the
    // smallest carries grain — this is what stops the surface reading as a
    // painted gradient at any distance.
    vec3 macroTex = texture2D(uRegolith, vTerrainUv * 0.021).rgb;
    vec3 midTex = texture2D(uRegolith, vTerrainUv * 0.13).rgb;
    vec4 grainTex = texture2D(uRegolith, vTerrainUv * 0.85);

    float mottle = macroTex.r;
    float gravel = midTex.g;
    float speckle = grainTex.b;
    float clumps = grainTex.a;

    // Height gate: high ground is lighter and greyer (dust-lifted highlands),
    // hollows are darker (basalt and shadowed fines).
    float heightMix = smoothstep(-30.0, 90.0, vWorldPosition.y);

    // --- family A: dust sheet (flat, high albedo, slight warm cast)
    vec3 dustFamily = uDust * (0.88 + speckle * 0.22);

    // --- family B: sand and coarse fines (gentle slope, ochre)
    vec3 sandFamily = uOchre * (0.72 + mottle * 0.55);

    // --- family C: exposed bedrock (steep faces, dark, cooler)
    vec3 bedrockFamily = uBedrock * (0.62 + gravel * 0.70);

    // --- family D: basaltic regolith (hollows, very dark, neutral)
    vec3 basaltFamily = uBasalt * (0.65 + clumps * 0.75);

    // Blend: slope first (geology), then the dust sheet on top (weathering).
    vec3 base = mix(sandFamily, bedrockFamily, smoothstep(0.16, 0.55, slope));
    base = mix(base, basaltFamily, smoothstep(0.30, 0.72, slope) * 0.5 * (1.0 - mottle));
    base = mix(base, uHighland, heightMix * 0.42);

    // Dust settles on shallow slopes and fills hollows. Its coverage is a
    // parameter, not a constant, so the quality presets can thin it out.
    float dustMask =
      uDustCoverage *
      (1.0 - smoothstep(0.05, 0.42, slope)) *
      (0.45 + mottle * 0.55) *
      (0.6 + speckle * 0.4);
    base = mix(base, dustFamily * (0.9 + speckle * 0.2), clamp(dustMask, 0.0, 0.92));

    // Mid-scale tonal mottling. Rover panoramas show metre-to-decimetre patches of
    // lighter and darker material everywhere; this is the term that turns the
    // surface from a single ochre field into *ground*. Two scales, because one
    // alone reads as a repeating pattern.
    float toneNear = texture2D(uRegolith, vTerrainUv * 0.42).r;
    float toneFar = texture2D(uRegolith, vTerrainUv * 0.075).g;
    base *= 0.86 + (toneNear * 0.30 + toneFar * 0.22) * uDetailScale;

    // Sub-metre grain: a normalised modulation. Without this the surface goes
    // unnaturally smooth once you are close enough to see individual rocks.
    base *= 0.90 + speckle * 0.2 * uGrain;

    // Gravel armouring: the coarse fraction reads slightly darker and rougher.
    base *= 1.0 - gravel * 0.08 * uGrain;

    // -------------------------------------------------------------- micro-relief
    // The mesh carries detail at 1 m spacing near the player; everything smaller
    // is a shading problem, not a geometry problem. Perturb the normal using the
    // *gradient of the detail tile* — a cheap bump map that costs three texture
    // samples and reuses the tile already fetched above.
    //
    // Without this, a 1 m grid under a low sun is a sheet of paper: the eye reads
    // surface roughness almost entirely from normal variation, and albedo texture
    // alone cannot fake it under directional light.
    vec2 texel = vec2(1.0 / 256.0);

    // **The world scale matters more than the amplitude.** The first attempt
    // sampled the tile at 1/0.85 m, i.e. 4.6 mm per texel. That is a real gravel
    // size, and it produced nothing on screen: by ten metres the whole tile
    // occupies a few pixels, so the mip chain averages the gradient to zero and
    // the surface goes back to being a sheet. Bump relief that survives a
    // moderately distant camera has to be measured in *decimetres per texel*.
    // Two octaves: 8 cm/texel (gravel, dies by ~8 m) and 30 cm/texel (drifts and
    // rubble shadows, still visible at 40 m).
    float bumpNear = 0.9 * uDetailScale;
    float bumpFar = 1.7 * uDetailScale;

    vec2 uvNear = vTerrainUv * 0.5;
    float nL = texture2D(uRegolith, uvNear - vec2(texel.x, 0.0)).g;
    float nR = texture2D(uRegolith, uvNear + vec2(texel.x, 0.0)).g;
    float nD = texture2D(uRegolith, uvNear - vec2(0.0, texel.y)).g;
    float nU = texture2D(uRegolith, uvNear + vec2(0.0, texel.y)).g;

    vec2 uvFar = vTerrainUv * 0.13;
    float fL = texture2D(uRegolith, uvFar - vec2(texel.x, 0.0)).r;
    float fR = texture2D(uRegolith, uvFar + vec2(texel.x, 0.0)).r;
    float fD = texture2D(uRegolith, uvFar - vec2(0.0, texel.y)).r;
    float fU = texture2D(uRegolith, uvFar + vec2(0.0, texel.y)).r;

    // Tangent frame for world-space XZ ground: tangent ≈ +X, bitangent ≈ +Z.
    vec3 bumpNormal = normalize(vec3(
      -((nR - nL) * bumpNear + (fR - fL) * bumpFar),
      1.0,
      -((nU - nD) * bumpNear + (fU - fD) * bumpFar)
    ));
    // Blend the perturbed normal in only where the ground is close to flat, so a
    // cliff face does not lose its real slope to a noise gradient.
    normal = normalize(mix(normal, bumpNormal, 0.9 * (1.0 - smoothstep(0.15, 0.5, slope))));

    // ------------------------------------------------------------------ lighting
    // Martian lighting has four contributors, in order of strength:
    //   sun (hard, warm), sky (dusty, slightly cool), ground bounce (warm, strong
    //   because the regolith is bright), and a weak forward-scatter term that
    //   keeps the sunward faces of rocks from going flat.
    //
    // **Order matters, and the first version had it wrong.** This block used to
    // run before the bump and then apply the perturbation as a multiplier on the
    // result. Because the ambient term is not attenuated by the perturbation, the
    // net effect was a ±3 % swing on an already-lit colour — mathematically
    // present, visually zero. Every "the ground still looks smooth" observation
    // traced back to that. The normal is now perturbed first and the *N·L term
    // itself* varies, which is what makes relief visible.
    float sunAmount = max(dot(normal, uSunDirection), 0.0);
    // Soft terminator: real Mars has no sharp night line because the dust
    // scatters light well past the geometric terminator.
    float wrapped = clamp((dot(normal, uSunDirection) + 0.25) / 1.25, 0.0, 1.0);
    float terminator = mix(sunAmount, wrapped, 0.35);

    vec3 ambient = mix(uGroundColor, uSkyColor, normal.y * 0.5 + 0.5) * uDaylight;

    // Direct sun is multiplied by the shadow term; ambient is not. That asymmetry
    // is the whole reason a shadow reads: the occluded patch keeps the dusty sky
    // fill (which is why Mars' shadows look blue-grey rather than black) while
    // losing the hard low-sun key that produces them.
    // getShadowMask() is 1.0 in full sun and 0.0 in full shadow, and returns 1.0
    // everywhere when the define is absent — so this needs no #ifdef of its own.
    float shadowFactor = getShadowMask();

    vec3 sunLit = uSunColor * terminator * uSunTint * shadowFactor;

    // Rock rim: a cheap approximate fresnel on the grazing angle picks out
    // silhouettes against the sky without a metalness channel.
    float rim = pow(1.0 - clamp(dot(normal, normalize(cameraPosition - vWorldPosition)), 0.0, 1.0), 3.0);
    vec3 rimLight = uSkyColor * rim * 0.16 * uDaylight;

    vec3 lit = base * (ambient + sunLit) + rimLight;

    // ------------------------------------------------------- aerial perspective
    // Directional dust extinction: looking sunward through suspended dust is far
    // hazier than looking away. The dot product is the physical cause; squaring it
    // exaggerates slightly, which matches what the rovers' cameras record.
    float distanceToCamera = length(vWorldPosition - cameraPosition);
    vec3 viewDirection = (vWorldPosition - cameraPosition) / max(distanceToCamera, 0.001);
    float sunward = clamp(dot(viewDirection, uSunDirection) * 0.5 + 0.5, 0.0, 1.0);
    float sunwardBoost = 0.45 + sunward * sunward * 1.1;

    float fogBase = smoothstep(uFogNear, uFogFar, distanceToCamera);
    // Height falloff: dust is denser in the basins than on the ridges, so high
    // ground stays legible from further away.
    float heightFall = mix(1.15, 0.55, smoothstep(40.0, 220.0, vWorldPosition.y));
    float fog = clamp(fogBase * sunwardBoost * heightFall, 0.0, 1.0);
    // Aerial colour is warmer toward the sun and cooler away from it.
    vec3 aerial = mix(uFogColor * 0.88, uFogColor, sunward);

    // ------------------------------------------------- the end of the world
    // The streamed ring is an *axis-aligned square* of chunks, so from a corner
    // of it the terrain simply stops along two perfectly straight lines. A
    // straight edge on the horizon does not read as "the draw distance ends"; it
    // reads as a bug, and it was very visible as a hard diagonal cutting across
    // the frame.
    //
    // A radial fade cannot make the square round, but it does guarantee the
    // transition happens where the boundary is *nearest* — not in the corner
    // directions, where the square reaches 1.41x further. Dissolving the ground
    // into the aerial colour before the geometry ends means the eye never finds a
    // silhouette to read as an edge: the terrain fades out, and beyond it is sky
    // of the same colour.
    float ringRadius = length(vWorldPosition.xz - uRingCentre);
    float ringFade = smoothstep(uRingFadeStart, uRingFadeEnd, ringRadius);
    // Also dissolve by *distance from the camera*, so a player standing at the
    // ring's centre sees the same fade in every direction rather than a square.
    float horizonFade = smoothstep(uFogFar * 0.82, uFogFar * 1.28, distanceToCamera);
    float dissolve = max(ringFade, horizonFade);

    fog = clamp(fog + dissolve * (1.0 - fog), 0.0, 1.0);
    vec3 color = mix(lit, aerial, fog);

    // No discard here.
    //
    // Dropping the fragment seemed tidy — the geometry has dissolved into the
    // aerial colour, so why draw it? Because *terrain still occludes things behind
    // it even when it is invisible*. Discarding let the sky dome show through the
    // mountain in front of the camera, which rendered as a large pale flat shape
    // with a straight edge, easily mistaken for a broken ground plane. Fully
    // fogged terrain must still write depth. Keeping the fragment costs one
    // blended write and preserves the silhouette.

    gl_FragColor = vec4(color, 1.0);

    #include <colorspace_fragment>
  }
`;

export interface TerrainMaterialOptions {
  fogColor: THREE.ColorRepresentation;
  fogNear: number;
  fogFar: number;
}

export class TerrainMaterial {
  readonly material: THREE.ShaderMaterial;

  constructor(options: TerrainMaterialOptions) {
    const regolith = regolithTexture();

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uSunDirection: { value: new THREE.Vector3(0.4, 0.72, 0.3).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.95, 0.86).multiplyScalar(1.05) },
        uSunTint: { value: new THREE.Color(1.0, 0.92, 0.82) },
        uSkyColor: { value: new THREE.Color(MARS_PALETTE.ambientSky) },
        uGroundColor: { value: new THREE.Color(MARS_PALETTE.ambientGround) },
        uBasalt: { value: new THREE.Color(MARS_PALETTE.basalt) },
        uOchre: { value: new THREE.Color(MARS_PALETTE.ochre) },
        uHighland: { value: new THREE.Color(MARS_PALETTE.highland) },
        uDust: { value: new THREE.Color(MARS_PALETTE.dust) },
        uBedrock: { value: new THREE.Color(MARS_PALETTE.bedrock) },
        uFogColor: { value: new THREE.Color(options.fogColor) },
        uFogNear: { value: options.fogNear },
        uFogFar: { value: options.fogFar },
        uRingCentre: { value: new THREE.Vector2(0, 0) },
        uRingFadeStart: { value: 300 },
        uRingFadeEnd: { value: 420 },
        uDustCoverage: { value: 0.55 },
        uGrain: { value: 1 },
        uDetailScale: { value: 1 },
        uRegolith: { value: regolith },
        uDaylight: { value: 1 },
        // The full three.js light uniform block. Without this the renderer has
        // nowhere to write the shadow matrices it computes.
        ...THREE.UniformsLib.lights,
      },
      vertexColors: false,
      side: THREE.FrontSide,
      // Opt this material into three.js's light and shadow uniform plumbing.
      //
      // A plain ShaderMaterial gets no `directionalShadowMap`, no
      // `directionalShadowMatrix` and no `USE_SHADOWMAP` define, so the terrain
      // receives nothing from the shadow pass and every object standing on it
      // appears to cast no shadow — while the *objects themselves*, being
      // MeshStandardMaterial, are shadowed perfectly well. That asymmetry is easy
      // to misread as "shadows are off". Setting `lights` makes WebGLRenderer treat
      // this as a lit material and supply the directional light arrays.
      lights: true,
      fog: false,
    });
    // `lights` is read by the renderer but is not part of ShaderMaterialParameters.
    (this.material as THREE.ShaderMaterial & { lights: boolean }).lights = true;
  }

  /** Called when the sun moves (day/night cycle). */
  setSun(direction: THREE.Vector3, intensity: number, color: THREE.Color): void {
    const uniforms = this.material.uniforms;
    (uniforms.uSunDirection.value as THREE.Vector3).copy(direction).normalize();
    (uniforms.uSunColor.value as THREE.Color).copy(color).multiplyScalar(intensity);
  }

  setFog(color: THREE.ColorRepresentation, near: number, far: number): void {
    const uniforms = this.material.uniforms;
    (uniforms.uFogColor.value as THREE.Color).set(color);
    uniforms.uFogNear.value = near;
    uniforms.uFogFar.value = far;
  }

  /**
   * Tell the shader where the streamed ring is centred and how far it reaches.
   *
   * Called whenever the player crosses a chunk boundary, because the fade must
   * always sit inside the *smallest* half-extent of the ring — the direction in
   * which the square ends soonest.
   */
  setRing(centreX: number, centreZ: number, chunkRadius: number, chunkSize: number): void {
    const uniforms = this.material.uniforms;
    (uniforms.uRingCentre.value as THREE.Vector2).set(centreX, centreZ);
    // Half-extent of the ring in the cardinal directions, less a chunk of margin
    // so no geometry is ever drawn at a radius beyond where terrain exists.
    const halfExtent = (chunkRadius + 0.5) * chunkSize;
    uniforms.uRingFadeStart.value = halfExtent * 0.72;
    uniforms.uRingFadeEnd.value = halfExtent * 0.98;
  }

  /** Night must be dark: ambient scales with daylight, not a constant. */
  setDaylight(daylight: number): void {
    this.material.uniforms.uDaylight.value = Math.max(0.06, Math.min(1, daylight));
  }

  setQuality(preset: 'high' | 'balanced' | 'low'): void {
    // Detail sampling is the most expensive part of this shader on a mobile GPU.
    // The lowest preset keeps the macro and patch scales (which carry the
    // large-scale look) and drops the two finest, plus thins the grain.
    const uniforms = this.material.uniforms;
    uniforms.uGrain.value = preset === 'low' ? 0.45 : 1;
    uniforms.uDetailScale.value = preset === 'low' ? 0.5 : 1;
    uniforms.uDustCoverage.value = preset === 'low' ? 0.45 : 0.55;
    (uniforms.uRegolith.value as THREE.Texture).anisotropy = preset === 'low' ? 1 : 4;
  }

  dispose(): void {
    this.material.dispose();
  }
}
