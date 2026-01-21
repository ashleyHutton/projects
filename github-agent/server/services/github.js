import { Octokit } from '@octokit/rest';

export const DEFAULT_GITHUB_ORG = process.env.GITHUB_ORG || 'brandnewbox';

/**
 * Create an authenticated Octokit client
 */
function createClient(token) {
  return new Octokit({ auth: token });
}

/**
 * List all repositories in the organization
 */
export async function listRepos(token, org = DEFAULT_GITHUB_ORG) {
  const octokit = createClient(token);

  try {
    const { data } = await octokit.repos.listForOrg({
      org,
      per_page: 100,
      sort: 'updated',
      direction: 'desc',
    });

    return data.map(repo => ({
      name: repo.name,
      description: repo.description,
      url: repo.html_url,
      updatedAt: repo.updated_at,
    }));
  } catch (error) {
    console.error('Error listing repos:', error.message);
    return [];
  }
}

/**
 * Search issues across the organization
 */
export async function searchIssues(token, query, org = DEFAULT_GITHUB_ORG, limit = 20) {
  const octokit = createClient(token);
  const searchQuery = `${query} org:${org} is:issue`;

  try {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: searchQuery,
      per_page: limit,
      sort: 'updated',
      order: 'desc',
    });

    return data.items.map(issue => ({
      title: issue.title,
      body: issue.body,
      url: issue.html_url,
      repository: {
        nameWithOwner: issue.repository_url.split('/').slice(-2).join('/'),
      },
      state: issue.state,
      createdAt: issue.created_at,
      author: { login: issue.user?.login },
    }));
  } catch (error) {
    console.error('Error searching issues:', error.message);
    return [];
  }
}

/**
 * Search pull requests across the organization
 */
export async function searchPullRequests(token, query, org = DEFAULT_GITHUB_ORG, limit = 20) {
  const octokit = createClient(token);
  const searchQuery = `${query} org:${org} is:pr`;

  try {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: searchQuery,
      per_page: limit,
      sort: 'updated',
      order: 'desc',
    });

    return data.items.map(pr => ({
      title: pr.title,
      body: pr.body,
      url: pr.html_url,
      repository: {
        nameWithOwner: pr.repository_url.split('/').slice(-2).join('/'),
      },
      state: pr.state,
      createdAt: pr.created_at,
      author: { login: pr.user?.login },
    }));
  } catch (error) {
    console.error('Error searching PRs:', error.message);
    return [];
  }
}

/**
 * Search code across the organization
 */
export async function searchCode(token, query, org = DEFAULT_GITHUB_ORG, limit = 20) {
  const octokit = createClient(token);
  const searchQuery = `${query} org:${org}`;

  try {
    const { data } = await octokit.search.code({
      q: searchQuery,
      per_page: limit,
    });

    return data.items.map(file => ({
      path: file.path,
      repository: {
        nameWithOwner: file.repository.full_name,
      },
      url: file.html_url,
    }));
  } catch (error) {
    console.error('Error searching code:', error.message);
    return [];
  }
}

/**
 * Search commits across the organization
 */
export async function searchCommits(token, query, org = DEFAULT_GITHUB_ORG, limit = 20) {
  const octokit = createClient(token);
  const searchQuery = `${query} org:${org}`;

  try {
    const { data } = await octokit.search.commits({
      q: searchQuery,
      per_page: limit,
      sort: 'committer-date',
      order: 'desc',
    });

    return data.items.map(item => ({
      sha: item.sha,
      commit: {
        message: item.commit.message,
      },
      repository: {
        nameWithOwner: item.repository.full_name,
      },
      url: item.html_url,
    }));
  } catch (error) {
    console.error('Error searching commits:', error.message);
    return [];
  }
}

/**
 * Perform a comprehensive search across all GitHub data types
 */
export async function comprehensiveSearch(token, query, org = DEFAULT_GITHUB_ORG) {
  console.log(`Searching GitHub for: "${query}" in org:${org}`);

  // Run searches in parallel
  const [issues, prs, code, commits] = await Promise.all([
    searchIssues(token, query, org, 10),
    searchPullRequests(token, query, org, 10),
    searchCode(token, query, org, 10),
    searchCommits(token, query, org, 5),
  ]);

  return {
    issues,
    pullRequests: prs,
    code,
    commits,
    summary: {
      issuesFound: issues.length,
      prsFound: prs.length,
      codeFilesFound: code.length,
      commitsFound: commits.length,
    }
  };
}
