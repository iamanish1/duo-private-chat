/**
 * Provisions the authorized people, two by two (1+2, 3+4, …), each pair with
 * its own private conversation.
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
    const users = [];
    for (let n = 1; process.env[`AUTHORIZED_USER_${n}_EMAIL`]; n += 1) users.push(readUser(n));
    const result = await seedAuthorizedUsers(users, { resetPasswords });
    for (const line of result.log) console.log(`  ${line}`);
    console.log(`\nSeed complete. ${users.length} people in ${users.length / 2} private conversation(s).`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
