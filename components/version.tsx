import { readVersions, versionsPath } from "#lib/versions.ts";

/** A version these docs pin, by its key in the `versions` file, read when the page is built. */
export function Version({ name }: { name: string }) {
  const versions = readVersions();
  const value = versions[name];
  if (value === undefined) {
    const pinned = Object.keys(versions).join(", ");
    throw new Error(
      `<Version name="${name}"/> names no pin in ${versionsPath()}; it pins ${pinned}`,
    );
  }
  return <>{value}</>;
}

/** The Horopter release these docs describe: `<Version name="HOROPTER_VERSION"/>`. */
export function HoropterVersion() {
  return <Version name="HOROPTER_VERSION" />;
}
