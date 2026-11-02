import { describe, it, expect } from "vitest";
import { getDatabasePlan, matchDestructiveDatabaseCommand } from "../src/providers/database.js";

describe("matchDestructiveDatabaseCommand", () => {
  it("matches DROP/TRUNCATE/FLUSH calls across common self-hosted databases", () => {
    expect(matchDestructiveDatabaseCommand('psql -h localhost -U app -c "DROP DATABASE orders"')).toBeDefined();
    expect(matchDestructiveDatabaseCommand("dropdb -h localhost -U app orders")).toBeDefined();
    expect(matchDestructiveDatabaseCommand('mysql -u root -e "DROP DATABASE orders"')).toBeDefined();
    expect(matchDestructiveDatabaseCommand("mysqladmin -f drop orders")).toBeDefined();
    expect(matchDestructiveDatabaseCommand('mongosh --eval "db.dropDatabase()"')).toBeDefined();
    expect(matchDestructiveDatabaseCommand("redis-cli FLUSHALL")).toBeDefined();
  });

  it("does not match read-only or unrelated calls", () => {
    expect(matchDestructiveDatabaseCommand("psql -c \"SELECT * FROM orders\"")).toBeUndefined();
    expect(matchDestructiveDatabaseCommand("mysql -e \"SHOW DATABASES\"")).toBeUndefined();
    expect(matchDestructiveDatabaseCommand("redis-cli GET mykey")).toBeUndefined();
  });
});

describe("getDatabasePlan", () => {
  it("produces a single delete change with the extracted database name", () => {
    const plan = getDatabasePlan('psql -h localhost -U app -c "DROP DATABASE orders"');
    expect(plan?.degraded).toBe(false);
    expect(plan?.changes[0]).toMatchObject({ resourceType: "database:database", address: "orders", action: "delete" });
  });

  it("returns undefined for commands outside its pattern list", () => {
    expect(getDatabasePlan("psql -c \"SELECT 1\"")).toBeUndefined();
  });
});
