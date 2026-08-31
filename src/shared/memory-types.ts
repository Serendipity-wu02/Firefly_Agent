export interface MemoryItem {
  key: string;
  value: string;
  updatedAt: string;
  source?: string;
}

export interface MemoryContextSnapshot {
  items: readonly MemoryItem[];
  formattedContext: string;
}
