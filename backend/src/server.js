import { createApp } from './app.js';
import { assertConfig, config } from './config.js';
import { connectDb } from './db.js';
import { User } from './models/index.js';
import { seedDatabase } from './seed/seed.js';

assertConfig();
const db = await connectDb();
// Zero-config local run: an empty embedded database is filled with the demo data automatically.
if (db.mode === 'embedded' && !(await User.exists({}))) {
  console.log('Empty database: loading demo data...');
  await seedDatabase();
}
createApp().listen(config.port, () => console.log(`API ready on http://localhost:${config.port} (${db.mode} MongoDB, AI: ${config.geminiKey ? 'Gemini + rules' : 'rules only'})`));
