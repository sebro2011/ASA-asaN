import { handleNovaChatRequest } from '../../server/novaChat.js';

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const firstForwardedIp = Array.isArray(forwarded)
    ? String(forwarded[0] || '').split(',')[0].trim()
    : String(forwarded || '').split(',')[0].trim();

  return firstForwardedIp || req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Only POST requests are supported.', code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const response = await handleNovaChatRequest({
      body: req.body,
      ip: getClientIp(req),
      contentLength: req.headers?.['content-length'],
    });

    for (const [name, value] of Object.entries(response.headers)) {
      res.setHeader(name, value);
    }
    return res.status(response.status).json(response.body);
  } catch {
    return res.status(500).json({
      error: 'NOVA could not process this request. Please retry.',
      code: 'INTERNAL_ERROR',
    });
  }
}
