import { readHoropterVersion } from "#lib/horopter-version.ts";

/** The Horopter release these docs describe, from `horopter-version` when the page is built. */
export function HoropterVersion() {
  return <>{readHoropterVersion()}</>;
}
