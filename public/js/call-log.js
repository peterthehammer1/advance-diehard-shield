const CallLog = {
  currentOffset: 0,
  pageSize: 25,
  currentFilter: '',

  async load() {
    try {
      let url = `/api/calls?limit=${this.pageSize}&offset=${this.currentOffset}`;
      if (this.currentFilter) {
        url += `&classification=${this.currentFilter}`;
      }

      const data = await API.get(url);
      this.render(data.calls);
      this.updatePagination(data.total);
    } catch (err) {
      console.error('Failed to load call log:', err);
    }
  },

  render(calls) {
    const tbody = document.getElementById('call-log-body');
    tbody.innerHTML = '';

    if (calls.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-message">No calls found</td></tr>';
      return;
    }

    calls.forEach(call => {
      const tr = document.createElement('tr');
      const time = new Date(call.created_at).toLocaleString();
      const duration = call.duration_seconds != null ? `${call.duration_seconds}s` : '—';
      const isFP = call.flagged_false_positive;
      const isFN = call.flagged_false_negative;

      tr.innerHTML = `
        <td>${time}</td>
        <td>${call.from_number}</td>
        <td>${call.to_store}</td>
        <td>${duration}</td>
        <td><span class="badge badge-${call.classification}">${call.classification.replace('_', ' ')}</span></td>
        <td><span class="badge badge-${call.action}">${call.action}</span></td>
        <td>${call.reason || ''}</td>
        <td>
          <button class="btn-flag ${isFP ? 'flagged' : ''}" data-id="${call.id}" data-type="fp"
            title="Flag as false positive">FP</button>
          <button class="btn-flag ${isFN ? 'flagged' : ''}" data-id="${call.id}" data-type="fn"
            title="Flag as false negative">FN</button>
        </td>
      `;

      // Flag button handlers
      tr.querySelectorAll('.btn-flag').forEach(btn => {
        btn.addEventListener('click', async () => {
          const callId = btn.dataset.id;
          const isFpBtn = btn.dataset.type === 'fp';
          const currentlyFlagged = btn.classList.contains('flagged');

          try {
            const body = isFpBtn
              ? { false_positive: !currentlyFlagged }
              : { false_negative: !currentlyFlagged };
            await API.patch(`/api/calls/${callId}/flag`, body);
            btn.classList.toggle('flagged');
            Dashboard.loadMetrics();
          } catch (err) {
            console.error('Failed to flag call:', err);
          }
        });
      });

      tbody.appendChild(tr);
    });
  },

  updatePagination(total) {
    const prevBtn = document.getElementById('log-prev');
    const nextBtn = document.getElementById('log-next');
    const info = document.getElementById('log-page-info');

    const page = Math.floor(this.currentOffset / this.pageSize) + 1;
    const totalPages = Math.ceil(total / this.pageSize);

    info.textContent = `Page ${page} of ${totalPages} (${total} calls)`;
    prevBtn.disabled = this.currentOffset === 0;
    nextBtn.disabled = this.currentOffset + this.pageSize >= total;
  },

  init() {
    document.getElementById('log-filter').addEventListener('change', (e) => {
      this.currentFilter = e.target.value;
      this.currentOffset = 0;
      this.load();
    });

    document.getElementById('log-prev').addEventListener('click', () => {
      this.currentOffset = Math.max(0, this.currentOffset - this.pageSize);
      this.load();
    });

    document.getElementById('log-next').addEventListener('click', () => {
      this.currentOffset += this.pageSize;
      this.load();
    });
  }
};
