import { createArenaServer } from './app';

const server = createArenaServer();
const port = await server.listen(Number(process.env.PORT) || 3000);
console.log(`MINI ARENA SHOOTER running at http://localhost:${port}`);
process.on('SIGINT', () => { void server.close().then(() => process.exit(0)); });
process.on('SIGTERM', () => { void server.close().then(() => process.exit(0)); });
