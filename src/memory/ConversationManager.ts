import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../config/env.js';

export interface Turn {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export class ConversationManager {
    private historyPath: string;
    private history: Turn[] = [];

    constructor(baseDir: string = process.cwd()) {
        this.historyPath = path.join(baseDir, '.conversation_history.json');
        this.loadHistory();
    }

    private loadHistory() {
        if (fs.existsSync(this.historyPath)) {
            try {
                const data = fs.readFileSync(this.historyPath, 'utf-8');
                this.history = JSON.parse(data);
            } catch (error) {
                console.warn('[Memory] Failed to load history, starting fresh.', error);
                this.history = [];
            }
        }
    }

    public saveTurn(userQuery: string, agentResponse: string) {
        const config = loadConfig();
        const timestamp = Date.now();
        this.history.push({ role: 'user', content: userQuery, timestamp });
        this.history.push({ role: 'assistant', content: agentResponse, timestamp });

        // Use configured retention size
        const retentionLimit = config.historyRetentionSize;
        if (this.history.length > retentionLimit) {
            this.history = this.history.slice(this.history.length - retentionLimit);
        }

        this.persist();
    }

    private persist() {
        try {
            fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2));
        } catch (error) {
            console.error('[Memory] Failed to save history:', error);
        }
    }

    public getHistoryContext(/* optional override */ limit?: number): string {
        if (this.history.length === 0) {
            return '';
        }

        // Use configured context size (defaulting to config if argument not provided)
        const config = loadConfig();
        const contextLimit = limit ?? config.historyContextSize;

        // Get last N messages
        const recentHistory = this.history.slice(-contextLimit);

        return recentHistory.map(turn => {
            const label = turn.role === 'user' ? 'User' : 'Assistant';
            return `${label}: ${turn.content}`;
        }).join('\n\n');
    }

    public clearHistory() {
        this.history = [];
        if (fs.existsSync(this.historyPath)) {
            fs.unlinkSync(this.historyPath);
        }
    }
}
