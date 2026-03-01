export interface LastfmTag {
  name: string;
  count?: number;
  url?: string;
}

export interface LastfmTrack {
  name: string;
  artist: string;
  mbid?: string;
  url?: string;
  duration?: number;
  listeners?: number;
  playcount?: number;
  toptags?: LastfmTag[];
}

export interface LastfmArtist {
  name: string;
  mbid?: string;
  url?: string;
  listeners?: number;
  playcount?: number;
  similar?: LastfmArtist[];
  toptags?: LastfmTag[];
}

export interface LastfmAlbum {
  name: string;
  artist: string;
  mbid?: string;
  url?: string;
}

export interface LastfmImage {
  size: "small" | "medium" | "large" | "extralarge";
  url: string;
}

export interface LastfmSearchTrack {
  name: string;
  artist: string;
  url?: string;
  listeners?: number;
  mbid?: string;
  image?: LastfmImage[];
}

export interface LastfmSearchResult {
  tracks: LastfmSearchTrack[];
  totalResults?: number;
}

export interface LastfmTopTracks {
  tracks: LastfmTrack[];
  attr?: {
    tag: string;
    page: string;
    perPage: string;
    totalPages: string;
    total: string;
  };
}

export interface LastfmUserTrack {
  name: string;
  artist: string;
  album?: string;
  mbid?: string;
  url?: string;
  date?: {
    uts: number;
    text: string;
  };
  loved?: boolean;
}

export interface LastfmUserTopTrack extends LastfmTrack {
  playcount: number;
}

export interface LastfmUserTopArtist {
  name: string;
  playcount: number;
  mbid?: string;
  url?: string;
}

export interface LastfmErrorResponse {
  error: number;
  message: string;
}

export const MOOD_TAG_MAP: Record<string, string[]> = {
  energetic: ["energetic", "upbeat", "high energy", "pump up", "energetic rock", "party"],
  chill: ["chill", "relaxing", "mellow", "calm", "ambient", "downtempo", "peaceful"],
  melancholic: ["sad", "melancholy", "melancholic", "depressing", "heartbreak", "emotional"],
  happy: ["happy", "feel good", "uplifting", "joyful", "cheerful", "optimistic"],
  focus: ["focus", "concentration", "study", "work", "productive", "thinking"],
  romantic: ["romantic", "love", "sensual", "intimate", "passionate", "valentines"],
  angry: ["angry", "rage", "aggressive", "intense", "frustration", "furious"],
  nostalgic: ["nostalgic", "memories", "throwback", "classic", "retro", "old school"],
  dark: ["dark", "moody", "atmospheric", "gloomy", "ominous", "brooding"],
  peaceful: ["peaceful", "serene", "tranquil", "meditation", "spa", "soothing"],
};

export function getMoodTags(mood: string): string[] {
  const normalizedMood = mood.toLowerCase().trim();
  return MOOD_TAG_MAP[normalizedMood] || [normalizedMood];
}

export function calculateTagMatchScore(
  trackTags: LastfmTag[],
  targetTags: string[]
): number {
  if (!trackTags.length || !targetTags.length) return 0;

  const targetSet = new Set(targetTags.map((t) => t.toLowerCase()));
  let matchCount = 0;
  let totalWeight = 0;

  for (const tag of trackTags) {
    const tagName = tag.name.toLowerCase();
    const weight = tag.count || 1;
    totalWeight += weight;

    if (targetSet.has(tagName)) {
      matchCount += weight;
    } else {
      for (const target of targetSet) {
        if (tagName.includes(target) || target.includes(tagName)) {
          matchCount += weight * 0.5;
          break;
        }
      }
    }
  }

  return totalWeight > 0 ? Math.round((matchCount / totalWeight) * 100) : 0;
}
