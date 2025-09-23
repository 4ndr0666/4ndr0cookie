export class PasswordRequiredError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'PasswordRequiredError';
  }
}

export interface SerializedCookie {
  domain: string;
  expirationDate?: number;
  hostOnly: boolean;
  httpOnly: boolean;
  name: string;
  path: string;
  sameSite: chrome.cookies.SameSiteStatus;
  secure: boolean;
  storeId: string;
  value: string;
}

export const parseCookieBackup = async (payload: string, password?: string, isEncrypted?: boolean): Promise<{ cookies: SerializedCookie[] }> => {
  if (isEncrypted) {
    if (!password) {
      throw new PasswordRequiredError('Password is required for encrypted backups.');
    }
    // This is where the decryption logic would go. 
    // For now, we'll just throw an error if the password is wrong.
    if (password !== 'password') { // Replace with actual decryption
        throw new Error('Invalid password');
    }
    // Assuming decryption is successful, parse the JSON
    try {
        const cookies = JSON.parse(payload);
        return { cookies };
    } catch (e) {
        throw new Error('Failed to parse decrypted backup file.');
    }
  } else {
    try {
        const cookies = JSON.parse(payload);
        return { cookies };
    } catch (e) {
        throw new Error('Failed to parse backup file. Ensure it is a valid JSON file.');
    }
  }
};

export const buildCookieSetDetails = (cookie: SerializedCookie, availableStoreIds: string[]): chrome.cookies.SetDetails => {
    const details: chrome.cookies.SetDetails = {
        url: `${cookie.secure ? 'https:' : 'http:'}://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        storeId: cookie.storeId,
    };

    if (cookie.expirationDate) {
        details.expirationDate = cookie.expirationDate;
    }

    if (!availableStoreIds.includes(cookie.storeId)) {
        console.warn(`Cookie store ID "${cookie.storeId}" not found. Using default store.`);
        delete details.storeId;
    }

    return details;
};

export const getAvailableCookieStoreIds = async (): Promise<string[]> => {
    const stores = await chrome.cookies.getAllCookieStores();
    return stores.map(s => s.id);
}
