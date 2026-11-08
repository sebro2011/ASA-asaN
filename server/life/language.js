/**
 * Multilingual support: script detection, language-aware prompts, Unicode safety
 * and glossary-assisted cross-language retrieval.
 *
 * What this is: deterministic script detection plus a curated Sinhala/Tamil/
 * English astronomy glossary, which lets a Sinhala query find an English memory
 * that contains the same concept.
 *
 * What this is not: a translator, and not a claim that all three languages get
 * identical retrieval quality. Cross-language *semantic* matching needs the
 * optional embedding adapter (see `memory.js`); keyword matching alone is only as
 * good as the glossary below, and `benchmarks.js` measures it per language.
 */

export const LANGUAGES = ['en', 'si', 'ta'];

const RANGES = {
  si: /[\u0D80-\u0DFF]/g,
  ta: /[\u0B80-\u0BFF]/g,
  en: /[A-Za-z]/g,
};

/** Detect the dominant script. Mixed text resolves to the script with most characters. */
export function detectLanguage(input) {
  const text = typeof input === 'string' ? input : String(input ?? '');
  const counts = { si: 0, ta: 0, en: 0 };
  for (const [language, pattern] of Object.entries(RANGES)) {
    counts[language] = (text.match(pattern) || []).length;
  }
  const total = counts.si + counts.ta + counts.en;
  if (total === 0) return { language: 'und', confidence: 0, counts };
  const [best, amount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { language: best, confidence: amount / total, counts };
}

export function detectLanguageCode(input) {
  return detectLanguage(input).language;
}

/** Instructions appended to a system prompt so the model answers in the same language. */
export function languageInstruction(language) {
  switch (language) {
    case 'si':
      return 'පිළිතුර සිංහලෙන් ලියන්න. තාක්ෂණික නම් ඉංග්‍රීසියෙන් තැබිය හැක.';
    case 'ta':
      return 'பதிலைத் தமிழில் எழுதுங்கள். தொழில்நுட்பப் பெயர்களை ஆங்கிலத்தில் வைக்கலாம்.';
    default:
      return 'Answer in the language of the question; keep technical names as they are.';
  }
}

/** Localised engine status strings — the server never returns English-only status to a si/ta client. */
const STATUS_COPY = {
  en: {
    planned: 'Task planned. No step has run yet.',
    noLocalProvider: 'LOCAL_ONLY is on and no local model is reachable. Ask an administrator to start Ollama or an OpenAI-compatible local server.',
    awaitingApproval: 'Waiting for your approval before continuing.',
    verified: 'Verified against independent checks.',
    unverified: 'Not independently verified.',
  },
  si: {
    planned: 'කාර්යය සැලසුම් කර ඇත. කිසිදු පියවරක් තවම ක්‍රියාත්මක නොවීය.',
    noLocalProvider:
      'LOCAL_ONLY සක්‍රීයයි, නමුත් දේශීය ආකෘතියක් සොයාගත නොහැක. Ollama හෝ OpenAI-අනුකූල දේශීය සේවාදායකයක් ආරම්භ කරන්න.',
    awaitingApproval: 'ඉදිරියට යාමට ඔබේ අනුමැතිය අපේක්ෂාවෙන් සිටී.',
    verified: 'ස්වාධීන පරීක්ෂණ මගින් තහවුරු කර ඇත.',
    unverified: 'ස්වාධීනව තහවුරු කර නැත.',
  },
  ta: {
    planned: 'பணி திட்டமிடப்பட்டது. இன்னும் எந்தப் படியும் இயங்கவில்லை.',
    noLocalProvider:
      'LOCAL_ONLY இயக்கத்தில் உள்ளது, ஆனால் உள்ளூர் மாதிரி கிடைக்கவில்லை. Ollama அல்லது OpenAI-இணக்க உள்ளூர் சேவையகத்தைத் தொடங்குங்கள்.',
    awaitingApproval: 'தொடர உங்கள் அனுமதிக்காகக் காத்திருக்கிறது.',
    verified: 'சுயாதீனச் சரிபார்ப்புகளால் உறுதி செய்யப்பட்டது.',
    unverified: 'சுயாதீனமாக உறுதி செய்யப்படவில்லை.',
  },
};

export function statusCopy(language, key) {
  const bucket = STATUS_COPY[language] || STATUS_COPY.en;
  return bucket[key] ?? STATUS_COPY.en[key] ?? key;
}

/** Normalise text for indexing: NFC, collapse whitespace, keep scripts intact. */
export function normalizeText(input) {
  const text = typeof input === 'string' ? input : String(input ?? '');
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** True when the string is valid Unicode (no lone surrogates). */
export function isWellFormedUnicode(input) {
  const text = typeof input === 'string' ? input : String(input ?? '');
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/**
 * Concept bridge for retrieval. English terms map to their Sinhala and Tamil
 * equivalents; the reverse direction is what makes a si/ta query reach an
 * English memory. Kept deliberately small and reviewable.
 */
export const GLOSSARY = [
  { en: 'moon', si: 'චන්ද්‍රයා', ta: 'நிலா' },
  { en: 'star', si: 'තාරකාව', ta: 'விண்மீன்' },
  { en: 'planet', si: 'ග්‍රහලෝකය', ta: 'கோள்' },
  { en: 'orbit', si: 'කක්ෂය', ta: 'சுற்றுப்பாதை' },
  { en: 'telescope', si: 'දුරේක්ෂය', ta: 'தொலைநோக்கி' },
  { en: 'observation', si: 'නිරීක්ෂණය', ta: 'கண்காணிப்பு' },
  { en: 'mission', si: 'මෙහෙයුම', ta: 'பயணம்' },
  { en: 'galaxy', si: 'ගැලැක්සිය', ta: 'விண்மீன் மண்டலம்' },
  { en: 'nebula', si: 'නීහාරිකාව', ta: 'விண்முகில்' },
  { en: 'gravity', si: 'ගුරුත්වාකර්ෂණය', ta: 'ஈர்ப்பு' },
  { en: 'light year', si: 'ආලෝක වර්ෂය', ta: 'ஒளியாண்டு' },
  { en: 'eclipse', si: 'ග්‍රහණය', ta: 'கிரகணம்' },
  { en: 'research', si: 'පර්යේෂණය', ta: 'ஆய்வு' },
  { en: 'memory', si: 'මතකය', ta: 'நினைவு' },
  { en: 'skill', si: 'නිපුණතාව', ta: 'திறன்' },
  { en: 'security', si: 'ආරක්ෂාව', ta: 'பாதுகாப்பு' },
  { en: 'test', si: 'පරීක්ෂණය', ta: 'சோதனை' },
  { en: 'weather', si: 'කාලගුණය', ta: 'வானிலை' },
];

const TERM_INDEX = (() => {
  const map = new Map();
  for (const entry of GLOSSARY) {
    for (const value of [entry.en, entry.si, entry.ta]) {
      map.set(normalizeText(value).toLowerCase(), entry);
    }
  }
  return map;
})();

/** Expand a query into the languages that express the same concept. */
export function expandQueryTerms(query) {
  const normalised = normalizeText(query).toLowerCase();
  const terms = new Set([normalised]);
  for (const [term, entry] of TERM_INDEX) {
    if (normalised.includes(term)) {
      terms.add(entry.en.toLowerCase());
      terms.add(entry.si.toLowerCase());
      terms.add(entry.ta.toLowerCase());
    }
  }
  return [...terms];
}

/** Tokenise for scoring: scripts without spaces still match as whole words. */
export function tokenize(input) {
  return normalizeText(input)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}
