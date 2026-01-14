/**
 * Batch Queries Example
 * 
 * Demonstrates processing multiple related questions efficiently
 */

import { config } from 'dotenv';
import { OpenAIClient } from '../src/providers/buildLLM.js';
import { ChromaAdapter } from '../src/vectorstores/chroma/chromaAdapter.js';
import { runAgent } from '../src/runtime/agent.js';

config();

async function main() {
    console.log('='.repeat(70));
    console.log('Example 5: Batch Query Processing');
    console.log('='.repeat(70));
    console.log();

    // Related questions about a specific area
    const queries = [
        {
            category: 'Account Management',
            questions: [
                "What classes handle account validation?",
                "How are account addresses validated?",
                "What enhancements exist for the Account entity?",
            ]
        },
        {
            category: 'Database Operations',
            questions: [
                "Find all uses of gw.api.database.Query",
                "What database query patterns are used?",
            ]
        }
    ];

    // Initialize once for all queries
    const llm = new OpenAIClient();
    const vectorStore = new ChromaAdapter();
    await vectorStore.connect();

    // Process each category
    for (const { category, questions } of queries) {
        console.log('\n' + '='.repeat(70));
        console.log(`Category: ${category}`);
        console.log('='.repeat(70));

        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            console.log(`\n[${i + 1}/${questions.length}] ${question}`);
            console.log('-'.repeat(70));

            try {
                const answer = await runAgent(llm, vectorStore, question);
                console.log('\n📝 Answer:');
                // Print first 500 chars for brevity in batch mode
                const summary = answer.length > 500
                    ? answer.substring(0, 500) + '...[truncated]'
                    : answer;
                console.log(summary);
            } catch (error) {
                console.error('❌ Error:', error);
            }
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Batch Processing Complete');
    console.log('='.repeat(70));
}

main().catch(console.error);
