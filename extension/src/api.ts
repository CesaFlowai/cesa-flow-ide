import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';

export interface Run {
  run_id: string;
  status: string;
  task_objective: string;
  objective?: string;
  created_at: string;
  progress_percentage?: number;
}

export interface RunDetail extends Run {
  nodes: RunNode[];
  shared_memory?: any;
}

export interface RunNode {
  id: string;
  agent_name: string;
  status: string;
  output?: { files_written?: string[]; summary?: string };
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface WorkspaceSummary {
  run_id: string;
  files: string[];
  file_count: number;
}

export class OrkestraApi {
  get apiKey(): string {
    return vscode.workspace.getConfiguration('orkestra').get('apiKey', '');
  }

  get serverUrl(): string {
    return vscode.workspace.getConfiguration('orkestra').get('serverUrl', 'http://localhost:8001');
  }

  get isConfigured(): boolean {
    return this.apiKey.startsWith('sk_');
  }

  private request<T>(
    method: string,
    path: string,
    body?: object
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.serverUrl + path);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const data = body ? JSON.stringify(body) : undefined;
      const options: http.RequestOptions = {
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
            } else {
              resolve(parsed as T);
            }
          } catch {
            reject(new Error(`Invalid JSON response: ${raw.slice(0, 100)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      if (data) req.write(data);
      req.end();
    });
  }

  async startRun(objective: string, projectId?: string): Promise<{ run_id: string }> {
    return this.request('POST', '/api/v1/runs', {
      objective,
      ...(projectId ? { project_id: projectId } : {}),
    });
  }

  async listRuns(limit = 20): Promise<Run[]> {
    return this.request('GET', `/api/v1/runs?limit=${limit}`);
  }

  async getRun(runId: string): Promise<RunDetail> {
    return this.request('GET', `/api/v1/runs/${runId}`);
  }

  async cancelRun(runId: string): Promise<void> {
    await this.request('POST', `/api/v1/runs/${runId}/cancel`);
  }

  async getWorkspace(runId: string): Promise<WorkspaceSummary> {
    return this.request('GET', `/api/v1/runs/${runId}/workspace`);
  }

  async getFile(runId: string, filePath: string): Promise<{ content: string; extension: string }> {
    return this.request('GET', `/api/v1/runs/${runId}/files/${filePath}`);
  }

  async getTokens(runId: string): Promise<{ total_tokens: number; total_cost_usd: number }> {
    return this.request('GET', `/api/v1/runs/${runId}/tokens`);
  }

  async getMe(): Promise<{ organization: { name: string; plan: string }; user: { email: string } }> {
    return this.request('GET', '/api/v1/auth/me');
  }

  async inlineEdit(params: {
    code: string;
    instruction: string;
    language: string;
    filename: string;
  }): Promise<{ edited_code: string; summary: string }> {
    return this.request('POST', '/api/v1/inline/edit', params);
  }

  async chat(params: {
    message: string;
    context: string;
  }): Promise<{ reply: string; has_code: boolean; code?: string; language?: string }> {
    return this.request('POST', '/api/v1/inline/chat', params);
  }

  async complete(params: {
    prefix: string;
    suffix: string;
    language: string;
    filename: string;
  }): Promise<{ completion: string }> {
    return this.request('POST', '/api/v1/inline/complete', params);
  }

  openWebSocket(onMessage: (ev: any) => void, onClose: () => void): WebSocket | null {
    try {
      const wsUrl = this.serverUrl
        .replace('http://', 'ws://')
        .replace('https://', 'wss://');
      // Use vscode's built-in fetch/WebSocket (available in extension host)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WS = require('ws');
      const ws = new WS(`${wsUrl}/ws/runs?api_key=${this.apiKey}`);
      ws.on('message', (raw: Buffer) => {
        try { onMessage(JSON.parse(raw.toString())); } catch {}
      });
      ws.on('close', onClose);
      ws.on('error', () => onClose());
      return ws;
    } catch {
      return null;
    }
  }
}
