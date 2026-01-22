import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../config/env.js';
import { createEmbeddingProvider } from '../embeddings/Factory.js';
import type { IEmbeddingProvider } from '../interfaces.js';
import type { LLMClient } from '../providers/buildLLM.js';
import { HistorySummarizer } from './HistorySummarizer.js';

export interface Turn {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    embedding?: number[];  // Stored embedding for duplicate detection
}

export interface CachedResponse {
    query: string;
    response: string;
    similarity: number;
    timestamp: number;
}

export class ConversationManager {
    private historyPath: string;
    private history: Turn[] = [];
    private summarizedOlderContext: string = '';
    private embedder: IEmbeddingProvider | null = null;
    private summarizer: HistorySummarizer;

    constructor(baseDir: string = process.cwd()) {
        this.historyPath = path.join(baseDir, '.conversation_history.json');
        this.summarizer = new HistorySummarizer();
        this.loadHistory();
    }

    /**
     * Initialize the embedding provider (lazy initialization)
     */
    private async getEmbedder(): Promise<IEmbeddingProvider> {
        if (!this.embedder) {
            this.embedder = createEmbeddingProvider();
        }
        return this.embedder;
    }

    private loadHistory() {
        if (fs.existsSync(this.historyPath)) {
            try {
                const data = fs.readFileSync(this.historyPath, 'utf-8');
                const parsed = JSON.parse(data);

                // Handle both old format (array) and new format (object with summary)
                if (Array.isArray(parsed)) {
                    this.history = parsed;
                    this.summarizedOlderContext = '';
                } else {
                    this.history = parsed.history || [];
                    this.summarizedOlderContext = parsed.summarizedContext || '';
                }
            } catch (error) {
                console.warn('[Memory] Failed to load history, starting fresh.', error);
                this.history = [];
                this.summarizedOlderContext = '';
            }
        }
    }

    /**
     * Find a similar query in history using embedding similarity
     * Returns cached response if similarity exceeds threshold
     */
    async findSimilarQuery(query: string): Promise<CachedResponse | null> {
        const config = loadConfig();

        // Only check if we have history and caching is enabled
        if (this.history.length === 0 || config.memoryCacheThreshold <= 0) {
            return null;
        }

        try {
            const embedder = await this.getEmbedder();
            const [queryEmbedding] = await embedder.embed([query]);

            // Find user turns with embeddings
            const userTurns = this.history.filter(t => t.role === 'user' && t.embedding);

            let bestMatch: CachedResponse | null = null;
            let bestSimilarity = 0;

            for (let i = 0; i < userTurns.length; i++) {
                const turn = userTurns[i];
                if (!turn.embedding) continue;

                const similarity = this.cosineSimilarity(queryEmbedding, turn.embedding);

                if (similarity > bestSimilarity && similarity >= config.memoryCacheThreshold) {
                    bestSimilarity = similarity;

                    // Find the assistant response following this user query
                    const turnIndex = this.history.indexOf(turn);
                    const assistantTurn = this.history[turnIndex + 1];

                    if (assistantTurn && assistantTurn.role === 'assistant') {
                        bestMatch = {
                            query: turn.content,
                            response: assistantTurn.content,
                            similarity,
                            timestamp: turn.timestamp,
                        };
                    }
                }
            }

            if (bestMatch) {
                console.log(`[Memory] Found similar query (${(bestMatch.similarity * 100).toFixed(1)}% match)`);
            }

            return bestMatch;
        } catch (error) {
            console.warn('[Memory] Duplicate detection failed:', error);
            return null;
        }
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        return denominator === 0 ? 0 : dotProduct / denominator;
    }

    /**
     * Save a conversation turn with optional embedding
     */
    async saveTurn(userQuery: string, agentResponse: string, llm?: LLMClient) {
        const config = loadConfig();
        const timestamp = Date.now();

        // Generate embedding for the user query (for future duplicate detection)
        let userEmbedding: number[] | undefined;
        try {
            const embedder = await this.getEmbedder();
            [userEmbedding] = await embedder.embed([userQuery]);
        } catch (error) {
            console.warn('[Memory] Failed to generate embedding for caching:', error);
        }

        this.history.push({
            role: 'user',
            content: userQuery,
            timestamp,
            embedding: userEmbedding
        });
        this.history.push({
            role: 'assistant',
            content: agentResponse,
            timestamp
        });

        // Check if we need to summarize older history
        if (config.memorySummarizationEnabled && llm) {
            await this.maybeSummarize(llm);
        }

        // Apply retention limit
        const retentionLimit = config.historyRetentionSize;
        if (this.history.length > retentionLimit) {
            this.history = this.history.slice(this.history.length - retentionLimit);
        }

        this.persist();
    }

    /**
     * Check if summarization is needed and perform it
     */
    private async maybeSummarize(llm: LLMClient) {
        const config = loadConfig();
        const contextSize = config.historyContextSize;
        const maxTokens = config.memoryMaxTokens;

        // Get older turns (not in context window)
        const olderTurns = this.history.slice(0, -contextSize);

        // Estimate current context tokens
        const currentContext = this.getHistoryContext();
        const estimatedTokens = this.summarizer.estimateTokens(currentContext);

        // If under limit or no older turns, no need to summarize
        if (estimatedTokens <= maxTokens || olderTurns.length === 0) {
            return;
        }

        console.log(`[Memory] Context exceeds ${maxTokens} tokens (est: ${estimatedTokens}), summarizing older history...`);

        try {
            // Combine existing summary with older turns for new summary
            const turnsToSummarize = olderTurns.slice(-10); // Only summarize last 10 older turns
            const newSummary = await this.summarizer.summarize(llm, turnsToSummarize);

            if (newSummary) {
                // Append to existing summary
                if (this.summarizedOlderContext) {
                    this.summarizedOlderContext = `${this.summarizedOlderContext}\n${newSummary}`;
                } else {
                    this.summarizedOlderContext = newSummary;
                }

                // Trim summary if it gets too long
                if (this.summarizedOlderContext.length > 1000) {
                    this.summarizedOlderContext = this.summarizedOlderContext.slice(-1000);
                }

                console.log(`[Memory] ✓ History summarized`);
            }
        } catch (error) {
            console.warn('[Memory] Summarization failed:', error);
        }
    }

    private persist() {
        try {
            // Store in new format with summary
            const data = {
                history: this.history,
                summarizedContext: this.summarizedOlderContext,
                lastUpdated: new Date().toISOString(),
            };
            fs.writeFileSync(this.historyPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('[Memory] Failed to save history:', error);
        }
    }

    /**
     * Get formatted history context for the LLM
     * Includes summarized older context + recent turns
     */
    public getHistoryContext(limit?: number): string {
        if (this.history.length === 0 && !this.summarizedOlderContext) {
            return '';
        }

        const config = loadConfig();
        const contextLimit = limit ?? config.historyContextSize;

        // Get recent turns
        const recentHistory = this.history.slice(-contextLimit);
        const recentText = recentHistory.map(turn => {
            const label = turn.role === 'user' ? 'User' : 'Assistant';
            return `${label}: ${turn.content}`;
        }).join('\n\n');

        // Combine with summarized older context
        if (this.summarizedOlderContext) {
            return `[Previous conversation summary]\n${this.summarizedOlderContext}\n\n[Recent conversation]\n${recentText}`;
        }

        return recentText;
    }

    /**
     * Get the summarized older context separately
     */
    public getSummarizedContext(): string {
        return this.summarizedOlderContext;
    }

    public clearHistory() {
        this.history = [];
        this.summarizedOlderContext = '';
        if (fs.existsSync(this.historyPath)) {
            fs.unlinkSync(this.historyPath);
        }
    }

    /**
     * Get the number of stored turns
     */
    public getTurnCount(): number {
        return this.history.length;
    }
}
