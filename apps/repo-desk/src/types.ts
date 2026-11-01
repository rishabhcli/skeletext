export interface RepoRef {
  owner: string;
  name: string;
}

export interface RepoInfo {
  fullName: string;
  description: string;
  stars: number;
  forks: number;
  /** GitHub counts pull requests in this number. */
  openIssuesAndPulls: number;
  language: string | null;
  license: string | null;
  pushedAt: number | null;
  defaultBranch: string;
  archived: boolean;
}

export interface CommitItem {
  sha: string;
  message: string;
  author: string;
  date: number;
}

export interface PullItem {
  number: number;
  title: string;
  author: string;
  draft: boolean;
  createdAt: number;
}

export interface IssueItem {
  number: number;
  title: string;
  author: string;
  createdAt: number;
}

export interface RunItem {
  name: string;
  status: string;
  conclusion: string | null;
  branch: string;
  runNumber: number;
  createdAt: number;
}

export interface LanguageShare {
  name: string;
  bytes: number;
}
