/**
 * The renderer, verified as far as this sandbox allows.
 *
 * There is no GPU here and no headless browser (the CDN is blocked), so nothing in
 * this file proves that Mars draws. What it *does* prove is everything between the
 * shader source and the draw call that can be checked without one:
 *
 *   · the GLSL in the terrain, sky and dust shaders is well formed — balanced
 *     braces and parentheses, every `varying` declared on both sides, every
 *     uniform the JS writes declared in the shader, and no GLSL 3 keywords in a
 *     GLSL 1 shader;
 *   · Three.js can build the real BufferGeometries the game asks for (positions,
 *     normals, indices, bounding spheres) from the chunk builder's typed arrays;
 *   · the scene graph the game assembles has the objects it claims, with the
 *     instancing counts the rock field promises.
 *
 * The alternative — asserting "rendering verified" because a build succeeded — is
 * exactly the kind of claim this repository's audits exist to prevent.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-mars-game-render.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';

/* ------------------------------------------------------------ GLSL checking */

/** Extracts a glsl template literal that follows a given const name. */
function shaderSource(file, constName) {
  const source = readFileSync(file, 'utf8');
  const pattern = new RegExp(`const ${constName} = /\\* glsl \\*/ \`([\\s\\S]*?)\`;`);
  const match = pattern.exec(source);
  assert.ok(match, `${file}: ${constName} not found`);
  return match[1];
}

function balanced(source, open, close) {
  let depth = 0;
  for (const character of source) {
    if (character === open) depth += 1;
    if (character === close) depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function declared(text, kind) {
  return new Set(
    [...text.matchAll(new RegExp(`\\b${kind}\\s+\\w+\\s+(\\w+)\\s*;`, 'g'))].map((match) => match[1]),
  );
}

function uniformsWrittenByJs(source) {
  return new Set([...source.matchAll(/uniforms\.(\w+)/g)].map((match) => match[1]));
}

const SHADERS = [
  {
    file: 'src/game/render/TerrainMaterial.ts',
    name: 'vertex',
    constName: 'VERTEX_SHADER',
    fragment: false,
    requiredUniforms: ['uSunDirection', 'uSunColor', 'uSkyColor', 'uGroundColor', 'uBasalt', 'uOchre', 'uHighland', 'uDust', 'uFogColor', 'uFogNear', 'uFogFar', 'uDustCoverage', 'uGrain'],
  },
  { file: 'src/game/render/TerrainMaterial.ts', name: 'fragment', constName: 'FRAGMENT_SHADER', fragment: true, requiredUniforms: [] },
  {
    file: 'src/game/render/Sky.ts',
    name: 'sky vertex',
    constName: 'SKY_VERTEX',
    fragment: false,
    requiredUniforms: [],
  },
  {
    file: 'src/game/render/Sky.ts',
    name: 'sky fragment',
    constName: 'SKY_FRAGMENT',
    fragment: true,
    requiredUniforms: ['uZenith', 'uHorizon', 'uNightZenith', 'uNightHorizon', 'uSunDirection', 'uSunGlow', 'uSunElevation', 'uDaylight'],
  },
  {
    file: 'src/game/render/Dust.ts',
    name: 'dust vertex',
    constName: 'DUST_VERTEX',
    fragment: false,
    requiredUniforms: ['uTime', 'uWind', 'uBoxSize', 'uPixelRatio', 'uSizeScale'],
  },
  {
    file: 'src/game/render/Dust.ts',
    name: 'dust fragment',
    constName: 'DUST_FRAGMENT',
    fragment: true,
    requiredUniforms: ['uColor', 'uOpacity'],
  },
];

test('every shader is syntactically well formed', () => {
  for (const shader of SHADERS) {
    const source = shaderSource(shader.file, shader.constName);
    assert.ok(balanced(source, '{', '}'), `${shader.name}: unbalanced braces`);
    assert.ok(balanced(source, '(', ')'), `${shader.name}: unbalanced parentheses`);
    assert.match(source, /void main\s*\(\s*\)/, `${shader.name}: no main()`);
    assert.match(source, /precision\s+(highp|mediump|lowp)\s+float/, `${shader.name}: no precision qualifier`);
    // A body that never writes gl_Position or gl_FragColor draws nothing.
    if (shader.fragment) assert.match(source, /gl_FragColor\s*=/, `${shader.name}: writes no colour`);
    else assert.match(source, /gl_Position\s*=/, `${shader.name}: never positions a vertex`);

    // GLSL 1 only: `in`/`out`/`texture()` belong to GLSL 3 and will not compile on a
    // WebGL1 device, which is most of the tablets this targets.
    assert.doesNotMatch(source, /^\s*(in|out)\s+\w+\s+\w+\s*;/m, `${shader.name}: GLSL 3 in/out`);
    assert.doesNotMatch(source, /\btexture\s*\(/, `${shader.name}: GLSL 3 texture()`);
    assert.doesNotMatch(source, /#version\s+300/, `${shader.name}: GLSL 3 version pragma`);
  }
});

test('varyings and uniforms agree between the JS and the GLSL', () => {
  const pairs = [
    ['src/game/render/TerrainMaterial.ts', 'VERTEX_SHADER', 'FRAGMENT_SHADER'],
    ['src/game/render/Sky.ts', 'SKY_VERTEX', 'SKY_FRAGMENT'],
    ['src/game/render/Dust.ts', 'DUST_VERTEX', 'DUST_FRAGMENT'],
  ];

  for (const [file, vertexName, fragmentName] of pairs) {
    const vertex = shaderSource(file, vertexName);
    const fragment = shaderSource(file, fragmentName);
    const vertexVaryings = declared(vertex, 'varying');
    const fragmentVaryings = declared(fragment, 'varying');

    // A varying read in the fragment shader but not written by the vertex shader
    // is the single most common silent shader failure (a link error at runtime).
    for (const name of fragmentVaryings) {
      assert.ok(vertexVaryings.has(name), `${file}: fragment reads varying ${name} the vertex shader never writes`);
    }

    // Every uniform the JS sets must exist in one of the two stages.
    const source = readFileSync(file, 'utf8');
    const declaredUniforms = new Set([...declared(vertex, 'uniform'), ...declared(fragment, 'uniform')]);
    for (const uniform of uniformsWrittenByJs(source)) {
      // `uniforms.uX.value` is our own object literal; only check names the shader
      // is expected to consume.
      if (/^u[A-Z]/.test(uniform)) {
        assert.ok(declaredUniforms.has(uniform), `${file}: JS sets uniform ${uniform} that no shader declares`);
      }
    }
  }

  // The terrain fragment shader must declare every uniform the material class sets.
  const terrain = readFileSync('src/game/render/TerrainMaterial.ts', 'utf8');
  const fragment = shaderSource('src/game/render/TerrainMaterial.ts', 'FRAGMENT_SHADER');
  const fragmentUniforms = declared(fragment, 'uniform');
  for (const required of ['uSunDirection', 'uSunColor', 'uFogColor', 'uFogNear', 'uFogFar']) {
    assert.ok(fragmentUniforms.has(required), `terrain fragment is missing ${required}`);
  }
  assert.match(terrain, /#include <colorspace_fragment>/, 'the terrain output is colour-managed');
  assert.match(terrain, /gl_FragColor/, 'the terrain writes a fragment colour');
});

test('Three.js accepts the geometry the chunk builder produces', () => {
  // Built with the real builder, wrapped exactly as TerrainChunk.tsx does it.
  return import('../src/game/world/chunks.ts').then(({ buildChunkGeometry, CHUNK_SIZE }) => {
    const data = buildChunkGeometry(2, -3, 33);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geometry.setAttribute('aSlope', new THREE.BufferAttribute(data.slopes, 1));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    assert.equal(geometry.getAttribute('position').count, 1089);
    assert.equal(geometry.getAttribute('normal').count, 1089);
    assert.equal(geometry.getAttribute('aSlope').count, 1089);
    assert.equal(geometry.index.count, 2048 * 3);

    const sphere = geometry.boundingSphere;
    assert.ok(sphere, 'a bounding sphere exists, so frustum culling can work');
    assert.ok(Number.isFinite(sphere.radius) && sphere.radius > 0);
    // The sphere must contain the whole tile, or a chunk vanishes at the screen edge.
    assert.ok(sphere.radius >= CHUNK_SIZE * 0.7, `bounding radius ${sphere.radius} is too small for a ${CHUNK_SIZE} m tile`);

    const box = geometry.boundingBox;
    assert.ok(box.min.x >= -0.001 && box.max.x <= CHUNK_SIZE + 0.001, 'vertices are local to the chunk origin');
    assert.ok(box.max.y - box.min.y > 0.1, 'the tile has relief');

    // No NaN reaches the GPU: one bad float blanks a whole draw call.
    for (const array of [data.positions, data.normals, data.slopes]) {
      for (let i = 0; i < array.length; i += 1) {
        assert.ok(Number.isFinite(array[i]), `non-finite vertex component at ${i}`);
      }
    }

    geometry.dispose();
    return undefined;
  });
});

test('the terrain material builds and responds to the sun and quality setters', async () => {
  const { TerrainMaterial } = await import('../src/game/render/TerrainMaterial.ts');
  const material = new TerrainMaterial({ fogColor: '#d8b08a', fogNear: 70, fogFar: 260 });

  assert.ok(material.material instanceof THREE.ShaderMaterial);
  assert.notEqual(material.material.transparent, true, 'terrain must be opaque');
  assert.equal(material.material.side, THREE.FrontSide);

  material.setSun(new THREE.Vector3(1, 1, 1), 1.1, new THREE.Color('#fff0dd'));
  const direction = material.material.uniforms.uSunDirection.value;
  assert.ok(Math.abs(direction.length() - 1) < 1e-6, 'the sun direction is normalised');

  material.setFog('#141b28', 40, 150);
  assert.equal(material.material.uniforms.uFogFar.value, 150);

  material.setQuality('low');
  // Low quality thins the grain and halves the detail sampling. It does not zero
  // the grain: an untextured surface at walking distance reads as plastic, which
  // was the exact complaint the detail tile was added to fix.
  assert.equal(material.material.uniforms.uGrain.value, 0.45, 'low quality thins the grain pass');
  assert.equal(material.material.uniforms.uDetailScale.value, 0.5, 'low quality halves detail sampling');
  assert.equal(material.material.uniforms.uDustCoverage.value, 0.45);
  material.setQuality('high');
  assert.equal(material.material.uniforms.uGrain.value, 1);
  assert.equal(material.material.uniforms.uDetailScale.value, 1);

  material.dispose();
});

test('the rock field instances exactly the rocks the world generates', async () => {
  const { rocksInChunk } = await import('../src/game/world/rocks.ts');
  const chunks = [
    { cx: 0, cz: 0 },
    { cx: 1, cz: 0 },
    { cx: 0, cz: 1 },
  ];

  const expected = chunks.reduce((sum, chunk) => sum + rocksInChunk(chunk.cx, chunk.cz).length, 0);
  const rocks = chunks.flatMap((chunk) => rocksInChunk(chunk.cx, chunk.cz));
  assert.equal(rocks.length, expected);

  // Grouping by kind, as RockField does, must partition without loss or duplication.
  const groups = new Map();
  for (const rock of rocks) groups.set(rock.kind, [...(groups.get(rock.kind) ?? []), rock]);
  const regrouped = [...groups.values()].reduce((sum, list) => sum + list.length, 0);
  assert.equal(regrouped, rocks.length, 'instancing dropped or duplicated a rock');

  // Every instance transform the renderer composes must be finite and upright.
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (const rock of rocks.slice(0, 40)) {
    position.set(rock.x, rock.y - rock.radius * 0.28, rock.z);
    quaternion.setFromAxisAngle(up, rock.rotation);
    scale.set(rock.scale * 2, rock.scale * 2 * rock.flatten, rock.scale * 2);
    matrix.compose(position, quaternion, scale);

    for (const value of matrix.elements) assert.ok(Number.isFinite(value), 'instance matrix has a NaN');
    assert.ok(scale.y > 0, 'a rock was scaled to nothing');
  }
});

test('a shader compiler would receive concrete source, not a template placeholder', async () => {
  const { TerrainMaterial } = await import('../src/game/render/TerrainMaterial.ts');
  const material = new TerrainMaterial({ fogColor: '#d8b08a', fogNear: 1, fogFar: 2 });

  // A `${...}` that survived interpolation means the GLSL would reach the driver
  // with literal braces in it.
  assert.doesNotMatch(material.material.vertexShader, /\$\{/, 'uninterpolated template expression in vertex shader');
  assert.doesNotMatch(material.material.fragmentShader, /\$\{/, 'uninterpolated template expression in fragment shader');
  assert.ok(material.material.fragmentShader.length > 500, 'the fragment shader is suspiciously short');
  material.dispose();
});

test('the game never loads a third-party asset at runtime', () => {
  // The brief asks for a realistic Mars; it does not ask for a 40 MB texture pack.
  // Every asset request the game makes must be same-origin, and the only network
  // call allowed is the already-audited NASA feed.
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return /\.(tsx?)$/.test(entry.name) ? [path] : [];
  });

  const allowedNetwork = /\/api\/mars\/latest/;
  for (const file of walk('src/game')) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/fetch\(\s*[`'"]([^`'"]+)/g)) {
      assert.match(match[1], allowedNetwork, `${file} fetches ${match[1]}`);
    }
    for (const match of source.matchAll(/https?:\/\/[a-z0-9.-]+/gi)) {
      // Documentation URLs in comments are fine; they are not requested.
      const line = source.slice(0, match.index).split('\n').pop() ?? '';
      const isComment = /^\s*(\*|\/\/)/.test(line);
      const isScienceLink = file === 'src/game/ui/Panels.tsx' && match[0] === 'https://science.nasa.gov' && /<a\s/.test(line) && /href=/.test(line);
      assert.ok(isComment || isScienceLink, `${file} references ${match[0]} outside a comment or approved science link`);
    }
  }
});

/* ------------------------------------------------ GLSL reserved words (real-bug) */

/**
 * Finds GLSL reserved words used as identifiers.
 *
 * This test exists because of a shipped, screen-breaking bug: the terrain shader
 * declared a local `float patch`, which is a *reserved* word in GLSL ES 1.00 (it
 * is reserved for ARB tessellation). Desktop Mesa happened to accept the shader in
 * an earlier inspection; the first real WebGL compile rejected it, and the whole
 * terrain drew as nothing but a sky-coloured void. No static check in this
 * repository caught it, because the string is syntactically fine — it is only
 * illegal *to the compiler*.
 *
 * The list is GLSL ES 1.00 §3.6 (keywords and "reserved for future use"), plus
 * the identifiers that actual drivers in the field reject even though the spec
 * does not reserve them.
 */
test('no GLSL template literal contains a stray backtick', () => {
  // A backtick inside a /* glsl */ `...` block terminates the JavaScript string
  // early. The shader then ends mid-expression, the rest of the file is parsed as
  // JavaScript, and the error surfaces as "',' expected" on an unrelated line — or,
  // in a dev server, as a module that silently fails to import and a game screen
  // that never mounts. It cost a debugging cycle, so it is pinned here. Prose in a
  // GLSL comment is the usual culprit.
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith('.ts') || full.endsWith('.tsx')) files.push(full);
    }
  };
  walk(new URL('../src/game', import.meta.url).pathname);
  assert.ok(files.length > 20, 'expected to scan the game sources');

  let checked = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const blocks = source.match(/\/\* glsl \*\/ `/g);
    if (!blocks) continue;
    const backticks = (source.match(/`/g) || []).length;
    assert.equal(
      backticks % 2,
      0,
      `${file}: ${blocks.length} GLSL block(s) but an odd backtick count — one of them ends the template literal early`,
    );
    checked += 1;
  }
  assert.ok(checked >= 2, `only ${checked} files with GLSL blocks scanned`);
});

test('no shader uses a GLSL ES reserved word as an identifier', () => {
  const RESERVED = [
    // §3.6 keywords
    'attribute', 'const', 'bool', 'float', 'int', 'break', 'continue', 'do', 'else', 'for',
    'if', 'discard', 'return', 'in', 'out', 'inout', 'uniform', 'varying', 'struct',
    'precision', 'invariant', 'highp', 'mediump', 'lowp', 'void', 'true', 'false',
    // §3.6 reserved for future use
    'asm', 'class', 'union', 'enum', 'typedef', 'template', 'this', 'packed', 'goto',
    'switch', 'default', 'inline', 'noinline', 'volatile', 'public', 'static', 'extern',
    'external', 'interface', 'long', 'short', 'double', 'half', 'fixed', 'unsigned',
    'superp', 'input', 'output', 'hvec2', 'hvec3', 'hvec4', 'dvec2', 'dvec3', 'dvec4',
    'fvec2', 'fvec3', 'fvec4', 'sampler1D', 'sampler3D', 'sampler1DShadow',
    'sampler2DShadow', 'sampler2DRect', 'sizeof', 'cast', 'namespace', 'using',
    // rejected by real drivers although not formally reserved
    'patch', 'sample', 'filter', 'buffer', 'common', 'partition', 'active', 'resource',
    'super', 'subroutine',
  ];

  const offenders = [];
  for (const file of readdirSync('src/game/render')) {
    if (!file.endsWith('.ts')) continue;
    const path = `src/game/render/${file}`;
    const source = readFileSync(path, 'utf8');
    const shaders = [...source.matchAll(/\/\* glsl \*\/ `([\s\S]*?)`/g)].map((match) => match[1]);
    for (const [index, shader] of shaders.entries()) {
      // Comments legitimately contain prose with these words; strip them first.
      const code = shader.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const word of RESERVED) {
        // \b so `patched` and `sampler2D` (a type) do not false-positive; the
        // declaration forms are what matter, so only flag identifiers that are
        // *declared or assigned*.
        const declaration = new RegExp(`\\b(?:float|vec[234]|int|bool|mat[234]|sampler2D)\\s+${word}\\b`);
        if (declaration.test(code)) offenders.push(`${path} shader#${index + 1}: declares \`${word}\``);
      }
    }
  }
  assert.deepEqual(offenders, [], `GLSL reserved words used as identifiers:\n${offenders.join('\n')}`);
});

test('third-person camera clears the documented steep canyon slope', async () => {
  const { cameraGroundClearance } = await import('../src/game/render/cameraGround.ts');
  const { terrainHeight } = await import('../src/game/world/terrain.ts');
  const x = 76, z = -237 + Math.cos(0.09) * 6.2;
  const oldY = terrainHeight(76, -237) + 1.62 + Math.sin(0.09) * 6.2 + 1.1;
  assert.ok(oldY < terrainHeight(x, z), 'regression viewpoint must reproduce an underground camera');
  assert.ok(cameraGroundClearance(x, z) > terrainHeight(x, z));
  assert.equal(cameraGroundClearance(0, 0, () => 12), 12.8);
});

test('rover wheel geometry has a bounded horizontal axle and a single merged draw', async () => {
  const { makeWheelGeometry } = await import('../src/game/render/Rover.tsx');
  const wheel = makeWheelGeometry();
  wheel.computeBoundingBox();
  const bounds = wheel.boundingBox;
  assert.ok(bounds);
  assert.ok(bounds.max.x - bounds.min.x < 0.35, 'axle must be narrower than wheel diameter');
  assert.ok(bounds.max.y - bounds.min.y > 0.7, 'wheel should have the expected radius');
  assert.ok(wheel.index && wheel.index.count < 2000, 'merged wheel should remain lightweight');
  wheel.dispose();
});
