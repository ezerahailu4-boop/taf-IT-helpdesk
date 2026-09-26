"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/apiClient";
import type { DbUser } from "@/types/db";

export function useMe() {
  const [user, setUser] = useState<DbUser | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api<{ user: DbUser; counts: Record<string, number> }>("/api/auth/me")
      .then((data) => {
        setUser(data.user);
        setCounts(data.counts);
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, counts, loading, error, reload: load };
}
