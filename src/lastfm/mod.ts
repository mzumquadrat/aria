import type { LastfmTag, LastfmTrack, LastfmArtist, LastfmUserTopTrack, LastfmUserTopArtist, LastfmUserTrack } from "./types.ts";
import { MOOD_TAG_MAP, getMoodTags, calculateTagMatchScore } from "./types.ts";
import type { LastfmCache as LastfmCacheType } from "./cache.ts";
import { LastfmCache } from "./cache.ts";

export { MOOD_TAG_MAP, getMoodTags, calculateTagMatchScore, LastfmCache };
export type { LastfmTag, LastfmTrack, LastfmArtist, LastfmCacheType };

export interface LastfmConfig {
  apiKey: string;
  username?: string | undefined;
  cacheExpiryDays?: number;
  rateLimitPerSecond?: number;
}

class RateLimiter {
  private queue: Array<() => void> = [];
  private lastCall = 0;
  private minInterval: number;

  constructor(callsPerSecond: number = 4) {
    this.minInterval = 1000 / callsPerSecond;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    
    if (timeSinceLastCall < this.minInterval) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
        setTimeout(() => this.processQueue(), this.minInterval - timeSinceLastCall);
      });
    }
    
    this.lastCall = Date.now();
  }

  private processQueue(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.lastCall = Date.now();
        next();
      }
    }
  }
}

export class LastfmService {
  private apiKey: string;
  private username?: string;
  private cache?: LastfmCache;
  private cacheExpiryDays: number;
  private rateLimiter: RateLimiter;
  private baseUrl = "https://ws.audioscrobbler.com/2.0/";

  constructor(config: LastfmConfig) {
    this.apiKey = config.apiKey;
    if (config.username !== undefined) {
      this.username = config.username;
    }
    this.cacheExpiryDays = config.cacheExpiryDays ?? 7;
    this.rateLimiter = new RateLimiter(config.rateLimitPerSecond ?? 4);
  }

  setCache(cache: LastfmCache): void {
    this.cache = cache;
  }

  private async request<T>(params: Record<string, string>): Promise<T> {
    await this.rateLimiter.acquire();

    const url = new URL(this.baseUrl);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("format", "json");
    
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`Last.fm API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Last.fm API error ${data.error}: ${data.message}`);
    }

    return data;
  }

  async getTrackTags(artist: string, track: string): Promise<LastfmTag[]> {
    if (this.cache) {
      const cached = this.cache.getTrackTags(artist, track);
      if (cached) return cached;
    }

    try {
      const response = await this.request<{ toptags?: { tag?: LastfmTag[] } }>({
        method: "track.gettoptags",
        artist,
        track,
        autocorrect: "1",
      });

      const tags = response.toptags?.tag || [];
      
      if (this.cache && tags.length > 0) {
        this.cache.setTrackTags(artist, track, tags, this.cacheExpiryDays);
      }

      return tags;
    } catch {
      return [];
    }
  }

  async getArtistTags(artist: string): Promise<LastfmTag[]> {
    if (this.cache) {
      const cached = this.cache.getArtistTags(artist);
      if (cached) return cached;
    }

    try {
      const response = await this.request<{ toptags?: { tag?: LastfmTag[] } }>({
        method: "artist.gettoptags",
        artist,
        autocorrect: "1",
      });

      const tags = response.toptags?.tag || [];
      
      if (this.cache && tags.length > 0) {
        this.cache.setArtistTags(artist, tags, this.cacheExpiryDays);
      }

      return tags;
    } catch {
      return [];
    }
  }

  async getSimilarTags(tag: string): Promise<string[]> {
    try {
      const response = await this.request<{ similartags?: { tag?: Array<{ name: string }> } }>({
        method: "tag.getsimilar",
        tag,
      });

      return (response.similartags?.tag || []).map((t) => t.name);
    } catch {
      return [];
    }
  }

  async getTopTracksForTag(tag: string, limit: number = 50): Promise<LastfmTrack[]> {
    try {
      const response = await this.request<{ tracks?: { track: LastfmTrack[] } }>({
        method: "tag.gettoptracks",
        tag,
        limit: limit.toString(),
      });

      return response.tracks?.track || [];
    } catch {
      return [];
    }
  }

  async getSimilarArtists(artist: string, limit: number = 20): Promise<LastfmArtist[]> {
    if (this.cache) {
      const cachedNames = this.cache.getSimilarArtists(artist);
      if (cachedNames) {
        return cachedNames.map((name: string) => ({ name }));
      }
    }

    try {
      const response = await this.request<{ similarartists?: { artist: LastfmArtist[] } }>({
        method: "artist.getsimilar",
        artist,
        autocorrect: "1",
        limit: limit.toString(),
      });

      const artists = response.similarartists?.artist || [];
      
      if (this.cache && artists.length > 0) {
        this.cache.setSimilarArtists(
          artist,
          artists.map((a) => a.name),
          this.cacheExpiryDays
        );
      }

      return artists;
    } catch {
      return [];
    }
  }

  async getSimilarTracks(artist: string, track: string, limit: number = 50): Promise<LastfmTrack[]> {
    try {
      const response = await this.request<{ similartracks?: { track: LastfmTrack[] } }>({
        method: "track.getsimilar",
        artist,
        track,
        autocorrect: "1",
        limit: limit.toString(),
      });

      return response.similartracks?.track || [];
    } catch {
      return [];
    }
  }

  async getArtistTopTracks(artist: string, limit: number = 20): Promise<LastfmTrack[]> {
    try {
      const response = await this.request<{ toptracks?: { track: LastfmTrack[] } }>({
        method: "artist.gettoptracks",
        artist,
        autocorrect: "1",
        limit: limit.toString(),
      });

      return response.toptracks?.track || [];
    } catch {
      return [];
    }
  }

  async getTrackInfo(artist: string, track: string): Promise<LastfmTrack | null> {
    try {
      const response = await this.request<{ track: LastfmTrack }>({
        method: "track.getinfo",
        artist,
        track,
        autocorrect: "1",
      });

      return response.track;
    } catch {
      return null;
    }
  }

  async searchTracks(query: string, limit: number = 30): Promise<LastfmTrack[]> {
    try {
      const response = await this.request<{ results?: { trackmatches?: { track: LastfmTrack[] } } }>({
        method: "track.search",
        track: query,
        limit: limit.toString(),
      });

      return response.results?.trackmatches?.track || [];
    } catch {
      return [];
    }
  }

  async searchArtists(query: string, limit: number = 30): Promise<LastfmArtist[]> {
    try {
      const response = await this.request<{ results?: { artistmatches?: { artist: LastfmArtist[] } } }>({
        method: "artist.search",
        artist: query,
        limit: limit.toString(),
      });

      return response.results?.artistmatches?.artist || [];
    } catch {
      return [];
    }
  }

  async getUserTopTracks(period: "overall" | "7day" | "1month" | "3month" | "6month" | "12month" = "overall", limit: number = 50): Promise<LastfmUserTopTrack[]> {
    if (!this.username) {
      return [];
    }

    try {
      const response = await this.request<{ toptracks?: { track: LastfmUserTopTrack[] } }>({
        method: "user.gettoptracks",
        user: this.username,
        period,
        limit: limit.toString(),
      });

      return response.toptracks?.track || [];
    } catch {
      return [];
    }
  }

  async getUserLovedTracks(limit: number = 50): Promise<LastfmUserTrack[]> {
    if (!this.username) {
      return [];
    }

    try {
      const response = await this.request<{ lovedtracks?: { track: LastfmUserTrack[] } }>({
        method: "user.getlovedtracks",
        user: this.username,
        limit: limit.toString(),
      });

      return response.lovedtracks?.track || [];
    } catch {
      return [];
    }
  }

  async getUserRecentTracks(limit: number = 50): Promise<LastfmUserTrack[]> {
    if (!this.username) {
      return [];
    }

    try {
      const response = await this.request<{ recenttracks?: { track: LastfmUserTrack[] } }>({
        method: "user.getrecenttracks",
        user: this.username,
        limit: limit.toString(),
      });

      return response.recenttracks?.track || [];
    } catch {
      return [];
    }
  }

  async getUserTopArtists(period: "overall" | "7day" | "1month" | "3month" | "6month" | "12month" = "overall", limit: number = 50): Promise<LastfmUserTopArtist[]> {
    if (!this.username) {
      return [];
    }

    try {
      const response = await this.request<{ topartists?: { artist: LastfmUserTopArtist[] } }>({
        method: "user.gettopartists",
        user: this.username,
        period,
        limit: limit.toString(),
      });

      return response.topartists?.artist || [];
    } catch {
      return [];
    }
  }

  async getTopTags(): Promise<LastfmTag[]> {
    try {
      const response = await this.request<{ toptags?: { tag: LastfmTag[] } }>({
        method: "tag.gettoptags",
      });

      return response.toptags?.tag || [];
    } catch {
      return [];
    }
  }
}

export function createLastfmService(config: LastfmConfig): LastfmService {
  return new LastfmService(config);
}
