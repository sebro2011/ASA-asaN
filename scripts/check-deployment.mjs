#!/usr/bin/env node
/**
 * Deployment probe: why does the workspace say "Cloud workspace is not configured"?
 *
 * Run it against the site that shows the banner (it needs network; the CI sandbox
 * does not have any):
 *
 *   npm run check:deployment -- https://your-app.vercel.app
 *
 * It asks the three endpoints the app itself asks, prints the raw answer, and
 * turns it into the one sentence an operator can act on.
 */

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base) {
  console.error('usage: npm run check:deployment -- https://your-app.vercel.app');
  process.exit(2);
}

const ENDPOINTS = ['/api/workspace/config', '/api/nova/config', '/'];

const VERDICTS = {
  ok: {
    meaning: 'The endpoint answered with JSON and a verdict.',
    next: 'If the app still shows the banner, clear the site data (the probe result is cached per page load) and reload.',
  },
  'route-missing': {
    meaning: 'The deployment is not serving this route at all (404).',
    next: 'Check vercel.json rewrites (`/api/(.*)` → `/api/index`) and that api/index.js is committed and built by `npm run build:api`.',
  },
  'server-error': {
    meaning: 'The function started and crashed (5xx).',
    next: 'Open the deployment logs in Vercel → Functions; a missing or malformed env var is the usual cause.',
  },
  'invalid-response': {
    meaning: 'The request was answered by the app shell (HTML), not the API.',
    next: 'The rewrite fell through to index.html — confirm the function exists in this deployment and that the request path starts with /api/.',
  },
  unreachable: {
    meaning: 'No answer at all (DNS, offline, or a proxy blocking the request).',
    next: 'Retry from the same network; if it always fails, check the deployment URL and any firewall/CSP in front of it.',
  },
  'not-configured': {
    meaning: 'The route works, the deployment has no credentials.',
    next: 'Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY on the environment that serves this URL, then redeploy.',
  },
};

async function probe(path) {
  const url = base + path;
  const started = Date.now();
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    const elapsed = Date.now() - started;

    let verdict = 'ok';
    if (response.status === 404) verdict = 'route-missing';
    else if (response.status >= 500) verdict = 'server-error';
    else if (!contentType.includes('json')) verdict = 'invalid-response';
    else {
      try {
        const body = JSON.parse(text);
        if (body && body.enabled === false) verdict = 'not-configured';
      } catch {
        verdict = 'invalid-response';
      }
    }

    return { path, url, status: response.status, contentType, elapsed, verdict, body: text.slice(0, 240) };
  } catch (error) {
    return {
      path,
      url,
      status: 0,
      contentType: '',
      elapsed: Date.now() - started,
      verdict: 'unreachable',
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

console.log(`\nProbing ${base}\n${'='.repeat(60)}`);

const results = [];
for (const path of ENDPOINTS) {
  const result = await probe(path);
  results.push(result);
  console.log(`\n${result.path}`);
  console.log(`  status       ${result.status || '(no response)'} in ${result.elapsed}ms`);
  console.log(`  content-type ${result.contentType || '(none)'}`);
  console.log(`  body         ${result.body || '(empty)'}`);
  const verdict = VERDICTS[result.verdict];
  console.log(`  verdict      ${result.verdict} — ${verdict.meaning}`);
  console.log(`  next step    ${verdict.next}`);
}

const config = results[0];
console.log(`\n${'='.repeat(60)}`);
if (config.verdict === 'ok' || config.verdict === 'not-configured') {
  console.log(config.verdict === 'ok'
    ? 'The cloud config endpoint is healthy. This is not a deployment problem.'
    : 'The endpoint is healthy but the deployment has no Supabase credentials.');
  process.exit(config.verdict === 'ok' ? 0 : 1);
}

console.log('The cloud config endpoint is not healthy — see the verdict above.');
process.exit(1);
