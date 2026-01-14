import type { LLMClient } from '../providers/buildLLM.js';
import type { StepOutcome } from '../planning/schemas.js';
import { getFinalizerSystemPrompt } from '../config/prompts.js';
import { buildSystemMessage, buildUserMessage } from '../utils/messages.js';

/**
 * Synthesize final answer from all step outcomes
 */
export async function finalize(
    llm: LLMClient,
    allOutcomes: StepOutcome[],
    userQuery: string
): Promise<string> {
    const systemPrompt = getFinalizerSystemPrompt();

    const outcomeSummary = allOutcomes
        .map(outcome => `
Step ${outcome.stepId} (${outcome.status}):
${outcome.summary}
`)
        .join('\n');

    const finalizerPrompt = `
Original Question:
${userQuery}

All Step Outcomes:
${outcomeSummary}

Now synthesize a final, well-cited answer to the user's question based on the above findings.
`.trim();

    const messages = [
        buildSystemMessage(systemPrompt),
        buildUserMessage(finalizerPrompt),
    ];

    try {
        const response = await llm.chat(messages);

        if (!response.content) {
            throw new Error('No content in finalizer response');
        }

        console.log('[Finalizer] Final answer generated');
        return response.content;
    } catch (error) {
        console.error('[Finalizer] Failed to generate final answer:', error);
        throw new Error(`Failed to generate final answer: ${error}`);
    }
}
