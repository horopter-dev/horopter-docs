import { Tabs as FumadocsTabs } from "fumadocs-ui/components/tabs";
import type { ComponentProps } from "react";

export { Tab } from "fumadocs-ui/components/tabs";

const segmentedControlClasses = [
  "[&>[role=tablist]]:gap-2",
  "[&>[role=tablist]]:p-2",
  "[&>[role=tablist]>[role=tab]]:rounded-md",
  "[&>[role=tablist]>[role=tab]]:border",
  "[&>[role=tablist]>[role=tab]]:border-fd-border",
  "[&>[role=tablist]>[role=tab]]:bg-fd-background",
  "[&>[role=tablist]>[role=tab]]:px-3",
  "[&>[role=tablist]>[role=tab]]:py-1.5",
  "[&>[role=tablist]>[role=tab]]:text-fd-muted-foreground",
  "[&>[role=tablist]>[role=tab]:hover]:bg-fd-accent",
  "[&>[role=tablist]>[role=tab]:hover]:text-fd-accent-foreground",
  "[&>[role=tablist]>[role=tab]:focus-visible]:outline-2",
  "[&>[role=tablist]>[role=tab]:focus-visible]:outline-offset-2",
  "[&>[role=tablist]>[role=tab]:focus-visible]:outline-fd-ring",
  "[&>[role=tablist]>[role=tab][data-state=active]]:border-fd-primary",
  "[&>[role=tablist]>[role=tab][data-state=active]]:bg-fd-primary",
  "[&>[role=tablist]>[role=tab][data-state=active]]:text-fd-primary-foreground",
].join(" ");

/**
 * Fumadocs' Tabs, with its tabs drawn as a segmented control rather than underlined labels.
 *
 * The classes target Fumadocs' own markup: a `role="tablist"` child of the root whose
 * `role="tab"` children carry Radix's `data-state`. Only those direct children are styled, so
 * code-block tabs inside a panel keep their own look.
 */
export function Tabs({ className, ...props }: ComponentProps<typeof FumadocsTabs>) {
  return (
    <FumadocsTabs
      className={className ? `${segmentedControlClasses} ${className}` : segmentedControlClasses}
      {...props}
    />
  );
}
