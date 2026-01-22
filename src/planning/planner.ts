import type { LLMClient } from '../providers/buildLLM.js';
import { PlanSchema, type Plan } from './schemas.js';
import { getPlannerSystemPrompt } from '../config/prompts.js';

/**
 * Create a plan from a user query
 */
export async function planFromQuery(llm: LLMClient, userQuery: string, historyContext?: string): Promise<Plan> {
    const systemPrompt = getPlannerSystemPrompt();

    const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
            role: 'user' as const,
            content: historyContext
                ? `Previous Conversation Context:\n${historyContext}\n\nCurrent User Query: ${userQuery}`
                : userQuery
        },
    ];

    try {
        const plan = await llm.structuredOutput(messages, PlanSchema);
        console.log(`[Planner] Created plan with ${plan.steps.length} steps`);
        return plan;
    } catch (error) {
        console.error('[Planner] Failed to create plan:', error);
        throw new Error(`Failed to create plan: ${error}`);
    }
}
