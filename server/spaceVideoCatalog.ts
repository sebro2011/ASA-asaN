import type { SpaceVideo, SpaceVideoCategory, SpaceVideoMode } from '../src/features/space-shorts/types';
import { NASA_CHANNELS } from './channelIds';

/**
 * Hand-picked astronomy fallback, NOT a live YouTube response. The cited pages
 * identify the works and publishers; IDs were checked against the cited embeds
 * or matching YouTube listings. Descriptions summarize those sources. Unknown
 * dates, durations and aspect ratios are omitted rather than guessed. Embed
 * availability can change independently.
 */
type CatalogItem = SpaceVideo & { modes: SpaceVideoMode[]; categories: SpaceVideoCategory[] };
const GODDARD = 'UCAY-SMFNfynqz1bdoaV8BeQ';
const CRASH_COURSE = 'UCX6b17PVsYBQ0ip5gyeme-Q';
const catalog: CatalogItem[] = [
  {
    id: '1ifqd3n6ZFY', title: 'What is galactic archaeology?! #shorts',
    description: 'Dr. Becky explains how astronomers reconstruct the history of the Milky Way using its stars.',
    channelTitle: 'Dr. Becky', channelId: 'UCYNbYGl89UUowy8oXkipC-Q', officialAgency: false,
    sourceUrl: 'https://www.thesciencechannel.org/what-is-galactic-archaeology-shorts/',
    modes: ['shorts'], categories: ['universe']
  },
  {
    id: 'KBPc_zyJICE', title: 'Artemis Science: Exploring the Moon’s South Pole',
    description: 'NASA explores what lunar samples from the Moon’s south pole can reveal about the solar system.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true, portraitVerified: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14886/', modes: ['shorts'], categories: ['missions', 'solar-system']
  },
  {
    id: 'Is7z49LToNg', title: 'The Andromeda Galaxy Is Under Attack',
    description: 'Astrum explores interactions between the Andromeda galaxy and another galaxy.',
    channelTitle: 'Astrum', channelId: 'UC-9b7aDP6ZN0coj9-xFnrtw', officialAgency: false,
    sourceUrl: 'https://www.thesciencechannel.org/the-andromeda-galaxy-is-under-attack/',
    modes: ['shorts'], categories: ['universe']
  },
  {
    id: 'TseGuyuVWKM', title: 'Visualizing NASA’s Next Lunar Flyby',
    description: 'A visualization of the Artemis II lunar flyby, produced before the mission.',
    // NASA links this video but does not identify its YouTube channel on the source page.
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
    id: '0rHUDWjR5gg', title: 'Introduction to Astronomy: Crash Course Astronomy #1',
    description: 'Phil Plait introduces astronomy and the study of the universe.',
    channelTitle: 'CrashCourse', channelId: CRASH_COURSE, officialAgency: false,
    sourceUrl: 'https://thecrashcourse.com/courses/introduction-to-astronomy-crash-course-astronomy-1/',
    modes: ['videos'], categories: ['universe']
  },
  {
    id: 'chhcwk4-esM', title: 'NASA Simulation’s Plunge Into a Black Hole: Explained',
    description: 'A NASA supercomputer visualization follows a camera toward a supermassive black hole.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14576/', modes: ['videos'], categories: ['universe']
  },
  {
    id: '1Ou1MckZHTA', title: 'Neutron Stars: The Most Extreme Objects in the Universe',
    description: 'PBS Space Time explores the extraordinary matter inside a neutron star.',
    channelTitle: 'PBS Space Time', channelId: 'UC7_gcs09iThXybpVgjHZ_7g', officialAgency: false,
    sourceUrl: 'https://www.pbs.org/video/neutron-stars-the-most-extreme-objects-in-the-universe-7rxzbs/',
    modes: ['videos'], categories: ['universe']
  },
  {
    id: 'TKM0P3XlMNA', title: 'Introduction to the Solar System: Crash Course Astronomy #9',
    description: 'Phil Plait explores how the Sun, planets and other celestial objects formed.',
    channelTitle: 'CrashCourse', channelId: CRASH_COURSE, officialAgency: false,
    sourceUrl: 'https://thecrashcourse.com/courses/introduction-to-the-solar-system-crash-course-astronomy-9/',
    modes: ['videos'], categories: ['solar-system']
  },
  {
    id: '6dcfxVydbQY', title: 'Exploring Planet Uranus',
    description: 'A journey to the ice giant, its rings and moons, with observations from Voyager 2 and Hubble.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/14580/', modes: ['videos'], categories: ['solar-system']
  },
  {
    id: 'w-9gDALvMF4', title: 'The Earth: Crash Course Astronomy #11',
    description: 'A planet-by-planet tour of the solar system begins with Earth.',
    channelTitle: 'CrashCourse', channelId: CRASH_COURSE, officialAgency: false,
    sourceUrl: 'https://thecrashcourse.com/courses/the-earth-crash-course-astronomy-11/',
    modes: ['videos'], categories: ['earth', 'solar-system']
  },
  {
    id: 'jxU2jFh_6GM', title: 'LISA Pathfinder mission',
    description: 'Explore the European Space Agency’s LISA Pathfinder mission for gravitational-wave astronomy.',
    channelTitle: 'European Space Agency, ESA', officialAgency: true,
    sourceUrl: 'https://sci.esa.int/web/lisa-pathfinder/display-page-cl-display-page-content-long/-/asset_publisher/34627/content/56320-lisa-pathfinder-mission-esa-youtube-video',
    modes: ['videos'], categories: ['missions', 'universe']
  },
  {
    id: 'VUq3ClMyNUw', title: 'NASA Will Explore Asteroid Apophis',
    description: 'NASA’s OSIRIS-APEX mission will study the asteroid Apophis after its 2029 Earth flyby.',
    channelTitle: 'NASA Goddard', channelId: GODDARD, officialAgency: true,
    sourceUrl: 'https://svs.gsfc.nasa.gov/15101/', modes: ['videos'], categories: ['missions', 'solar-system']
  },
  {
    id: 'qZWPBKULkdQ', title: 'Black Holes: Crash Course Astronomy #33',
    description: 'Crash Course Astronomy explains how black holes form and how their gravity behaves.',
    channelTitle: 'CrashCourse', channelId: CRASH_COURSE, officialAgency: false,
    sourceUrl: 'https://thecrashcourse.com/courses/black-holes-crash-course-astronomy-33/',
    modes: ['videos'], categories: ['universe']
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

export function getCuratedPage(mode: SpaceVideoMode, category: SpaceVideoCategory, query: string, offset = 0, pageSize = 9, scope: 'all' | 'nasa' = 'all') {
  const matching = catalog.filter((video) => video.modes.includes(mode)
    && (scope !== 'nasa' || (video.channelId && NASA_CHANNELS.has(video.channelId)))
    && (category === 'all' || video.categories.includes(category))
    && matchesQuery(video, query));
  const items = matching.slice(offset, offset + pageSize).map(({ modes, ...video }) => video);
  return {
    items,
    nextPageToken: offset + pageSize < matching.length ? `c_${offset + pageSize}` : null
  };
}
