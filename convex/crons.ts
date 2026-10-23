import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 19:05 UTC is 00:05 in Pakistan: publish the new day's mandi prices.
crons.cron("roll mandi prices", "5 19 * * *", internal.prices.rollDay, {});

export default crons;
