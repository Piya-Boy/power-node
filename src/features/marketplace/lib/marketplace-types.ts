/**
 * Phase 28 — Ecosystem & Scale: Templates Marketplace types
 */

export type MarketplaceCategory =
  | "productivity"
  | "communication"
  | "data"
  | "ai"
  | "developer"
  | "finance"
  | "marketing"
  | "ecommerce"
  | "social"
  | "other";

export interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  category: MarketplaceCategory;
  tags: string[];
  author: {
    id: string;
    name: string;
    verified: boolean;
  };
  stats: {
    downloads: number;
    stars: number;
    views: number;
  };
  nodeCount: number;
  requiredCredentials: string[];
  previewImageUrl?: string;
  readme?: string;
  version: string;
  publishedAt: Date;
  updatedAt: Date;
  featured: boolean;
  price: "free" | number; // 0 = free, number = credits
}

export interface MarketplaceSearchOptions {
  query?: string;
  category?: MarketplaceCategory;
  tags?: string[];
  freeOnly?: boolean;
  featured?: boolean;
  sortBy?: "downloads" | "stars" | "newest" | "relevance";
  limit?: number;
  offset?: number;
}

export interface MarketplaceSearchResult {
  templates: MarketplaceTemplate[];
  total: number;
  hasMore: boolean;
}
