"use client";
import { useMe } from "@/lib/useMe";
import { BottomNav } from "@/components/BottomNav";
import { TopHeader } from "@/components/TopHeader";
import { DemoRoleSwitcher } from "@/components/DemoRoleSwitcher";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useMe();

  return (
    <div className="min-h-screen flex flex-col justify-between" style={{ background: "var(--tg-theme-bg-color, #ffffff)" }}>
      {user && <TopHeader user={user} />}
      <DemoRoleSwitcher currentRole={user?.role} />

      <main className="flex-1 max-w-6xl w-full mx-auto pb-24">
        {children}
      </main>

      {user && <BottomNav role={user.role} />}
    </div>
  );
}
