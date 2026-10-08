import { appName, basePath } from "#lib/site.ts";

/**
 * The Horopter lockup, in its light or dark variant to match the site's theme.
 *
 * Args:
 *   className: Sizing classes applied to both variants, such as `h-6`.
 */
export function Lockup({ className }: { className: string }) {
  return (
    <>
      <img
        src={`${basePath}/brand/lockup.svg`}
        alt={appName}
        className={`${className} dark:hidden`}
      />
      <img
        src={`${basePath}/brand/lockup-dark.svg`}
        alt={appName}
        className={`${className} hidden dark:block`}
      />
    </>
  );
}
