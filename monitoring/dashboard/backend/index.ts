import express from "express";
import cors from "cors";
import { getMongoClient } from "./config/mongo.js";
import { getServerSettingsProvider } from "./config/server-settings.js";
import { SSMAgentService } from "./services/ssmAgentService.js";
import agentRoutes from "./routes/agent.js";
import logsRoutes from "./routes/logs.js";

// Initialize MongoDB connection
async function initialize() {
  try {
    await getMongoClient();
    console.log("MongoDB connected");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// Initialize SSM agent service with server settings provider
const serverSettingsProvider = getServerSettingsProvider();
export const ssmAgentService = new SSMAgentService(serverSettingsProvider);

app.use("/api/agent", agentRoutes);
app.use("/api/logs", logsRoutes);

// Use MONITORING_DASHBOARD_PORT if set, otherwise use PORT from env (same as main API)
// If neither is set, default to 4000
const PORT = process.env.MONITORING_DASHBOARD_PORT 
  ? parseInt(process.env.MONITORING_DASHBOARD_PORT, 10)
  : process.env.PORT 
    ? parseInt(process.env.PORT, 10)
    : 4000;

// Start server after MongoDB connection
initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`Dashboard API running on port ${PORT}`);
    console.log(`MongoDB URI: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/hosting-control-panel'}`);
  });
});
