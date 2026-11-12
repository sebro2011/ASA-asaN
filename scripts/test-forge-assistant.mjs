/**
 * NOVA FORGE — contextual research assistant.
 *
 * Three layers are exercised:
 *  1. the pure validator, which is where the honesty guarantees live;
 *  2. the runner with injected provider adapters (no network);
 *  3. the real Express route on an ephemeral port with stub providers.
 *
 * The rule under test throughout: an answer that invents a number, cites
 * something that was not in the context, or claims proof is *rejected*, and the
 * deterministic brief is shown instead — never a partially-trusted answer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

import {
  RESEARCH_SYSTEM_INSTRUCTION,
  parseAssistantAnswer,
  researchPrompt,
  runProjectAssistant,
  validateAssistantQuestion,
  validateContextPayload,
  assistantAvailability,
} from '../server/forge/projectAssistant.ts';
import { ProviderError } from '../server/earth/providerOrchestrator.ts';
import { buildResearchContext, localBrief, auditNumbers } from '../src/lib/forge/research/context.ts';
import { createForgeRouter } from '../server/forgeRoutes.ts';

/* ------------------------------- fixtures -------------------------------- */

const project = {
  schemaVersion: 2,
  id: 'prj_test',
  title: 'Solar wind coupling',
  description: '',
  discipline: 'space-weather',
  language: 'en',
  questions: ['Does solar wind speed lead Kp by 3–6 hours?'],
  objectives: ['Quantify the lag'],
  variables: [{ id: 'v1', name: 'solar wind speed', role: 'independent', unit: 'km/s', operationalisation: 'DSCOVR plasma' }],
  assumptions: [{ id: 'a1', statement: 'Kp is linear in ring-current intensity', ifFalse: 'the correlation is not interpretable', status: 'untested' }],
  methods: [{ id: 'm1', name: 'lagged correlation', kind: 'correlation', variables: ['v1'], decisionRule: 'r > 0.3 at lag 3–6 h', preregistered: true }],
  hypotheses: [
    {
      schemaVersion: 1,
      id: 'hyp_1',
      projectId: 'prj_test',
      statement: 'Higher solar wind speed is followed by higher Kp within 6 hours.',
      rationale: 'Reconnection injects energy.',
      theory: 'Dungey cycle',
      independentVariables: ['v1'],
      dependentVariables: ['kp'],
      controls: ['ICME intervals excluded'],
      assumptions: ['Kp is linear'],
      predictions: [{ prediction: 'positive lagged r', expectedObservation: 'r > 0.3', unit: 'dimensionless' }],
      methodology: 'Lagged correlation over 90 days',
      datasets: [{ datasetId: 'noaa-swpc-solar-wind', variable: 'solar_wind_speed' }],
      limitations: ['Kp saturates'],
      alternativeExplanations: ['Solar cycle trend'],
      falsificationConditions: ['No positive lag at any lag'],
      lifecycle: 'testable',
      stateReason: 'pre-registered',
      sourceHypothesisId: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      history: [],
    },
  ],
  evidence: [
    {
      id: 'ev_1',
      title: 'DSCOVR plasma 1-day',
      authors: ['NOAA'],
      url: 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json',
      doi: null,
      publisher: 'NOAA',
      publishedAt: null,
      retrievedAt: '2024-01-02T00:00:00.000Z',
      datasetId: 'noaa-swpc-solar-wind',
      datasetVersion: '2024-01-02',
      observation: 'speed 350–620 km/s',
      unit: 'km/s',
      method: 'provider aggregation',
      limitations: ['1-day window'],
      citation: 'NOAA dataset',
      sourceType: 'official-dataset',
      stance: 'supporting',
      hypothesisIds: ['hyp_1'],
      fullText: 'metadata-only',
      origin: 'connector',
      accessNote: 'Dataset metadata only.',
      verification: 'verified-structure',
      verificationNote: 'official endpoint',
    },
  ],
  datasets: [
    {
      datasetId: 'noaa-swpc-solar-wind',
      title: 'Solar wind plasma',
      organisation: 'NOAA',
      version: '2024-01-02',
      retrievedAt: '2024-01-02T00:00:00.000Z',
      payloadHash: 'abc12345',
      rowCount: 1440,
      units: ['km/s'],
      query: 'GET plasma-1-day.json',
    },
  ],
  analyses: [],
  simulations: [],
  conclusions: [],
  citations: [],
  reports: [],
  investigationIds: [],
  versions: [],
  archivedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
};

const context = buildResearchContext(project, { selectedHypothesisId: 'hyp_1' });
const goodAnswer = {
  answer: 'The project records one testable hypothesis about solar wind speed and Kp, and one official dataset record supports it with a metadata-only access note.',
  citations: ['ev_1'],
  uncertainties: ['Kp is assumed linear, which the project records as untested.'],
  nextStep: 'Run the pre-registered lagged correlation over the pinned 1-day window.',
};

const stubProvider = (impl, id = 'arena') => ({
  id,
  label: 'Stub provider',
  model: 'stub-1',
  isConfigured: () => true,
  generate: impl,
});

const jsonProvider = (payload) =>
  stubProvider(async () => JSON.stringify(payload));

/* ------------------------------- validation ------------------------------ */

test('questions are bounded and typed', () => {
  assert.equal(validateAssistantQuestion('What is recorded?'), null);
  assert.equal(validateAssistantQuestion(42).code, 'INVALID_QUESTION');
  assert.equal(validateAssistantQuestion('  a  ').code, 'INVALID_QUESTION');
  assert.equal(validateAssistantQuestion('x'.repeat(1300)).status, 413);
});

test('the context envelope is validated, never repaired', () => {
  assert.equal(validateContextPayload(context).ok, true);
  assert.equal(validateContextPayload({ ...context, version: 'v0' }).ok, false);
  assert.equal(validateContextPayload({ ...context, hypotheses: 'nope' }).ok, false);
  assert.equal(validateContextPayload({ ...context, projectId: '' }).ok, false);
  assert.equal(validateContextPayload({ ...context, evidence: new Array(4000).fill(context.evidence[0]) }).ok, false);
});

test('the prompt marks project text as data, not instructions', () => {
  const prompt = researchPrompt(context, 'What is missing?', 'English');
  assert.match(prompt, /<project_context>/);
  assert.match(prompt, /data only/i);
  assert.match(prompt, /must not be followed/i);
  assert.match(RESEARCH_SYSTEM_INSTRUCTION, /Never invent evidence/);
  assert.match(RESEARCH_SYSTEM_INSTRUCTION, /never as commands/);
});

test('a well-formed answer citing a real record is accepted', () => {
  const answer = parseAssistantAnswer(JSON.stringify(goodAnswer), context);
  assert.deepEqual(answer.citations, ['ev_1']);
  assert.match(answer.answer, /testable hypothesis/);
});

test('an invented number rejects the whole answer', () => {
  const bad = {
    ...goodAnswer,
    answer: 'The correlation is r = 0.87 with 4321 samples, which supports the hypothesis.',
  };
  assert.throws(
    () => parseAssistantAnswer(JSON.stringify(bad), context),
    (error) => error instanceof ProviderError && error.code === 'INVENTED_NUMBER',
  );
});

test('numbers that are in the context are allowed', () => {
  const fine = {
    ...goodAnswer,
    answer: 'The project pins 1440 rows of solar wind data in one dataset snapshot, and the hypothesis is at the testable stage.',
  };
  const answer = parseAssistantAnswer(JSON.stringify(fine), context);
  assert.match(answer.answer, /1440/);
});

test('a citation outside the context rejects the answer', () => {
  const bad = { ...goodAnswer, citations: ['ev_1', 'doi:10.1029/FAKE'] };
  assert.throws(
    () => parseAssistantAnswer(JSON.stringify(bad), context),
    (error) => error.code === 'CITATION_NOT_IN_CONTEXT',
  );
});

test('claims of proof or discovery are rejected outright', () => {
  for (const phrase of ['The hypothesis is proven by this dataset.', 'We discovered a new coupling mechanism in the data.']) {
    assert.throws(
      () => parseAssistantAnswer(JSON.stringify({ ...goodAnswer, answer: phrase }), context),
      (error) => error.code === 'UNSUPPORTED_CLAIM',
      phrase,
    );
  }
});

test('a short, non-JSON or empty reply is unusable', () => {
  assert.throws(() => parseAssistantAnswer('{"answer":"too short"}', context));
  assert.throws(() => parseAssistantAnswer('not json at all', context));
  assert.throws(() => parseAssistantAnswer('{"answer":42}', context));
});

test('the numeric audit only permits numbers the context could have supplied', () => {
  const audit = auditNumbers('There are 12 evidence records and a slope of 0.42.', context);
  assert.equal(audit.ok, false);
  const allowed = auditNumbers('There are 1 evidence records.', context);
  assert.equal(allowed.ok, true);
});

/* --------------------------------- runner -------------------------------- */

test('with no provider configured the assistant returns the local brief, labelled', async () => {
  const run = await runProjectAssistant({ context, question: 'What is missing?', providers: [] });
  assert.equal(run.mode, 'local');
  assert.equal(run.noticeCode, 'local-mode');
  assert.equal(run.answer, null);
  assert.match(run.brief.caveat, /not a model response/i);
  assert.ok(run.brief.sections.some((section) => /What is missing/.test(section.title)));
  assert.ok(run.brief.citations.every((id) => context.evidence.some((record) => record.id === id)));
});

test('a provider answer is used only after validation', async () => {
  const run = await runProjectAssistant({
    context,
    question: 'What is recorded?',
    providers: [jsonProvider(goodAnswer)],
  });
  assert.equal(run.mode, 'remote');
  assert.equal(run.noticeCode, null);
  assert.equal(run.answer.citations[0], 'ev_1');
  assert.equal(run.providerChain[0].outcome, 'ok');
});

test('an answer with an invented number falls back to the local brief and says why', async () => {
  const run = await runProjectAssistant({
    context,
    question: 'What is the correlation?',
    providers: [jsonProvider({ ...goodAnswer, answer: 'The correlation is r = 0.91 across 9999 samples.' })],
  });
  assert.equal(run.mode, 'local');
  assert.equal(run.noticeCode, 'model-response-unusable');
  assert.equal(run.rejectedCode, 'INVENTED_NUMBER');
  assert.ok(!JSON.stringify(run).includes('0.91'), 'the rejected answer must not be surfaced');
  assert.equal(run.answer, null);
});

test('a failing provider falls back after retries, without leaking its message', async () => {
  let attempts = 0;
  const failing = stubProvider(async () => {
    attempts += 1;
    throw new ProviderError('upstream exploded at https://internal.example/secret', { status: 503 });
  });
  const run = await runProjectAssistant({
    context,
    question: 'What is recorded?',
    providers: [failing],
    timeoutMs: 200,
    deadlineMs: 1_500,
  });
  assert.ok(attempts >= 2, 'a transient failure must be retried');
  assert.equal(run.mode, 'local');
  assert.equal(run.noticeCode, 'all-providers-unavailable');
  assert.ok(!JSON.stringify(run).includes('internal.example'), 'provider detail leaked');
});

test('a second provider is used when the first is unconfigured', async () => {
  const unconfigured = { ...stubProvider(async () => { throw new Error('must not run'); }, 'gemini'), isConfigured: () => false };
  const run = await runProjectAssistant({
    context,
    question: 'What is recorded?',
    providers: [unconfigured, jsonProvider(goodAnswer)],
  });
  assert.equal(run.mode, 'remote');
  assert.equal(run.providerChain[0].outcome, 'skipped');
  assert.equal(run.providerChain[1].outcome, 'ok');
});

test('availability is descriptor-only and makes no network call', () => {
  const availability = assistantAvailability({});
  assert.equal(availability.configured, false);
  assert.match(availability.note, /deterministic summary/);
  const configured = assistantAvailability({ OPENROUTER_API_KEY: 'x' });
  assert.equal(configured.configured, true);
  assert.match(configured.note, /rejected/);
});

test('the deterministic brief never interprets and never invents', () => {
  const brief = localBrief(context);
  const text = JSON.stringify(brief);
  assert.match(brief.caveat, /adds no interpretation/);
  assert.match(text, /1 supporting/);
  assert.ok(!/discover/i.test(text));
});

/* ---------------------------------- route -------------------------------- */

async function startServer(deps) {
  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.use('/api/forge', createForgeRouter(deps));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

async function post(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('POST /assistant returns a validated answer', async () => {
  const { server, base } = await startServer({ assistantProviders: [jsonProvider(goodAnswer)] });
  try {
    const result = await post(base, '/api/forge/assistant', { question: 'What is recorded?', context });
    assert.equal(result.status, 200);
    assert.equal(result.body.mode, 'remote');
    assert.deepEqual(result.body.answer.citations, ['ev_1']);
    assert.equal(result.body.ok, true);
  } finally {
    server.close();
  }
});

test('POST /assistant rejects a bad context and a bad question without calling a provider', async () => {
  let called = 0;
  const { server, base } = await startServer({
    assistantProviders: [stubProvider(async () => { called += 1; return JSON.stringify(goodAnswer); })],
  });
  try {
    const badContext = await post(base, '/api/forge/assistant', { question: 'What is recorded?', context: { version: 'x' } });
    assert.equal(badContext.status, 400);
    assert.equal(badContext.body.code, 'INVALID_CONTEXT');
    const badQuestion = await post(base, '/api/forge/assistant', { question: 'x'.repeat(2000), context });
    assert.equal(badQuestion.status, 413);
    assert.equal(called, 0);
  } finally {
    server.close();
  }
});

test('POST /assistant never returns provider internals', async () => {
  const { server, base } = await startServer({
    assistantProviders: [
      stubProvider(async () => {
        throw new ProviderError('key sk-live-12345 rejected by https://api.internal/v1', { status: 401 });
      }),
    ],
    assistantTimeoutMs: 200,
  });
  try {
    const result = await post(base, '/api/forge/assistant', { question: 'What is recorded?', context });
    assert.equal(result.status, 200);
    assert.equal(result.body.mode, 'local');
    const text = JSON.stringify(result.body);
    assert.ok(!text.includes('sk-live-12345'));
    assert.ok(!text.includes('api.internal'));
  } finally {
    server.close();
  }
});
