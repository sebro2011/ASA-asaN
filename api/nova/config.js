import { getNovaPublicConfig } from '../../server/novaChat.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Only GET requests are supported.', code: 'METHOD_NOT_ALLOWED' });
  }

  return res.status(200).json(getNovaPublicConfig());
}
