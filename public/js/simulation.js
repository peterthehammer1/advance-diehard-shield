const Simulation = {
  async loadProfiles() {
    try {
      const profiles = await API.get('/api/simulation/profiles');
      this.renderProfiles(profiles);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  },

  renderProfiles(profiles) {
    const container = document.getElementById('sim-profiles');
    container.innerHTML = '';

    const traitDescriptions = {
      legitimate: 'Long calls, single store, passes IVR — should always be allowed through.',
      robocaller: 'Very short calls, hits multiple stores, fails IVR — should be blocked.',
      mixed: 'Varies between normal and suspicious behavior — classification depends on recent history.'
    };

    profiles.forEach(profile => {
      const card = document.createElement('div');
      card.className = `profile-card ${profile.behavior}`;
      card.innerHTML = `
        <h4>${profile.label}</h4>
        <div class="profile-phone">${profile.phone_number}</div>
        <div class="profile-traits">${traitDescriptions[profile.behavior] || ''}</div>
        <button class="btn-trigger" data-id="${profile.id}">Trigger Single Call</button>
      `;

      card.querySelector('.btn-trigger').addEventListener('click', async () => {
        const btn = card.querySelector('.btn-trigger');
        btn.textContent = 'Sending...';
        btn.disabled = true;
        try {
          await API.post('/api/simulation/single', { profile_id: profile.id });
        } catch (err) {
          console.error('Failed to trigger call:', err);
        }
        setTimeout(() => {
          btn.textContent = 'Trigger Single Call';
          btn.disabled = false;
        }, 500);
      });

      container.appendChild(card);
    });
  },

  async updateStatus() {
    try {
      const status = await API.get('/api/simulation/status');
      const statusText = document.getElementById('sim-status-text');
      const startBtn = document.getElementById('sim-start');
      const stopBtn = document.getElementById('sim-stop');

      if (status.running) {
        statusText.textContent = `Running (${status.callCount} calls generated)`;
        statusText.className = 'status-running';
        startBtn.disabled = true;
        stopBtn.disabled = false;
      } else {
        statusText.textContent = 'Stopped';
        statusText.className = 'status-stopped';
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
    } catch (err) {
      console.error('Failed to get simulation status:', err);
    }
  },

  init() {
    document.getElementById('sim-start').addEventListener('click', async () => {
      try {
        await API.post('/api/simulation/start', { interval: 3000 });
        this.updateStatus();
      } catch (err) {
        console.error('Failed to start simulation:', err);
      }
    });

    document.getElementById('sim-stop').addEventListener('click', async () => {
      try {
        await API.post('/api/simulation/stop');
        this.updateStatus();
      } catch (err) {
        console.error('Failed to stop simulation:', err);
      }
    });
  }
};
