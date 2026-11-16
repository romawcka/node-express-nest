import { app } from './app.ts';
import { config } from './configs/app.config.ts';
import { closeDatabase, connectToDatabase } from './db/drizzle.ts';

const startServer = async () => {
  await connectToDatabase();

  const server = app.listen(config.port, (err) => {
    if (err) {
      console.error(`Failed to start server: ${err.message}`);
      process.exit(1);
    }
    console.log(`Server is running on port: ${config.port}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await closeDatabase();
      console.log('Server and database connections closed');
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

void startServer();
