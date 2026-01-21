import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_GITHUB_ORG } from './github.js';

/**
 * Create a Claude client with the provided API key
 */
function createClient(apiKey) {
  return new Anthropic({ apiKey });
}

const DEFAULT_SYSTEM_PROMPT = `You are an expert assistant for the configured GitHub organization with deep knowledge of its codebase, practices, and history.

Your role is to search for and provide the most relevant information related to questions about the organization's projects.

When answering questions:
1. Base your answers on the search results provided
2. Always include relevant links to GitHub resources (issues, PRs, code files)
3. If you can't find relevant information, say so clearly
4. Be concise but thorough
5. Format your responses using Markdown for readability

**Important: When recommending approaches, patterns, or tools:**
- Prioritize MORE RECENT usage over frequency of occurrence
- The organization's practices evolve over time—newer projects reflect current best practices
- If an older pattern appears more frequently but a newer approach exists in recent projects, recommend the newer approach
- Always note when a practice has changed (e.g., "While older projects used X, the team has since adopted Y")

If the search results don't contain relevant information to answer the question, suggest what the user might search for instead.`;

/**
 * Get the default system prompt
 */
export function getDefaultSystemPrompt() {
  return DEFAULT_SYSTEM_PROMPT;
}

/**
 * Format GitHub search results into a readable context for the LLM
 */
function formatGitHubContext(searchResults) {
  let context = '';

  if (searchResults.issues && searchResults.issues.length > 0) {
    context += '## Issues Found\n\n';
    searchResults.issues.forEach((issue, i) => {
      context += `### ${i + 1}. ${issue.title}\n`;
      context += `- **Repository**: ${issue.repository?.nameWithOwner || 'Unknown'}\n`;
      context += `- **State**: ${issue.state}\n`;
      context += `- **URL**: ${issue.url}\n`;
      context += `- **Author**: ${issue.author?.login || 'Unknown'}\n`;
      if (issue.body) {
        const truncatedBody = issue.body.length > 500 ? issue.body.substring(0, 500) + '...' : issue.body;
        context += `- **Description**: ${truncatedBody}\n`;
      }
      context += '\n';
    });
  }

  if (searchResults.pullRequests && searchResults.pullRequests.length > 0) {
    context += '## Pull Requests Found\n\n';
    searchResults.pullRequests.forEach((pr, i) => {
      context += `### ${i + 1}. ${pr.title}\n`;
      context += `- **Repository**: ${pr.repository?.nameWithOwner || 'Unknown'}\n`;
      context += `- **State**: ${pr.state}\n`;
      context += `- **URL**: ${pr.url}\n`;
      context += `- **Author**: ${pr.author?.login || 'Unknown'}\n`;
      if (pr.body) {
        const truncatedBody = pr.body.length > 500 ? pr.body.substring(0, 500) + '...' : pr.body;
        context += `- **Description**: ${truncatedBody}\n`;
      }
      context += '\n';
    });
  }

  if (searchResults.code && searchResults.code.length > 0) {
    context += '## Code Files Found\n\n';
    searchResults.code.forEach((file, i) => {
      context += `${i + 1}. **${file.path}** in ${file.repository?.nameWithOwner || 'Unknown'}\n`;
      context += `   - URL: ${file.url}\n`;
    });
    context += '\n';
  }

  if (searchResults.commits && searchResults.commits.length > 0) {
    context += '## Commits Found\n\n';
    searchResults.commits.forEach((commit, i) => {
      const message = commit.commit?.message || 'No message';
      const truncatedMessage = message.length > 200 ? message.substring(0, 200) + '...' : message;
      context += `${i + 1}. **${truncatedMessage}**\n`;
      context += `   - Repository: ${commit.repository?.nameWithOwner || 'Unknown'}\n`;
      context += `   - URL: ${commit.url}\n`;
    });
    context += '\n';
  }

  return context;
}

/**
 * Generate a response using Claude
 */
export async function generateResponse(apiKey, userQuery, searchResults, org = DEFAULT_GITHUB_ORG, customSystemPrompt = null) {
  const client = createClient(apiKey);

  const githubContext = formatGitHubContext(searchResults);

  const systemPrompt = customSystemPrompt || getDefaultSystemPrompt();

  const userMessage = `# User Question
${userQuery}

# GitHub Search Results
${githubContext || 'No results found for this search.'}

# Search Summary
- Issues found: ${searchResults.summary?.issuesFound || 0}
- Pull requests found: ${searchResults.summary?.prsFound || 0}
- Code files found: ${searchResults.summary?.codeFilesFound || 0}
- Commits found: ${searchResults.summary?.commitsFound || 0}

Please answer the user's question based on the search results above.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userMessage }
    ],
  });

  return response.content[0].text;
}

/**
 * Extract search keywords from a user query using Claude
 */
export async function extractSearchKeywords(apiKey, userQuery) {
  const client = createClient(apiKey);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: `Extract 1-3 search keywords or phrases from the user's question that would be most effective for searching GitHub issues, PRs, and code.
Return ONLY the keywords/phrases, one per line, no explanations or numbering.
Focus on technical terms, feature names, or specific concepts mentioned.`,
    messages: [
      { role: 'user', content: userQuery }
    ],
  });

  const keywords = response.content[0].text
    .split('\n')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  return keywords;
}
