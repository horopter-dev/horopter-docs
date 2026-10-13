const notBare = /^(?:\.{1,2}\/|\/|#|\?|[a-z][a-z\d+.-]*:|$)/i;

/**
 * Makes a bare file-relative href, such as `configuration.md#horo`, explicit as
 * `./configuration.md#horo`: Fumadocs resolves a link to another page only when it starts
 * `./` or `../`, and the pages imported from `horopter`'s `docs/reference/` link bare.
 *
 * Args:
 *   href: The href as written in a page.
 *
 * Returns:
 *   The href with `./` prefixed when it is bare and relative; otherwise unchanged.
 */
export function fileRelative(href: string): string {
  return notBare.test(href) ? href : `./${href}`;
}
