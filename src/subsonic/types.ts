export interface SubsonicArtist {
  id: string;
  name: string;
  albumCount?: number;
  coverArt?: string;
  artistImageUrl?: string;
  starred?: string;
}

export interface SubsonicAlbum {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  playCount?: number;
  created?: string;
  starred?: string;
  year?: number;
  genre?: string;
}

export interface SubsonicSong {
  id: string;
  parent?: string;
  title: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  duration?: number;
  playCount?: number;
  discNumber?: number;
  track?: number;
  year?: number;
  genre?: string;
  size?: number;
  contentType?: string;
  suffix?: string;
  path?: string;
  starred?: string;
  created?: string;
  type?: "music" | "podcast" | "audiobook" | "video";
}

export interface SubsonicGenre {
  name: string;
  songCount?: number;
  albumCount?: number;
}

export interface SubsonicPlaylist {
  id: string;
  name: string;
  comment?: string;
  owner?: string;
  public?: boolean;
  songCount?: number;
  duration?: number;
  created?: string;
  changed?: string;
  coverArt?: string;
}

export interface SubsonicMusicFolder {
  id: string;
  name: string;
}

export interface SubsonicArtistIndex {
  name: string;
  artists: SubsonicArtist[];
}

export interface SubsonicIndexes {
  lastModified?: number;
  ignoredArticles?: string;
  index: SubsonicArtistIndex[];
}

export interface SubsonicDirectory {
  id: string;
  parent?: string;
  name: string;
  starred?: string;
  child: SubsonicSong[];
}

export interface SubsonicSearchResult {
  artist?: SubsonicArtist[];
  album?: SubsonicAlbum[];
  song?: SubsonicSong[];
}

export interface SubsonicError {
  code: number;
  message: string;
}

export interface SubsonicResponse {
  status: "ok" | "failed";
  version: string;
  type?: string;
  serverVersion?: string;
  openSubsonic?: boolean;
  error?: SubsonicError;
  // Response data is spread directly on this object, not in a "data" property
  [key: string]: unknown;
}

export interface SubsonicConfig {
  serverUrl: string;
  username: string;
  password: string;
  defaultPlaylistPrefix?: string;
}

export interface RandomSongsParams {
  size?: number | undefined;
  genre?: string | undefined;
  fromYear?: number | undefined;
  toYear?: number | undefined;
  musicFolderId?: string | undefined;
}

export interface SearchParams {
  query: string;
  artistCount?: number;
  artistOffset?: number;
  albumCount?: number;
  albumOffset?: number;
  songCount?: number;
  songOffset?: number;
  musicFolderId?: string;
}

export interface UpdatePlaylistParams {
  name?: string | undefined;
  comment?: string | undefined;
  public?: boolean | undefined;
  songIdsToAdd?: string[] | undefined;
  songIndicesToRemove?: number[] | undefined;
}

export const SUBSONIC_ERROR_CODES: Record<number, string> = {
  0: "A generic error",
  10: "Required parameter is missing",
  20: "Incompatible Subsonic REST protocol version. Client must upgrade",
  30: "Incompatible Subsonic REST protocol version. Server must upgrade",
  40: "Wrong username or password",
  41: "Token authentication not supported for LDAP users",
  50: "User is not authorized for the given operation",
  60: "The trial period for the Subsonic server is over",
  70: "The requested data was not found",
};
