// Pure helpers for NOVA AI conversation export/import. No browser APIs here so
// they stay testable outside the UI layer. Exported files contain only user
// messages and assistant replies — never API keys or provider secrets.
export const NOVA_EXPORT_VERSION = 1;

export function buildNovaExportPayload({ messages, language, model } = {}) {
  if (!Array.isArray(messages)) throw new Error('messages must be an array');
  return {
    version: NOVA_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    source: 'nova-ai',
    language: language || 'en',
    model: model || 'local',
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  };
}

const VALID_ROLES = new Set(['user', 'assistant']);

export function parseNovaImportFile(text) {
  if (typeof text !== 'string') throw new Error('import text must be a string');
  const imported = JSON.parse(text);
  if (!imported || imported.version !== NOVA_EXPORT_VERSION || !Array.isArray(imported.messages)) {
    throw new Error('Invalid NOVA conversation file');
  }
  const messages = imported.messages.filter(
    (message) => message && typeof message.role === 'string' && typeof message.content === 'string' && VALID_ROLES.has(message.role)
  );
  if (!messages.length) throw new Error('No messages found in file');
  return { messages, language: imported.language || 'en', model: imported.model || 'local' };
}
