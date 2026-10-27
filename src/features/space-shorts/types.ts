/** Shared, deliberately small public contract for the CosmoVision API. */
export type SpaceVideoMode = 'shorts' | 'videos';
export type SpaceVideoCategory = 'all' | 'missions' | 'solar-system' | 'universe' | 'earth';
export type SpaceVideoSource = 'youtube' | 'curated';
export type SpaceVideoFailure = 'missing-key' | 'quota' | 'configuration' | 'network' | 'upstream' | 'rate-limit';

export interface SpaceVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId?: string;
  thumbnailUrl: string;
  publishedAt?: string;
  durationSeconds?: number;
  /** Only true for explicitly verified agency channels, never inferred from a title. */
  officialAgency: boolean;
  /** A research/source citation, included only in the curated collection. */
  sourceUrl?: string;
  /** Portrait is known only for individually checked starter videos. */
  portraitVerified?: boolean;
}

export interface SpaceVideoResponse {
  items: SpaceVideo[];
  nextPageToken: string | null;
  source: SpaceVideoSource;
  reason?: SpaceVideoFailure;
  cached?: boolean;
}
