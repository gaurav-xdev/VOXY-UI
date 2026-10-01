import path from "node:path";
import { fileURLToPath } from "node:url";

export const loadMigrationsDirForTests = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../server/db/migrations");
