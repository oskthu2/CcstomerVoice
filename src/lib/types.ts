export type ProductStatus = "current" | "future";

export interface Product {
  name: string;
  status: ProductStatus;
  description?: string;
  aliases?: string[];
}

export interface Statement {
  id: string;
  text: string;
  author?: string;
  role?: string;
  source: "kiosk" | "example";
  createdAt: string;
  status: "pending" | "processing" | "done" | "error";
  error?: string;
}

/** A part of a statement that an Inera product (current or future) could address. */
export interface Insight {
  id: string;
  statementId: string;
  excerpt: string;
  need: string;
  themeId: string;
  product: string;
  productStatus: ProductStatus;
  rationale?: string;
  createdAt: string;
}

export interface Theme {
  id: string;
  name: string;
  description?: string;
  /** Sorting generation; a re-sort starts a new one so old themes aren't reused. */
  gen?: number;
}

export interface State {
  version: number;
  statements: Statement[];
  insights: Insight[];
  themes: Theme[];
  generation?: number;
}

export interface SeedVoice {
  author: string;
  role: string;
  text: string;
}
