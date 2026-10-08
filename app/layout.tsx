import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Provider } from "#components/provider.tsx";
import { appName, basePath, siteUrl } from "#lib/site.ts";
import "#app/global.css";

export const metadata: Metadata = {
  title: { default: appName, template: `%s | ${appName}` },
  metadataBase: new URL(siteUrl),
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: `${basePath}/brand/favicon.svg`, type: "image/svg+xml" },
      {
        url: `${basePath}/brand/favicon-dark.svg`,
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
