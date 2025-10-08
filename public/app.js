// public/app.js
// Connects to WebSocket server and renders the UI, sending actions back to server.

(function () {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  const issuesBody = document.getElementById('issuesBody');
  const createForm = document.getElementById('createForm');

  let currentIssues = [];

  // Helpers to send actions
  function send(action) {
    ws.send(JSON.stringify(action));
  }

  // Render functions
  function renderIssues(issues) {
    currentIssues = issues.slice().sort((a,b) => a.id - b.id);
    issuesBody.innerHTML = '';
    for (const issue of currentIssues) {
      const tr = document.createElement('tr');

      // ID
      const tdId = document.createElement('td');
      tdId.textContent = issue.id;
      tr.appendChild(tdId);

      // Title
      const tdTitle = document.createElement('td');
      tdTitle.innerHTML = `<strong>${escapeHtml(issue.title)}</strong><div class="small-note">Created: ${new Date(issue.createdAt).toLocaleString()}</div>`;
      tr.appendChild(tdTitle);

      // Description
      const tdDesc = document.createElement('td');
      tdDesc.textContent = issue.description || '';
      tr.appendChild(tdDesc);

      // Status
      const tdStatus = document.createElement('td');
      const select = document.createElement('select');
      select.className = 'status-select';
      for (const s of ['Open', 'In Progress', 'Closed']) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.text = s;
        if (issue.status === s) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        const actor = prompt('Your name for this change:', 'Anonymous') || 'Anonymous';
        send({ type: 'update_issue', id: issue.id, fields: { status: select.value }, actor });
      });
      tdStatus.appendChild(select);
      tr.appendChild(tdStatus);

      // CreatedBy
      const tdBy = document.createElement('td');
      tdBy.textContent = issue.createdBy || '';
      tr.appendChild(tdBy);

      // Comments
      const tdComments = document.createElement('td');
      tdComments.style.minWidth = '220px';
      if (issue.comments && issue.comments.length) {
        for (const c of issue.comments.slice().reverse()) {
          const div = document.createElement('div');
          div.className = 'comment';
          div.innerHTML = `<div style="font-weight:600">${escapeHtml(c.author)}</div><div>${escapeHtml(c.text)}</div><div class="small-note">${new Date(c.createdAt).toLocaleString()}</div>`;
          tdComments.appendChild(div);
        }
      } else {
        tdComments.innerHTML = '<div class="small-note">No comments</div>';
      }
      tr.appendChild(tdComments);

      // Actions: quick add comment + update title/desc
      const tdActions = document.createElement('td');

      // comment form
      const commentForm = document.createElement('div');
      commentForm.className = 'comment-form';
      const authorInput = document.createElement('input');
      authorInput.placeholder = 'Your name';
      const textInput = document.createElement('input');
      textInput.placeholder = 'Write a comment...';
      const sendBtn = document.createElement('button');
      sendBtn.textContent = 'Post';
      sendBtn.addEventListener('click', () => {
        const author = authorInput.value.trim() || 'Anonymous';
        const text = textInput.value.trim();
        if (!text) return alert('Comment cannot be empty');
        send({ type: 'add_comment', id: issue.id, comment: { author, text } });
        authorInput.value = '';
        textInput.value = '';
      });
      commentForm.appendChild(authorInput);
      commentForm.appendChild(textInput);
      commentForm.appendChild(sendBtn);
      tdActions.appendChild(commentForm);

      // Quick edit button for title/description
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.style.marginTop = '8px';
      editBtn.addEventListener('click', () => {
        const newTitle = prompt('Edit title', issue.title);
        if (newTitle === null) return;
        const newDesc = prompt('Edit description', issue.description || '');
        if (newDesc === null) return;
        const actor = prompt('Your name for this update:', 'Anonymous') || 'Anonymous';
        send({ type: 'update_issue', id: issue.id, fields: { title: newTitle, description: newDesc }, actor });
      });
      tdActions.appendChild(editBtn);

      tr.appendChild(tdActions);

      issuesBody.appendChild(tr);
    }
  }

  // Escape helper
  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // WebSocket handlers
  ws.addEventListener('open', () => {
    console.log('WebSocket connected');
  });
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'init' || msg.type === 'update') {
        renderIssues(msg.issues || []);
      } else if (msg.type === 'error') {
        alert('Server error: ' + (msg.message || 'unknown'));
      }
    } catch (e) {
      console.error('Bad ws message', e);
    }
  });
  ws.addEventListener('close', () => {
    console.warn('WebSocket closed. Reload the page to retry.');
  });

  // Create form submit
  createForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();
    const createdBy = document.getElementById('createdBy').value.trim() || 'Anonymous';
    if (!title) return alert('Title required');
    send({ type: 'create_issue', issue: { title, description, createdBy } });
    createForm.reset();
  });

})();
