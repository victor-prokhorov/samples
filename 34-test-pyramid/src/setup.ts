import { recreate } from "./api/db.js";

await recreate("pyramid");
console.log("setup: database pyramid (members M0001-M0003 of Acme, Globex, Initech; contribution_changes with CHECK and a partial unique index)");
