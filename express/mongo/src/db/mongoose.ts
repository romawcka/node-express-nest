import mongoose from "mongoose";
import { config } from "../config/app.config.ts";

export const connectToDatabase = async () => {
  try {
    await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to database");
  } catch (error) {
    console.error("Failed to connect to database", error);
    process.exit(1);
  }
};

export const isDatabaseConnected = () => mongoose.connection.readyState === 1;
