/**
 * "owner/name" from a GitHub remote or URL (SSH, HTTPS or owner/name itself); null for anything
 * else. Same rule as githubRepo in cli/park.mjs, which carries its own copy to stay dependency-free.
 */
export function githubRepo(value: string): string | null {
  const m =
    /^(?:(?:git\+)?ssh:\/\/git@github\.com\/|git@github\.com:|https?:\/\/(?:[^@/]+@)?(?:www\.)?github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(
      value.trim(),
    );
  return m && !/^\.{1,2}$/.test(m[2]) ? `${m[1]}/${m[2]}` : null;
}
