// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

    // Refresh data when switching tabs
    const tabName = tab.dataset.tab;
    if (tabName === 'dashboard') Dashboard.loadMetrics();
    if (tabName === 'phone-lists') PhoneLists.load();
    if (tabName === 'call-log') CallLog.load();
    if (tabName === 'simulation') {
      Simulation.loadProfiles();
      Simulation.updateStatus();
    }
    if (tabName === 'nucleus-voice') {
      NucleusVoice.loadStatus();
    }
  });
});

// SSE connection for real-time updates
const eventSource = new EventSource('/api/calls/stream');
eventSource.onmessage = (event) => {
  try {
    const call = JSON.parse(event.data);
    Dashboard.addToFeed(call);

    // If call log tab is active, refresh it
    if (document.getElementById('tab-call-log').classList.contains('active')) {
      CallLog.load();
    }

    // Update simulation status if that tab is active
    if (document.getElementById('tab-simulation').classList.contains('active')) {
      Simulation.updateStatus();
    }
  } catch (err) {
    console.error('SSE parse error:', err);
  }
};

eventSource.onerror = () => {
  console.warn('SSE connection lost, will reconnect automatically');
};

// Initialize all modules
PhoneLists.init();
CallLog.init();
Simulation.init();
NucleusVoice.init();

// Load initial data
Dashboard.loadMetrics();
