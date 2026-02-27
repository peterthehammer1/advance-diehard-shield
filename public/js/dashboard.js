const Dashboard = {
  async loadMetrics() {
    try {
      const metrics = await API.get('/api/calls/metrics');
      document.getElementById('metric-total').textContent = metrics.total;
      document.getElementById('metric-blocked').textContent =
        `${metrics.blocked} (${metrics.blocked_pct}%)`;
      document.getElementById('metric-allowed').textContent =
        `${metrics.allowed} (${metrics.allowed_pct}%)`;
      document.getElementById('metric-false-positives').textContent = metrics.false_positives;

      this.renderBreakdown(metrics.by_classification, metrics.total);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    }
  },

  renderBreakdown(byClassification, total) {
    const container = document.getElementById('classification-bars');
    const labels = {
      blacklisted: 'Blacklisted',
      whitelisted: 'Whitelisted',
      spam_detected: 'Spam Detected',
      legitimate: 'Legitimate',
      unknown: 'Unknown'
    };

    container.innerHTML = '';
    for (const [key, label] of Object.entries(labels)) {
      const count = byClassification[key] || 0;
      const pct = total > 0 ? (count / total) * 100 : 0;

      const bar = document.createElement('div');
      bar.className = 'breakdown-bar';
      bar.innerHTML = `
        <span class="bar-label">${label}</span>
        <div class="bar-track">
          <div class="bar-fill ${key}" style="width: ${Math.max(pct, 0.5)}%"></div>
        </div>
        <span class="bar-count">${count}</span>
      `;
      container.appendChild(bar);
    }
  },

  async loadAutoWhitelisted() {
    try {
      const rows = await API.get('/api/calls/auto-whitelisted');
      const container = document.getElementById('auto-whitelist-feed');
      if (rows.length === 0) {
        container.innerHTML = '<div class="empty-message">No numbers auto-whitelisted yet</div>';
        return;
      }
      container.innerHTML = '';
      rows.forEach(row => {
        const el = document.createElement('div');
        el.className = 'feed-item';
        const time = new Date(row.whitelisted_at).toLocaleTimeString();
        const dur = row.duration_seconds ? `${row.duration_seconds}s` : '';
        el.innerHTML = `
          <span class="feed-time">${time}</span>
          <span class="badge badge-whitelisted">whitelisted</span>
          <span class="feed-number">${row.from_number}</span>
          <span class="feed-label">${row.to_store}</span>
          <span class="feed-reason">Passed screening${dur ? ' (' + dur + ')' : ''}</span>
        `;
        container.appendChild(el);
      });
    } catch (err) {
      console.error('Failed to load auto-whitelisted:', err);
    }
  },

  addToFeed(call) {
    const feed = document.getElementById('live-feed');
    const time = new Date(call.created_at).toLocaleTimeString();
    const label = call.caller_label || '';

    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `
      <span class="feed-time">${time}</span>
      <span class="badge badge-${call.action}">${call.action}</span>
      <span class="feed-number">${call.from_number}</span>
      <span class="feed-label">${label}</span>
      <span class="badge badge-${call.classification}">${call.classification.replace('_', ' ')}</span>
      <span class="feed-reason">${call.reason}</span>
    `;

    feed.insertBefore(item, feed.firstChild);

    // Keep only last 30 items
    while (feed.children.length > 30) {
      feed.removeChild(feed.lastChild);
    }

    // Refresh metrics
    this.loadMetrics();
  }
};
