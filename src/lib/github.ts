const GITHUB_USERNAME = import.meta.env.GITHUB_USERNAME || 'rhgrieve';

interface GitHubEvent {
  type: string;
  created_at: string;
  repo: { name: string };
  payload: {
    action?: string;
    ref?: string;
    ref_type?: string;
    commits?: { message: string }[];
    pull_request?: { title: string; html_url: string };
    issue?: { title: string; html_url: string };
  };
}

export interface GitHubActivity {
  type: 'push' | 'pr' | 'issue' | 'star' | 'create' | 'other';
  description: string;
  repo: string;
  url: string;
  timestamp: Date;
}

function summarize(event: GitHubEvent): GitHubActivity | null {
  const repo = event.repo.name;
  const repoUrl = `https://github.com/${repo}`;
  const ts = new Date(event.created_at);

  switch (event.type) {
    case 'PushEvent': {
      const commits = event.payload.commits || [];
      if (commits.length === 0) return null;
      const count = commits.length;
      const msg = commits[0]?.message?.split('\n')[0] || '';
      return {
        type: 'push',
        description: count === 1 ? msg : `${count} commits — ${msg}`,
        repo,
        url: repoUrl,
        timestamp: ts,
      };
    }
    case 'PullRequestEvent': {
      const pr = event.payload.pull_request;
      return {
        type: 'pr',
        description: `${event.payload.action} pr: ${pr?.title}`,
        repo,
        url: pr?.html_url || repoUrl,
        timestamp: ts,
      };
    }
    case 'IssuesEvent': {
      const issue = event.payload.issue;
      return {
        type: 'issue',
        description: `${event.payload.action} issue: ${issue?.title}`,
        repo,
        url: issue?.html_url || repoUrl,
        timestamp: ts,
      };
    }
    case 'WatchEvent':
      return {
        type: 'star',
        description: `starred ${repo}`,
        repo,
        url: repoUrl,
        timestamp: ts,
      };
    case 'CreateEvent':
      return {
        type: 'create',
        description: `created ${event.payload.ref_type}${event.payload.ref ? ` ${event.payload.ref}` : ''} in ${repo}`,
        repo,
        url: repoUrl,
        timestamp: ts,
      };
    default:
      return null;
  }
}

export async function getRecentActivity(limit = 30): Promise<GitHubActivity[]> {
  const res = await fetch(
    `https://api.github.com/users/${GITHUB_USERNAME}/events/public?per_page=${limit}`,
    { headers: { 'User-Agent': 'rhgblog', Accept: 'application/vnd.github.v3+json' } },
  );

  if (!res.ok) {
    console.error('[github] api error:', res.status, await res.text());
    return [];
  }

  const events = (await res.json()) as GitHubEvent[];
  return events.map(summarize).filter((e): e is GitHubActivity => e !== null);
}
