import { getGuidewireSources } from '../config/env.js';
import type { VectorStoreAdapter } from '../vectorstores/VectorStoreAdapter.js';

/**
 * Verification check result
 */
export interface VerificationCheck {
    /** Check name */
    name: string;
    /** Whether the check passed */
    passed: boolean;
    /** Severity: 'error' blocks the change, 'warning' is informational */
    severity: 'error' | 'warning';
    /** Description of the issue or success */
    message: string;
    /** Additional details */
    details?: string;
}

/**
 * Complete verification result
 */
export interface VerificationResult {
    /** Whether all blocking checks passed */
    approved: boolean;
    /** Individual check results */
    checks: VerificationCheck[];
    /** Blocking issues (severity: 'error') */
    errors: string[];
    /** Non-blocking concerns (severity: 'warning') */
    warnings: string[];
    /** Suggestions for improvement */
    suggestions: string[];
    /** Overall summary */
    summary: string;
}

/**
 * Proposed diff information for verification
 */
export interface ProposedDiff {
    /** Target Guidewire module */
    module: string;
    /** Relative file path within module */
    filePath: string;
    /** Original file content (empty for new files) */
    originalContent: string;
    /** Proposed modified content */
    modifiedContent: string;
    /** Description of the change */
    description: string;
    /** The unified diff string */
    diff: string;
    /** Diff statistics */
    stats: {
        additions: number;
        deletions: number;
    };
}

/**
 * Configuration for generated file detection
 */
const GENERATED_FILE_PATTERNS = [
    /\.generated\.(gs|gsx)$/i,
    /Generated\.(gs|gsx)$/i,
    /_gen\.(gs|gsx)$/i,
];

/**
 * Maximum allowed diff size (lines changed)
 */
const MAX_DIFF_SIZE = 500;

/**
 * Verifier Agent - performs Guidewire-specific sanity checks on proposed changes.
 * Verification is BLOCKING - changes are rejected until all checks pass.
 */
export class Verifier {
    private vectorStore: VectorStoreAdapter;

    constructor(vectorStore: VectorStoreAdapter) {
        this.vectorStore = vectorStore;
    }

    /**
     * Verify a proposed diff against all Guidewire-specific rules
     */
    async verify(diff: ProposedDiff): Promise<VerificationResult> {
        const checks: VerificationCheck[] = [];
        const suggestions: string[] = [];

        // Run all verification checks
        checks.push(await this.checkModuleExists(diff));
        checks.push(this.checkGeneratedFile(diff));
        checks.push(this.checkDiffSize(diff));
        checks.push(await this.checkReferencedEntities(diff));
        checks.push(this.checkMinimalChange(diff));
        checks.push(await this.checkIdiomaticPatterns(diff));

        // Separate errors and warnings
        const errors = checks
            .filter(c => !c.passed && c.severity === 'error')
            .map(c => c.message);
        const warnings = checks
            .filter(c => !c.passed && c.severity === 'warning')
            .map(c => c.message);

        // All error-level checks must pass
        const approved = errors.length === 0;

        // Generate suggestions based on checks
        if (diff.stats.additions > 50) {
            suggestions.push('Consider breaking large changes into smaller, focused commits');
        }
        if (!diff.description || diff.description.length < 10) {
            suggestions.push('Provide a more detailed description of what this change accomplishes');
        }

        // Create summary
        const summary = this.generateSummary(approved, errors, warnings, checks);

        return {
            approved,
            checks,
            errors,
            warnings,
            suggestions,
            summary,
        };
    }

    /**
     * Check 1: Verify the target module exists in configuration
     */
    private async checkModuleExists(diff: ProposedDiff): Promise<VerificationCheck> {
        const sources = getGuidewireSources();
        const moduleExists = sources.some(
            s => s.module.toLowerCase() === diff.module.toLowerCase()
        );

        return {
            name: 'module_exists',
            passed: moduleExists,
            severity: 'error',
            message: moduleExists
                ? `Module '${diff.module}' is configured`
                : `Module '${diff.module}' not found in GUIDEWIRE_SOURCES configuration`,
            details: moduleExists
                ? undefined
                : `Available modules: ${sources.map(s => s.module).join(', ') || 'none'}`,
        };
    }

    /**
     * Check 2: Block modifications to generated files
     */
    private checkGeneratedFile(diff: ProposedDiff): VerificationCheck {
        const isGenerated = GENERATED_FILE_PATTERNS.some(pattern =>
            pattern.test(diff.filePath)
        );

        return {
            name: 'not_generated_file',
            passed: !isGenerated,
            severity: 'error',
            message: isGenerated
                ? `Cannot modify generated file: ${diff.filePath}`
                : 'Target file is not a generated file',
            details: isGenerated
                ? 'Generated files are auto-created and should not be manually modified. Change the generator or source file instead.'
                : undefined,
        };
    }

    /**
     * Check 3: Ensure diff is not excessively large
     */
    private checkDiffSize(diff: ProposedDiff): VerificationCheck {
        const totalChanges = diff.stats.additions + diff.stats.deletions;
        const isReasonable = totalChanges <= MAX_DIFF_SIZE;

        return {
            name: 'reasonable_diff_size',
            passed: isReasonable,
            severity: 'warning',
            message: isReasonable
                ? `Diff size is reasonable (${totalChanges} lines changed)`
                : `Large diff detected: ${totalChanges} lines changed (recommended: ≤${MAX_DIFF_SIZE})`,
            details: isReasonable
                ? undefined
                : 'Consider breaking this into smaller, focused changes for easier review and safer deployment.',
        };
    }

    /**
     * Check 4: Verify referenced entities exist in the codebase
     */
    private async checkReferencedEntities(diff: ProposedDiff): Promise<VerificationCheck> {
        // Extract potential entity references from the modified content
        const entityPattern = /(?:extends|implements|uses|new\s+)\s+(\w+)/g;
        const typePattern = /:\s*(\w+)(?:\s*[=;,)])/g;

        const referencedEntities = new Set<string>();
        let match: RegExpExecArray | null;

        while ((match = entityPattern.exec(diff.modifiedContent)) !== null) {
            if (match[1] && !this.isPrimitiveType(match[1])) {
                referencedEntities.add(match[1]);
            }
        }
        while ((match = typePattern.exec(diff.modifiedContent)) !== null) {
            if (match[1] && !this.isPrimitiveType(match[1])) {
                referencedEntities.add(match[1]);
            }
        }

        // Skip if no entities found (could be a simple change)
        if (referencedEntities.size === 0) {
            return {
                name: 'entities_exist',
                passed: true,
                severity: 'warning',
                message: 'No complex entity references detected',
            };
        }

        // Check a sample of entities (limit to 5 for performance)
        const entitiesToCheck = Array.from(referencedEntities).slice(0, 5);
        const missingEntities: string[] = [];

        for (const entity of entitiesToCheck) {
            const hits = await this.vectorStore.semanticSearch(
                `class ${entity} entity`,
                3,
                { className: entity }
            );
            const found = hits.some(h =>
                h.metadata.className?.toLowerCase() === entity.toLowerCase()
            );
            if (!found) {
                missingEntities.push(entity);
            }
        }

        const allFound = missingEntities.length === 0;

        return {
            name: 'entities_exist',
            passed: allFound,
            severity: 'warning', // Warning, not error - could be external types
            message: allFound
                ? `All checked entity references found (${entitiesToCheck.length} checked)`
                : `Some entity references not found: ${missingEntities.join(', ')}`,
            details: allFound
                ? undefined
                : 'These entities may be external types, or could be typos. Verify they exist before applying the change.',
        };
    }

    /**
     * Check 5: Ensure the change is minimal (not replacing entire files)
     */
    private checkMinimalChange(diff: ProposedDiff): VerificationCheck {
        // If original is empty, this is a new file
        if (!diff.originalContent.trim()) {
            return {
                name: 'minimal_change',
                passed: true,
                severity: 'warning',
                message: 'New file creation - no minimal change check needed',
            };
        }

        const originalLines = diff.originalContent.split('\n').length;
        const deletionRatio = diff.stats.deletions / originalLines;
        const isMinimal = deletionRatio < 0.8; // Flag if replacing >80% of file

        return {
            name: 'minimal_change',
            passed: isMinimal,
            severity: 'warning',
            message: isMinimal
                ? `Change preserves ${Math.round((1 - deletionRatio) * 100)}% of original file`
                : `Replacing ${Math.round(deletionRatio * 100)}% of the original file`,
            details: isMinimal
                ? undefined
                : 'Large file replacements are risky. Consider incremental changes or verify this is intentional.',
        };
    }

    /**
     * Check 6: Look for similar patterns to ensure idiomatic code
     */
    private async checkIdiomaticPatterns(diff: ProposedDiff): Promise<VerificationCheck> {
        // Extract added code (lines starting with +)
        const addedLines = diff.diff
            .split('\n')
            .filter(line => line.startsWith('+') && !line.startsWith('+++'))
            .map(line => line.substring(1))
            .join('\n');

        if (addedLines.length < 20) {
            return {
                name: 'idiomatic_patterns',
                passed: true,
                severity: 'warning',
                message: 'Change too small for pattern analysis',
            };
        }

        // Search for similar patterns
        const hits = await this.vectorStore.semanticSearch(
            addedLines.substring(0, 500), // Use first 500 chars
            3,
            { module: diff.module }
        );

        const hasPatternMatch = hits.length > 0 && (hits[0]?.score || 0) > 0.7;

        return {
            name: 'idiomatic_patterns',
            passed: hasPatternMatch,
            severity: 'warning',
            message: hasPatternMatch
                ? 'Added code matches existing patterns in the codebase'
                : 'Added code may not follow existing patterns',
            details: hasPatternMatch
                ? `Similar pattern found in: ${hits[0]?.metadata.relativePath}`
                : 'Consider using find_similar_changes to discover existing patterns before implementing.',
        };
    }

    /**
     * Check if a type name is a primitive or built-in
     */
    private isPrimitiveType(typeName: string): boolean {
        const primitives = new Set([
            'String', 'string', 'int', 'Integer', 'long', 'Long',
            'boolean', 'Boolean', 'double', 'Double', 'float', 'Float',
            'Object', 'void', 'null', 'List', 'Map', 'Set', 'Array',
            'Date', 'DateTime', 'BigDecimal', 'Currency',
        ]);
        return primitives.has(typeName);
    }

    /**
     * Generate a human-readable summary
     */
    private generateSummary(
        approved: boolean,
        errors: string[],
        warnings: string[],
        checks: VerificationCheck[]
    ): string {
        const passedCount = checks.filter(c => c.passed).length;
        const totalCount = checks.length;

        if (approved) {
            if (warnings.length === 0) {
                return `✅ APPROVED: All ${totalCount} verification checks passed.`;
            }
            return `✅ APPROVED with ${warnings.length} warning(s): ${passedCount}/${totalCount} checks passed.`;
        }

        return `❌ BLOCKED: ${errors.length} error(s) must be resolved. ${passedCount}/${totalCount} checks passed.`;
    }
}

/**
 * Create a verifier instance
 */
export function createVerifier(vectorStore: VectorStoreAdapter): Verifier {
    return new Verifier(vectorStore);
}
