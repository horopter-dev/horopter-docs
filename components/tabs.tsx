import { Tabs as FumadocsTabs } from "fumadocs-ui/components/tabs";
import type { ComponentProps } from "react";

export { Tab } from "fumadocs-ui/components/tabs";

const folderTabClasses = [
  "[&>[role=tablist]]:gap-1",
  "[&>[role=tablist]]:px-2",
  "[&>[role=tablist]]:pt-2",
  "[&>[role=tablist]]:shadow-[inset_0_-1px_0_var(--color-fd-border)]",
  "[&>[role=tablist]>[role=tab]]:rounded-t-lg",
  "[&>[role=tablist]>[role=tab]]:border",
  "[&>[role=tablist]>[role=tab]]:border-b-0",
  "[&>[role=tablist]>[role=tab]]:border-fd-border",
  "[&>[role=tablist]>[role=tab]]:px-3",
  "[&>[role=tablist]>[role=tab]]:text-fd-muted-foreground",
  "[&>[role=tablist]>[role=tab]:hover]:text-fd-foreground",
  "[&>[role=tablist]>[role=tab]:focus-visible]:outline-none",
  "[&>[role=tablist]>[role=tab]:focus-visible]:focus-ring-open-bottom",
  "[&>[role=tablist]>[role=tab][data-state=active]]:border-transparent",
  "[&>[role=tablist]>[role=tab][data-state=active]]:bg-fd-background",
  "[&>[role=tablist]>[role=tab][data-state=active]]:text-fd-foreground",
  "[&>[role=tabpanel]]:rounded-t-none",
].join(" ");

/**
 * Fumadocs' Tabs, with its tabs drawn as folder tabs rather than underlined labels.
 *
 * The classes target Fumadocs' own markup: a `role="tablist"` child of the root whose
 * `role="tab"` children carry Radix's `data-state`. Only those direct children are styled, so
 * code-block tabs inside a panel keep their own look. The line under the tabs is an inset
 * shadow because the tablist scrolls, which clips any tab drawn over the panel's edge. The
 * selected tab has no border and focus draws no bottom edge, so the tab runs into its panel.
 */
export function Tabs({ className, ...props }: ComponentProps<typeof FumadocsTabs>) {
  return (
    <FumadocsTabs
      className={className ? `${folderTabClasses} ${className}` : folderTabClasses}
      {...props}
    />
  );
}
