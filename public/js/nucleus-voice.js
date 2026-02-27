const NucleusVoice = {
  async loadStatus() {
    try {
      const status = await API.get('/api/retell/status');

      // API key status
      const apiStatus = document.getElementById('nv-api-status');
      if (status.retell_api_key_set) {
        apiStatus.textContent = 'Configured';
        apiStatus.className = 'status-running';
      } else {
        apiStatus.textContent = 'Not configured';
        apiStatus.className = 'status-stopped';
      }

      // Webhook URL
      document.getElementById('nv-webhook-url').textContent =
        status.webhook_base_url || 'Not set (WEBHOOK_BASE_URL env var)';

      // Agents
      this.renderAgents(status.agents);

      // Phone numbers
      this.renderNumbers(status.phone_numbers);
    } catch (err) {
      console.error('Failed to load Nucleus Voice status:', err);
    }
  },

  renderAgents(agents) {
    const container = document.getElementById('nv-agents');

    if (agents.length === 0) {
      container.innerHTML = '<div class="empty-message">No agents created yet. Click "Run Setup" to create them.</div>';
      return;
    }

    const typeLabels = {
      assistant: { label: 'Store Assistant', desc: 'Greets whitelisted callers by name and helps with inquiries', color: 'legitimate' },
      blocked: { label: 'Call Blocked', desc: 'Delivers spam notification message and ends the call', color: 'robocaller' },
      screening: { label: 'Call Screener', desc: 'Asks unknown callers to identify themselves and state their purpose', color: 'mixed' }
    };

    container.innerHTML = agents.map(agent => {
      const info = typeLabels[agent.agent_type] || { label: agent.name, desc: '', color: '' };
      return `
        <div class="profile-card ${info.color}">
          <h4>${info.label}</h4>
          <div class="profile-phone">${agent.agent_type}</div>
          <div class="profile-traits">${info.desc}</div>
          <div class="profile-traits" style="font-family: monospace; font-size: 11px;">ID: ${agent.retell_agent_id}</div>
        </div>
      `;
    }).join('');
  },

  renderNumbers(numbers) {
    const container = document.getElementById('nv-numbers');

    if (numbers.length === 0) {
      container.innerHTML = '<div class="empty-message">No phone numbers provisioned yet. Click "Run Setup" to provision them.</div>';
      return;
    }

    container.innerHTML = numbers.map(num => `
      <div class="profile-card legitimate">
        <h4>${num.nickname || num.store_name}</h4>
        <div class="profile-phone" style="font-size: 18px; font-weight: 700;">${num.phone_number}</div>
        <div class="profile-traits">Call this number to test the filtering for the ${num.store_name} store location.</div>
      </div>
    `).join('');
  },

  init() {
    document.getElementById('nv-setup').addEventListener('click', async () => {
      const btn = document.getElementById('nv-setup');
      btn.textContent = 'Setting up...';
      btn.disabled = true;
      try {
        const result = await API.post('/api/retell/setup', {});
        console.log('Setup result:', result);
        this.loadStatus();
      } catch (err) {
        console.error('Setup failed:', err);
        alert('Setup failed: ' + err.message);
      }
      btn.textContent = 'Run Setup';
      btn.disabled = false;
    });

    document.getElementById('nv-teardown').addEventListener('click', async () => {
      if (!confirm('This will delete all Nucleus voice agents and phone numbers. Continue?')) return;
      const btn = document.getElementById('nv-teardown');
      btn.textContent = 'Tearing down...';
      btn.disabled = true;
      try {
        await API.del('/api/retell/teardown');
        this.loadStatus();
      } catch (err) {
        console.error('Teardown failed:', err);
        alert('Teardown failed: ' + err.message);
      }
      btn.textContent = 'Teardown All';
      btn.disabled = false;
    });
  }
};
