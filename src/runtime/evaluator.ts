import type { LLMClient } from '../providers/buildLLM.js';
import { PlanDecisionSchema, type StepOutcome, type PlanStep, type PlanDecision } from '../planning/schemas.js';
import { getEvaluatorSystemPrompt } from '../config/prompts.js';
import { buildSystemMessage, buildUserMessage } from '../utils/messages.js';

/**
 * Evaluate the recent step outcome and decide next action
 */
export async function evaluate(
    llm: LLMClient,
    recentOutcome: StepOutcome,
    remainingSteps: PlanStep[]
): Promise<PlanDecision> {
    const systemPrompt = getEvaluatorSystemPrompt();

    const evaluationContext = `
Recent Step Outcome:
- Step ID: ${recentOutcome.stepId}
- Status: ${recentOutcome.status}
- Summary: ${recentOutcome.summary}

Remaining Steps (${remainingSteps.length}):
${remainingSteps.map(s => `- Step ${s.id}: ${s.title}`).join('\n')}

Based on this outcome, decide whether to:
1. "continue" - Move to the next step (we have sufficient info for this step)
2. "finalize" - We have enough information to answer the user's question
3. "revise" - The plan needs adjustment (provide newSteps if revising)
`.trim();

    const messages = [
        buildSystemMessage(systemPrompt),
        buildUserMessage(evaluationContext),
    ];

    try {
        const decision = await llm.structuredOutput(messages, PlanDecisionSchema);
        console.log(`[Evaluator] Decision: ${decision.decision} - ${decision.reason}`);
        return decision;
    } catch (error) {
        console.error('[Evaluator] Failed to make decision:', error);
        // Default to continue if evaluation fails
        return {
            decision: 'continue',
            reason: `Evaluation failed, continuing with plan: ${error}`,
        };
    }
}
