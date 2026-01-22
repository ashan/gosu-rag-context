#!/usr/bin/env node
/**
 * CLI wrapper for Gosu code ingestion (Loose Coupling Mode)
 * Exectutes gosu-chroma-rag from sibling directory
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// Load environment from consolidated .env
dotenv.config();

async function main() {
    console.log('🚀 Gosu Code Ingestion Pipeline (Wrapper)\n');

    // Assume sibling directory structure
    // /workspace/
    //   ├── gosu-chroma-rag-context (current)
    //   ├── gosu-chroma-rag (target)

    const targetDir = path.resolve('../gosu-chroma-rag');

    if (!fs.existsSync(targetDir)) {
        console.error(`❌ Could not find gosu-chroma-rag at: ${targetDir}`);
        console.error('   Please ensure the project is checked out as a sibling directory.');
        process.exit(1);
    }

    // Ensure cache directory exists in THIS project
    const cacheDir = path.resolve('.cache/code');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Construct env with overrides
    const env = {
        ...process.env,
        // Override paths to map to current project's config
        SOURCE_PATH: path.resolve(process.env.CODE_SOURCE_PATH || './gsrc'),
        CHROMA_COLLECTION: process.env.CODE_COLLECTION || 'guidewire-code',
        RAG_CACHE_PATH: path.join(cacheDir, '.rag-cache.json'),
        INGESTION_DB_PATH: path.join(cacheDir, 'ingestion.db'),
        // Force color output
        FORCE_COLOR: '1'
    };

    console.log(`📁 Source: ${env.SOURCE_PATH}`);
    console.log(`📦 Collection: ${env.CHROMA_COLLECTION}`);
    console.log(`Working Dir: ${targetDir}\n`);

    // Spawn the ingestion process in the sibling directory
    const child = spawn('npm', ['run', 'ingest'], {
        cwd: targetDir,
        env: env,
        stdio: 'inherit'
    });

    child.on('close', (code) => {
        if (code === 0) {
            console.log('\n✅ Gosu code ingestion complete');
        } else {
            console.error(`\n❌ Ingestion failed with code ${code}`);
            console.error('\n💡 Hint: If you see "No native build was found", run:');
            console.error('   npm run fix:deps');
            process.exit(code || 1);
        }
    });

    child.on('error', (err) => {
        console.error('❌ Failed to start subprocess:', err);
    });
}

main();
