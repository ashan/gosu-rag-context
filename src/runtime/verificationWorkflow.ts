import type { VectorStoreAdapter } from '../vectorstores/VectorStoreAdapter.js';
import { Verifier, type VerificationResult, type ProposedDiff } from './verifier.js';
import { loadConfig } from '../config/env.js';

/**
 * Configuration for the verification workflow
 */
export interface VerificationWorkflowConfig {
    /** Whether verification is required (default: true from REQUIRE_VERIFICATION) */
    requireVerification?: boolean;
    /** Maximum verification attempts before giving up */
    maxAttempts?: number;
}

/**
 * Result of the verification workflow
 */
export interface VerificationWorkflowResult {
    /** Final verification result */
    verification: VerificationResult;
    /** Whether the diff was ultimately approved */
    approved: boolean;
    /** Number of verification attempts */
    attempts: number;
    /** The original proposed diff */
    proposedDiff: ProposedDiff;
    /** Formatted output for human review */
    formattedOutput: string;
}

/**
 * Run the verification workflow for a proposed diff.
 * 
 * This is the main entry point for verifying code changes.
 * It runs the verifier and formats the output for human review.
 */
export async function runVerificationWorkflow(
    vectorStore: VectorStoreAdapter,
    proposedDiff: ProposedDiff,
    config?: VerificationWorkflowConfig
): Promise<VerificationWorkflowResult> {
    const verifier = new Verifier(vectorStore);
    const appConfig = loadConfig();

    // Check if verification is required
    const requireVerification = config?.requireVerification ??
        (appConfig.requireVerification !== false);

    // If verification is disabled, auto-approve with warning
    if (!requireVerification) {
        const result: VerificationResult = {
            approved: true,
            checks: [],
            errors: [],
            warnings: ['Verification is disabled - diff approved without checks'],
            suggestions: [],
            summary: '⚠️ SKIPPED: Verification is disabled in configuration',
        };

        return {
            verification: result,
            approved: true,
            attempts: 0,
            proposedDiff,
            formattedOutput: formatVerificationOutput(result, proposedDiff),
        };
    }

    // Run verification
    const verification = await verifier.verify(proposedDiff);

    // Format output for human review
    const formattedOutput = formatVerificationOutput(verification, proposedDiff);

    return {
        verification,
        approved: verification.approved,
        attempts: 1,
        proposedDiff,
        formattedOutput,
    };
}

/**
 * Format verification result for human-readable output
 */
function formatVerificationOutput(
    result: VerificationResult,
    diff: ProposedDiff
): string {
    const lines: string[] = [];

    // Header
    lines.push('═'.repeat(70));
    lines.push('📋 CODE CHANGE VERIFICATION REPORT');
    lines.push('═'.repeat(70));
    lines.push('');

    // Summary
    lines.push(`Status: ${result.summary}`);
    lines.push('');

    // File info
    lines.push('📁 Target File');
    lines.push(`   Module: ${diff.module}`);
    lines.push(`   Path: ${diff.filePath}`);
    lines.push(`   Changes: +${diff.stats.additions}/-${diff.stats.deletions} lines`);
    lines.push('');

    // Description
    lines.push('📝 Change Description');
    lines.push(`   ${diff.description}`);
    lines.push('');

    // Check results
    lines.push('✓ Verification Checks');
    lines.push('─'.repeat(40));
    for (const check of result.checks) {
        const icon = check.passed ? '✓' : (check.severity === 'error' ? '✗' : '⚠');
        lines.push(`   ${icon} ${check.name}: ${check.message}`);
        if (check.details) {
            lines.push(`      └─ ${check.details}`);
        }
    }
    lines.push('');

    // Errors (if any)
    if (result.errors.length > 0) {
        lines.push('❌ Blocking Errors (must fix)');
        lines.push('─'.repeat(40));
        for (const error of result.errors) {
            lines.push(`   • ${error}`);
        }
        lines.push('');
    }

    // Warnings (if any)
    if (result.warnings.length > 0) {
        lines.push('⚠️ Warnings (review recommended)');
        lines.push('─'.repeat(40));
        for (const warning of result.warnings) {
            lines.push(`   • ${warning}`);
        }
        lines.push('');
    }

    // Suggestions (if any)
    if (result.suggestions.length > 0) {
        lines.push('💡 Suggestions');
        lines.push('─'.repeat(40));
        for (const suggestion of result.suggestions) {
            lines.push(`   • ${suggestion}`);
        }
        lines.push('');
    }

    // The diff itself
    lines.push('📄 Unified Diff');
    lines.push('─'.repeat(40));
    lines.push('```diff');
    lines.push(diff.diff);
    lines.push('```');
    lines.push('');

    // Footer
    lines.push('═'.repeat(70));
    if (result.approved) {
        lines.push('✅ APPROVED FOR REVIEW');
        lines.push('This diff has passed verification. Review and apply manually.');
    } else {
        lines.push('❌ BLOCKED - CHANGES REQUIRED');
        lines.push('Resolve the errors above before this diff can be applied.');
    }
    lines.push('═'.repeat(70));

    return lines.join('\n');
}

/**
 * Export verification types for use elsewhere
 */
export { type VerificationResult, type ProposedDiff };
