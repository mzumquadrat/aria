import type { SQLiteDatabase } from "../storage/mod.ts";
import type { LastfmTag } from "./types.ts";

export class LastfmCache {
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS lastfm_track_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist TEXT NOT NULL,
        track TEXT NOT NULL,
        tags TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        UNIQUE(artist, track)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_track_tags_lookup 
      ON lastfm_track_tags(artist, track)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_track_tags_expiry 
      ON lastfm_track_tags(expires_at)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS lastfm_artist_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist TEXT NOT NULL,
        tags TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        UNIQUE(artist)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_artist_tags_lookup 
      ON lastfm_artist_tags(artist)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS lastfm_similar_artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist TEXT NOT NULL,
        similar_artists TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        UNIQUE(artist)
      )
    `);
  }

  getTrackTags(artist: string, track: string): LastfmTag[] | null {
    const now = Date.now();
    const result = this.db.queryOne<{ tags: string }>(
      `SELECT tags FROM lastfm_track_tags WHERE artist = ? AND track = ? AND expires_at > ?`,
      artist.toLowerCase(),
      track.toLowerCase(),
      now
    );
    
    if (result) {
      return JSON.parse(result.tags);
    }
    return null;
  }

  setTrackTags(
    artist: string, 
    track: string, 
    tags: LastfmTag[], 
    expiryDays: number = 7
  ): void {
    const now = Date.now();
    const expiresAt = now + (expiryDays * 24 * 60 * 60 * 1000);
    
    this.db.run(
      `INSERT OR REPLACE INTO lastfm_track_tags (artist, track, tags, cached_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
      artist.toLowerCase(),
      track.toLowerCase(),
      JSON.stringify(tags),
      now,
      expiresAt
    );
  }

  getArtistTags(artist: string): LastfmTag[] | null {
    const now = Date.now();
    const result = this.db.queryOne<{ tags: string }>(
      `SELECT tags FROM lastfm_artist_tags WHERE artist = ? AND expires_at > ?`,
      artist.toLowerCase(),
      now
    );
    
    if (result) {
      return JSON.parse(result.tags);
    }
    return null;
  }

  setArtistTags(
    artist: string, 
    tags: LastfmTag[], 
    expiryDays: number = 7
  ): void {
    const now = Date.now();
    const expiresAt = now + (expiryDays * 24 * 60 * 60 * 1000);
    
    this.db.run(
      `INSERT OR REPLACE INTO lastfm_artist_tags (artist, tags, cached_at, expires_at) VALUES (?, ?, ?, ?)`,
      artist.toLowerCase(),
      JSON.stringify(tags),
      now,
      expiresAt
    );
  }

  getSimilarArtists(artist: string): string[] | null {
    const now = Date.now();
    const result = this.db.queryOne<{ similar_artists: string }>(
      `SELECT similar_artists FROM lastfm_similar_artists WHERE artist = ? AND expires_at > ?`,
      artist.toLowerCase(),
      now
    );
    
    if (result) {
      return JSON.parse(result.similar_artists);
    }
    return null;
  }

  setSimilarArtists(
    artist: string, 
    similarArtists: string[], 
    expiryDays: number = 7
  ): void {
    const now = Date.now();
    const expiresAt = now + (expiryDays * 24 * 60 * 60 * 1000);
    
    this.db.run(
      `INSERT OR REPLACE INTO lastfm_similar_artists (artist, similar_artists, cached_at, expires_at) VALUES (?, ?, ?, ?)`,
      artist.toLowerCase(),
      JSON.stringify(similarArtists),
      now,
      expiresAt
    );
  }

  cleanExpired(): number {
    const now = Date.now();

    this.db.run(`DELETE FROM lastfm_track_tags WHERE expires_at <= ?`, now);
    this.db.run(`DELETE FROM lastfm_artist_tags WHERE expires_at <= ?`, now);
    this.db.run(`DELETE FROM lastfm_similar_artists WHERE expires_at <= ?`, now);

    return 0;
  }
}
