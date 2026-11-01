/** Parse the repo parameter from the URL search string. */
export function parseRepoParam(search: string): { owner: string; name: string } | null {
  const params = new URLSearchParams(search);
  const repoParam = params.get('repo');
  if (repoParam === null || repoParam === '') {
    return { owner: 'rishabhcli', name: 'skeletext' };
  }
  const parts = repoParam.split('/');
  if (parts.length !== 2) {
    return null;
  }
  // Both parts must be non-empty per REQ-1.5
  if (parts[0] === '' || parts[1] === '') {
    return null;
  }
  const owner = parts[0] as string;
  const name = parts[1] as string;
  return { owner, name };
}

/** Build a GitHub API URL from owner, name and path. */
export function buildApiUrl(owner: string, name: string, path: string): string {
  const encodedOwner = encodeURIComponent(owner);
  const encodedName = encodeURIComponent(name);
  return `https://api.github.com/repos/${encodedOwner}/${encodedName}${path}`;
}
