import { User, Conversation } from '../src/models/index.js';
import { hashPassword } from '../src/services/authService.js';
import { clearConversationCache } from '../src/services/conversationService.js';

const MIN_PASSWORD_LENGTH = 8;

function validateInput(users) {
  users.forEach((u, i) => {
    const n = i + 1;
    if (!u.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) throw new Error(`AUTHORIZED_USER_${n}_EMAIL is missing or invalid.`);
    if (!u.name) throw new Error(`AUTHORIZED_USER_${n}_NAME is missing.`);
  });
  if (users[0].email === users[1].email) throw new Error('The two authorized emails must be different.');
}

/**
 * Idempotent: creates missing users, never creates a third user, and ensures
 * exactly one conversation between the two. Refuses to run if the database
 * already holds users other than the two configured ones.
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
  const conversation = await Conversation.findOne({ singleton: 'primary' });
  if (!conversation) {
    await Conversation.create({ participants: ids });
    log.push('Created the private conversation');
  } else {
    const same = conversation.participants.map(String).sort().join() === ids.map(String).sort().join();
    if (!same) throw new Error('A conversation already exists between different users. Refusing to change it.');
    log.push('Private conversation already exists');
  }
  clearConversationCache();
  return { userIds: ids, log };
}
