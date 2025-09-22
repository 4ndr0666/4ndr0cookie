// src/workers/encryption.worker.ts

importScripts('/src/utils/sjcl.js'); // Import the SJCL library

const encryptData = (data: string, password: string): string => {
    // sjcl.encrypt returns a JSON string containing the encrypted data
    return sjcl.encrypt(password, data, { ks: 256 });
};

const decryptData = (encryptedData: string, password: string): string => {
    try {
        // sjcl.decrypt expects the encrypted data as a JSON string
        const decrypted = sjcl.decrypt(password, encryptedData);
        return decrypted;
    } catch (error: any) {
        if (error instanceof sjcl.exception.corrupt) {
            throw new Error('Decryption failed: Incorrect password or corrupted file.');
        } else if (error instanceof sjcl.exception.invalid) {
            throw new Error('Decryption failed: Invalid SJCL data format.');
        } else {
            throw new Error(`Decryption failed: ${error.message || 'Unknown error'}`);
        }
    }
};

const stringifyData = (data: any): string => {
    return JSON.stringify(data);
};

const parseData = (data: string): any => {
    return JSON.parse(data);
};

self.onmessage = (event) => {
    const { type, data, password } = event.data;

    try {
        let result;
        if (type === 'encrypt') {
            result = encryptData(data, password);
        } else if (type === 'decrypt') {
            result = decryptData(data, password);
        } else if (type === 'stringify') {
            result = stringifyData(data);
        } else if (type === 'parse') {
            result = parseData(data);
        } else {
            throw new Error('Unknown worker message type');
        }
        self.postMessage({ status: 'success', result });
    } catch (error: any) {
        self.postMessage({ status: 'error', message: error.message });
    }
};
