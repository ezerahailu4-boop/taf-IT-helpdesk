"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useMe } from "@/lib/useMe";
import { useTelegram } from "@/lib/telegram/useTelegram";
import { EmptyState } from "@/components/TicketCard";

interface Article {
  id: string;
  category_id: string | null;
  category_name?: string;
  title: string;
  body: string;
  keywords?: string[];
  view_count: number;
}

const CATEGORIES = ["ALL", "Network", "Hardware", "Software", "Email", "Accounts", "Security"];

export default function HelpPage() {
  const { user } = useMe();
  const { haptic } = useTelegram();
  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [open, setOpen] = useState<Article | null>(null);

  // Admin add article
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Network");
  const [newBody, setNewBody] = useState("");

  const load = () => {
    api<{ articles: Article[] }>(`/api/knowledge${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((d) => setArticles(d.articles ?? []))
      .catch(() => setArticles([]));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function addArticle() {
    if (!newTitle.trim() || !newBody.trim()) return;
    try {
      await api("/api/admin/knowledge", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          body: newBody.trim(),
          categoryName: newCategory
        })
      });
      setNewTitle("");
      setNewBody("");
      setShowAdd(false);
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  const filteredArticles = articles?.filter((a) => {
    if (activeCategory === "ALL") return true;
    const cat = (a.category_name || "").toLowerCase();
    const title = a.title.toLowerCase();
    const target = activeCategory.toLowerCase();
    return cat.includes(target) || title.includes(target);
  });

  if (open) {
    return (
      <div className="p-4 space-y-4">
        <button
          onClick={() => setOpen(null)}
          className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full card border"
          style={{ color: "var(--tg-theme-button-color,#2481cc)" }}
        >
          ← Back to Articles
        </button>

        <div className="card p-5 space-y-3 border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <span className="text-xs opacity-60">Help Article · {open.view_count || 1} views</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">{open.title}</h1>
          <div className="pt-2 border-t text-sm leading-relaxed whitespace-pre-wrap opacity-90" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            {open.body}
          </div>
        </div>

        <div className="card p-4 text-center space-y-2 border">
          <p className="text-xs font-semibold">Still need assistance?</p>
          <Link
            href="/create"
            className="inline-block px-4 py-2 rounded-full font-bold text-xs text-white shadow-sm"
            style={{ background: "var(--tg-theme-button-color,#2481cc)" }}
          >
            🛠 Submit an IT Ticket
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Help Center & Knowledge Base</h1>
          <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
            Guides, FAQs, and self-service troubleshooting articles
          </p>
        </div>

        {user?.role === "ADMIN" && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm text-white shrink-0"
            style={{ background: "var(--tg-theme-button-color,#2481cc)" }}
          >
            {showAdd ? "✕ Cancel" : "+ New Article"}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="card p-4 space-y-3 border" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="font-semibold text-sm">Add Knowledge Base Article</p>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Article Title (e.g. How to set up MFA Authenticator)"
            className="w-full rounded-xl p-2.5 card text-xs border"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="w-full rounded-xl p-2.5 card text-xs border"
          >
            {CATEGORIES.filter((c) => c !== "ALL").map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Step-by-step instructions..."
            rows={5}
            className="w-full rounded-xl p-2.5 card text-xs border"
          />
          <button
            onClick={addArticle}
            disabled={!newTitle.trim() || !newBody.trim()}
            className="w-full py-2.5 rounded-full font-medium text-xs text-white disabled:opacity-50"
            style={{ background: "var(--tg-theme-button-color,#2481cc)" }}
          >
            Publish Article
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <span className="absolute left-3.5 top-3 text-sm opacity-60">🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Wi-Fi, password, printer, software..."
          className="w-full pl-9 pr-4 py-2.5 rounded-2xl card text-xs border focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ borderColor: "rgba(0,0,0,0.08)" }}
        />
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="px-3 py-1 rounded-full font-medium whitespace-nowrap transition-all"
            style={{
              background:
                activeCategory === cat
                  ? "var(--tg-theme-button-color, #2481cc)"
                  : "var(--tg-theme-secondary-bg-color, #f2f2f7)",
              color: activeCategory === cat ? "#fff" : "var(--tg-theme-text-color, #111)"
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Articles List */}
      <div className="space-y-2">
        {!filteredArticles && (
          <div className="space-y-2">
            <div className="skeleton h-14 w-full" />
            <div className="skeleton h-14 w-full" />
            <div className="skeleton h-14 w-full" />
          </div>
        )}

        {filteredArticles?.length === 0 && (
          <EmptyState icon="📚" title="No help articles found." />
        )}

        {filteredArticles?.map((a) => (
          <button
            key={a.id}
            onClick={() => setOpen(a)}
            className="card w-full p-4 text-left flex items-center justify-between border hover:border-blue-400 transition-all group"
            style={{ borderColor: "rgba(0,0,0,0.06)" }}
          >
            <div>
              <p className="font-semibold text-sm flex items-center gap-2 group-hover:text-blue-600 transition-colors">
                <span>📚</span>
                <span>{a.title}</span>
              </p>
              <p className="text-xs opacity-60 line-clamp-1 mt-1">{a.body}</p>
            </div>
            <span className="opacity-40 text-xs group-hover:translate-x-1 transition-transform">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
