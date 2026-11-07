import mongoose from 'mongoose';
import { createApp } from './app.js';
import { assertConfig, config } from './config.js';

assertConfig();
mongoose.set('strictQuery', true);
await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
createApp().listen(config.port, () => console.log(`API ready on :${config.port} (${config.env}, AI: ${config.anthropicKey ? 'Claude + rules' : 'rules only'})`));
