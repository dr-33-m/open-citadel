export type Collection = {
  id: string;
  name: string;
  icon: string;
  count: number;
};

// Collections are not yet synced from the file system,
// so we keep mock data for the library screen.
export const mockCollections: Collection[] = [
  { id: '1', name: 'Alchemy', icon: '📜', count: 14 },
  { id: '2', name: 'Statecraft', icon: '🏛', count: 32 },
  { id: '3', name: 'Philosophy', icon: '🔮', count: 21 },
  { id: '4', name: 'Strategy', icon: '⚔️', count: 8 },
];
