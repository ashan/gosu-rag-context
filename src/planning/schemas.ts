import { z } from 'zod';

/**
 * Schema for a single plan step
 */
export const PlanStepSchema = z.object({
    id: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().min(1),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

/**
 * Schema for the complete plan
 */
export const PlanSchema = z.object({
    steps: z.array(PlanStepSchema).min(1),
});

export type Plan = z.infer<typeof PlanSchema>;

/**
 * Schema for the outcome of executing a step
 */
export const StepOutcomeSchema = z.object({
    stepId: z.number().int().positive(),
    status: z.enum(['completed', 'failed']),
    summary: z.string().min(1),
});

export type StepOutcome = z.infer<typeof StepOutcomeSchema>;

/**
 * Schema for the evaluator's decision
 */
export const PlanDecisionSchema = z.object({
    decision: z.enum(['continue', 'finalize', 'revise']),
    reason: z.string().min(1),
    newSteps: z.array(PlanStepSchema).nullable().optional(),
});

export type PlanDecision = z.infer<typeof PlanDecisionSchema>;

/**
 * Helper to create a new plan step
 */
export function createPlanStep(
    id: number,
    title: string,
    description: string,
    status: PlanStep['status'] = 'pending'
): PlanStep {
    return PlanStepSchema.parse({ id, title, description, status });
}

/**
 * Helper to create a plan from steps
 */
export function createPlan(steps: PlanStep[]): Plan {
    return PlanSchema.parse({ steps });
}

/**
 * Helper to create a step outcome
 */
export function createStepOutcome(
    stepId: number,
    status: StepOutcome['status'],
    summary: string
): StepOutcome {
    return StepOutcomeSchema.parse({ stepId, status, summary });
}

/**
 * Helper to create a plan decision
 */
export function createPlanDecision(
    decision: PlanDecision['decision'],
    reason: string,
    newSteps?: PlanStep[]
): PlanDecision {
    return PlanDecisionSchema.parse({ decision, reason, newSteps });
}
