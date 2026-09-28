"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, uploadFile, ApiError } from "@/lib/apiClient";
import { useTelegram } from "@/lib/telegram/useTelegram";

type Category = { id: string; key: string; label: string; icon: string };
type LocationRow = { id: string; name: string };
type AssetRow = { id: string; asset_tag: string; type: string; brand: string | null; model: string | null };
type ArticleSuggestion = { id: string; title: string; category_id: string; keywords: string[] };

export default function CreateTicketPage() {
  const router = useRouter();
  const { showBackButton, showMainButton, haptic } = useTelegram();
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [articles, setArticles] = useState<ArticleSuggestion[]>([]);

  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{
      categories: Category[];
      locations: LocationRow[];
      assets: AssetRow[];
      articles: ArticleSuggestion[];
    }>("/api/reference").then((d) => {
      setCategories(d.categories);
      setLocations(d.locations);
      setAssets(d.assets ?? []);
      setArticles(d.articles ?? []);
    });
  }, []);

  useEffect(() => showBackButton(() => (step > 1 ? setStep(step - 1) : router.back())), [step, showBackButton, router]);

  const canNext =
    (step === 1 && !!categoryKey) ||
    (step === 2 && subject.trim().length >= 3 && description.trim().length >= 3) ||
    step === 3;

  useEffect(() => {
    if (step < 4) {
      return showMainButton(step === 3 ? "Continue to Review" : "Next", () => canNext && setStep(step + 1));
    }
    return showMainButton(submitting ? "Submitting…" : "🎫 Submit Ticket", submit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, canNext, submitting]);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { ticket } = await api<{ ticket: { id: string } }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({ categoryKey, subject, description, locationId, assetId })
      });
      for (const file of files) {
        await uploadFile(file, ticket.id).catch(() => null);
      }
      haptic("success");
      router.replace(`/tickets/${ticket.id}`);
    } catch (err) {
      haptic("error");
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  // Smart suggestions: match selected category or subject keywords
  const selectedCat = categories.find((c) => c.key === categoryKey);
  const suggestedArticles = articles.filter((a) => {
    if (selectedCat && a.category_id === selectedCat.id) return true;
    const sub = subject.toLowerCase();
    return a.keywords?.some((k) => sub.includes(k.toLowerCase()));
  }).slice(0, 3);

  return (
    <div className="p-4 pb-28 space-y-4">
      <StepDots step={step} />

      {/* STEP 1: Categories */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">What do you need help with?</h1>
            <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
              Select a category to route your ticket to the right IT team
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {categories.map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  setCategoryKey(c.key);
                  haptic("light");
                  setStep(2);
                }}
                className={`card p-4 flex flex-col items-start gap-2.5 text-left border transition-all ${
                  categoryKey === c.key ? "ring-2 ring-blue-500 scale-[1.02]" : "hover:border-blue-300"
                }`}
                style={{ borderColor: "rgba(0,0,0,0.06)" }}
              >
                <span className="text-3xl">{c.icon}</span>
                <div>
                  <span className="font-semibold text-sm block leading-tight">{c.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Describe the problem & Knowledge suggestions */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Describe the problem</h1>
            <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
              Category: <span className="font-semibold">{selectedCat?.icon} {selectedCat?.label}</span>
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5">Problem Title</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Internet is not working on my laptop"
              className="w-full rounded-2xl p-3.5 card text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ borderColor: "rgba(0,0,0,0.08)" }}
              maxLength={150}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5">Detailed Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us what happened, any error messages shown, and when it started..."
              rows={5}
              className="w-full rounded-2xl p-3.5 card text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ borderColor: "rgba(0,0,0,0.08)" }}
              maxLength={4000}
            />
          </div>

          {/* Section 28: Suggested Articles to self-resolve */}
          {suggestedArticles.length > 0 && (
            <div className="card p-3.5 space-y-2 border" style={{ background: "#F0F9FF", borderColor: "#BAE6FD" }}>
              <p className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                <span>💡</span> Suggested Quick Fixes (Can this help?):
              </p>
              <div className="space-y-1.5">
                {suggestedArticles.map((art) => (
                  <Link
                    key={art.id}
                    href="/help"
                    target="_blank"
                    className="block text-xs text-sky-800 hover:text-sky-950 font-medium underline decoration-dotted truncate"
                  >
                    📚 {art.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Attachments */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Attachments</h1>
            <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
              Attach screenshots, photos of error codes, or log files
            </p>
          </div>

          <label className="card p-6 flex flex-col items-center justify-center gap-2 cursor-pointer border-2 border-dashed border-blue-400 hover:bg-blue-50/20 transition-all">
            <span className="text-3xl">📷</span>
            <span className="font-semibold text-sm">Add Photo or File</span>
            <span className="text-[11px] opacity-60">JPG, PNG, PDF, DOC, TXT (up to 15MB)</span>
            <input
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              multiple
              className="hidden"
              onChange={(e) => {
                const newFiles = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...newFiles]);
                haptic("light");
              }}
            />
          </label>

          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold">Attached files ({files.length}):</p>
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="card p-2.5 flex items-center justify-between text-xs border">
                    <span className="truncate max-w-[80%] font-medium">📎 {f.name}</span>
                    <button
                      onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                      className="text-red-500 hover:text-red-700 font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-center opacity-60">
            This step is optional — click Continue if you have no files to upload.
          </p>
        </div>
      )}

      {/* STEP 4: Review & Submit */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Review & Submit</h1>
            <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
              Please check your information before submitting
            </p>
          </div>

          <div className="card p-4 space-y-3 text-xs border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            <div>
              <span className="opacity-60 block">Category:</span>
              <span className="font-semibold text-sm">
                {selectedCat?.icon} {selectedCat?.label}
              </span>
            </div>
            <div>
              <span className="opacity-60 block">Subject:</span>
              <span className="font-semibold text-sm">{subject}</span>
            </div>
            <div>
              <span className="opacity-60 block">Description:</span>
              <p className="mt-0.5 whitespace-pre-wrap leading-relaxed opacity-90">{description}</p>
            </div>
            {files.length > 0 && (
              <div className="pt-2 border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                <span className="opacity-60 block">Attachments:</span>
                <span className="font-medium">{files.length} file(s) ready to upload</span>
              </div>
            )}
          </div>

          {error && <p className="text-xs font-semibold text-red-600 card p-3 bg-red-50">{error}</p>}
        </div>
      )}

      {/* Always-visible In-Page Action Bar (fallback & mobile friendly) */}
      <div className="fixed bottom-14 left-0 right-0 p-3 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-black dark:via-black/95 z-30">
        <div className="max-w-md mx-auto flex gap-2">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-3 rounded-2xl font-semibold text-xs border card"
              style={{ borderColor: "rgba(0,0,0,0.1)" }}
            >
              Back
            </button>
          )}

          {step < 4 ? (
            <button
              onClick={() => canNext && setStep(step + 1)}
              disabled={!canNext}
              className="flex-1 py-3 rounded-2xl font-bold text-xs text-white shadow-md transition-all disabled:opacity-40"
              style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
            >
              {step === 3 ? "Continue to Review →" : "Next Step →"}
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="flex-1 py-3 rounded-2xl font-bold text-sm text-white shadow-lg transition-all disabled:opacity-40"
              style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
            >
              {submitting ? "Submitting Ticket…" : "🎫 Submit IT Ticket"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5 mb-2 justify-center">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-1.5 rounded-full transition-all"
          style={{
            width: i === step ? 24 : 8,
            background: i <= step ? "var(--tg-theme-button-color,#2481cc)" : "var(--tg-theme-secondary-bg-color,#eee)"
          }}
        />
      ))}
    </div>
  );
}
