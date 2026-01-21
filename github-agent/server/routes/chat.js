import express from 'express';
import * as github from '../services/github.js';
import * as llm from '../services/llm.js';

const router = express.Router();

/**
 * POST /api/chat
 * Main chat endpoint - takes a question and returns an AI-generated answer
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, apiKey, githubToken, githubOrg, systemPrompt } = req.body;
    const org = githubOrg || github.DEFAULT_GITHUB_ORG;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic API key is required. Please enter it in settings.' });
    }

    if (!githubToken) {
      return res.status(400).json({ error: 'GitHub token is required. Please enter it in settings.' });
    }

    console.log(`Processing query: "${message}"`);

    // Step 1: Extract search keywords from the user's question
    console.log('Extracting search keywords...');
    const keywords = await llm.extractSearchKeywords(apiKey, message);
    console.log('Keywords:', keywords);

    // Step 2: Search GitHub using each keyword
    let allResults = {
      issues: [],
      pullRequests: [],
      code: [],
      commits: [],
    };

    for (const keyword of keywords) {
      const results = await github.comprehensiveSearch(githubToken, keyword, org);
      allResults.issues.push(...results.issues);
      allResults.pullRequests.push(...results.pullRequests);
      allResults.code.push(...results.code);
      allResults.commits.push(...results.commits);
    }

    // Deduplicate results by URL
    allResults.issues = deduplicateByUrl(allResults.issues);
    allResults.pullRequests = deduplicateByUrl(allResults.pullRequests);
    allResults.code = deduplicateByUrl(allResults.code);
    allResults.commits = deduplicateByUrl(allResults.commits);

    allResults.summary = {
      issuesFound: allResults.issues.length,
      prsFound: allResults.pullRequests.length,
      codeFilesFound: allResults.code.length,
      commitsFound: allResults.commits.length,
    };

    console.log('Search summary:', allResults.summary);

    // Step 3: Generate response using Claude
    console.log('Generating response...');
    const response = await llm.generateResponse(apiKey, message, allResults, org, systemPrompt);

    res.json({
      response,
      searchSummary: allResults.summary,
      keywords,
    });
  } catch (error) {
    console.error('Chat error:', error);

    // Check for specific API key errors
    if (error.message?.includes('401') || error.message?.includes('authentication')) {
      return res.status(401).json({ error: 'Invalid API key. Please check your Anthropic API key or GitHub token.' });
    }

    if (error.message?.includes('Bad credentials')) {
      return res.status(401).json({ error: 'Invalid GitHub token. Please check your GitHub Personal Access Token.' });
    }

    res.status(500).json({ error: 'An error occurred processing your request. Please try again.' });
  }
});

/**
 * GET /api/system-prompt
 * Get the default system prompt
 */
router.get('/system-prompt', (req, res) => {
  res.json({ systemPrompt: llm.getDefaultSystemPrompt() });
});

/**
 * POST /api/repos
 * List all repositories in the organization
 */
router.post('/repos', async (req, res) => {
  try {
    const { githubToken } = req.body;

    if (!githubToken) {
      return res.status(400).json({ error: 'GitHub token is required' });
    }

    const repos = await github.listRepos(githubToken);
    res.json({ repos, org: github.DEFAULT_GITHUB_ORG });
  } catch (error) {
    console.error('Error listing repos:', error);
    res.status(500).json({ error: 'Failed to list repositories' });
  }
});

/**
 * POST /api/search
 * Direct search endpoint (for debugging/testing)
 */
router.post('/search', async (req, res) => {
  try {
    const { query, githubToken } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!githubToken) {
      return res.status(400).json({ error: 'GitHub token is required' });
    }

    const results = await github.comprehensiveSearch(githubToken, query);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Helper function to deduplicate results by URL
 */
function deduplicateByUrl(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  });
}

export default router;
