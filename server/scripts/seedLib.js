import { User, Conversation } from '../src/models/index.js';
import { hashPassword } from '../src/services/authService.js';
import { clearConversationCache } from '../src/services/conversationService.js';

const MIN_PASSWORD_LENGTH = 8;

function validateInput(users) {
  if (users.length < 2 || users.length % 2) throw new Error('Authorized users must come in pairs (1+2, 3+4, …).');
  users.forEach((u, i) => {
    const n = i + 1;
    if (!u.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) throw new Error(`AUTHORIZED_USER_${n}_EMAIL is missing or invalid.`);
    if (!u.name) throw new Error(`AUTHORIZED_USER_${n}_NAME is missing.`);
  });
  if (new Set(users.map((u) => u.email)).size !== users.length) throw new Error('The authorized emails must all be different.');
}

/**
 * Idempotent: creates missing users and exactly one private conversation per
 * pair (users 1+2, 3+4, …). Never creates anyone not listed, and refuses to
 * run if the database already holds users other than the configured ones.
 */
export async function seedAuthorizedUsers(users, { resetPasswords = false } = {}) {
  validateInput(users);
  const log = [];
  const emails = users.map((u) => u.email);

  const strangers = await User.countDocuments({ email: { $nin: emails } });
  if (strangers > 0) {
    throw new Error(`Found ${strangers} user(s) not listed in AUTHORIZED_USER_*_EMAIL. Remove them before seeding.`);
  }

  const ids = [];
  for (const [i, u] of users.entries()) {
    const existing = await User.findOne({ email: u.email });
    if (!existing) {
      if (!u.password || u.password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`AUTHORIZED_USER_${i + 1}_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      const created = await User.create({ email: u.email, name: u.name, passwordHash: await hashPassword(u.password) });
      ids.push(created._id);
      log.push(`Created user ${u.name}`);
      continue;
    }
    const update = { name: u.name };
    if (resetPasswords) {
      if (!u.password || u.password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`AUTHORIZED_USER_${i + 1}_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      update.passwordHash = await hashPassword(u.password);
      // Changing the password signs out every existing session.
      await User.updateOne({ _id: existing._id }, { $inc: { tokenVersion: 1 } });
    }
    await User.updateOne({ _id: existing._id }, { $set: update });
    ids.push(existing._id);
    log.push(`User ${u.name} already exists${resetPasswords ? ' (password reset)' : ''}`);
  }

  await Conversation.syncIndexes();
  for (let i = 0; i < ids.length; i += 2) {
    const pair = [ids[i], ids[i + 1]];
    const names = `${users[i].name} & ${users[i + 1].name}`;
    const existing = await Conversation.find({ participants: { $in: pair } }).lean();
    const same = existing.length === 1 && existing[0].participants.map(String).sort().join() === pair.map(String).sort().join();
    if (same) {
      log.push(`Private conversation of ${names} already exists`);
    } else if (existing.length) {
      throw new Error(`${names} already belong to a different conversation. Refusing to change it.`);
    } else {
      await Conversation.create({ participants: pair });
      log.push(`Created the private conversation of ${names}`);
    }
  }
  clearConversationCache();
  return { userIds: ids, log };
}
