export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
}

export class CookieManagerModule {
  static async getCookiesForCurrentTab(): Promise<Cookie[]> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.url) {
        const url = new URL(tab.url);
        return await chrome.cookies.getAll({ domain: url.hostname });
      }
      return [];
    } catch (error) {
      console.error('Error getting cookies:', error);
      return [];
    }
  }

  static async deleteCookie(cookie: Cookie): Promise<boolean> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.url) {
        const url = new URL(tab.url);
        await chrome.cookies.remove({
          url: `${url.protocol}//${cookie.domain}${cookie.path}`,
          name: cookie.name
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting cookie:', error);
      return false;
    }
  }

  static async clearAllCookiesForSite(): Promise<boolean> {
    try {
      const cookies = await this.getCookiesForCurrentTab();
      const deletePromises = cookies.map(cookie => this.deleteCookie(cookie));
      await Promise.all(deletePromises);
      return true;
    } catch (error) {
      console.error('Error clearing cookies:', error);
      return false;
    }
  }

  static exportCookies(cookies: Cookie[]): void {
    const dataStr = JSON.stringify(cookies, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `cookies_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  static async importCookies(cookiesData: Cookie[]): Promise<boolean> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url) return false;

      const url = new URL(tab.url);
      const setPromises = cookiesData.map(cookie => {
        return chrome.cookies.set({
          url: `${url.protocol}//${cookie.domain}${cookie.path}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          expirationDate: cookie.expirationDate
        });
      });

      await Promise.all(setPromises);
      return true;
    } catch (error) {
      console.error('Error importing cookies:', error);
      return false;
    }
  }
}
