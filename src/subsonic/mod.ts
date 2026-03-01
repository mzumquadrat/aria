import { crypto } from "@std/crypto";
import { encodeHex } from "@std/encoding/hex";
import type {
  SubsonicConfig,
  SubsonicArtist,
  SubsonicAlbum,
  SubsonicSong,
  SubsonicGenre,
  SubsonicPlaylist,
  SubsonicMusicFolder,
  SubsonicIndexes,
  SubsonicDirectory,
  SubsonicSearchResult,
  RandomSongsParams,
  SearchParams,
  UpdatePlaylistParams,
  SubsonicResponse,
} from "./types.ts";

export class SubsonicService {
  private serverUrl: string;
  private username: string;
  private password: string;
  private defaultPlaylistPrefix: string;
  private clientName = "Aria";
  private apiVersion = "1.16.1";

  constructor(config: SubsonicConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, "");
    this.username = config.username;
    this.password = config.password;
    this.defaultPlaylistPrefix = config.defaultPlaylistPrefix ?? "Aria: ";
  }

  private async generateAuthParams(): Promise<Record<string, string>> {
    const salt = this.generateSalt(8);
    const token = await this.generateToken(this.password, salt);
    
    return {
      u: this.username,
      t: token,
      s: salt,
      v: this.apiVersion,
      c: this.clientName,
      f: "json",
    };
  }

  private generateSalt(length: number): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async md5(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("MD5", msgBuffer);
    return encodeHex(hashBuffer);
  }

  private generateToken(password: string, salt: string): Promise<string> {
    return this.md5(password + salt);
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string | number | undefined> = {}
  ): Promise<T> {
    const authParams = await this.generateAuthParams();
    const url = new URL(`${this.serverUrl}/rest/${endpoint}`);
    
    for (const [key, value] of Object.entries(authParams)) {
      url.searchParams.set(key, value);
    }
    
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`Subsonic HTTP error: ${response.status}`);
    }

    const data = await response.json();
    const subsonicResponse = data["subsonic-response"] as SubsonicResponse<T>;

    if (subsonicResponse.status === "failed") {
      const errorCode = subsonicResponse.error?.code ?? 0;
      const errorMsg = subsonicResponse.error?.message ?? "Unknown error";
      throw new Error(`Subsonic error ${errorCode}: ${errorMsg}`);
    }

    return subsonicResponse.data as T;
  }

  async ping(): Promise<boolean> {
    try {
      await this.request("ping.view");
      return true;
    } catch {
      return false;
    }
  }

  async getMusicFolders(): Promise<SubsonicMusicFolder[]> {
    const data = await this.request<{ musicFolders: { musicFolder: SubsonicMusicFolder[] } }>(
      "getMusicFolders.view"
    );
    return data.musicFolders?.musicFolder ?? [];
  }

  async getIndexes(musicFolderId?: string): Promise<SubsonicIndexes> {
    const params: Record<string, string | undefined> = {};
    if (musicFolderId !== undefined) {
      params.musicFolderId = musicFolderId;
    }
    
    const data = await this.request<{ indexes: SubsonicIndexes }>(
      "getIndexes.view",
      params
    );
    return data.indexes;
  }

  async getArtists(musicFolderId?: string): Promise<SubsonicArtist[]> {
    const params: Record<string, string | undefined> = {};
    if (musicFolderId !== undefined) {
      params.musicFolderId = musicFolderId;
    }
    
    const data = await this.request<{ artists: { index: Array<{ artist: SubsonicArtist[] }> } }>(
      "getArtists.view",
      params
    );
    
    const artists: SubsonicArtist[] = [];
    for (const index of data.artists?.index ?? []) {
      artists.push(...(index.artist ?? []));
    }
    return artists;
  }

  async getArtist(id: string): Promise<{ artist: SubsonicArtist; albums: SubsonicAlbum[] }> {
    const data = await this.request<{ artist: SubsonicArtist & { album?: SubsonicAlbum[] } }>(
      "getArtist.view",
      { id }
    );
    
    return {
      artist: { id: data.artist.id, name: data.artist.name },
      albums: data.artist.album ?? [],
    };
  }

  async getAlbum(id: string): Promise<{ album: SubsonicAlbum; songs: SubsonicSong[] }> {
    const data = await this.request<{ album: SubsonicAlbum & { song?: SubsonicSong[] } }>(
      "getAlbum.view",
      { id }
    );
    
    const { song: _, ...albumWithoutSong } = data.album;
    
    return {
      album: albumWithoutSong as SubsonicAlbum,
      songs: data.album.song ?? [],
    };
  }

  async getSong(id: string): Promise<SubsonicSong | null> {
    const data = await this.request<{ song: SubsonicSong }>(
      "getSong.view",
      { id }
    );
    return data.song;
  }

  async getGenres(): Promise<SubsonicGenre[]> {
    const data = await this.request<{ genres: { genre: SubsonicGenre[] } }>(
      "getGenres.view"
    );
    return data.genres?.genre ?? [];
  }

  async getRandomSongs(params: RandomSongsParams = {}): Promise<SubsonicSong[]> {
    const requestParams: Record<string, string | number | undefined> = {
      size: params.size ?? 10,
      genre: params.genre,
      fromYear: params.fromYear,
      toYear: params.toYear,
      musicFolderId: params.musicFolderId,
    };
    
    const data = await this.request<{ randomSongs: { song: SubsonicSong[] } }>(
      "getRandomSongs.view",
      requestParams
    );
    return data.randomSongs?.song ?? [];
  }

  async getSongsByGenre(genre: string, count: number = 50, offset: number = 0): Promise<SubsonicSong[]> {
    const data = await this.request<{ songsByGenre: { song: SubsonicSong[] } }>(
      "getSongsByGenre.view",
      { genre, count, offset }
    );
    return data.songsByGenre?.song ?? [];
  }

  async search3(params: SearchParams): Promise<SubsonicSearchResult> {
    const requestParams: Record<string, string | number | undefined> = {
      query: params.query,
      artistCount: params.artistCount ?? 20,
      artistOffset: params.artistOffset ?? 0,
      albumCount: params.albumCount ?? 20,
      albumOffset: params.albumOffset ?? 0,
      songCount: params.songCount ?? 20,
      songOffset: params.songOffset ?? 0,
      musicFolderId: params.musicFolderId,
    };
    
    const data = await this.request<{
      searchResult3: {
        artist?: SubsonicArtist[];
        album?: SubsonicAlbum[];
        song?: SubsonicSong[];
      };
    }>("search3.view", requestParams);
    
    return {
      artist: data.searchResult3?.artist ?? [],
      album: data.searchResult3?.album ?? [],
      song: data.searchResult3?.song ?? [],
    };
  }

  async getPlaylists(): Promise<SubsonicPlaylist[]> {
    const data = await this.request<{ playlists: { playlist: SubsonicPlaylist[] } }>(
      "getPlaylists.view"
    );
    return data.playlists?.playlist ?? [];
  }

  async getPlaylist(id: string): Promise<{ playlist: SubsonicPlaylist; songs: SubsonicSong[] }> {
    const data = await this.request<{ playlist: SubsonicPlaylist & { entry?: SubsonicSong[] } }>(
      "getPlaylist.view",
      { id }
    );
    
    const { entry: _, ...playlistWithoutEntry } = data.playlist;
    
    return {
      playlist: playlistWithoutEntry as SubsonicPlaylist,
      songs: data.playlist.entry ?? [],
    };
  }

  async createPlaylist(name: string, songIds: string[] = []): Promise<SubsonicPlaylist> {
    const params: Record<string, string | number | undefined> = {
      name: this.defaultPlaylistPrefix + name,
    };
    
    songIds.forEach((id, index) => {
      params[`songId[${index}]`] = id;
    });
    
    const data = await this.request<{ playlist: SubsonicPlaylist }>(
      "createPlaylist.view",
      params
    );
    
    return data.playlist;
  }

  async updatePlaylist(id: string, params: UpdatePlaylistParams): Promise<void> {
    const requestParams: Record<string, string | number | undefined> = {
      playlistId: id,
      name: params.name ? this.defaultPlaylistPrefix + params.name : undefined,
      comment: params.comment,
      public: params.public !== undefined ? (params.public ? "true" : "false") : undefined,
    };
    
    params.songIdsToAdd?.forEach((songId, index) => {
      requestParams[`songIdToAdd[${index}]`] = songId;
    });
    
    params.songIndicesToRemove?.forEach((index, i) => {
      requestParams[`songIndexToRemove[${i}]`] = index;
    });
    
    await this.request("updatePlaylist.view", requestParams);
  }

  async deletePlaylist(id: string): Promise<void> {
    await this.request("deletePlaylist.view", { id });
  }

  async getSimilarSongs(id: string, count: number = 50): Promise<SubsonicSong[]> {
    const data = await this.request<{ similarSongs: { song: SubsonicSong[] } }>(
      "getSimilarSongs2.view",
      { id, count }
    );
    return data.similarSongs?.song ?? [];
  }

  async getTopSongs(artist: string, count: number = 50): Promise<SubsonicSong[]> {
    const data = await this.request<{ topSongs: { song: SubsonicSong[] } }>(
      "getTopSongs.view",
      { artist, count }
    );
    return data.topSongs?.song ?? [];
  }

  async getStarred(): Promise<{ artists: SubsonicArtist[]; albums: SubsonicAlbum[]; songs: SubsonicSong[] }> {
    const data = await this.request<{
      starred: {
        artist?: SubsonicArtist[];
        album?: SubsonicAlbum[];
        song?: SubsonicSong[];
      };
    }>("getStarred2.view");
    
    return {
      artists: data.starred?.artist ?? [],
      albums: data.starred?.album ?? [],
      songs: data.starred?.song ?? [],
    };
  }

  async getMusicDirectory(id: string): Promise<SubsonicDirectory> {
    const data = await this.request<{ directory: SubsonicDirectory }>(
      "getMusicDirectory.view",
      { id }
    );
    return data.directory;
  }
}

export function createSubsonicService(config: SubsonicConfig): SubsonicService {
  return new SubsonicService(config);
}
