/**
 * Provisions the two authorized people and their single conversation.
 *   npm run seed            create users (or update name), keep existing passwords
 *   npm run seed -- --reset-passwords   also re-hash passwords from .env
 * Credentials come only from environment variables.
 */
import { config } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { seedAuthorizedUsers } from './seedLib.js';

const readUser = (n) => ({
  email: process.env[`AUTHORIZED_USER_${n}_EMAIL`]?.trim().toLowerCase(),
  name: process.env[`AUTHORIZED_USER_${n}_NAME`]?.trim(),
  password: process.env[`AUTHORIZED_USER_${n}_PASSWORD`],
});

async function main() {
  if (!config.mongoUri) throw new Error('MONGODB_URI is not set.');
  const resetPasswords = process.argv.includes('--reset-passwords');
  await connectDatabase(config.mongoUri);
  try {
    const result = await seedAuthorizedUsers([readUser(1), readUser(2)], { resetPasswords });
    for (const line of result.log) console.log(`  ${line}`);
    console.log('\nSeed complete. Exactly two users and one conversation exist.');
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
