export interface FileEntry {
  path: string;
  name: string;
  modified?: number;
  title?: string;
}

export interface FileGroup {
  root: string;
  base?: string;
  name: string;
  files: FileEntry[];
}

export interface GroupsResponse {
  groups: FileGroup[];
}

export interface SearchResult {
  path: string;
  name: string;
  snippet: string;
  line: number;
}

export interface Session {
  currentPath: string | null;
  openPaths: string[];
  query: string;
  viewMode: "list" | "tree";
  /** A theme preset id (see lib/themes.ts) or "system". */
  theme: string;
  wideView: boolean;
  showToc: boolean;
  showRaw: boolean;
  fontSize: "small" | "medium" | "large" | "xlarge";
  groupOrder: string[];
  fileOrder: Record<string, string[]>;
  sidebarLabel: Record<string, "name" | "heading">;
  sidebarOpen: boolean;
  /** Run the query against every served file instead of the open one. */
  queryAll: boolean;
  queryHistory: string[];
  savedQueries: string[];
}

export interface FileQueryResult {
  path: string;
  name: string;
  result: string;
}

export interface MultiQueryResponse {
  results: FileQueryResult[];
  error?: string;
}
