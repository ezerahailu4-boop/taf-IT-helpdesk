// lib/neon/client.ts
import "server-only";
import { Pool } from "@neondatabase/serverless";

export interface NeonQueryResponse<T = any> {
  data: T | null;
  error: { message: string } | null;
  count?: number;
}

interface FilterCondition {
  sql: string;
  values: any[];
}

let _pool: Pool | null = null;

function getPool(connectionString: string): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString });
  }
  return _pool;
}

export class NeonQueryBuilder {
  private table: string;
  private connectionString: string;
  private selectFields = "*";
  private isCountExact = false;
  private isHead = false;
  private filters: FilterCondition[] = [];
  private orderClause: string | null = null;
  private limitValue: number | null = null;

  private pendingMutation: {
    type: "insert" | "update" | "delete" | "upsert";
    payload?: any;
  } | null = null;

  constructor(table: string, connectionString: string) {
    this.table = table;
    this.connectionString = connectionString;
  }

  select(fields = "*", options?: { count?: "exact"; head?: boolean }) {
    this.selectFields = fields;
    if (options?.count === "exact") this.isCountExact = true;
    if (options?.head) this.isHead = true;
    return this;
  }

  eq(col: string, val: any) {
    if (val === null) {
      this.filters.push({ sql: `"${col}" IS NULL`, values: [] });
    } else {
      this.filters.push({ sql: `"${col}" = $PARAM`, values: [val] });
    }
    return this;
  }

  neq(col: string, val: any) {
    if (val === null) {
      this.filters.push({ sql: `"${col}" IS NOT NULL`, values: [] });
    } else {
      this.filters.push({ sql: `"${col}" != $PARAM`, values: [val] });
    }
    return this;
  }

  is(col: string, val: any) {
    if (val === null) {
      this.filters.push({ sql: `"${col}" IS NULL`, values: [] });
    } else {
      this.filters.push({ sql: `"${col}" = $PARAM`, values: [val] });
    }
    return this;
  }

  in(col: string, vals: any[]) {
    if (!vals || vals.length === 0) {
      this.filters.push({ sql: `1 = 0`, values: [] });
    } else {
      const placeholders = vals.map(() => "$PARAM").join(", ");
      this.filters.push({ sql: `"${col}" IN (${placeholders})`, values: vals });
    }
    return this;
  }

  not(col: string, operator: string, val: any) {
    if (operator === "in" && typeof val === "string") {
      const clean = val.replace(/^\(/, "").replace(/\)$/, "").split(",").map((s) => s.replace(/['"]/g, "").trim());
      const placeholders = clean.map(() => "$PARAM").join(", ");
      this.filters.push({ sql: `"${col}" NOT IN (${placeholders})`, values: clean });
    } else if (operator === "is" && val === null) {
      this.filters.push({ sql: `"${col}" IS NOT NULL`, values: [] });
    }
    return this;
  }

  gte(col: string, val: any) {
    this.filters.push({ sql: `"${col}" >= $PARAM`, values: [val] });
    return this;
  }

  lte(col: string, val: any) {
    this.filters.push({ sql: `"${col}" <= $PARAM`, values: [val] });
    return this;
  }

  gt(col: string, val: any) {
    this.filters.push({ sql: `"${col}" > $PARAM`, values: [val] });
    return this;
  }

  lt(col: string, val: any) {
    this.filters.push({ sql: `"${col}" < $PARAM`, values: [val] });
    return this;
  }

  ilike(col: string, pattern: string) {
    this.filters.push({ sql: `"${col}" ILIKE $PARAM`, values: [pattern] });
    return this;
  }

  or(expression: string) {
    const clauses = expression.split(",").map((s) => s.trim()).filter(Boolean);
    const orParts: string[] = [];
    const orVals: any[] = [];

    for (const clause of clauses) {
      const parts = clause.split(".");
      if (parts.length >= 3) {
        const col = parts[0];
        const op = parts[1];
        const val = parts.slice(2).join(".");
        if (op === "ilike" || op === "like") {
          orParts.push(`"${col}" ILIKE $PARAM`);
          orVals.push(val);
        } else if (op === "eq") {
          orParts.push(`"${col}" = $PARAM`);
          orVals.push(val);
        }
      }
    }

    if (orParts.length > 0) {
      this.filters.push({ sql: `(${orParts.join(" OR ")})`, values: orVals });
    }
    return this;
  }

  order(col: string, options: { ascending?: boolean } = { ascending: true }) {
    const dir = (options.ascending ?? true) ? "ASC" : "DESC";
    this.orderClause = `ORDER BY "${col}" ${dir}`;
    return this;
  }

  limit(count: number) {
    this.limitValue = count;
    return this;
  }

  insert(recordOrArray: any) {
    this.pendingMutation = { type: "insert", payload: recordOrArray };
    return this;
  }

  update(patch: any) {
    this.pendingMutation = { type: "update", payload: patch };
    return this;
  }

  delete() {
    this.pendingMutation = { type: "delete" };
    return this;
  }

  upsert(record: any) {
    this.pendingMutation = { type: "upsert", payload: record };
    return this;
  }

  private buildWhere(startIndex = 1): { whereSql: string; params: any[]; nextIndex: number } {
    if (this.filters.length === 0) {
      return { whereSql: "", params: [], nextIndex: startIndex };
    }

    const params: any[] = [];
    let currentIndex = startIndex;

    const parts = this.filters.map((f) => {
      let clauseSql = f.sql;
      for (const val of f.values) {
        clauseSql = clauseSql.replace("$PARAM", `$${currentIndex}`);
        params.push(val);
        currentIndex++;
      }
      return clauseSql;
    });

    return {
      whereSql: `WHERE ${parts.join(" AND ")}`,
      params,
      nextIndex: currentIndex
    };
  }

  private async execute(): Promise<any[]> {
    const pool = getPool(this.connectionString);

    if (this.pendingMutation) {
      const mut = this.pendingMutation;

      if (mut.type === "insert") {
        const records = Array.isArray(mut.payload) ? mut.payload : [mut.payload];
        if (records.length === 0) return [];

        const allInserted: any[] = [];
        for (const record of records) {
          const cols = Object.keys(record);
          const vals = Object.values(record);
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
          const quotedCols = cols.map((c) => `"${c}"`).join(", ");

          const query = `INSERT INTO "${this.table}" (${quotedCols}) VALUES (${placeholders}) RETURNING *;`;
          const res = await pool.query(query, vals);
          allInserted.push(...res.rows);
        }
        return Array.isArray(mut.payload) ? allInserted : (allInserted[0] ? [allInserted[0]] : []);
      }

      if (mut.type === "update") {
        const patch = mut.payload || {};
        const patchKeys = Object.keys(patch);
        if (patchKeys.length === 0) return [];

        const setParts: string[] = [];
        const params: any[] = [];
        let pIndex = 1;

        for (const k of patchKeys) {
          setParts.push(`"${k}" = $${pIndex}`);
          params.push(patch[k]);
          pIndex++;
        }

        const { whereSql, params: whereParams } = this.buildWhere(pIndex);
        params.push(...whereParams);

        const query = `UPDATE "${this.table}" SET ${setParts.join(", ")} ${whereSql} RETURNING *;`;
        const res = await pool.query(query, params);
        return res.rows;
      }

      if (mut.type === "delete") {
        const { whereSql, params } = this.buildWhere(1);
        const query = `DELETE FROM "${this.table}" ${whereSql} RETURNING *;`;
        const res = await pool.query(query, params);
        return res.rows;
      }

      if (mut.type === "upsert") {
        const record = mut.payload;
        const cols = Object.keys(record);
        const vals = Object.values(record);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const quotedCols = cols.map((c) => `"${c}"`).join(", ");

        const conflictTarget = record.id ? `"id"` : (record.key ? `"key"` : (record.priority ? `"priority"` : `"id"`));
        const updateParts = cols.filter((c) => c !== "id").map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");

        const query = `
          INSERT INTO "${this.table}" (${quotedCols}) VALUES (${placeholders})
          ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateParts}
          RETURNING *;
        `;
        const res = await pool.query(query, vals);
        return res.rows;
      }
    }

    // Normal SELECT query
    const { whereSql, params } = this.buildWhere(1);
    let query = `SELECT ${this.selectFields === "*" ? "*" : this.selectFields} FROM "${this.table}" ${whereSql}`;

    if (this.orderClause) query += ` ${this.orderClause}`;
    if (this.limitValue !== null) query += ` LIMIT ${this.limitValue}`;

    const res = await pool.query(query, params);
    return res.rows;
  }

  async single(): Promise<NeonQueryResponse> {
    try {
      const rows = await this.execute();
      if (!rows || rows.length === 0) {
        return { data: null, error: { message: "Row not found" } };
      }
      return { data: rows[0], error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message || "Database error" } };
    }
  }

  async maybeSingle(): Promise<NeonQueryResponse> {
    try {
      const rows = await this.execute();
      return { data: rows && rows.length > 0 ? rows[0] : null, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message || "Database error" } };
    }
  }

  async then(resolve: (value: NeonQueryResponse) => void) {
    try {
      const rows = await this.execute();
      const count = this.isCountExact ? rows.length : undefined;
      const data = this.isHead ? null : (this.pendingMutation && !Array.isArray(this.pendingMutation.payload) && rows.length === 1 ? rows[0] : rows);
      resolve({ data, error: null, count });
    } catch (err: any) {
      resolve({ data: null, error: { message: err.message || "Database error" }, count: 0 });
    }
  }
}

export function createNeonClient(connectionString: string) {
  const pool = getPool(connectionString);

  return {
    from(table: string) {
      return new NeonQueryBuilder(table, connectionString);
    },
    async rpc(fnName: string, args?: any) {
      try {
        if (fnName === "nextval_ticket_seq") {
          const res = await pool.query("SELECT nextval_ticket_seq() as val;");
          return { data: Number(res.rows[0]?.val ?? 250), error: null };
        }
        return { data: null, error: null };
      } catch (err: any) {
        return { data: null, error: { message: err.message } };
      }
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string, bytes: any) => ({ data: { path }, error: null }),
          getPublicUrl: (path: string) => ({ data: { publicUrl: `/uploads/${path}` } })
        };
      }
    }
  };
}
