export interface ClipboardItem {
  id: string;
  content: string;
  timestamp: number;
  type: 'text' | 'url' | 'email';
}

export class ClipboardManagerModule {
  private static readonly STORAGE_KEY = 'clipboardHistory';
  private static readonly MAX_HISTORY_SIZE = 100;

  static async getHistory(): Promise<ClipboardItem[]> {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      return result[this.STORAGE_KEY] || [];
    } catch (error) {
      console.error('Error getting clipboard history:', error);
      return [];
    }
  }

  static async addToHistory(content: string): Promise<void> {
    try {
      const history = await this.getHistory();
      
      // Check if content already exists
      const existingIndex = history.findIndex(item => item.content === content);
      if (existingIndex !== -1) {
        // Update timestamp and move to top
        history[existingIndex].timestamp = Date.now();
        history.sort((a, b) => b.timestamp - a.timestamp);
      } else {
        // Add new item
        const newItem: ClipboardItem = {
          id: Date.now().toString(),
          content,
          timestamp: Date.now(),
          type: this.detectContentType(content)
        };
        
        history.unshift(newItem);
        
        // Limit history size
        if (history.length > this.MAX_HISTORY_SIZE) {
          history.splice(this.MAX_HISTORY_SIZE);
        }
      }

      await chrome.storage.local.set({ [this.STORAGE_KEY]: history });
    } catch (error) {
      console.error('Error adding to clipboard history:', error);
    }
  }

  static async removeFromHistory(id: string): Promise<void> {
    try {
      const history = await this.getHistory();
      const updatedHistory = history.filter(item => item.id !== id);
      await chrome.storage.local.set({ [this.STORAGE_KEY]: updatedHistory });
    } catch (error) {
      console.error('Error removing from clipboard history:', error);
    }
  }

  static async clearHistory(): Promise<void> {
    try {
      await chrome.storage.local.set({ [this.STORAGE_KEY]: [] });
    } catch (error) {
      console.error('Error clearing clipboard history:', error);
    }
  }

  static async copyToClipboard(content: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(content);
      await this.addToHistory(content);
      return true;
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      return false;
    }
  }

  private static detectContentType(content: string): 'text' | 'url' | 'email' {
    if (content.match(/^https?:\/\//)) return 'url';
    if (content.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return 'email';
    return 'text';
  }

  static async cleanupOldEntries(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const history = await this.getHistory();
      const now = Date.now();
      const filteredHistory = history.filter(item => now - item.timestamp < maxAge);
      
      if (filteredHistory.length !== history.length) {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: filteredHistory });
      }
    } catch (error) {
      console.error('Error cleaning up clipboard history:', error);
    }
  }
}
