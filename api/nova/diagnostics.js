import { handleNovaDiagnostics } from '../../server/novaDiagnostics.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Only GET requests are supported.', code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const probe = req.query?.probe === '1' || req.query?.probe === 'true';
    // `?chat=1` runs the real chat handler once per configured provider: a probe
    // says a host answered, this says a completion works. Opt-in and throttled.
    const chat = req.query?.chat === '1' || req.query?.chat === 'true';
    return res.status(200).json(await handleNovaDiagnostics({ probe, chat }));
  } catch {
    return res.status(500).json({ error: 'Diagnostics could not run.', code: 'INTERNAL_ERROR' });
  }
}
