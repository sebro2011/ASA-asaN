/**
 * NOVA L.I.F.E. — memory fabric, graph, permissions and evaluation.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-life-memory.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLifeEngine } from '../server/life/index.js';

function engine(env = {}) {
  return createLifeEngine({ inMemory: true, root: process.cwd(), env });
}

test('five memory categories are stored, counted and listed', () => {
  const life = engine();
  const seeds = [
    ['working', 'Current session', 'Comparing two telescopes for lunar observing tonight.'],
    ['episodic', 'Observed Jupiter', 'Used the 8 inch reflector on 2026-02-14; seeing was good.'],
    ['semantic', 'Moon phase geometry', 'The Moon phase is determined by the Sun-Earth-Moon angle.'],
    ['procedural', 'Dark adaptation routine', 'Wait twenty minutes, use red light, avoid phone screens.'],
    ['personal', 'Preferred instrument', 'The user prefers the 8 inch reflector for planets.'],
  ];
  for (const [category, title, body] of seeds) {
    const result = life.memory.add({ category, title, body });
    assert.equal(result.duplicate, false);
    assert.equal(result.memory.category, category);
  }
  const counts = life.memory.counts();
  assert.equal(counts.total, 5);
  for (const [, category] of seeds.map(([category]) => [null, category])) {
    assert.equal(counts.byCategory[category], 1);
  }
  assert.equal(life.memory.list({ category: 'semantic' }).length, 1);
  assert.equal(life.memory.list({ limit: 2 }).length, 2);
  life.close();
});

test('memory input is validated and credentials are refused', () => {
  const life = engine();
  assert.throws(() => life.memory.add({ title: 'a', body: 'too short title' }), /INVALID_MEMORY_TITLE|3/);
  assert.throws(() => life.memory.add({ title: 'Valid title', body: '   ' }), /INVALID_MEMORY_BODY|1/);
  assert.throws(
    () => life.memory.add({ category: 'dreams', title: 'Valid title', body: 'body text' }),
    (error) => error.code === 'INVALID_CATEGORY',
  );
  assert.throws(
    () => life.memory.add({ title: 'Key copy', body: 'here is my key sk-abcdef0123456789abcdef use it' }),
    (error) => error.code === 'SECRET_IN_MEMORY',
  );
  // A redacted form is not stored either: there is nothing to redact on read.
  assert.equal(life.memory.counts().total, 0);
  life.close();
});

test('duplicate detection stops the same memory being stored twice', () => {
  const life = engine();
  const first = life.memory.add({ category: 'semantic', title: 'Kepler third law', body: 'T squared is proportional to a cubed.' });
  const again = life.memory.add({ category: 'semantic', title: 'kepler THIRD law', body: 'Different words entirely here.' });
  assert.equal(again.duplicate, true);
  assert.equal(again.reason, 'same-title');
  assert.equal(again.memory.id, first.memory.id);

  const body = 'A telescope needs a stable mount, a dark sky and patience at the eyepiece.';
  life.memory.add({ category: 'semantic', title: 'Telescope basics', body });
  const near = life.memory.add({ category: 'semantic', title: 'Refractor basics', body: body.replace('telescope', 'refractor') });
  assert.equal(near.duplicate, true);
  assert.equal(near.reason, 'similar-body');
  assert.equal(life.memory.counts().total, 2);
  life.close();
});

test('updates keep history, and a correction can be reverted', () => {
  const life = engine();
  const { memory } = life.memory.add({ title: 'Session plan', body: 'Observe M42.', category: 'working' });
  const updated = life.memory.correct(memory.id, { body: 'Observe M42 then M45.', reason: 'clouds cleared' });
  assert.equal(updated.version, 2);
  assert.equal(updated.body, 'Observe M42 then M45.');

  const versions = life.memory.listVersions(memory.id);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].body, 'Observe M42.');
  assert.equal(versions[0].reason, 'clouds cleared');

  const reverted = life.memory.revert(memory.id, versions[0].version);
  assert.equal(reverted.body, 'Observe M42.');
  assert.equal(reverted.version, 3);
  life.close();
});

test('search ranks by keyword and explains the score', async () => {
  const life = engine();
  life.memory.add({ category: 'semantic', title: 'Lunar eclipse checklist', body: 'Clear horizon, tripod, warm clothes, extra battery.' });
  life.memory.add({ category: 'episodic', title: 'Solar observing notes', body: 'Baader filter, low power, never look directly at the Sun.' });
  life.memory.add({ category: 'procedural', title: 'Collimation steps', body: 'Centre the secondary mirror, then align the primary.' });

  const result = await life.memory.search({ query: 'lunar eclipse' });
  assert.equal(result.strategy, 'fts');
  assert.ok(result.results.length >= 1);
  assert.match(result.results[0].memory.title, /Lunar eclipse/);
  assert.ok(result.results[0].score > 0);
  assert.ok(result.results[0].parts.keyword >= 0);
  assert.equal(typeof result.results[0].parts.recency, 'number');

  const filtered = await life.memory.search({ query: 'observing', categories: ['episodic'] });
  assert.equal(filtered.results.every((entry) => entry.memory.category === 'episodic'), true);
  assert.equal((await life.memory.search({ query: '' })).results.length, 0);
  life.close();
});

test('a Sinhala query reaches an English memory through the glossary bridge', async () => {
  const life = engine();
  life.memory.add({
    category: 'semantic',
    title: 'Moon rise times',
    body: 'The Moon rises about fifty minutes later each night.',
  });
  const result = await life.memory.search({ query: 'චන්ද්‍රයා උදාව' });
  assert.ok(result.expandedTerms.includes('moon'));
  assert.equal(result.results.length, 1);
  assert.match(result.results[0].memory.title, /Moon rise/);
  life.close();
});

test('Tamil and Sinhala memories are stored with the right language tag', () => {
  const life = engine();
  const tamil = life.memory.add({ title: 'நிலா கட்டங்கள்', body: 'நிலா கட்டங்கள் சூரியன்-பூமி-நிலா கோணத்தால் தீர்மானிக்கப்படுகின்றன.' });
  assert.equal(tamil.memory.language, 'ta');
  const sinhala = life.memory.add({ title: 'ග්‍රහලෝක නිරීක්ෂණය', body: 'ගුරු ග්‍රහයා රාත්‍රී අහසේ දීප්තිමත්ම ග්‍රහලෝකයයි.' });
  assert.equal(sinhala.memory.language, 'si');
  life.close();
});

test('retention expires working memories and keeps durable ones', () => {
  const life = engine();
  life.memory.add({ category: 'working', title: 'Temporary context', body: 'This should not survive the week.' });
  life.memory.add({ category: 'semantic', title: 'Durable fact', body: 'Jupiter has 95 confirmed moons as of recent counts.' });
  const working = life.memory.list({ category: 'working' })[0];
  assert.ok(working.expiresAt, 'working memory has an expiry');
  life.store.run('update memories set expires_at = ? where id = ?', ['2000-01-01T00:00:00.000Z', working.id]);
  const result = life.memory.expire();
  assert.equal(result.removed, 1);
  assert.equal(life.memory.counts().byCategory.working, 0);
  assert.equal(life.memory.counts().byCategory.semantic, 1);
  life.close();
});

test('summaries are extractive and name the memories they used', () => {
  const life = engine();
  const a = life.memory.add({ title: 'First note', body: 'First sentence here. Second sentence follows.' });
  life.memory.add({ title: 'Second note', body: 'Only one sentence.' });
  const summary = life.memory.summarize({ limit: 5 });
  assert.equal(summary.method, 'extractive');
  assert.match(summary.summary, /First note: First sentence here\./);
  assert.ok(summary.used.includes(a.memory.id));
  life.close();
});

test('permissions gate reading, writing and deleting', () => {
  const life = engine();
  const { memory } = life.memory.add({ title: 'Guarded note', body: 'Only a granted client may read this.' });

  life.security.setGrant('memory.write', false);
  assert.throws(() => life.memory.add({ title: 'Blocked note', body: 'should not be stored' }), (error) => error.code === 'PERMISSION_DENIED');
  assert.equal(life.memory.counts().total, 1, 'a refused write changed nothing');
  life.security.setGrant('memory.write', true);

  life.security.setGrant('memory.read', false);
  assert.throws(() => life.memory.get(memory.id), (error) => error.code === 'PERMISSION_DENIED');
  life.security.setGrant('memory.read', true);

  life.security.setGrant('memory.delete', false);
  assert.throws(() => life.memory.remove(memory.id), (error) => error.code === 'PERMISSION_DENIED');
  life.security.setGrant('memory.delete', true);

  assert.equal(life.memory.remove(memory.id).deleted, true);
  assert.equal(life.memory.counts().total, 0);
  const audit = life.security.auditLog();
  assert.ok(audit.some((event) => event.kind === 'memory.deleted'));
  assert.ok(audit.some((event) => event.kind === 'permission.changed'));
  life.close();
});

test('the knowledge graph links entities and refuses nonsense', () => {
  const life = engine();
  const { memory } = life.memory.add({ title: 'Graph note', body: 'A memory that supports a task.' });
  const linked = life.graph.link({
    from: { type: 'memory', id: memory.id },
    relation: 'MEMORY_SUPPORTS_TASK',
    to: { type: 'task', id: 'task-1' },
  });
  assert.equal(linked.created, true);
  assert.equal(
    life.graph.link({ from: { type: 'memory', id: memory.id }, relation: 'MEMORY_SUPPORTS_TASK', to: { type: 'task', id: 'task-1' } }).created,
    false,
  );
  const neighbourhood = life.graph.neighbors('memory', memory.id);
  assert.equal(neighbourhood.nodes[0].type, 'task');
  assert.equal(neighbourhood.edges[0].relation, 'MEMORY_SUPPORTS_TASK');

  assert.throws(
    () => life.graph.link({ from: { type: 'memory', id: 'a' }, relation: 'MADE_UP', to: { type: 'task', id: 'b' } }),
    (error) => error.code === 'INVALID_RELATION',
  );
  assert.throws(
    () => life.graph.link({ from: { type: 'memory', id: 'a' }, relation: 'RELATED_TO', to: { type: 'memory', id: 'a' } }),
    (error) => error.code === 'SELF_LINK',
  );
  assert.throws(
    () => life.graph.link({ from: { type: 'planet', id: 'a' }, relation: 'RELATED_TO', to: { type: 'task', id: 'b' } }),
    (error) => error.code === 'INVALID_ENTITY_TYPE',
  );
  assert.equal(life.graph.stats().edges, 1);
  life.close();
});

test('export and delete are the data-rights pair', () => {
  const life = engine();
  life.memory.add({ title: 'Export me', body: 'This memory must appear in the export.' });
  const exported = life.store.exportAll('local');
  assert.equal(exported.data.memories.length, 1);
  assert.match(exported.data.memories[0].title, /Export me/);
  assert.equal(JSON.stringify(exported).includes('sk-'), false);

  life.store.deleteUser('local');
  assert.equal(life.memory.counts().total, 0);
  life.close();
});

test('benchmarks measure three languages and the memory suite for real', async () => {
  const life = engine();
  const run = await life.benchmarks.run();
  assert.equal(run.total, 7);
  assert.equal(run.passed, 7, JSON.stringify(run.results.filter((result) => !result.passed)));
  for (const language of ['en', 'si', 'ta']) {
    assert.ok(run.byLanguage[language], `${language} was measured`);
    assert.ok(run.byLanguage[language].latencyMs >= 0);
  }
  assert.deepEqual(run.suites.sort(), ['language', 'memory', 'security']);
  assert.equal(life.memory.counts().total, 0, 'benchmark memories are cleaned up');
  const history = life.benchmarks.history();
  assert.equal(history[0].total, 7);
  life.close();
});
