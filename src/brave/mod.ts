import type { BraveSearchConfig } from "../config/types.ts";

export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface BraveApiResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

export class BraveSearchService {
  private config: BraveSearchConfig;

  constructor(config: BraveSearchConfig) {
    this.config = config;
  }

  async search(query: string): Promise<SearchResponse> {
    const url = new URL(`${this.config.baseUrl}/web/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(this.config.count));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.config.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Brave Search failed: ${response.status} ${error}`);
    }

    const data: BraveApiResponse = await response.json();

    const results: SearchResult[] = (data.web?.results ?? [])
      .filter((r): r is BraveWebResult & { title: string; url: string } =>
        r.title !== undefined && r.url !== undefined
      )
      .map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description ?? "",
      }));

    return {
      query,
      results,
    };
  }

  async searchWithSnippet(query: string, maxLength: number = 500): Promise<string> {
    const response = await this.search(query);

    if (response.results.length === 0) {
      return `No results found for "${query}"`;
    }

    const snippets = response.results
      .slice(0, 5)
      .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`)
      .join("\n\n");

    if (snippets.length > maxLength) {
      return snippets.slice(0, maxLength) + "...";
    }

    return snippets;
  }
}

export function createBraveSearchService(config: BraveSearchConfig): BraveSearchService {
  return new BraveSearchService(config);
}
