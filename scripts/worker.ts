import { indexes } from "../lib/db";
import { drainJobs } from "../lib/ingestion";
await indexes();
console.log("Margin ingestion worker running");
setInterval(() => drainJobs().catch(console.error), 2000);
await drainJobs();
