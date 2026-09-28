import fs from 'fs';
import path from 'path';

/**
 * Automatically pushes all required environment variables from .env.local to Vercel.
 * Usage:
 *   node scripts/push-vercel-env.mjs <VERCEL_TOKEN> [PROJECT_NAME_OR_ID]
 *
 * Example:
 *   node scripts/push-vercel-env.mjs VERCEL_TOKEN_HERE taf-IT-helpdesk
 */

const envPath = path.resolve(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local not found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    envVars[key] = val;
  }
}

const token = process.argv[2] || process.env.VERCEL_TOKEN;
const projectName = process.argv[3] || 'taf-IT-helpdesk';

console.log('📋 Variables to push:');
for (const [k, v] of Object.entries(envVars)) {
  console.log(`   - ${k}: ${v.slice(0, 15)}... (${v.length} chars)`);
}

if (!token) {
  console.log('\n======================================================');
  console.log('💡 HOW TO PUSH ENVIRONMENT VARIABLES TO VERCEL');
  console.log('======================================================');
  console.log('Option 1: In Vercel Web Dashboard (Quickest & standard):');
  console.log('  1. Open your project on vercel.com');
  console.log('  2. Go to: Settings -> Environment Variables');
  console.log('  3. Paste each variable from .env.local:\n');
  for (const [k, v] of Object.entries(envVars)) {
    console.log(`Key:   ${k}`);
    console.log(`Value: ${v}\n`);
  }
  console.log('Option 2: Push via API using this script:');
  console.log('  Create a token at https://vercel.com/account/tokens');
  console.log('  Then run:');
  console.log('    node scripts/push-vercel-env.mjs <YOUR_VERCEL_TOKEN> <PROJECT_NAME>\n');
  process.exit(0);
}

async function pushToVercel() {
  console.log(`\n🚀 Pushing environment variables to Vercel project: ${projectName}...`);

  for (const [key, value] of Object.entries(envVars)) {
    try {
      const res = await fetch(`https://api.vercel.com/v10/projects/${projectName}/env`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          value,
          type: 'encrypted',
          target: ['production', 'preview', 'development'],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.code === 'ENV_ALREADY_EXISTS') {
          console.log(`ℹ️  ${key}: already exists on Vercel`);
        } else {
          console.warn(`⚠️  ${key}: ${data?.error?.message || res.statusText}`);
        }
      } else {
        console.log(`✅  ${key}: successfully pushed to Vercel!`);
      }
    } catch (err) {
      console.error(`❌  Failed to push ${key}:`, err.message);
    }
  }

  console.log('\n🎉 Finished pushing environment variables to Vercel!');
}

pushToVercel().catch(console.error);
