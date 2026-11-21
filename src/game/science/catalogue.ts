/**
 * What the player can find, and what it really is.
 *
 * Every entry below is a material that has actually been identified on Mars by
 * orbital or surface instruments, with the mission that established it. The game's
 * *identification* of a particular pixel-rock is illustrative — a browser game has
 * no spectrometer — but the mineralogy it draws from is not invented.
 *
 * Sources are NASA/ JPL mission pages and the published Mössbauer and APXS results
 * from Spirit, Opportunity, Curiosity and Perseverance. Attribution is shown in the
 * inventory and the journal, per the project's rule that derived or simulated data
 * is never presented as measured.
 */
import type { RockKind } from '../world/rocks';

export interface MineralEntry {
  id: RockKind;
  /** Short label used in the HUD. */
  label: string;
  /** Full name. */
  name: string;
  /** One-sentence description of the material. */
  summary: string;
  /** Where on Mars it has genuinely been found, and by which mission. */
  evidence: string;
  /** What the discovery implies, in one line. */
  significance: string;
  /** Colour used by the scanner reticle. */
  accent: string;
  /** Research points awarded, 0…1. */
  weight: number;
}

/**
 * The catalogue.
 *
 * Deliberately conservative: each `evidence` line names a mission and a location,
 * and none of them claim a measurement this page made.
 */
export const MINERALS: Record<RockKind, MineralEntry> = {
  basalt: {
    id: 'basalt',
    label: 'Basaltic rock',
    name: 'Olivine-bearing basalt',
    summary: 'Dark, fine-grained volcanic rock — the dominant crustal material at both landing regions.',
    evidence: 'Identified across Gusev Crater (Spirit) and Gale Crater (Curiosity) by Mössbauer and APXS instruments.',
    significance: 'Basalt is the raw material of the Martian crust; its weathering products are what the other minerals here come from.',
    accent: '#8f7a63',
    weight: 0.12,
  },
  sedimentary: {
    id: 'sedimentary',
    label: 'Sedimentary rock',
    name: 'Layered mudstone / sandstone',
    summary: 'Fine-grained sedimentary rock laid down in standing or slowly moving water.',
    evidence: 'The Sheepbed and Murray mudstones in Gale Crater were drilled and analysed by Curiosity (2013–2015).',
    significance: 'Layered mudstone is the strongest surface evidence that Mars once held long-lived lakes.',
    accent: '#b08a5e',
    weight: 0.22,
  },
  olivine: {
    id: 'olivine',
    label: 'Olivine grain',
    name: 'Olivine (forsterite–fayalite)',
    summary: 'A green magnesium–iron silicate that weathers quickly in the presence of water.',
    evidence: 'Found in nakhlite meteorites and in situ at Gusev and Gale; orbital spectroscopy maps it in Nili Fossae.',
    significance: 'Fresh olivine at the surface means little liquid water has been there recently — it rusts fast.',
    accent: '#6f8a5c',
    weight: 0.2,
  },
  hematite: {
    id: 'hematite',
    label: 'Hematite nodule',
    name: 'Hematite (spherules)',
    summary: 'Iron oxide concretions — the "blueberries" that cemented out of groundwater.',
    evidence: 'Discovered at Meridiani Planum by Opportunity in 2004; also mapped from orbit by CRISM.',
    significance: 'These nodules form in water, which made Meridiani the first site with direct evidence of past groundwater.',
    accent: '#9a4f42',
    weight: 0.26,
  },
  sulphate: {
    id: 'sulphate',
    label: 'Sulphate vein',
    name: 'Calcium / magnesium sulphate',
    summary: 'Salts precipitated from evaporating brines, often filling fractures as veins.',
    evidence: 'Jarosite at Meridiani (Opportunity); gypsum veins at Garden City in Gale Crater (Curiosity, 2015).',
    significance: 'Sulphate veins record fluid moving through rock long after the lakes dried.',
    accent: '#c9bfa6',
    weight: 0.3,
  },
};

/** Deterministic-ish identification for a rock: kind plus a plausible confidence. */
export function identify(kind: RockKind, seedFraction: number): { entry: MineralEntry; confidence: number } {
  const entry = MINERALS[kind];
  // Confidence is a property of the *simulation*, not of a measurement, and is
  // capped below 1 so the interface never implies certainty.
  const confidence = 0.62 + Math.min(0.3, seedFraction * 0.3);
  return { entry, confidence };
}

/** Attribution shown anywhere a mineral is identified. */
export const CATALOGUE_ATTRIBUTION =
  'Mineral classifications are illustrative, drawn from published NASA/JPL results for Spirit, Opportunity, Curiosity and Perseverance. They are not measurements made by this page.';

/** Research points needed to fill the journal's progress bar. */
export const RESEARCH_TARGET = 1;

/** Total weight available across all minerals, for progress normalisation. */
export const TOTAL_MINERAL_WEIGHT = Object.values(MINERALS).reduce((sum, entry) => sum + entry.weight, 0);
