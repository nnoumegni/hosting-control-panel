'use client';

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Theme } from './api.service';

interface ThemesDB extends DBSchema {
  themes: {
    key: string;
    value: Theme;
    indexes: { 'by-name': string; 'by-category': string };
  };
}

class StorageService {
  private db: IDBPDatabase<ThemesDB> | null = null;
  private dbName = 'mesdoh_local_db';
  private storeName = 'themes';

  async init() {
    if (this.db) return;

    this.db = await openDB<ThemesDB>(this.dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('themes')) {
          const store = db.createObjectStore('themes', { keyPath: '_id' });
          store.createIndex('by-name', 'themeName');
          store.createIndex('by-category', 'categories', { multiEntry: true });
        }
      },
    });
  }

  async storeThemes(themes: Theme[]) {
    await this.init();
    if (!this.db) return;

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);

    // Clear existing themes
    await store.clear();

    // Store new themes
    for (const theme of themes) {
      if (theme._id) {
        await store.put(theme);
      }
    }

    await tx.done;
  }

  async searchThemes(query: string, categories?: string[]): Promise<Theme[]> {
    await this.init();
    if (!this.db) return [];

    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const allThemes = await store.getAll();

    let filtered = allThemes;

    // Filter by categories
    if (categories && categories.length > 0) {
      filtered = filtered.filter((theme) =>
        theme.categories.some((cat) => categories.includes(cat))
      );
    }

    // Filter by search query
    if (query && query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(
        (theme) =>
          theme.themeName?.toLowerCase().includes(lowerQuery) ||
          theme.introText?.toLowerCase().includes(lowerQuery) ||
          theme.description?.toLowerCase().includes(lowerQuery)
      );
    }

    return filtered;
  }

  async getAllThemes(): Promise<Theme[]> {
    await this.init();
    if (!this.db) return [];

    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    return store.getAll();
  }
}

export const storageService = new StorageService();











