/**
 * Conservative metadata-based relevance check for YouTube search results.
 * YouTube does not expose a reliable "astronomy only" classification. Strip
 * hashtags/links so unrelated videos cannot pass on keyword stuffing alone,
 * and require an astronomical subject in the title or a space-related title
 * supported by the opening description. This intentionally favours precision
 * over recall; it is not a semantic classifier and can still make mistakes.
 */
const TITLE_SUBJECT = /\b(?:astronomy|astronomers?|astronomical\s+(?:events?|observations?|research|discoveries|science)|astrophysics?|astrophotography|cosmology|cosmological|galax(?:y|ies)|galactic|universe|universo|cosmos|cosmic|black\s+holes?|neutron\s+stars?|pulsars?|quasars?|nebula(?:e|s)?|exoplanets?|solar\s+system|planet(?:s|ary)?(?!\s+earth\b)|stars|stellar|supernovae?|supernovas|constellations?|meteors?|meteorites?|asteroids?|comets?|milky\s+way|andromeda|dark\s+(?:matter|energy)|big\s+bang|interstellar|celestial|stargazing|night\s+sky|eclipses?|moon|lunar|sun|solar\s+(?:flare|storm|wind|eruption|corona)|mercury|venus|mars|jupiter|saturn|uranus|neptune|pluto|betelgeuse|hubble|webb|jwst|tess|kepler|voyager|perseids)\b/iu;
const TITLE_CONTEXT = /\b(?:space|sky|astronomical|earth|planet|star|sun|solar|moon|orbit|orbital|telescope|observatory|mission|spacecraft|astronaut|nasa|esa|artemis|apollo|jwst|hubble)\b/iu;
const DESCRIPTION_SUBJECT = /\b(?:astronomy|astronomers?|astrophysics?|cosmology|galax(?:y|ies)|universe|black\s+holes?|neutron\s+stars?|pulsars?|quasars?|nebula(?:e|s)?|exoplanets?|solar\s+system|stellar|supernovae?|constellations?|meteors?|asteroids?|comets?|milky\s+way|andromeda|night\s+sky|space\s+telescope|lunar|moon|mercury|venus|mars|jupiter|saturn|uranus|neptune|pluto)\b/iu;
const SOUTH_ASIAN_SUBJECT = /(?:තාරකා|විශ්ව|ග්‍රහලෝක|ග්‍රහ ලෝක|සෞරග්‍රහ|සූර්ය|චන්ද්‍ර|සඳ|ක්ෂීරපථ|ආකාශගංගා|කෘෂ්ණ කුහර|දුරේක්ෂ|උල්කා|වල්ගා තරු|වானியல்|விண்வெளி|பிரபஞ்ச|கோள்கள்|கோள்|நிலா|நிலவு|சூரிய|நட்சத்திர|விண்மீன்|கருந்துளை|அண்டம்|தொலைநோக்கி|விண்கல்)/u;
// Topics and brands which frequently use astronomical words as clickbait.
// Rejecting them can also hide an occasional legitimate comparison.
const UNRELATED = /\b(?:horoscopes?|astrology|zodiac|tarot|numerology|natal\s+chart|minecraft|roblox|fortnite|gameplay|video\s+game|gaming|star\s+wars|star\s+trek|marvel|hollywood|celebrit(?:y|ies)|pop\s+star|movie\s+star|football|basketball|music\s+video|song\s+lyrics?|samsung\s+galaxy|galaxy\s+(?:phone|smartphone|tablet|s\d+)|skincare|sunburn|solar\s+panels?|solar\s+installation)\b/iu;

function meaningfulText(value: string): string {
  return value.normalize('NFKC')
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/(^|\s)#[\p{L}\p{M}\p{N}_]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function isAstronomyRelated(video: { title: string; description: string }): boolean {
  const title = meaningfulText(video.title);
  // Don't let a long channel boilerplate or hashtag list decide relevance.
  const description = meaningfulText(video.description).slice(0, 500);
  if (!title || UNRELATED.test(title)) return false;
  if (TITLE_SUBJECT.test(title) || SOUTH_ASIAN_SUBJECT.test(title)) return true;
  return TITLE_CONTEXT.test(title) && (DESCRIPTION_SUBJECT.test(description) || SOUTH_ASIAN_SUBJECT.test(description));
}
