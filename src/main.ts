#!/usr/bin/env node

import { config } from 'dotenv';
import { loadConfig } from './config/env.js';
import { createLLMClient } from './providers/buildLLM.js';
import { ChromaAdapter } from './vectorstores/chroma/chromaAdapter.js';
import { runAgent } from './runtime/agent.js';
import { formatError } from './utils/errors.js';
import { ConversationManager } from './memory/ConversationManager.js';

// Load environment variables
config();

/**
 * Main CLI entry point
 */
async function main() {
    try {
        // Get question from command line arguments
        const args = process.argv.slice(2);
        const question = args.join(' ').trim();

        if (!question) {
            console.error('Error: No question provided');
            console.error('Usage: npm run agent "Your question here"');
            console.error('Example: npm run agent "How does account validation work?"');
            process.exit(1);
        }

        // Load configuration
        const appConfig = loadConfig();

        // Build LLM client
        const llm = createLLMClient();

        // Build vector store
        const vectorStore = new ChromaAdapter();
        await vectorStore.connect();

        // Initialize memory (conditional)
        let historyContext: string | undefined;
        let memory: ConversationManager | undefined;
        let answer: string;

        if (appConfig.memoryEnabled) {
            memory = new ConversationManager();

            // Check for duplicate/similar query first
            const cached = await memory.findSimilarQuery(question);
            if (cached) {
                console.log(`\n🔄 Found similar previous query (${(cached.similarity * 100).toFixed(0)}% match)`);
                console.log(`   Original: "${cached.query.substring(0, 60)}..."`);
                console.log('   Returning cached response.\n');

                answer = cached.response;

                // Print the cached answer
                console.log('\n📝 Cached Answer:\n');
                console.log(answer);
                console.log('\n');
                return;
            }

            // Get history context for the agent
            historyContext = memory.getHistoryContext();
            if (historyContext) {
                console.log('📚 Loaded conversation history context');
            }
        }

        // Run the agent
        answer = await runAgent(llm, vectorStore, question, historyContext);

        // Save interaction (if memory enabled, passes LLM for potential summarization)
        if (memory) {
            await memory.saveTurn(question, answer, llm);
        }

        // Print the final answer
        console.log('\n📝 Final Answer:\n');
        console.log(answer);
        console.log('\n');

    } catch (error) {
        console.error('\n❌ Error:', formatError(error));
        console.error('\nStack trace:', error);
        process.exit(1);
    }
}

// Run main function
main();
