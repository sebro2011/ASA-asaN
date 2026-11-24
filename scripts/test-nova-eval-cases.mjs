import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const dataset = JSON.parse(readFileSync(new URL('./fixtures/nova-eval-cases.v1.json', import.meta.url), 'utf8'));
const LANGUAGES = ['en', 'si', 'ta'];
const SOURCE_IDS = new Set(dataset.sources.map((source) => source.id));

test('draft evaluation set has ten shared cases and thirty localized prompts', () => {
  assert.equal(dataset.schemaVersion, 1);
  assert.equal(dataset.status, 'DRAFT_SOURCE_REVIEW_REQUIRED');
  assert.equal(dataset.caseCount, 10);
  assert.equal(dataset.cases.length, dataset.caseCount);
  assert.equal(dataset.localizedPromptCount, 30);

  for (const language of LANGUAGES) {
    for (const evaluationCase of dataset.cases) {
      const turns = evaluationCase.turns[language];
      assert.ok(Array.isArray(turns) && turns.length > 0, `${evaluationCase.id}/${language} has turns`);
      assert.equal(turns.at(-1).role, 'user', `${evaluationCase.id}/${language} ends with a user turn`);
      assert.ok(turns.every((turn) => ['user', 'assistant'].includes(turn.role) && turn.content.trim()));
      if (language === 'si') assert.match(turns.at(-1).content, /[\u0D80-\u0DFF]/u, `${evaluationCase.id} has Sinhala script`);
      if (language === 'ta') assert.match(turns.at(-1).content, /[\u0B80-\u0BFF]/u, `${evaluationCase.id} has Tamil script`);
    }
  }
});

test('cases cover NASA astronomy, astrophysics, general science, context, and integrity', () => {
  const domains = new Set(dataset.cases.map((evaluationCase) => evaluationCase.domain));
  for (const domain of [
    'astronomy',
    'astrophysics',
    'nasa-mission-science',
    'nasa-planetary-science',
    'general-science',
    'multilingual-context',
    'science-integrity',
  ]) assert.ok(domains.has(domain), `missing domain ${domain}`);

  for (const evaluationCase of dataset.cases) {
    assert.ok(evaluationCase.mustCover.length > 0, `${evaluationCase.id} has positive scoring criteria`);
    assert.ok(evaluationCase.mustAvoid.length > 0, `${evaluationCase.id} has hallucination checks`);
    assert.ok(evaluationCase.sourceIds.length > 0, `${evaluationCase.id} has provenance references`);
    for (const sourceId of evaluationCase.sourceIds) assert.ok(SOURCE_IDS.has(sourceId), `${evaluationCase.id} source ${sourceId} exists`);
  }
});

test('licensing and source provenance are explicit and do not grant training or redistribution rights', () => {
  assert.equal(dataset.provenance.rootRepositoryLicense, 'UNLICENSED');
  assert.equal(dataset.provenance.datasetLicense, 'No separate license is granted by this draft.');
  assert.equal(dataset.provenance.externalSourceContentIncluded, false);
  assert.equal(dataset.provenance.externalImagesOrAudioIncluded, false);
  assert.match(dataset.provenance.repositorySourceRevision, /^[a-f0-9]{40}$/u);
  assert.equal(dataset.provenance.multilingualSemanticReview, 'PENDING_FLUENT_REVIEW');
  assert.ok(dataset.provenance.notPermittedByThisDraft.some((item) => /pretraining|fine-tuning/i.test(item)));
  assert.ok(dataset.provenance.rightsReview.includes('Pending'));

  assert.equal(SOURCE_IDS.size, dataset.sources.length, 'source identifiers are unique');
  for (const source of dataset.sources) {
    assert.ok(source.reference || source.url, `${source.id} has a locator`);
    assert.ok(source.usage, `${source.id} has a usage note`);
    for (const locator of [source.reference, source.listedInRepositoryAt].filter(Boolean)) {
      for (const repositoryPath of locator.split(';')) {
        const file = repositoryPath.trim().split('#')[0];
        assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${source.id} repository locator ${file} exists`);
      }
    }
    if (source.url) {
      assert.match(source.referenceStatus || '', /not fetched|not requested|no request made|not reviewed/i,
        `${source.id} must not be represented as externally verified`);
      assert.match(source.rightsStatus || '', /not reviewed/i, `${source.id} rights status remains visible`);
      assert.equal(source.contentIncluded, undefined, 'source content is not embedded in the case file');
    }
  }
});

test('metrics are measurable and factual scoring waits for source review', () => {
  const metrics = dataset.metricDefinitions;
  for (const name of ['factualAccuracy', 'requiredFactCoverage', 'hallucinationRate', 'multilingual', 'responseConsistency']) {
    assert.equal(typeof metrics[name], 'string', `metric ${name} is defined`);
  }
  for (const name of ['factualAccuracy', 'requiredFactCoverage', 'hallucinationRate']) {
    assert.match(metrics[name], /\//u, `metric ${name} has a measurable ratio`);
  }
  assert.match(metrics.multilingual, /pass rate|1-5/i);
  assert.match(metrics.responseConsistency, /Jaccard/i);
  assert.match(metrics.responseConsistency, /10 run pairs/i);
  assert.match(metrics.responseConsistency, /Both empty sets score 1/i);
  assert.match(metrics.hallucinationRate, /fraction of cases/i);
  assert.match(metrics.zeroDenominatorHandling, /NA/i);
  assert.match(metrics.reviewRule, /reference and usage review are complete/i);
  assert.ok(metrics.claimLabels.includes('unsupported'));
  assert.ok(metrics.claimLabels.includes('contradicted'));
});

test('case design is model-independent and every external factual reference is visibly draft', () => {
  assert.equal(dataset.status, 'DRAFT_SOURCE_REVIEW_REQUIRED');
  assert.equal(dataset.provenance.sourceLocatorsAreNotSourceSnapshots, true);
  for (const evaluationCase of dataset.cases) {
    assert.match(evaluationCase.referenceReview, /pending|not-requested|reviewed/i, evaluationCase.id);
    assert.equal(Object.hasOwn(evaluationCase, 'model'), false);
    assert.equal(Object.hasOwn(evaluationCase, 'modelSize'), false);
  }
});
