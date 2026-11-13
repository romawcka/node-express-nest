import { app } from './app.ts';
import { config } from './configs/app.config.ts';
import { connectToDatabase } from './db/mongoose.ts';

const startServer = async () => {
  await connectToDatabase();

  app.listen(config.port, (err) => {
    if (err) {
      console.error(`Failed to start the server: ${err.message}`);
      process.exit(1);
    }
    console.log(`The server is running on port: ${config.port}`);
  });
};

void startServer();
