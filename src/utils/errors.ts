/**
 * Base error class for application errors
 */
export class AppError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Configuration error
 */
export class ConfigError extends AppError {
    constructor(message: string) {
        super(`Configuration Error: ${message}`);
    }
}

/**
 * Tool execution error
 */
export class ToolError extends AppError {
    constructor(toolName: string, message: string) {
        super(`Tool "${toolName}" Error: ${message}`);
    }
}

/**
 * Vector store error
 */
export class VectorStoreError extends AppError {
    constructor(message: string) {
        super(`Vector Store Error: ${message}`);
    }
}

/**
 * LLM provider error
 */
export class LLMError extends AppError {
    constructor(provider: string, message: string) {
        super(`LLM Provider "${provider}" Error: ${message}`);
    }
}

/**
 * Type guard for AppError
 */
export function isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
}

/**
 * Format error for user display
 */
export function formatError(error: unknown): string {
    if (isAppError(error)) {
        return error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}
