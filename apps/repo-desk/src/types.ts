export interface RepoData {
  fullName: string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  license: string | null;
  pushedAt: string;
}

export interface CommitItem {
  sha: string;
  date: string;
  author: string;
  message: string;
}

export interface PullItem {
  number: number;
  login: string;
  title: string;
}

export interface IssueItem {
  number: number;
  login: string;
  title: string;
}

export interface RunItem {
  name: string;
  branch: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  updatedAt: string;
}

export interface AppState {
  owner: string;
  name: string;
  repo: RepoData | null;
  commits: CommitItem[] | null;
  pulls: PullItem[] | null;
  issues: IssueItem[] | null;
  runs: RunItem[] | null;
  languages: Record<string, number> | null;
}
