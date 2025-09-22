declare function importScripts(...urls: string[]): void;

declare namespace sjcl {
    function encrypt(password: string, data: string, options?: object): string;
    function decrypt(password: string, encryptedData: string): string;

    namespace exception {
        class corrupt extends Error {}
        class invalid extends Error {}
    }
}
