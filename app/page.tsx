"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTelegram } from "@/lib/telegram/useTelegram";
import { useMe } from "@/lib/useMe";

export default function RootPage() {
  const router = useRouter();
  const { ready } = useTelegram();
  const { user, loading, error } = useMe();

  useEffect(() => {
    if (!ready || loading || !user) return;
    if (user.role === "ADMIN") router.replace("/admin");
    else if (user.role === "TECHNICIAN") router.replace("/tech");
    else router.replace("/home");
  }, [ready, loading, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      {error ? (
        <p style={{ color: "var(--tg-theme-hint-color,#999)" }}>Something went wrong. Please reopen from the bot.</p>
      ) : (
        <div className="skeleton h-8 w-8 rounded-full" />
      )}
    </div>
  );
}
