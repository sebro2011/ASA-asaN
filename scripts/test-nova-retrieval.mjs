import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cloudChunksToEvidence,
  mergeEvidence,
  retrieveDeviceLibrary,
} from '../src/workspace/chat/retrieval.ts';
import { knowledgeRepo } from '../src/data/repositories.ts';
import { historyWindow, sendChat } from '../src/workspace/chat/chatClient.ts';
import { citedSources, withCitationReferences } from '../src/workspace/chat/citations.ts';

const record = (id, name, text) => ({
  id,
  module: 'library',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  data: { name, text },
});

function fakeKnowledgeClient() {
  const calls = { uploads: [], inserts: [], rpcs: [], removals: [] };
  return {
    calls,
    storage: {
      from(bucket) {
        return {
          async upload(path, bytes, options) {
            calls.uploads.push({ bucket, path, bytes, options });
            return { error: null };
          },
          async remove(paths) {
            calls.removals.push({ bucket, paths });
            return { error: null };
          },
        };
      },
    },
    from(table) {
      return {
        insert(row) {
          calls.inserts.push({ table, row });
          return {
            select() {
              return {
                single: async () => ({ data: { id: 'file-1', ...row }, error: null }),
              };
            },
          };
        },
      };
    },
    async rpc(name, args) {
      calls.rpcs.push({ name, args });
      return { data: [{ knowledge_file_id: 'file-1', content: 'Moon orbit excerpt.' }], error: null };
    },
  };
}

test('knowledge uploads index supported text while preserving non-indexable file metadata', async () => {
  const client = fakeKnowledgeClient();
  const repo = knowledgeRepo(client);
  const bytes = new Blob(['  Moon\u0000 orbit cafe\u0301  '], { type: 'text/plain' });
  const indexed = await repo.upload('owner-1', {
    name: 'moon notes.md',
    mime: 'text/plain; charset=utf-8',
    bytes,
  });

  assert.equal(indexed.index_status, 'ready');
  assert.equal(client.calls.inserts[0].row.name, 'moon_notes.md');
  assert.equal(client.calls.inserts[0].row.extracted_text, 'Moon orbit café');
  assert.equal(client.calls.inserts[0].row.index_status, 'ready');
  assert.equal(client.calls.uploads[0].bucket, 'knowledge');
  assert.ok(client.calls.uploads[0].path.startsWith('owner-1/'));

  await repo.upload('owner-1', {
    name: 'field guide.pdf',
    mime: 'application/pdf',
    bytes: new Blob(['not extracted']),
  });
  assert.equal(client.calls.inserts[1].row.extracted_text, null);
  assert.equal(client.calls.inserts[1].row.index_status, 'metadata_only');
});

test('private retrieval calls the owner-scoped RPC with bounded arguments', async () => {
  const client = fakeKnowledgeClient();
  const repo = knowledgeRepo(client);
  const short = await repo.retrieve('x');
  assert.deepEqual(short, []);
  assert.equal(client.calls.rpcs.length, 0);

  const hits = await repo.retrieve('  moon orbit  ', 100);
  assert.equal(hits[0].knowledge_file_id, 'file-1');
  assert.deepEqual(client.calls.rpcs, [{
    name: 'nova_retrieve_knowledge',
    args: { query: 'moon orbit', match_limit: 8 },
  }]);
});

test('device retrieval returns one bounded, relevant passage per saved source', () => {
  const sources = [
    record('mars', 'Mars notes', 'Mars has a thin atmosphere and polar ice. The Curiosity rover studies Gale crater.'),
    record('moon', 'Moon notes', 'The Moon has no substantial atmosphere and shows phases from Earth.'),
  ];

  const hits = retrieveDeviceLibrary('Tell me about Mars ice', sources, 3);

  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'mars');
  assert.equal(hits[0].source, 'device-library');
  assert.match(hits[0].content, /polar ice/);
  assert.ok(hits[0].content.length <= 1_200);
});

test('device retrieval applies the cap after filtering for Star Library records', () => {
  const nonLibrary = Array.from({ length: 200 }, (_, index) => ({
    ...record(`journal-${index}`, 'Unrelated journal', 'No Moon information here.'),
    module: 'journal',
  }));
  const library = record('late-moon-note', 'Moon orbit note', 'The Moon follows an orbit around Earth.');

  const hits = retrieveDeviceLibrary('Moon orbit', [...nonLibrary, library]);

  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'late-moon-note');
});

test('concept bridges support Sinhala and Tamil queries against English notes', () => {
  const sources = [record('lunar', 'Lunar guide', 'Moon phases change through the month. The Moon orbits Earth.')];

  assert.equal(retrieveDeviceLibrary('සඳ ගැන කියන්න', sources)[0]?.id, 'lunar');
  assert.equal(retrieveDeviceLibrary('நிலா பற்றி சொல்லுங்கள்', sources)[0]?.id, 'lunar');
});

test('cloud results map to safe citation evidence and merge caps and deduplicates', () => {
  const cloud = cloudChunksToEvidence([
    {
      knowledge_file_id: 'file-1', chunk_id: 'chunk-1', title: 'Fallback title',
      content: 'Owner-scoped excerpt.', rank: 0.8, chunk_index: 0, created_at: '2026-01-01T00:00:00.000Z',
    },
  ], [{ id: 'file-1', name: 'Private field guide' }]);
  assert.equal(cloud[0].title, 'Private field guide');
  assert.equal(cloud[0].source, 'private-library');

  const merged = mergeEvidence(
    cloud,
    [
      cloud[0],
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `device-${index}`,
        source: 'device-library',
        title: `Source ${index}`,
        content: 'x'.repeat(1_200),
      })),
    ],
  );
  assert.equal(merged.length, 5);
  assert.equal(merged.filter((item) => item.id === 'file-1').length, 1);
  assert.ok(merged.reduce((sum, item) => sum + item.title.length + item.content.length, 0) <= 5_500);
});

test('multilingual evidence respects the server UTF-8 byte budget', () => {
  const evidence = mergeEvidence([
    {
      id: 'sinhala-source',
      source: 'device-library',
      title: 'චන්ද්‍ර නිරීක්ෂණ සටහන්',
      content: 'සඳ පෘථිවිය වටා කක්ෂයක ගමන් කරයි. '.repeat(500),
    },
    {
      id: 'tamil-source',
      source: 'private-library',
      title: 'நிலா குறிப்புகள்',
      content: 'நிலா பூமியைச் சுற்றி வருகிறது. '.repeat(500),
    },
  ]);

  assert.ok(Buffer.byteLength(JSON.stringify(evidence), 'utf8') < 8 * 1024);
  assert.ok(evidence.length <= 2);
});

test('chat transport sends selected evidence and accepts only safe citation shapes', async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/nova/chat');
    payload = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        text: 'The Moon orbits Earth. [Source 1]',
        provider: 'NOVA Local Space Engine',
        model: 'nasa-local-engine',
        sources: [
          { id: 'moon-1', source: 'device-library', title: 'Moon notes' },
          { id: 'bad', source: 'untrusted', title: 'Ignore me' },
        ],
      }),
    };
  };

  try {
    const result = await sendChat({
      messages: [{ role: 'user', content: 'What does my Moon note say?' }],
      lang: 'en',
      evidence: [{ id: 'moon-1', source: 'device-library', title: 'Moon notes', content: 'The Moon orbits Earth.' }],
    });
    assert.equal(payload.evidence[0].id, 'moon-1');
    assert.deepEqual(result.ok && result.reply.sources, [
      { id: 'moon-1', source: 'device-library', title: 'Moon notes' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saved citations retain the evidence index used in the answer', () => {
  const sources = [
    { id: 'first', source: 'device-library', title: 'First source' },
    { id: 'second', source: 'private-library', title: 'Second source' },
  ];
  const cited = citedSources('The answer relies on the second note. [Source 2]', sources);
  assert.deepEqual(cited, [{ number: 2, source: sources[1] }]);

  const saved = withCitationReferences('The answer relies on the second note. [Source 2]', cited, {
    heading: 'Sources',
    device: 'On this device',
    private: 'Private library',
  });
  assert.match(saved, /\[Source 2\].*Second source/);
  assert.doesNotMatch(saved, /\[Source 1\]/);
});

test('history window can reserve request bytes for retrieved evidence', () => {
  const history = historyWindow([
    { role: 'user', content: 'x'.repeat(1_500) },
    { role: 'assistant', content: 'y'.repeat(1_500) },
    { role: 'user', content: 'latest' },
  ], { maxTextBytes: 512, maxSerializedBytes: 1_024 });

  assert.deepEqual(history, [{ role: 'user', content: 'latest' }]);
});
