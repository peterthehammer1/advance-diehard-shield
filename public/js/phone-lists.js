const PhoneLists = {
  async load() {
    try {
      const entries = await API.get('/api/phone-lists');
      this.render(entries);
    } catch (err) {
      console.error('Failed to load phone lists:', err);
    }
  },

  render(entries) {
    const whitelistContainer = document.getElementById('whitelist-entries');
    const blacklistContainer = document.getElementById('blacklist-entries');

    whitelistContainer.innerHTML = '';
    blacklistContainer.innerHTML = '';

    const whitelist = entries.filter(e => e.list_type === 'whitelist');
    const blacklist = entries.filter(e => e.list_type === 'blacklist');

    if (whitelist.length === 0) {
      whitelistContainer.innerHTML = '<div class="empty-message">No whitelist entries</div>';
    }
    if (blacklist.length === 0) {
      blacklistContainer.innerHTML = '<div class="empty-message">No blacklist entries</div>';
    }

    whitelist.forEach(entry => {
      whitelistContainer.appendChild(this.createEntryElement(entry));
    });
    blacklist.forEach(entry => {
      blacklistContainer.appendChild(this.createEntryElement(entry));
    });
  },

  createEntryElement(entry) {
    const el = document.createElement('div');
    el.className = 'list-entry';
    el.innerHTML = `
      <div class="list-entry-info">
        <span class="list-entry-phone">${entry.phone_number}</span>
        <span class="list-entry-label">${entry.label || 'No label'}</span>
      </div>
      <button class="btn-remove" data-id="${entry.id}">Remove</button>
    `;

    el.querySelector('.btn-remove').addEventListener('click', async () => {
      try {
        await API.del(`/api/phone-lists/${entry.id}`);
        this.load();
      } catch (err) {
        console.error('Failed to remove entry:', err);
      }
    });

    return el;
  },

  init() {
    document.getElementById('whitelist-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      await this.addEntry(form, 'whitelist');
    });

    document.getElementById('blacklist-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      await this.addEntry(form, 'blacklist');
    });
  },

  async addEntry(form, listType) {
    const phone_number = form.phone_number.value.trim();
    const label = form.label.value.trim();

    if (!phone_number) return;

    try {
      await API.post('/api/phone-lists', {
        phone_number,
        list_type: listType,
        label: label || null
      });
      form.reset();
      this.load();
    } catch (err) {
      console.error('Failed to add entry:', err);
    }
  }
};
