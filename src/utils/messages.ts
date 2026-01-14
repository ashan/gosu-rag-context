import type { Message } from '../providers/buildLLM.js';

/**
 * Build a system message
 */
export function buildSystemMessage(content: string): Message {
    return {
        role: 'system',
        content,
    };
}

/**
 * Build a user message
 */
export function buildUserMessage(content: string): Message {
    return {
        role: 'user',
        content,
    };
}

/**
 * Build an assistant message
 */
export function buildAssistantMessage(content: string): Message {
    return {
        role: 'assistant',
        content,
    };
}

/**
 * Build a tool result message
 */
export function buildToolResultMessage(
    toolCallId: string,
    toolName: string,
    result: any
): Message {
    const resultString = typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2);

    return {
        role: 'tool',
        content: resultString,
        tool_call_id: toolCallId,
        name: toolName,
    };
}
