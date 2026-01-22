import type { LLMClient, Message } from '../providers/buildLLM.js';
import type { VectorStoreAdapter } from '../vectorstores/VectorStoreAdapter.js';
import { StepOutcomeSchema, type PlanStep, type StepOutcome } from '../planning/schemas.js';
import { getToolRegistry } from '../tools/registry.js';
import { getStepSystemPrompt, getStepDeveloperPrompt } from '../config/prompts.js';
import { buildSystemMessage, buildUserMessage, buildToolResultMessage } from '../utils/messages.js';
import { loadConfig } from '../config/env.js';
import { ToolError } from '../utils/errors.js';

/**
 * Run a single step from the plan
 */
export async function runStep(
    llm: LLMClient,
    vectorStore: VectorStoreAdapter,
    step: PlanStep,
    userQuery: string
): Promise<StepOutcome> {
    const config = loadConfig();
    const maxTurns = config.maxTurns;
    const registry = getToolRegistry();
    const tools = registry.getToolSpecs();

    // Build initial messages
    const messages: Message[] = [
        buildSystemMessage(getStepSystemPrompt()),
        {
            role: 'user',
            content: getStepDeveloperPrompt(),
        },
        buildUserMessage(`Original question: ${userQuery}\n\nCurrent step to complete:\n${step.title}\n\n${step.description}`),
    ];

    console.log(`\n[Step ${step.id}] Starting: ${step.title}`);

    let turnCount = 0;

    // Tool execution loop
    while (turnCount < maxTurns) {
        turnCount++;

        const response = await llm.chat(messages, tools, { parallel_tool_calls: false });

        // Check if we have tool calls
        if (response.tool_calls && response.tool_calls.length > 0) {
            // Add assistant message with ALL tool calls first
            messages.push({
                role: 'assistant',
                content: response.content || null,
                tool_calls: response.tool_calls,
            } as any);

            // Execute ALL tool calls and add responses for each
            for (const toolCall of response.tool_calls) {
                if (!toolCall) continue;

                console.log(`[Step ${step.id}] Tool call: ${toolCall.function.name}`);

                try {
                    const tool = registry.getTool(toolCall.function.name);
                    if (!tool) {
                        throw new ToolError(toolCall.function.name, 'Tool not found');
                    }

                    // Parse arguments
                    const args = JSON.parse(toolCall.function.arguments);
                    const parsedArgs = tool.parse(args);

                    // Execute
                    const result = await tool.execute(parsedArgs, { vectorStore });

                    // Add tool result message
                    messages.push(buildToolResultMessage(
                        toolCall.id,
                        toolCall.function.name,
                        result
                    ));

                    console.log(`[Step ${step.id}] Tool result received (${typeof result})`);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error(`[Step ${step.id}] Tool execution error:`, errorMessage);

                    // Add error as tool result
                    messages.push(buildToolResultMessage(
                        toolCall.id,
                        toolCall.function.name,
                        { error: errorMessage }
                    ));
                }
            }
        } else {
            // No more tool calls - agent has enough information
            console.log(`[Step ${step.id}] Step complete after ${turnCount} turns`);
            break;
        }
    }

    if (turnCount >= maxTurns) {
        console.warn(`[Step ${step.id}] Reached max turns (${maxTurns})`);
    }

    // Request structured outcome
    const outcomeMessages: Message[] = [
        ...messages,
        buildUserMessage(
            `Summarize the outcome of this step. Return a structured response with:\n` +
            `- stepId: ${step.id}\n` +
            `- status: "completed" or "failed"\n` +
            `- summary: brief summary of what was found or accomplished`
        ),
    ];

    try {
        const outcome = await llm.structuredOutput(outcomeMessages, StepOutcomeSchema);
        console.log(`[Step ${step.id}]Status: ${outcome.status}`);
        return outcome;
    } catch (error) {
        console.error(`[Step ${step.id}] Failed to get structured outcome:`, error);
        // Return a failed outcome
        return {
            stepId: step.id,
            status: 'failed',
            summary: `Failed to complete step: ${error}`,
        };
    }
}
