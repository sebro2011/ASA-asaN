/**
 * Interface copy for the redesigned shell, home page and page framing.
 *
 * Kept in one typed module instead of inline conditionals so translators can
 * review a single file and no screen silently falls back to English. Merged into
 * the existing i18next resources in src/i18n.ts (same pattern as the Earth Lab).
 */

import type { Copy } from '../interfaceCopy';

export const interfaceCopyEn: Copy = {

  /* shell */
  navHome: 'Home',
  wsNavWorkspace: 'Mission Control',
  navExplore: 'Explore',
  navEarth: 'Earth',
  navSystem: 'Solar system',
  navAssistant: 'Assistant',
  navAskNova: 'Ask NOVA',
  navMenu: 'Menu',
  navAllDestinations: 'All destinations',
  navLanguage: 'Language',
  interfaceLanguage: 'Interface language',
  skipToContent: 'Skip to main content',
  siteTagline: 'Earth · Missions · Deep Space',

  /* data state vocabulary */
  stateLive: 'Live',
  stateCached: 'Cached',
  stateDerived: 'Derived',
  stateStatic: 'Reference',
  stateSimulated: 'Simulated',
  stateUnavailable: 'Unavailable',
  stateLoading: 'Requesting',
  lastUpdated: 'Last updated',
  retrieved: 'Retrieved',
  sourceLabel: 'Source',
  unavailableShort: 'Unavailable',
  retry: 'Try again',
  refresh: 'Refresh',
  open: 'Open',
  close: 'Close',
  viewAll: 'View all',

  /* hero */
  heroEyebrow: 'Earth observation · Planetary science · Deep space',
  heroTitleA: 'Explore Beyond the',
  heroTitleB: 'Horizon.',
  heroDescription:
    'Discover our changing planet, follow missions across the solar system, and explore the universe through real scientific data.',
  heroCtaPrimary: 'Open Earth Intelligence Lab',
  heroCtaSecondary: 'Mission overview',
  heroCtaTertiary: 'Today’s astronomy picture',
  heroScroll: 'Scroll to telemetry',
  heroImageCredit: 'Earth imagery: NASA Blue Marble collection, NASA Visible Earth',
  heroFact1: 'NASA open data',
  heroFact2: 'Three languages',
  heroFact3: 'No fabricated values',

  /* signal strip */
  signalsTitle: 'Data links',
  signalsSubtitle: 'Service state of the sources this page is currently reading.',
  signalApod: 'APOD',
  signalIss: 'Orbital tracking',
  signalNeo: 'Near-Earth objects',
  signalPower: 'NASA POWER',

  /* mission overview */
  overviewEyebrow: 'Mission overview',
  overviewTitle: 'What the instruments are reporting right now',
  overviewDescription:
    'A single operational view of the live sources this platform can reach. Every panel states whether its values are live, cached, simulated or unavailable.',
  issTitle: 'International Space Station',
  issSubtitle: 'Position derived from public orbital tracking',
  issLatitude: 'Latitude',
  issLongitude: 'Longitude',
  issAltitude: 'Altitude',
  issVelocity: 'Ground speed',
  issVisibility: 'Visibility',
  issOpenTracker: 'Open orbital tracking',
  issSimulatedNote:
    'Upstream tracking did not respond. This position is propagated from the last known elements and is not live telemetry.',
  neoTitle: 'Near-Earth objects',
  neoSubtitle: 'Close approaches in the next seven days · NASA NeoWs',
  neoCount: 'Objects tracked',
  neoClosest: 'Closest approach',
  neoHazardous: 'Flagged potentially hazardous',
  neoDiameter: 'Estimated diameter',
  neoDistance: 'Miss distance',
  neoVelocity: 'Relative velocity',
  neoOpen: 'Open NEO explorer',
  neoDisclaimer:
    '“Potentially hazardous” is a size-and-orbit classification, not a prediction of impact. A close approach is a normal orbital event.',
  neoStaticNote:
    'The live NeoWs feed is unavailable, so approach values are withheld. Reference objects from the NASA catalogue are shown instead.',
  apodTitle: 'Astronomy Picture of the Day',
  apodOpen: 'Open the full archive',
  apodCredit: 'Image credit',
  apodSampleNote: 'Archival reference image — the live APOD service did not respond.',
  apodImageFailed: 'The image could not be loaded from NASA. The original is still available.',
  apodMediaMissing: 'NASA published this entry without a still image.',
  apodOpenOriginal: 'Open the original media',
  apodVideoNote: 'This entry is a video, not a still image.',

  /* earth preview */
  earthEyebrow: 'Earth intelligence',
  earthTitle: 'Fifteen years of surface temperature, one grid cell',
  earthDescription:
    'A live slice of the Earth Intelligence Lab: NASA POWER monthly air temperature for Colombo, reduced to annual means. The Lab adds precipitation, humidity, wind, irradiance, satellite imagery and full provenance.',
  earthMeanLabel: 'Period mean',
  earthTrendLabel: 'Least-squares slope',
  earthPointsLabel: 'Complete years',
  earthOpenLab: 'Open the lab',
  earthGridNote:
    'POWER reports the ≈0.5° × 0.625° grid cell containing the request point. These are satellite and reanalysis estimates, not weather-station measurements.',
  earthLabBriefTitle: 'Four workspaces, one provenance model',

  /* discovery */
  discoveryEyebrow: 'Continue exploring',
  discoveryTitle: 'Instruments, archives and simulators',
  discoveryDescription: 'Thirteen destinations, each with its own data contract and source attribution.',

  /* page framing */
  pageApodEyebrow: 'Explore · Astronomy Picture of the Day',
  page3dEyebrow: 'Explore · 3D visualisation',
  pageMissionsEyebrow: 'Explore · Flight history',
  pageNewsEyebrow: 'Explore · Agency releases',
  pageQuizEyebrow: 'Explore · Learning',
  pageEarthEyebrow: 'Earth · Intelligence Lab',
  pageEpicEyebrow: 'Earth · DSCOVR imagery',
  pageIssEyebrow: 'Earth · Orbital tracking',
  pageNeoEyebrow: 'Solar system · Near-Earth objects',
  pageExoEyebrow: 'Solar system · Exoplanets',
  pageLaunchEyebrow: 'Solar system · Simulation',
  pageAssistantEyebrow: 'Assistant · Grounded AI',
  pageSavedEyebrow: 'Assistant · Your collection',

  /* footer */
  footerDisclaimer:
    'An independent, trilingual interface to publicly available NASA science data. Not affiliated with or endorsed by the National Aeronautics and Space Administration.',
  footerSources: 'Data sources',
  footerExport: 'Export as single-file HTML',
  footerRights: 'Built for scientific literacy',
  /* APOD */
  apodLoading: 'Requesting the APOD record',
  apodErrorTitle: 'The APOD service did not answer',
  apodErrorBody: 'No substitute image has been invented for this date. Retry, pick another day, or open the record directly at apod.nasa.gov.',
  apodRetry: 'Retry request',
  apodSampleBadge: 'Reference entry',
  apodSampleBody: 'The live APOD service could not be reached. The image and text below are a stored example kept for offline use — they are not the release for the selected date.',
  apodCachedBadge: 'Cached copy',
  apodCachedBody: 'Served from the on-device cache, not a new request.',
  apodCreditLabel: 'Credit',
  apodScienceSource: 'NASA Science APOD archive · featured image; see the NASA record for media and credits',
  apodScienceCredit: 'See NASA record for credits',
  apodOpenSource: 'Open record at apod.nasa.gov',
  apodPrevious: 'Previous day',
  apodNext: 'Next day',
  apodDateLabel: 'Date',
  apodResolution: 'Resolution',
  apodStandard: 'Standard',
  apodHigh: 'Full resolution',
  apodArchiveJumps: 'Archive jumps',
  destinationErrorTitle: 'This destination failed to load',
  destinationErrorBody: 'A module inside this view could not start — often a WebGL, map or network limitation on this device. The rest of the explorer is unaffected. Move to another destination or return home.',
  apodReadNasa: 'NASA publishes one image per day with an astronomer-written caption. Translation is machine-generated unless stated.',

  /* welcome screen & version management */
  welcomeEyebrow: 'NASA Space Explorer',
  welcomeTitle: 'Welcome to your space observation deck',
  welcomeBody:
    'Explore real NASA imagery, Earth climate records, near-Earth objects and landmark missions — every figure traced to its source, in English, සිංහල and தமிழ்.',
  welcomeBegin: 'Begin Exploration',
  welcomeSkip: 'Skip',
  welcomeShowOnStartup: 'Show welcome screen on startup',
  welcomeReplay: 'Replay welcome screen',
};
