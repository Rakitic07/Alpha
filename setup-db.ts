import * as cp from 'child_process';
import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// Load env
const envLocalPath = join(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl || !dbUrl.startsWith('postgresql')) {
  console.error('❌ Please set correct DATABASE_URL in .env.local starting with postgresql://');
  process.exit(1);
}

async function main() {
  try {
    // Push schema to Neon Postgres
    console.log('🚀 Pushing schema to Neon Postgres...');
    cp.execSync('npx prisma db push', { stdio: 'inherit' });

    // Generate Prisma Client
    console.log('⏳ Generating Prisma Client...');
    cp.execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Done!');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error applying schema:', err);
    process.exit(1);
  }
}

main();
