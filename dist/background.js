/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/background/service-worker.ts":
/*!******************************************!*\
  !*** ./src/background/service-worker.ts ***!
  \******************************************/
/***/ (function() {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
console.log('4ndr0cookie Service Worker Loaded');
// Initialize extension
chrome.runtime.onInstalled.addListener(function () {
    console.log('4ndr0cookie extension installed');
});
// Handle Alt+C command for site clearance
chrome.commands.onCommand.addListener(function (command) { return __awaiter(void 0, void 0, void 0, function () {
    var tab_1, url, origin_1, settings, error_1, tab_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!(command === 'clear-site-data')) return [3 /*break*/, 9];
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 9]);
                return [4 /*yield*/, chrome.tabs.query({ active: true, currentWindow: true })];
            case 2:
                tab_1 = (_a.sent())[0];
                if (!tab_1.url)
                    return [2 /*return*/];
                url = new URL(tab_1.url);
                origin_1 = url.origin;
                // Clear all site data
                return [4 /*yield*/, chrome.browsingData.remove({ origins: [origin_1] }, {
                        cookies: true,
                        localStorage: true,
                        indexedDB: true,
                        webSQL: true,
                        cache: true
                    })];
            case 3:
                // Clear all site data
                _a.sent();
                if (!tab_1.id) return [3 /*break*/, 5];
                return [4 /*yield*/, chrome.scripting.executeScript({
                        target: { tabId: tab_1.id },
                        func: function () {
                            try {
                                sessionStorage.clear();
                            }
                            catch (e) {
                                console.log('SessionStorage clear failed:', e);
                            }
                        }
                    })];
            case 4:
                _a.sent();
                _a.label = 5;
            case 5:
                // Show success badge
                chrome.action.setBadgeText({ text: '✓', tabId: tab_1.id });
                chrome.action.setBadgeBackgroundColor({ color: '#15FFFF', tabId: tab_1.id });
                // Clear badge after 2 seconds
                setTimeout(function () {
                    chrome.action.setBadgeText({ text: '', tabId: tab_1.id });
                }, 2000);
                return [4 /*yield*/, chrome.storage.sync.get(['autoReload'])];
            case 6:
                settings = _a.sent();
                if (settings.autoReload !== false) {
                    chrome.tabs.reload(tab_1.id);
                }
                return [3 /*break*/, 9];
            case 7:
                error_1 = _a.sent();
                console.error('Site clearance failed:', error_1);
                return [4 /*yield*/, chrome.tabs.query({ active: true, currentWindow: true })];
            case 8:
                tab_2 = (_a.sent())[0];
                if (tab_2.id) {
                    chrome.action.setBadgeText({ text: '✗', tabId: tab_2.id });
                    chrome.action.setBadgeBackgroundColor({ color: '#FF4444', tabId: tab_2.id });
                    setTimeout(function () {
                        chrome.action.setBadgeText({ text: '', tabId: tab_2.id });
                    }, 2000);
                }
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); });
// Handle messages from popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    switch (request.action) {
        case 'clearSiteData':
            handleSiteClearance()
                .then(function () { return sendResponse({ success: true }); })
                .catch(function (error) { return sendResponse({ success: false, error: error.message }); });
            return true;
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
});
function handleSiteClearance() {
    return __awaiter(this, void 0, void 0, function () {
        var tab, url, origin;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, chrome.tabs.query({ active: true, currentWindow: true })];
                case 1:
                    tab = (_a.sent())[0];
                    if (!tab.url)
                        throw new Error('No active tab');
                    url = new URL(tab.url);
                    origin = url.origin;
                    return [4 /*yield*/, chrome.browsingData.remove({ origins: [origin] }, {
                            cookies: true,
                            localStorage: true,
                            indexedDB: true,
                            webSQL: true,
                            cache: true
                        })];
                case 2:
                    _a.sent();
                    if (!tab.id) return [3 /*break*/, 4];
                    return [4 /*yield*/, chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: function () { return sessionStorage.clear(); }
                        })];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./src/background/service-worker.ts"]();
/******/ 	
/******/ })()
;
//# sourceMappingURL=background.js.map
