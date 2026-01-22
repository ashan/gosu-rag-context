import type { LLMClient } from '../providers/buildLLM.js';
import type { VectorStoreAdapter } from '../vectorstores/VectorStoreAdapter.js';
import { planFromQuery } from '../planning/planner.js';
import { runStep } from './stepRunner.js';
import { evaluate } from './evaluator.js';
import { finalize } from './finalizer.js';
import type { Plan, StepOutcome } from '../planning/schemas.js';

/**
 * Main agent orchestrator - runs the full RAG pipeline
 */
export async function runAgent(
    llm: LLMClient,
    vectorStore: VectorStoreAdapter,
    question: string,
    historyContext?: string
): Promise<string> {
    console.log('\n='.repeat(70));
    console.log('🤖 RAG Agent Starting');
    console.log('='.repeat(70));
    console.log(`Question: ${question}\n`);

    if (historyContext) {
        console.log('[Agent] History context provided');
    }

    // Health check
    console.log('[Agent] Checking vector store connectivity...');
    const isHealthy = await vectorStore.healthCheck();
    if (!isHealthy) {
        throw new Error('Vector store health check failed. Ensure ChromaDB is running.');
    }
    console.log('[Agent] ✓ Vector store connected\n');

    // Step 1: Create plan
    console.log('[Agent] Creating execution plan...');
    let plan: Plan = await planFromQuery(llm, question, historyContext);
    console.log(`[Agent] Plan created with ${plan.steps.length} steps\n`);

    // Step 2: Execute plan
    const allOutcomes: StepOutcome[] = [];
    let currentStepIndex = 0;

    while (currentStepIndex < plan.steps.length) {
        const currentStep = plan.steps[currentStepIndex];

        if (!currentStep) {
            break;
        }

        // Run the step
        const outcome = await runStep(llm, vectorStore, currentStep, question);
        allOutcomes.push(outcome);

        // Get remaining steps
        const remainingSteps = plan.steps.slice(currentStepIndex + 1);

        // Evaluate
        const decision = await evaluate(llm, outcome, remainingSteps);

        if (decision.decision === 'finalize') {
            console.log('\n[Agent] Evaluator decided to finalize\n');
            break;
        } else if (decision.decision === 'revise') {
            console.log('\n[Agent] Evaluator decided to revise plan\n');
            if (decision.newSteps && decision.newSteps.length > 0) {
                // Replace remaining steps with new steps
                plan.steps = [
                    ...plan.steps.slice(0, currentStepIndex + 1),
                    ...decision.newSteps,
                ];
                console.log(`[Agent] Plan revised: ${decision.newSteps.length} new steps added\n`);
            }
        } else {
            // Continue to next step
            console.log(`[Agent] Continuing to next step\n`);
        }

        currentStepIndex++;
    }

    // Step 3: Finalize
    console.log('[Agent] Generating final answer...\n');
    const finalAnswer = await finalize(llm, allOutcomes, question);

    console.log('\n' + '='.repeat(70));
    console.log('✅ RAG Agent Complete');
    console.log('='.repeat(70) + '\n');

    return finalAnswer;
}
