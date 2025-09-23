// src/workers/encryption.worker.ts

const encryptData = async (data: string, password: string): Promise<string> => {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // Generate a random salt
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    // Derive key from password
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt data
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      dataBuffer
    );
    
    // Combine salt, iv, and encrypted data
    const resultBuffer = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
    resultBuffer.set(salt, 0);
    resultBuffer.set(iv, salt.length);
    resultBuffer.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);
    
    // Convert to base64
    return btoa(String.fromCharCode.apply(null, Array.from(resultBuffer)));
};

const decryptData = async (encryptedData: string, password: string): Promise<string> => {
    try {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      
      // Convert from base64
      const binaryString = atob(encryptedData);
      const encryptedBuffer = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        encryptedBuffer[i] = binaryString.charCodeAt(i);
      }
      
      // Extract salt, iv, and encrypted data
      const salt = encryptedBuffer.slice(0, 16);
      const iv = encryptedBuffer.slice(16, 28);
      const encrypted = encryptedBuffer.slice(28);
      
      // Derive key from password
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );
      
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      
      // Decrypt data
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encrypted
      );
      
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      throw new Error('Decryption failed - incorrect password or corrupted file');
    }
};


self.onmessage = async (event) => {
    const { type, data, password } = event.data;

    try {
        let result;
        if (type === 'encrypt') {
            result = await encryptData(data, password);
        } else if (type === 'decrypt') {
            result = await decryptData(data, password);
        } else {
            throw new Error('Unknown worker message type');
        }
        self.postMessage({ status: 'success', result });
    } catch (error: any) {
        self.postMessage({ status: 'error', message: error.message });
    }
};
