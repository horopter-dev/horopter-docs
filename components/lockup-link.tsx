"use client";

import type { ComponentProps } from "react";
import { Lockup } from "#components/lockup.tsx";

/**
 * The nav's lockup as a plain link, so it opens in the same tab: fumadocs opens an absolute
 * `nav.url` in a new one. A client component, because a server layout cannot pass a function.
 */
export function LockupLink(props: ComponentProps<"a">) {
  return (
    <a {...props}>
      <Lockup className="h-6 w-auto" />
    </a>
  );
}
