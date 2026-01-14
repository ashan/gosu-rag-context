import fs from 'fs';
import path from 'path';
import { loadConfig } from './env.js';

export interface AgentPromptConfig {
    collections: string[];
    metadataFields: string[];
    topK: number;
    maxTurns: number;
}

let cachedPrompt: string | null = null;

/**
 * Load agent system prompt from external markdown file with variable substitution
 */
export function loadAgentSystemPrompt(config: AgentPromptConfig): string {
    // Return cached if available
    if (cachedPrompt) {
        return cachedPrompt;
    }

    const envConfig = loadConfig();
    const promptPath = envConfig.agentSystemPromptPath;

    // Resolve relative to project root (process.cwd())
    const absolutePath = path.resolve(process.cwd(), promptPath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(
            `Agent system prompt file not found: ${absolutePath}\n` +
            `Please ensure AGENT_SYSTEM_PROMPT.md exists or set AGENT_SYSTEM_PROMPT_PATH in .env`
        );
    }

    // Read template
    let template = fs.readFileSync(absolutePath, 'utf-8');

    // Perform variable substitution
    const substitutions: Record<string, string> = {
        '{{COLLECTIONS}}': config.collections.join(', '),
        '{{METADATA_FIELDS}}': config.metadataFields.join(', '),
        '{{TOP_K}}': config.topK.toString(),
        '{{MAX_TURNS}}': config.maxTurns.toString(),
    };

    for (const [variable, value] of Object.entries(substitutions)) {
        template = template.replace(new RegExp(escapeRegExp(variable), 'g'), value);
    }

    // Cache and return
    cachedPrompt = template;
    return cachedPrompt;
}

/**
 * Clear cached prompt (useful for testing or hot-reloading)
 */
export function clearPromptCache(): void {
    cachedPrompt = null;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
