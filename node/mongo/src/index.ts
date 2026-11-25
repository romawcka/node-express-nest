import { createServer } from 'node:http';
import { app } from './app.ts';
import { config } from './configs/app.config.ts';
import { connectToDatabase, disconnectFromDatabase } from './db/mongoose.ts';

const server = createServer(app);

server.on('error', (err) => {
  console.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`${signal} received, closing server`);

  server.close(async (err) => {
    if (err) {
      console.error(err);
      process.exitCode = 1;
    }

    await disconnectFromDatabase();
  });

  server.closeIdleConnections();

  setTimeout(() => server.closeAllConnections(), 10_000).unref();
};

const startServer = async () => {
  await connectToDatabase();

  server.listen(config.port, () => console.log(`Server is running on port: ${config.port}`));

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

void startServer();
