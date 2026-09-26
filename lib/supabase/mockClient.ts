// Emulates Supabase QueryBuilder against in-memory Mock Store
import { getMockStore } from "./mockStore";
import { nanoid } from "nanoid";

export class MockQueryBuilder {
  private table: string;
  private filters: ((item: any) => boolean)[] = [];
  private orderFn: ((a: any, b: any) => number) | null = null;
  private limitCount: number | null = null;
  private selectFields: string | null = null;
  private isCountExact = false;
  private isHead = false;

  constructor(table: string) {
    this.table = table;
  }

  select(fields = "*", options?: { count?: "exact"; head?: boolean }) {
    this.selectFields = fields;
    if (options?.count === "exact") this.isCountExact = true;
    if (options?.head) this.isHead = true;
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((item) => item[col] === val);
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push((item) => item[col] !== val);
    return this;
  }

  is(col: string, val: any) {
    this.filters.push((item) => item[col] === val);
    return this;
  }

  in(col: string, vals: any[]) {
    this.filters.push((item) => vals.includes(item[col]));
    return this;
  }

  not(col: string, operator: string, val: any) {
    if (operator === "in" && typeof val === "string") {
      // Handles e.g. .not("status", "in", '("RESOLVED","CLOSED","CANCELLED")')
      const clean = val.replace(/^\(/, "").replace(/\)$/, "").split(",").map((s) => s.replace(/['"]/g, "").trim());
      this.filters.push((item) => !clean.includes(item[col]));
    } else if (operator === "is" && val === null) {
      this.filters.push((item) => item[col] !== null);
    }
    return this;
  }

  gte(col: string, val: any) {
    this.filters.push((item) => {
      const a = item[col];
      return a !== null && a !== undefined && a >= val;
    });
    return this;
  }

  lte(col: string, val: any) {
    this.filters.push((item) => {
      const a = item[col];
      return a !== null && a !== undefined && a <= val;
    });
    return this;
  }

  gt(col: string, val: any) {
    this.filters.push((item) => {
      const a = item[col];
      return a !== null && a !== undefined && a > val;
    });
    return this;
  }

  lt(col: string, val: any) {
    this.filters.push((item) => {
      const a = item[col];
      return a !== null && a !== undefined && a < val;
    });
    return this;
  }

  ilike(col: string, pattern: string) {
    const cleanPattern = pattern.replace(/^%/, "").replace(/%$/, "").toLowerCase();
    this.filters.push((item) => {
      const val = String(item[col] ?? "").toLowerCase();
      return val.includes(cleanPattern);
    });
    return this;
  }

  or(expression: string) {
    // Parse Supabase style OR expressions e.g. "col1.ilike.%val%,col2.ilike.%val%"
    const clauses = expression.split(",").map((s) => s.trim()).filter(Boolean);
    this.filters.push((item) => {
      if (clauses.length === 0) return true;
      return clauses.some((clause) => {
        const parts = clause.split(".");
        if (parts.length >= 3) {
          const col = parts[0];
          const op = parts[1];
          const val = parts.slice(2).join(".").replace(/^%/, "").replace(/%$/, "").toLowerCase();
          const itemVal = String(item[col] ?? "").toLowerCase();
          if (op === "ilike" || op === "like") {
            return itemVal.includes(val);
          }
          if (op === "eq") {
            return itemVal === val;
          }
        }
        return false;
      });
    });
    return this;
  }

  order(col: string, options: { ascending?: boolean } = { ascending: true }) {
    const asc = options.ascending ?? true;
    this.orderFn = (a, b) => {
      const valA = a[col];
      const valB = b[col];
      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      return asc ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private getItems(): any[] {
    const store = getMockStore() as any;
    return store[this.table] ?? [];
  }

  private applyFilters(): any[] {
    let items = this.getItems().filter((item) => {
      for (const filter of this.filters) {
        if (!filter(item)) return false;
      }
      return true;
    });

    if (this.orderFn) {
      items = [...items].sort(this.orderFn);
    }

    if (this.limitCount !== null) {
      items = items.slice(0, this.limitCount);
    }

    return items;
  }

  private pendingMutation: {
    type: "insert" | "update" | "delete" | "upsert";
    payload?: any;
  } | null = null;

  private executeMutation(): any {
    const store = getMockStore() as any;
    if (!store[this.table]) store[this.table] = [];

    if (!this.pendingMutation) return null;

    if (this.pendingMutation.type === "insert") {
      const records = Array.isArray(this.pendingMutation.payload)
        ? this.pendingMutation.payload
        : [this.pendingMutation.payload];
      const inserted: any[] = [];
      for (const r of records) {
        const newRecord = {
          id: r.id || `${this.table.slice(0, 4)}-${nanoid(8)}`,
          created_at: r.created_at || new Date().toISOString(),
          ...r
        };
        store[this.table].push(newRecord);
        inserted.push(newRecord);
      }
      return Array.isArray(this.pendingMutation.payload) ? inserted : inserted[0];
    }

    if (this.pendingMutation.type === "update") {
      const items = store[this.table] ?? [];
      const patch = this.pendingMutation.payload;
      const updated: any[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (this.filters.every((f) => f(item))) {
          const next = { ...item, ...patch, updated_at: patch.updated_at || new Date().toISOString() };
          items[i] = next;
          updated.push(next);
        }
      }
      return updated;
    }

    if (this.pendingMutation.type === "delete") {
      const items = store[this.table] ?? [];
      const remaining = items.filter((item: any) => !this.filters.every((f) => f(item)));
      store[this.table] = remaining;
      return null;
    }

    if (this.pendingMutation.type === "upsert") {
      const items = store[this.table];
      const record = this.pendingMutation.payload;
      const matchIndex = items.findIndex(
        (i: any) => (record.key && i.key === record.key) || (record.id && i.id === record.id)
      );
      if (matchIndex >= 0) {
        items[matchIndex] = { ...items[matchIndex], ...record, updated_at: new Date().toISOString() };
        return items[matchIndex];
      } else {
        const newRec = { id: record.id || nanoid(8), ...record, created_at: new Date().toISOString() };
        items.push(newRec);
        return newRec;
      }
    }

    return null;
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

  async single() {
    if (this.pendingMutation) {
      const res = this.executeMutation();
      const item = Array.isArray(res) ? res[0] : res;
      if (!item) return { data: null, error: { message: "Row not found" } };
      return { data: item, error: null };
    }
    const items = this.applyFilters();
    if (items.length === 0) {
      return { data: null, error: { message: "Row not found" } };
    }
    return { data: items[0], error: null };
  }

  async maybeSingle() {
    if (this.pendingMutation) {
      const res = this.executeMutation();
      const item = Array.isArray(res) ? res[0] : res;
      return { data: item ?? null, error: null };
    }
    const items = this.applyFilters();
    return { data: items.length > 0 ? items[0] : null, error: null };
  }

  async then(resolve: (value: { data: any; error: any; count?: number }) => void) {
    try {
      if (this.pendingMutation) {
        const res = this.executeMutation();
        resolve({ data: res, error: null });
        return;
      }
      const items = this.applyFilters();
      const count = this.isCountExact ? this.getItems().filter((i) => this.filters.every((f) => f(i))).length : undefined;
      const data = this.isHead ? null : items;
      resolve({ data, error: null, count });
    } catch (err: any) {
      resolve({ data: null, error: err, count: 0 });
    }
  }
}

export function createMockSupabaseClient(): any {
  return {
    from(table: string) {
      return new MockQueryBuilder(table);
    },
    rpc(fnName: string, args?: any) {
      const store = getMockStore();
      if (fnName === "nextval_ticket_seq") {
        store.ticket_seq = (store.ticket_seq || 245) + 1;
        return Promise.resolve({ data: store.ticket_seq, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string, bytes: any, opts?: any) => {
            return { data: { path }, error: null };
          },
          getPublicUrl: (path: string) => {
            return { data: { publicUrl: `/uploads/${path}` } };
          }
        };
      }
    }
  };
}
