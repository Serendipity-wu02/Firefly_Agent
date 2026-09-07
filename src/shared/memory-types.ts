export interface MemoryItem {
  key: string;
  value: string;
  updatedAt: string;
  source?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface MemoryContextSnapshot {
  items: readonly MemoryItem[];
  formattedContext: string;
}
