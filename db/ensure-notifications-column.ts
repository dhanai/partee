/**
 * @deprecated Prefer `npm run db:ensure-user-columns`. Kept for existing scripts/CI.
 */
import { repairUserColumns } from "./ensure-user-columns";

repairUserColumns().catch((err) => {
  console.error(err);
  process.exit(1);
});
