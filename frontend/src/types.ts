export interface FileEntry {
  path: string;
  name: string;
  modified?: number;
  title?: string;
}

export interface FileGroup {
  root: string;
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
  theme: "light" | "dark" | "system";
  wideView: boolean;
  showToc: boolean;
  showRaw: boolean;
  groupOrder: string[];
  fileOrder: Record<string, string[]>;
  sidebarLabel: Record<string, "name" | "heading">;
}
