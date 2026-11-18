import { readFileSync } from "fs";
import { Pool } from "@neondatabase/serverless";

let connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
if (!connectionString) {
  try {
    const envText = readFileSync(".env.local", "utf8");
    const match = envText.match(/^(?:DATABASE_URL|NEON_DATABASE_URL)=(.+)$/m);
    if (match) {
      connectionString = match[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // ignore
  }
}

if (!connectionString) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function main() {
  console.log("Adding progress_weight column to project_subtasks...");

  await pool.query(`
    ALTER TABLE project_subtasks
    ADD COLUMN IF NOT EXISTS progress_weight integer NOT NULL DEFAULT 10;
  `);

  const check = await pool.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'project_subtasks' AND column_name = 'progress_weight'
  `);
  console.log("Verified column:", check.rows);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

