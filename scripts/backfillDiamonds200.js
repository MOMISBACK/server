// server/scripts/backfillDiamonds200.js

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: 'server/.env' });

const DEFAULT_DIAMONDS = 200;

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set. Set it in server/.env or your environment.');
  }

  await mongoose.connect(uri);

  const User = require('../models/User');

  const result = await User.updateMany(
    {
      $or: [{ totalDiamonds: { $exists: false } }, { totalDiamonds: null }],
    },
    { $set: { totalDiamonds: DEFAULT_DIAMONDS } }
  );

  const modified = result?.modifiedCount ?? result?.nModified ?? 0;
  const matched = result?.matchedCount ?? result?.n ?? 0;

  // eslint-disable-next-line no-console
  console.log(`✅ Backfill totalDiamonds: matched=${matched}, modified=${modified}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('❌ Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
  });
