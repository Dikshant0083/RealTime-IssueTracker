
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { execFileSync } = require('child_process');
const PORT = process.env.PORT || 3000;
const APP_ROOT = __dirname;
const ISSUES_FILE = path.join(APP_ROOT, 'issues.json');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(APP_ROOT, 'public')));
app.use(express.json());

// Helper: ensure issues.json exists
function ensureIssuesFile() {
  if (!fs.existsSync(ISSUES_FILE)) {
    fs.writeFileSync(ISSUES_FILE, '[]', 'utf8');
    try {
      // if git exists and repo initialized, make initial commit
      execFileSync('git', ['add', 'issues.json']);
      execFileSync('git', ['commit', '-m', 'Initial issues.json created by server']);
    } catch (err) {
      // ignore if git not initialized yet
    }
  }
}

// Load issues from file
function loadIssues() {
  ensureIssuesFile();
  const raw = fs.readFileSync(ISSUES_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Could not parse issues.json, resetting to []', e);
    fs.writeFileSync(ISSUES_FILE, '[]', 'utf8');
    return [];
  }
}

// Save issues and commit to git with message
function saveIssuesAndCommit(issues, commitMessage) {
  fs.writeFileSync(ISSUES_FILE, JSON.stringify(issues, null, 2), 'utf8');

  // try to commit using git; errors are logged but not fatal
  try {
    execFileSync('git', ['add', ISSUES_FILE]);
    execFileSync('git', ['commit', '-m', commitMessage]);
    console.log('Committed to git:', commitMessage);
  } catch (err) {
    // If git isn't initialized or nothing to commit, print a helpful message.
    console.warn('Git commit failed (is git initialized?). Message:', commitMessage);
    // console.error(err);
  }
}

// Ensure a git repo exists, otherwise init one and set a default user
function ensureGitRepo() {
  const gitFolder = path.join(APP_ROOT, '.git');
  if (!fs.existsSync(gitFolder)) {
    try {
      execFileSync('git', ['init']);
      // Set a sensible default identity so commits have an author
      execFileSync('git', ['config', 'user.email', 'issue.tracker@example.com']);
      execFileSync('git', ['config', 'user.name', 'Issue Tracker']);
      console.log('Initialized new git repository with default user.');
    } catch (err) {
      console.warn('Could not initialize git repo automatically:', err.message);
    }
  }
}

// Utility: next ID
function nextId(issues) {
  const max = issues.reduce((m, it) => Math.max(m, it.id || 0), 0);
  return max + 1;
}

// Broadcast helper: send JSON to all clients
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// Handle incoming WS messages (expects JSON)
function handleMessage(raw, ws) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    return;
  }

  const issues = loadIssues();

  if (msg.type === 'create_issue') {
    const id = nextId(issues);
    const now = new Date().toISOString();
    const newIssue = {
      id,
      title: String(msg.issue.title || '').trim(),
      description: String(msg.issue.description || '').trim(),
      status: 'Open',
      createdBy: String(msg.issue.createdBy || 'Unknown').trim(),
      createdAt: now,
      comments: []
    };
    issues.push(newIssue);
    const cm = `Issue #${id} created by ${newIssue.createdBy}: ${newIssue.title}`;
    saveIssuesAndCommit(issues, cm);
    broadcast({ type: 'update', issues });
    return;
  }

  if (msg.type === 'update_issue') {
    // expect { id, fields: { title?, description?, status? }, actor }
    const id = Number(msg.id);
    const fields = msg.fields || {};
    const actor = msg.actor || 'Someone';
    const it = issues.find(x => x.id === id);
    if (!it) {
      ws.send(JSON.stringify({ type: 'error', message: 'Issue not found' }));
      return;
    }
    const changed = [];
    if (fields.title !== undefined) {
      it.title = String(fields.title);
      changed.push('title');
    }
    if (fields.description !== undefined) {
      it.description = String(fields.description);
      changed.push('description');
    }
    if (fields.status !== undefined) {
      it.status = String(fields.status);
      changed.push('status');
    }
    const cm = `Issue #${id} updated (${changed.join(', ') || 'no-op'}) by ${actor}`;
    saveIssuesAndCommit(issues, cm);
    broadcast({ type: 'update', issues });
    return;
  }

  if (msg.type === 'add_comment') {
    // expect { id, comment: { author, text } }
    const id = Number(msg.id);
    const it = issues.find(x => x.id === id);
    if (!it) {
      ws.send(JSON.stringify({ type: 'error', message: 'Issue not found' }));
      return;
    }
    const author = String(msg.comment.author || 'Anonymous');
    const text = String(msg.comment.text || '').trim();
    const now = new Date().toISOString();
    const comment = { author, text, createdAt: now };
    it.comments = it.comments || [];
    it.comments.push(comment);
    const cm = `Comment added to issue #${id} by ${author}`;
    saveIssuesAndCommit(issues, cm);
    broadcast({ type: 'update', issues });
    return;
  }

  ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
}

// Setup WebSocket behavior
wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');
  // send current issues on connect
  const issues = loadIssues();
  ws.send(JSON.stringify({ type: 'init', issues }));

  ws.on('message', (message) => {
    handleMessage(message, ws);
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Simple HTTP endpoint for debugging: return issues
app.get('/api/issues', (req, res) => {
  res.json(loadIssues());
});

// Start server
ensureGitRepo();
ensureIssuesFile();

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Open this URL in multiple browser windows to see live updates.');
});
