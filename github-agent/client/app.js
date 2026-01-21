// DOM Elements
const settingsPanel = document.getElementById('settings-panel');
const settingsBtn = document.getElementById('settings-btn');
const saveSettingsBtn = document.getElementById('save-settings');
const apiKeyInput = document.getElementById('api-key');
const githubTokenInput = document.getElementById('github-token');
const githubOrgInput = document.getElementById('github-org');
const systemPromptInput = document.getElementById('system-prompt');
const resetPromptBtn = document.getElementById('reset-prompt');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages');
const statusText = document.getElementById('status-text');
const sendBtn = document.getElementById('send-btn');

// State
let isLoading = false;
let defaultSystemPrompt = '';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved settings from localStorage
  const savedApiKey = localStorage.getItem('anthropic_api_key');
  const savedGithubToken = localStorage.getItem('github_token');
  const savedGithubOrg = localStorage.getItem('github_org');

  if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
  }

  if (savedGithubToken) {
    githubTokenInput.value = savedGithubToken;
  }

  if (savedGithubOrg) {
    githubOrgInput.value = savedGithubOrg;
  }

  // Show settings panel if either key is missing
  if (!savedApiKey || !savedGithubToken) {
    settingsPanel.classList.add('open');
  }

  // Load default system prompt from server
  await loadDefaultSystemPrompt();
});

async function loadDefaultSystemPrompt() {
  try {
    const response = await fetch('/api/system-prompt');
    const data = await response.json();
    defaultSystemPrompt = data.systemPrompt;

    // Load saved prompt or use default
    const savedPrompt = localStorage.getItem('system_prompt');
    systemPromptInput.value = savedPrompt || defaultSystemPrompt;
  } catch (error) {
    console.error('Failed to load default system prompt:', error);
  }
}

// Settings Panel
settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('open');
});

saveSettingsBtn.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  const githubToken = githubTokenInput.value.trim();
  const githubOrg = githubOrgInput.value.trim() || 'brandnewbox';

  if (!apiKey) {
    alert('Please enter your Anthropic API key');
    return;
  }

  if (!githubToken) {
    alert('Please enter your GitHub Personal Access Token');
    return;
  }

  localStorage.setItem('anthropic_api_key', apiKey);
  localStorage.setItem('github_token', githubToken);
  localStorage.setItem('github_org', githubOrg);

  // Save system prompt (or clear if using default)
  const customPrompt = systemPromptInput.value.trim();
  if (customPrompt && customPrompt !== defaultSystemPrompt) {
    localStorage.setItem('system_prompt', customPrompt);
  } else {
    localStorage.removeItem('system_prompt');
  }

  settingsPanel.classList.remove('open');
  statusText.textContent = 'Settings saved';
  setTimeout(() => {
    statusText.textContent = 'Ready';
  }, 2000);
});

// Reset system prompt to default
resetPromptBtn.addEventListener('click', () => {
  systemPromptInput.value = defaultSystemPrompt;
});

// Close settings panel when clicking outside
settingsPanel.addEventListener('click', (e) => {
  if (e.target === settingsPanel) {
    settingsPanel.classList.remove('open');
  }
});

// Chat Form
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const message = messageInput.value.trim();
  if (!message || isLoading) return;

  const apiKey = localStorage.getItem('anthropic_api_key');
  const githubToken = localStorage.getItem('github_token');

  if (!apiKey || !githubToken) {
    settingsPanel.classList.add('open');
    return;
  }

  // Add user message to chat
  addMessage(message, 'user');
  messageInput.value = '';

  // Show loading state
  isLoading = true;
  sendBtn.disabled = true;
  statusText.textContent = 'Searching GitHub and generating response...';
  const loadingMessage = addLoadingMessage();

  try {
    // Get custom system prompt if set
    const systemPrompt = localStorage.getItem('system_prompt') || null;
    const githubOrg = localStorage.getItem('github_org') || 'brandnewbox';

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, apiKey, githubToken, githubOrg, systemPrompt }),
    });

    const data = await response.json();

    // Remove loading message
    loadingMessage.remove();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get response');
    }

    // Add assistant response
    addMessage(data.response, 'assistant', data.searchSummary, data.keywords);

  } catch (error) {
    loadingMessage.remove();
    addMessage(`Error: ${error.message}`, 'assistant');
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    statusText.textContent = 'Ready';
  }
});

// Add a message to the chat
function addMessage(content, role, searchSummary = null, keywords = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  if (role === 'assistant') {
    contentDiv.innerHTML = formatMarkdown(content);

    // Add search info if available
    if (searchSummary && (searchSummary.issuesFound > 0 || searchSummary.prsFound > 0 || searchSummary.codeFilesFound > 0)) {
      const searchInfo = document.createElement('div');
      searchInfo.className = 'search-info';
      const parts = [];
      if (searchSummary.issuesFound > 0) parts.push(`${searchSummary.issuesFound} issues`);
      if (searchSummary.prsFound > 0) parts.push(`${searchSummary.prsFound} PRs`);
      if (searchSummary.codeFilesFound > 0) parts.push(`${searchSummary.codeFilesFound} code files`);
      if (searchSummary.commitsFound > 0) parts.push(`${searchSummary.commitsFound} commits`);
      searchInfo.textContent = `Searched: ${parts.join(', ')}`;
      if (keywords && keywords.length > 0) {
        searchInfo.textContent += ` | Keywords: ${keywords.join(', ')}`;
      }
      contentDiv.appendChild(searchInfo);
    }
  } else {
    contentDiv.textContent = content;
  }

  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);

  // Scroll to bottom smoothly
  requestAnimationFrame(() => {
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });

  return messageDiv;
}

// Add loading message
function addLoadingMessage() {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant loading';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = `
    <span>Thinking</span>
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;

  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);

  // Scroll to bottom smoothly
  requestAnimationFrame(() => {
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });

  return messageDiv;
}

// Simple markdown formatter
function formatMarkdown(text) {
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs (double newlines)
  html = html.replace(/\n\n/g, '</p><p>');

  // Single newlines to <br> (but not inside pre/code)
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');

  return html;
}

// Handle Enter key in input
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});
