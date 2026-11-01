import { config } from "./config/app.config.ts";
import { app } from "./app.ts";

app.listen(config.port, (err) => {
  if (err) {
    console.error(`Failed to start the server: ${err.message}`);
    process.exit(1);
  }
  console.log(`The server is running on port ${config.port}`);
});
