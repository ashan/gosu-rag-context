/**
 * File Analysis Example
 * 
 * Demonstrates retrieving and analyzing specific files
 */

import { config } from 'dotenv';
import { OpenAIClient } from '../src/providers/buildLLM.js';
import { ChromaAdapter } from '../src/vectorstores/chroma/chromaAdapter.js';
import { runAgent } from '../src/runtime/agent.js';

config();

async function main() {
    console.log('='.repeat(70));
    console.log('Example 4: File Analysis');
    console.log('='.repeat(70));
    console.log();

    const question = "Show me the structure of the AccountEnhancement_ACC.gsx file and explain its main components";
    console.log(`Question: ${question}\n`);

    console.log('Expected Tool Usage:');
    console.log('1. symbol_search to find the file');
    console.log('2. get_file to retrieve complete contents');
    console.log('3. Analysis of structure and components\n');

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
