/**
 * NOVA FORGE — research project, hypothesis lifecycle and evidence intelligence.
 *
 * These tests are about *epistemic* behaviour as much as structure: that a
 * hypothesis cannot be promoted without its falsification conditions, that a
 * stored run is reopened rather than recomputed, that dataset drift is reported,
 * and that the Forge never composes a citation it was not given.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// A minimal Storage implementation; the project layer only uses these five calls.
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  key(index) {
    return [...this.map.keys()][index] ?? projectStoreHelper();
  }
  get length() {
    return this.map.size;
  }
}
function projectStoreHelper() {
  return null;
}

const storage = new MemoryStorage();
globalThis.window = { localStorage: storage };
globalThis.localStorage = storage;

const {
  emptyProject,
  validateProject,
  migrateProject,
  commitVersion,
  restoreVersion,
  checkReproducibility,
  projectHash,
  saveProject,
  readProjects,
  deleteProject,
  saveDraft,
  readDraft,
  clearDraft,
  summariseProject,
  canonicalJson,
  PROJECT_SCHEMA_VERSION,
  PROJECT_STORE_KEY,
  MAX_VERSIONS_PER_PROJECT,
} = await import('../src/lib/forge/research/project.ts');

const {
  createHypothesis,
  canTransition,
  transition,
  editFields,
  missingFields,
  compareHypotheses,
  lifecycleDisclosure,
  fromGenerated,
  FIELD_ORDER,
  hypothesisHash,
} = await import('../src/lib/forge/research/hypothesis.ts');

const {
  validateEvidenceRecord,
  isAllowedHost,
  isValidDoi,
  rankEvidence,
  evidenceBalance,
  fromEngineEvidence,
  formatCitation,
  stanceCounts,
  SOURCE_CAVEAT,
} = await import('../src/lib/forge/research/evidenceIntel.ts');

/* ------------------------------- projects --------------------------------- */

test('a new project is valid, empty and explicitly incomplete', () => {
  const project = emptyProject({ title: 'Solar wind coupling' });
  assert.equal(validateProject(project).ok, true);
  assert.equal(project.schemaVersion, PROJECT_SCHEMA_VERSION);
  const summary = summariseProject(project);
  assert.ok(summary.gaps.length >= 5);
  assert.ok(summary.gaps.some((gap) => /No hypothesis/.test(gap)));
  assert.ok(summary.gaps.some((gap) => /No dataset snapshot/.test(gap)));
});

test('a project without an id or title is refused, not defaulted', () => {
  assert.equal(validateProject({ title: 'x' }).ok, false);
  assert.equal(validateProject({ id: 'a', title: '' }).ok, false);
  assert.equal(migrateProject({ title: 'x' }), null);
});

test('a partial legacy payload is migrated with its arrays restored', () => {
  const migrated = migrateProject({
    id: 'prj_legacy',
    title: 'Old project',
    questions: ['Does X follow Y?'],
    // no variables / evidence / versions at all
  });
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.deepEqual(migrated.questions, ['Does X follow Y?']);
  assert.deepEqual(migrated.evidence, []);
  assert.deepEqual(migrated.versions, []);
  assert.equal(migrated.discipline, 'interdisciplinary');
});

test('canonical JSON is key-order independent so hashes are stable', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  const first = emptyProject({ title: 'Same' });
  const second = { ...first };
  assert.equal(projectHash(first), projectHash(second));
  assert.notEqual(projectHash(first), projectHash({ ...first, title: 'Different' }));
});

test('autosave round-trips a draft and rejects a corrupted one', () => {
  clearDraft();
  const project = emptyProject({ title: 'Draft project' });
  assert.equal(saveDraft(project).ok, true);
  const recovered = readDraft();
  assert.equal(recovered.project.title, 'Draft project');
  assert.equal(recovered.contentHash, projectHash(project));

  const raw = JSON.parse(storage.getItem('nova_forge_project_draft_v1'));
  raw.project.title = 'Tampered after save';
  storage.setItem('nova_forge_project_draft_v1', JSON.stringify(raw));
  assert.equal(readDraft(), null, 'a draft whose content no longer matches its hash must not be returned');
});

test('a stored project round-trips through the versioned store', () => {
  storage.clear();
  const project = emptyProject({ title: 'Stored project' });
  const saved = saveProject(project);
  assert.equal(saved.ok, true);
  const read = readProjects();
  assert.equal(read.projects.length, 1);
  assert.equal(read.projects[0].title, 'Stored project');
  assert.equal(read.version, PROJECT_SCHEMA_VERSION);
  const removed = deleteProject(project.id);
  assert.equal(removed.projects.length, 0);
});

test('a corrupt store is treated as empty rather than crashing', () => {
  storage.clear();
  storage.setItem(PROJECT_STORE_KEY, '{ this is not json');
  assert.deepEqual(readProjects().projects, []);
  storage.setItem(PROJECT_STORE_KEY, JSON.stringify({ projects: [{ nonsense: true }, emptyProject({ title: 'Good' })] }));
  const read = readProjects();
  assert.equal(read.projects.length, 1);
  assert.equal(read.projects[0].title, 'Good');
});

test('committing a version records what changed and keeps a snapshot', () => {
  let project = emptyProject({ title: 'Versioned' });
  project = commitVersion(project, 'Initial');
  project = { ...project, title: 'Versioned v2', questions: ['Q1'] };
  project = commitVersion(project, 'Added question');
  assert.equal(project.versions.length, 2);
  const latest = project.versions[1];
  assert.ok(latest.changed.includes('title'));
  assert.ok(latest.changed.includes('questions'));
  assert.equal(latest.label, 'Added question');
});

test('history is capped so storage cannot grow without bound', () => {
  let project = emptyProject({ title: 'Many versions' });
  for (let index = 0; index < MAX_VERSIONS_PER_PROJECT + 5; index += 1) {
    project = commitVersion(project, `v${index}`);
  }
  assert.equal(project.versions.length, MAX_VERSIONS_PER_PROJECT);
});

test('restoring a version returns the values recorded then, and says so', () => {
  let project = emptyProject({ title: 'Original title' });
  project = { ...project, datasets: [{ datasetId: 'd1', title: 'T', organisation: 'NASA', version: 'v1', retrievedAt: '2024-01-01', payloadHash: 'abc', rowCount: 10, units: ['K'], query: 'q' }] };
  project = commitVersion(project, 'Snapshot with data');
  const versionId = project.versions[0].id;
  // Later edits (as if the source changed and the user re-ran)
  project = { ...project, title: 'Later title', datasets: [] };
  const restored = restoreVersion(project, versionId);
  assert.ok(restored.project);
  assert.equal(restored.project.title, 'Original title');
  assert.equal(restored.project.datasets.length, 1);
  assert.match(restored.reason, /nothing was recalculated/);
  // History is preserved across a restore.
  assert.equal(restored.project.versions.length, project.versions.length);
});

test('restoring an unknown version fails with a reason instead of guessing', () => {
  const project = emptyProject({ title: 'x' });
  const result = restoreVersion(project, 'ver_missing');
  assert.equal(result.project, null);
  assert.match(result.reason, /Unknown version id/);
});

test('dataset drift is reported, not absorbed into the stored run', () => {
  let project = emptyProject({ title: 'Drift' });
  project = {
    ...project,
    datasets: [
      { datasetId: 'nasa-power', title: 'POWER', organisation: 'NASA', version: '2024-01', retrievedAt: '2024-01-01', payloadHash: 'aaaa', rowCount: 30, units: ['K'], query: 'q1' },
      { datasetId: 'noaa-kp', title: 'Kp', organisation: 'NOAA', version: '2024-01', retrievedAt: '2024-01-01', payloadHash: 'bbbb', rowCount: 30, units: ['Kp'], query: 'q2' },
    ],
  };
  const unchanged = checkReproducibility(project, [
    { datasetId: 'nasa-power', payloadHash: 'aaaa' },
    { datasetId: 'noaa-kp', payloadHash: 'bbbb' },
  ]);
  assert.equal(unchanged.ok, true);
  const drifted = checkReproducibility(project, [
    { datasetId: 'nasa-power', payloadHash: 'cccc' },
    { datasetId: 'noaa-kp', payloadHash: null },
  ]);
  assert.equal(drifted.ok, false);
  assert.equal(drifted.drift.length, 2);
  assert.match(drifted.message, /1 dataset\(s\) have changed/);
  assert.match(drifted.message, /1 could not be re-checked/);
  assert.match(drifted.message, /new version/);
});

/* ------------------------------- hypotheses ------------------------------- */

const completeFields = {
  statement: 'Increasing solar wind speed leads to a higher Kp index within 6 hours.',
  rationale: 'Enhanced reconnection during high-speed streams injects energy into the ring current.',
  theory: 'Dungey cycle / solar wind–magnetosphere coupling.',
  independentVariables: ['solar_wind_speed'],
  dependentVariables: ['kp_index'],
  controls: ['Season matched', 'No ICME intervals'],
  assumptions: ['Kp is a linear proxy for ring-current intensity over 3-hour windows.'],
  predictions: [
    { prediction: 'Positive lagged correlation at 3–6 h', expectedObservation: 'r > 0.3', unit: 'dimensionless' },
  ],
  methodology: 'Lagged cross-correlation over a fixed 90-day window with a pre-registered decision rule.',
  datasets: [{ datasetId: 'noaa-swpc-solar-wind', variable: 'solar_wind_speed' }],
  limitations: ['Kp saturates during severe storms.'],
  alternativeExplanations: ['Both variables follow the solar cycle.'],
  falsificationConditions: ['No positive lagged correlation at any lag in the window, or a negative correlation at 6 h.'],
};

test('a new hypothesis starts as a draft and carries all thirteen fields', () => {
  const hypothesis = createHypothesis({ projectId: 'prj_1' });
  assert.equal(hypothesis.lifecycle, 'draft');
  assert.equal(FIELD_ORDER.length, 13);
  assert.equal(missingFields(hypothesis).length, 13);
  assert.match(lifecycleDisclosure(hypothesis), /Draft/);
});

test('a hypothesis cannot jump from draft to supported', () => {
  const hypothesis = createHypothesis({ projectId: 'prj_1', fields: completeFields });
  const check = canTransition(hypothesis, 'supported');
  assert.equal(check.allowed, false);
  assert.match(check.reason, /not part of the lifecycle/);
});

test('testable requires a method, predictions and falsification conditions', () => {
  const empty = createHypothesis({ projectId: 'p', fields: { statement: 'X causes Y' } });
  const blocked = canTransition(empty, 'testable');
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.blockers.sort(), ['falsificationConditions', 'methodology', 'predictions'].sort());

  const complete = createHypothesis({ projectId: 'p', fields: completeFields });
  const allowed = canTransition(complete, 'testable');
  assert.equal(allowed.allowed, true);
});

test('the full lifecycle runs draft → testable → under-evaluation → supported', () => {
  let hypothesis = createHypothesis({ projectId: 'p', fields: completeFields });
  hypothesis = transition(hypothesis, 'testable', 'Method pre-registered').hypothesis;
  hypothesis = transition(hypothesis, 'under-evaluation', 'Run 1 started').hypothesis;
  hypothesis = transition(hypothesis, 'supported', 'Lagged r=0.41 at 4 h').hypothesis;
  assert.equal(hypothesis.lifecycle, 'supported');
  assert.equal(hypothesis.history.length, 3);
  assert.match(lifecycleDisclosure(hypothesis), /not proof, and not a discovery/);
});

test('a refused transition leaves the hypothesis untouched', () => {
  const hypothesis = createHypothesis({ projectId: 'p', fields: { statement: 'X' } });
  const { hypothesis: after, check } = transition(hypothesis, 'supported', 'wishful');
  assert.equal(check.allowed, false);
  assert.equal(after, hypothesis);
  assert.equal(after.lifecycle, 'draft');
});

test('support requires alternatives, limitations and assumptions to be stated', () => {
  const minimal = createHypothesis({
    projectId: 'p',
    lifecycle: 'under-evaluation',
    fields: { ...completeFields, alternativeExplanations: [], limitations: [], assumptions: [] },
  });
  const check = canTransition(minimal, 'supported');
  assert.equal(check.allowed, false);
  assert.deepEqual(check.blockers.sort(), ['alternativeExplanations', 'assumptions', 'limitations'].sort());
});

test('edits are recorded with the hash of the pre-edit state', () => {
  const hypothesis = createHypothesis({ projectId: 'p', fields: completeFields });
  const before = hypothesisHash(hypothesis);
  const edited = editFields(hypothesis, { statement: 'A narrower statement.' }, 'Narrowed after reading the paper');
  assert.equal(edited.history.at(-1).contentHash, before);
  assert.match(edited.history.at(-1).note, /Narrowed/);
  assert.notEqual(hypothesisHash(edited), before);
});

test('comparison highlights the fields that actually differ', () => {
  const first = createHypothesis({ projectId: 'p', fields: completeFields });
  const second = createHypothesis({
    projectId: 'p',
    fields: { ...completeFields, statement: 'Kp drives solar wind speed.', methodology: 'Reverse the lag scan.' },
  });
  const rows = compareHypotheses([first, second]);
  const statementRow = rows.find((row) => row.field === 'statement');
  const assumptionsRow = rows.find((row) => row.field === 'assumptions');
  assert.equal(statementRow.same, false);
  assert.equal(assumptionsRow.same, true);
  assert.equal(rows.length, 13);
});

test('an engine hypothesis is imported without inventing missing fields', () => {
  const imported = fromGenerated({
    projectId: 'p',
    generated: {
      id: 'hyp-1',
      statement: 'Higher solar wind speed is associated with higher Kp.',
      explanation: 'Coupling mechanism.',
      independentVariables: ['solar_wind_speed'],
      dependentVariables: ['kp_index'],
      alternativeExplanations: ['Solar cycle'],
      falsificationCriteria: ['No association'],
      limitations: ['Kp saturates'],
      expectedRelationship: { type: 'positive', effectThreshold: 0.3 },
    },
  });
  assert.equal(imported.sourceHypothesisId, 'hyp-1');
  assert.equal(imported.lifecycle, 'needs-evidence');
  assert.equal(imported.theory, '', 'theory must be left empty rather than invented');
  assert.equal(imported.methodology, '');
  assert.equal(imported.controls.length, 0);
  assert.equal(imported.assumptions.length, 0);
  assert.equal(missingFields(imported).includes('statement'), false);
});

test('no hypothesis disclosure ever uses the words proven or discovery as a claim', () => {
  const states = ['draft', 'needs-evidence', 'testable', 'under-evaluation', 'supported', 'not-supported', 'inconclusive', 'archived'];
  for (const state of states) {
    const disclosure = lifecycleDisclosure({ lifecycle: state });
    assert.ok(!/\bis proven\b|\bproves\b/i.test(disclosure), `${state} claims proof`);
    if (/discovery/i.test(disclosure)) {
      assert.match(disclosure, /not a discovery/i, `${state} uses "discovery" without negating it`);
    }
  }
});

/* -------------------------------- evidence -------------------------------- */

test('DOIs are accepted only when they are structurally valid', () => {
  assert.equal(isValidDoi('10.1029/2023JA031234'), true);
  assert.equal(isValidDoi('10.1000/xyz123'), true);
  assert.equal(isValidDoi('doi:10.1029/2023JA031234'), false);
  assert.equal(isValidDoi('10.1029'), false);
  assert.equal(isValidDoi('not a doi'), false);
});

test('evidence hosts are allowlisted to recognised scientific sources', () => {
  assert.equal(isAllowedHost('https://agupubs.onlinelibrary.wiley.com/doi/10.1029/x').allowed, true);
  assert.equal(isAllowedHost('https://www.nasa.gov/report').allowed, true);
  assert.equal(isAllowedHost('https://arxiv.org/abs/2401.00001').allowed, true);
  assert.equal(isAllowedHost('https://randomblog.example/post').allowed, false);
  assert.equal(isAllowedHost('http://arxiv.org/abs/1').allowed, false);
  assert.equal(isAllowedHost('javascript:alert(1)').allowed, false);
});

test('a record with a malformed DOI is rejected, not repaired', () => {
  const result = validateEvidenceRecord({
    origin: 'user',
    doi: '10.9999',
    url: null,
    title: 'Some paper',
    sourceType: 'peer-reviewed',
  });
  assert.equal(result.verification, 'rejected');
  assert.match(result.note, /not a syntactically valid DOI/);
});

test('an off-allowlist URL is kept but marked unverified', () => {
  const result = validateEvidenceRecord({
    origin: 'user',
    url: 'https://randomblog.example/post',
    title: 'Blog post',
    sourceType: 'secondary',
  });
  assert.equal(result.verification, 'unverified');
  assert.match(result.note, /not a recognised scientific source/);
});

test('model-generated text can never be verified evidence', () => {
  const result = validateEvidenceRecord({
    origin: 'user',
    url: 'https://www.nasa.gov/x',
    title: 'Made up by a model',
    sourceType: 'ai-generated',
  });
  assert.equal(result.verification, 'unverified');
  assert.match(result.note, /not a citable source/);
  assert.match(SOURCE_CAVEAT['ai-generated'], /not evidence/);
});

test('an identifier-less user claim stays visible as unverified', () => {
  const result = validateEvidenceRecord({ origin: 'user', title: 'A claim from memory', sourceType: 'secondary' });
  assert.equal(result.verification, 'unverified');
  assert.match(result.note, /kept as an unverified claim/);
});

test('engine evidence becomes a metadata-only, official-dataset record', () => {
  const engineItem = {
    id: 'ev-1',
    datasetId: 'nasa-power',
    datasetTitle: 'POWER daily',
    organisation: 'NASA',
    sourceUrl: 'https://power.larc.nasa.gov/data-access-viewer/',
    documentationUrl: 'https://power.larc.nasa.gov/docs/',
    retrievedAt: '2024-02-01T00:00:00.000Z',
    observationStart: '2024-01-01',
    observationEnd: '2024-01-31',
    measurements: 'T2M daily mean',
    units: 'K',
    processing: 'daily aggregation by the provider',
    quality: 'provider QC',
    limitations: ['reanalysis, not a station measurement'],
    hypothesisIds: ['hyp-1'],
    classification: 'supporting',
    strength: 'moderate',
    rule: 'rule',
    analysisId: null,
    values: {},
  };
  const record = fromEngineEvidence(engineItem, { datasetVersion: '2024-01-31' });
  assert.equal(record.sourceType, 'official-dataset');
  assert.equal(record.stance, 'supporting');
  assert.equal(record.fullText, 'metadata-only');
  assert.match(record.accessNote, /did not read a paper/);
  assert.equal(record.doi, null, 'a DOI must never be invented for a dataset');
  assert.ok(record.citation.includes('https://power.larc.nasa.gov'));
});

test('evidence is ranked by source type, then stance, never by a truth score', () => {
  const base = {
    authors: [],
    publisher: 'x',
    publishedAt: '2024-01-01',
    retrievedAt: '2024-01-02',
    datasetId: null,
    datasetVersion: null,
    observation: 'o',
    unit: 'K',
    method: 'm',
    limitations: [],
    citation: 'c',
    origin: 'user',
    fullText: 'abstract',
    verification: 'verified-structure',
    verificationNote: '',
    hypothesisIds: ['h'],
  };
  const ranked = rankEvidence([
    { ...base, id: 'b', title: 'B', url: null, doi: null, sourceType: 'secondary', stance: 'supporting' },
    { ...base, id: 'a', title: 'A', url: null, doi: null, sourceType: 'peer-reviewed', stance: 'neutral' },
    { ...base, id: 'c', title: 'C', url: null, doi: null, sourceType: 'ai-generated', stance: 'supporting' },
  ]);
  assert.deepEqual(ranked.map((record) => record.id), ['a', 'b', 'c']);
});

test('the evidence balance is counts and a sentence, never a percentage', () => {
  const record = (id, stance) => ({
    id,
    stance,
    hypothesisIds: ['h1'],
    sourceType: 'peer-reviewed',
  });
  const records = [record('1', 'supporting'), record('2', 'contradicting'), record('3', 'unverified')];
  const balance = evidenceBalance(records, 'h1');
  assert.equal(balance.supporting, 1);
  assert.equal(balance.contradicting, 1);
  assert.equal(balance.unverified, 1);
  assert.equal(balance.indeterminate, true);
  assert.match(balance.statement, /1 supporting, 1 contradicting/);
  assert.match(balance.statement, /not on how many papers/);
  assert.ok(!balance.statement.includes('%'));
  assert.deepEqual(stanceCounts(records, 'h1'), {
    supporting: 1,
    contradicting: 1,
    neutral: 0,
    insufficient: 0,
    unverified: 1,
  });
});

test('citation formatting never invents authors or a year', () => {
  const formatted = formatCitation({
    id: 'c1',
    title: 'A real title',
    authors: [],
    year: null,
    publisher: 'NASA',
    url: 'https://www.nasa.gov/x',
    doi: null,
    retrievedAt: '2024-01-01',
    origin: 'connector',
    fullText: 'metadata-only',
  });
  assert.match(formatted, /Authors not recorded/);
  assert.match(formatted, /year not recorded/);
  assert.ok(!formatted.includes('doi:'), 'no DOI was supplied, so none may appear');
});
