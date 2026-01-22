import * as fs from 'fs';
import * as path from 'path';
import type { LLMClient } from '../providers/buildLLM.js';
import type { Turn } from './ConversationManager.js';

/**
 * Summarizes conversation history to reduce token usage
 */
export class HistorySummarizer {
    private promptTemplate: string;

    constructor() {
        // Load the summarization prompt
        const promptPath = path.join(process.cwd(), 'prompts', 'summarize_history.md');
        if (fs.existsSync(promptPath)) {
            this.promptTemplate = fs.readFileSync(promptPath, 'utf-8');
        } else {
            // Fallback prompt
            this.promptTemplate = `Summarize the following conversation history in 2-3 sentences, focusing on key facts discovered:\n\n{{HISTORY}}\n\nSummary:`;
        }
    }

    /**
     * Summarize a set of conversation turns into a condensed string
     */
    async summarize(llm: LLMClient, turns: Turn[]): Promise<string> {
        if (turns.length === 0) {
            return '';
        }

        // Format turns into readable history
        const historyText = turns.map(turn => {
            const label = turn.role === 'user' ? 'User' : 'Assistant';
            return `${label}: ${turn.content}`;
        }).join('\n\n');

        // Build the prompt
        const prompt = this.promptTemplate.replace('{{HISTORY}}', historyText);

        try {
            // Use LLM to generate summary
            const messages = [
                { role: 'user' as const, content: prompt }
            ];

            const response = await llm.chat(messages, []);
            return response.content?.trim() || '';
        } catch (error) {
            console.error('[HistorySummarizer] Failed to summarize:', error);
            // Fallback: return truncated first and last turn
            if (turns.length >= 2) {
                return `Previous conversation covered: "${turns[0].content.substring(0, 100)}..." and more.`;
            }
            return '';
        }
    }

    /**
     * Estimate token count for a string (rough approximation: ~4 chars per token)
     */
    estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }
}
