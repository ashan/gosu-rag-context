/**
 * Complex Query Example
 * 
 * Demonstrates a multi-step investigation requiring multiple tools
 */

import { config } from 'dotenv';
import { OpenAIClient } from '../src/providers/buildLLM.js';
import { ChromaAdapter } from '../src/vectorstores/chroma/chromaAdapter.js';
import { runAgent } from '../src/runtime/agent.js';

config();

async function main() {
    console.log('='.repeat(70));
    console.log('Example 2: Complex Multi-Step Investigation');
    console.log('='.repeat(70));
    console.log();

    const question = "How does account validation work in the ACC project? Show me the implementation and explain the validation rules.";
    console.log(`Question: ${question}\n`);

    console.log('Expected Strategy:');
    console.log('1. Search for validation-related symbols');
    console.log('2. Retrieve relevant files');
    console.log('3. Analyze validation rules');
    console.log('4. Synthesize explanation with citations\n');

    // Initialize
    const llm = new OpenAIClient();
    const vectorStore = new ChromaAdapter();
    await vectorStore.connect();

    // Run query
    const answer = await runAgent(llm, vectorStore, question);

    console.log('\n' + '='.repeat(70));
    console.log('📝 Final Answer:');
    console.log('='.repeat(70));
    console.log(answer);
    console.log();
}

main().catch(console.error);
