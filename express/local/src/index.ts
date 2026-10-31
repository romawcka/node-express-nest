import { config } from "./config/config.ts";
import { app } from "./server.ts";

app.listen(config.port, (err) => {
  if (err) {
    console.error(`Failed to start the server: ${err.message}`);
    process.exit(1);
  }
  console.log(`The server is running on port ${config.port}`);
});
