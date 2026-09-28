import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "IT Support",
  description: "Company IT Helpdesk"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                // 1. Cache Telegram initData from hash if present
                const hash = window.location.hash.slice(1);
                if (hash) {
                  const hp = new URLSearchParams(hash);
                  const td = hp.get('tgWebAppData');
                  if (td) sessionStorage.setItem('tg_init_data', td);
                }
                const sp = new URLSearchParams(window.location.search);
                const sdata = sp.get('tgWebAppData') || sp.get('initData');
                if (sdata) sessionStorage.setItem('tg_init_data', sdata);

                // 2. Initialize theme
                const saved = localStorage.getItem('it_helpdesk_theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (saved === 'dark' || (!saved && prefersDark)) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.classList.remove('light');
                } else if (saved === 'light') {
                  document.documentElement.classList.add('light');
                  document.documentElement.classList.remove('dark');
                } else {
                  // Default to dark mode for elite high-tech aesthetic
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `
          }}
        />
      </head>
      <body className="safe-top safe-bottom min-h-screen">{children}</body>
    </html>
  );
}
