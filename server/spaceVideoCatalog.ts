import type { SpaceVideo, SpaceVideoCategory, SpaceVideoMode } from '../src/features/space-shorts/types';

/**
 * Hand-picked fallback, NOT a live YouTube response. Each source page links to
 * the exact YouTube ID. Titles/descriptions are taken from or summarize those
 * agency pages. Dates/durations are omitted unless independently confirmed.
 * Links and embed availability can change; the player always offers YouTube.
 */
type CatalogItem = SpaceVideo & { modes: SpaceVideoMode[]; categories: SpaceVideoCategory[] };
const GODDARD = 'UCAY-SMFNfynqz1bdoaV8BeQ';
const catalog: CatalogItem[] = [
  {
    id: 'KBPc_zyJICE', title: 'Artemis Science: Exploring the Moon’s South Pole',
    description: 'NASA explores what lunar samples from the Moon’s south pole can reveal about the solar system.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true, portraitVerified: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14886/', modes: ['shorts'], categories: ['missions', 'solar-system']
  },
  {
    id: 'TseGuyuVWKM', title: 'Visualizing NASA’s Next Lunar Flyby',
    description: 'A visualization of the Artemis II lunar flyby, produced before the mission.',
    // NASA links this Short but does not identify its YouTube channel on the source page.
    channelTitle: '', officialAgency: false, portraitVerified: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14938/', modes: ['shorts'], categories: ['missions', 'solar-system']
  },
  {
    id: 'bX0hv0EFKnI', title: 'Artemis II: Into the Path of Solar Eruptions',
    description: 'How solar eruptions can affect a lunar mission and its crew.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true, portraitVerified: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14988/', modes: ['shorts'], categories: ['missions', 'solar-system']
  },
  {
    id: 'chhcwk4-esM', title: 'NASA Simulation’s Plunge Into a Black Hole: Explained',
    description: 'A NASA supercomputer visualization follows a camera toward a supermassive black hole.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14576/', modes: ['videos'], categories: ['universe']
  },
  {
    id: '6dcfxVydbQY', title: 'Exploring Planet Uranus',
    description: 'A journey to the ice giant, its rings and moons, with observations from Voyager 2 and Hubble.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14580/', modes: ['videos'], categories: ['solar-system']
  },
  {
    id: 'VUq3ClMyNUw', title: 'NASA Will Explore Asteroid Apophis',
    description: 'NASA’s OSIRIS-APEX mission will study the asteroid Apophis after its 2029 Earth flyby.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/15101/', modes: ['videos'], categories: ['missions', 'solar-system']
  },
  {
    id: 'AQAaAJW-uC0', title: 'Artemis Science: Exploring the Moon’s South Pole',
    description: 'NASA explores what lunar samples from the Moon’s south pole can reveal about the solar system.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14886/', modes: ['videos'], categories: ['missions', 'solar-system']
  },
  {
    id: 'zJE0DnRWPz0', title: 'Going Interstellar with TESS and Kepler',
    description: 'Explore spacecraft beyond the solar system and the search for exoplanets with Kepler and TESS.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true, durationSeconds: 174,
    sourceUrl: 'https://svs.gsfc.nasa.gov/13155/', modes: ['videos'], categories: ['universe', 'missions']
  },
  {
    id: 'vUQAc0RYjzc', title: 'How NASA Unlocks the Moon’s Mysteries',
    description: 'Discoveries about the Moon made using data from the Lunar Reconnaissance Orbiter.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14383/', modes: ['videos'], categories: ['missions', 'solar-system']
  },
  {
    id: 'f-2F3QD_UyA', title: 'Cosmic Cycles: Earth, Our Home',
    description: 'A tour of Earth as NASA sees it, from astronaut photographs to satellite visualizations.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14318/', modes: ['videos'], categories: ['earth']
  },
  {
    id: 'WbmZhMZcrWE', title: 'Cosmic Cycles: Planetary Fantasia',
    description: 'A visual tour of other worlds in our solar system.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14321/', modes: ['videos'], categories: ['solar-system']
  },
  {
    id: 'wdF4wyTarrI', title: 'Artemis Science: Visualizing NASA’s Next Lunar Flyby',
    description: 'A visualization of the Artemis II lunar flyby, produced before the mission.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14938/', modes: ['videos'], categories: ['missions', 'solar-system']
  },
  {
    id: 'jxU2jFh_6GM', title: 'LISA Pathfinder mission',
    description: 'Explore the European Space Agency’s LISA Pathfinder mission.',
    channelTitle: 'European Space Agency, ESA', officialAgency: true,
    sourceUrl: 'https://sci.esa.int/web/lisa-pathfinder/display-page-cl-display-page-content-long/-/asset_publisher/34627/content/56320-lisa-pathfinder-mission-esa-youtube-video',
    modes: ['videos'], categories: ['missions', 'universe']
  },
  {
    id: '6J1qTOHBZ4s', title: 'A New Portrait of the Cosmos is Coming',
    description: 'A NASA trailer introducing the Nancy Grace Roman Space Telescope.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/13606/', modes: ['videos'], categories: ['universe', 'missions']
  }
].map((video) => ({ ...video, thumbnailUrl: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` })) as CatalogItem[];

/** Search the metadata we actually show; no arbitrary video URLs are accepted. */
export function matchesQuery(video: Pick<SpaceVideo, 'title' | 'description' | 'channelTitle'>, query: string): boolean {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  const haystack = `${video.title} ${video.description} ${video.channelTitle}`.toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function getCuratedPage(mode: SpaceVideoMode, category: SpaceVideoCategory, query: string, offset = 0, pageSize = 9) {
  const matching = catalog.filter((video) => video.modes.includes(mode)
    && (category === 'all' || video.categories.includes(category))
    && matchesQuery(video, query));
  const items = matching.slice(offset, offset + pageSize).map(({ modes, categories, ...video }) => video);
  return {
    items,
    nextPageToken: offset + pageSize < matching.length ? `c_${offset + pageSize}` : null
  };
}
