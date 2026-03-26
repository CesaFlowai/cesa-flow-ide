"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrkestraApi = void 0;
const vscode = __importStar(require("vscode"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
class OrkestraApi {
    get apiKey() {
        return vscode.workspace.getConfiguration('orkestra').get('apiKey', '');
    }
    get serverUrl() {
        return vscode.workspace.getConfiguration('orkestra').get('serverUrl', 'http://localhost:8001');
    }
    get isConfigured() {
        return this.apiKey.startsWith('sk_');
    }
    request(method, path, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.serverUrl + path);
            const isHttps = url.protocol === 'https:';
            const lib = isHttps ? https : http;
            const data = body ? JSON.stringify(body) : undefined;
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method,
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                    ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
                },
                timeout: 30000,
            };
            const req = lib.request(options, (res) => {
                let raw = '';
                res.on('data', (chunk) => raw += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(raw);
                        if ((res.statusCode ?? 0) >= 400) {
                            reject(new Error(parsed.detail || `HTTP ${res.statusCode}`));
                        }
                        else {
                            resolve(parsed);
                        }
                    }
                    catch {
                        reject(new Error(`Invalid JSON response: ${raw.slice(0, 100)}`));
                    }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
            if (data)
                req.write(data);
            req.end();
        });
    }
    async startRun(objective, projectId) {
        return this.request('POST', '/api/v1/runs', {
            objective,
            ...(projectId ? { project_id: projectId } : {}),
        });
    }
    async listRuns(limit = 20) {
        return this.request('GET', `/api/v1/runs?limit=${limit}`);
    }
    async getRun(runId) {
        return this.request('GET', `/api/v1/runs/${runId}`);
    }
    async cancelRun(runId) {
        await this.request('POST', `/api/v1/runs/${runId}/cancel`);
    }
    async getWorkspace(runId) {
        return this.request('GET', `/api/v1/runs/${runId}/workspace`);
    }
    async getFile(runId, filePath) {
        return this.request('GET', `/api/v1/runs/${runId}/files/${filePath}`);
    }
    async getTokens(runId) {
        return this.request('GET', `/api/v1/runs/${runId}/tokens`);
    }
    async getMe() {
        return this.request('GET', '/api/v1/auth/me');
    }
    async inlineEdit(params) {
        return this.request('POST', '/api/v1/inline/edit', params);
    }
    async chat(params) {
        return this.request('POST', '/api/v1/inline/chat', params);
    }
    async complete(params) {
        return this.request('POST', '/api/v1/inline/complete', params);
    }
    openWebSocket(onMessage, onClose) {
        try {
            const wsUrl = this.serverUrl
                .replace('http://', 'ws://')
                .replace('https://', 'wss://');
            const ws = new WebSocket(`${wsUrl}/ws/runs?api_key=${this.apiKey}`);
            ws.onmessage = (ev) => {
                try {
                    onMessage(JSON.parse(ev.data));
                }
                catch { }
            };
            ws.onclose = onClose;
            ws.onerror = () => onClose();
            return ws;
        }
        catch {
            return null;
        }
    }
}
exports.OrkestraApi = OrkestraApi;
//# sourceMappingURL=api.js.map