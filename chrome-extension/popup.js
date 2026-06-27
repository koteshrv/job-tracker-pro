document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  
  const loginBtn = document.getElementById('loginBtn');
  const saveBtn = document.getElementById('saveBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  
  const loginView = document.getElementById('loginView');
  const actionView = document.getElementById('actionView');
  
  const activeUserSpan = document.getElementById('activeUser');
  const statusDiv = document.getElementById('status');

  const jobCompanyInput = document.getElementById('jobCompany');
  const jobTitleInput = document.getElementById('jobTitle');
  const parseIndicator = document.getElementById('parseIndicator');

  const saveIcon = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  `;

  // Check auth status on load
  chrome.storage.local.get(['token', 'apiUrl', 'username'], (result) => {
    if (result.apiUrl) apiUrlInput.value = result.apiUrl;
    
    if (result.token) {
      showActionView(result.username || 'admin');
    } else {
      showLoginView();
    }
  });

  function showLoginView() {
    loginView.classList.remove('hidden');
    actionView.classList.add('hidden');
    statusDiv.className = "";
    statusDiv.innerText = "";
  }

  async function showActionView(username) {
    loginView.classList.add('hidden');
    actionView.classList.remove('hidden');
    activeUserSpan.innerText = `Connected as ${username}`;
    statusDiv.className = "";
    statusDiv.innerText = "";

    // Pre-populate & run AI parser immediately
    saveBtn.disabled = true;
    parseIndicator.classList.remove('hidden');
    jobCompanyInput.value = "";
    jobTitleInput.value = "";
    jobCompanyInput.disabled = true;
    jobTitleInput.disabled = true;

    chrome.storage.local.get(['token', 'apiUrl'], async (stored) => {
      const { token, apiUrl } = stored;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error("No active tab");

        const pageTitle = tab.title || "Unknown Job Page";
        
        // Fetch parsing from API
        const response = await fetch(`${apiUrl}/api/jobs/extension/parse-title?page_title=${encodeURIComponent(pageTitle)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error("Could not parse");
        }

        const data = await response.json();
        jobCompanyInput.value = data.company || "Unknown Company";
        jobTitleInput.value = data.title || pageTitle;
      } catch (err) {
        // Fallback to raw page title
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          jobCompanyInput.value = "Unknown Company";
          jobTitleInput.value = tab ? tab.title : "Unknown Title";
        } catch {
          jobCompanyInput.value = "Unknown Company";
          jobTitleInput.value = "Unknown Title";
        }
      } finally {
        // Enable fields so the user can review and edit
        jobCompanyInput.disabled = false;
        jobTitleInput.disabled = false;
        parseIndicator.classList.add('hidden');
        saveBtn.disabled = false;
      }
    });
  }

  // Handle Login
  loginBtn.addEventListener('click', async () => {
    const apiUrl = apiUrlInput.value.replace(/\/$/, "");
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showStatus("Please enter credentials", "error");
      return;
    }

    loginBtn.disabled = true;
    loginBtn.innerText = "Authenticating...";
    statusDiv.className = "";
    statusDiv.innerText = "";

    try {
      const response = await fetch(`${apiUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        throw new Error("Invalid username or password");
      }

      const data = await response.json();
      
      chrome.storage.local.set({ 
        token: data.token, 
        apiUrl: apiUrl,
        username: username
      }, () => {
        showActionView(username);
      });
    } catch (err) {
      showStatus(err.message || "Failed to log in", "error");
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerText = "Log In & Sync";
    }
  });

  // Handle Save Job
  saveBtn.addEventListener('click', async () => {
    chrome.storage.local.get(['token', 'apiUrl'], async (stored) => {
      const { token, apiUrl } = stored;
      
      if (!token) {
        showStatus("Session expired. Please log in again.", "error");
        showLoginView();
        return;
      }

      const company = jobCompanyInput.value.trim();
      const title = jobTitleInput.value.trim();

      if (!company || !title) {
        showStatus("Please fill in Company and Job Title", "error");
        return;
      }

      saveBtn.disabled = true;
      saveBtn.innerHTML = `
        <svg class="pulse" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        Extracting page content...
      `;
      statusDiv.className = "";
      statusDiv.innerText = "";

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error("No active tab found");

        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const clone = document.body.cloneNode(true);
            const elementsToRemove = clone.querySelectorAll('script, style, noscript, nav, footer, header');
            elementsToRemove.forEach(el => el.remove());
            
            return {
              url: window.location.href,
              page_title: document.title,
              description: clone.innerText.substring(0, 15000)
            };
          }
        });

        saveBtn.innerHTML = `
          <svg class="pulse" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
            <polyline points="17 6 23 6 23 12"></polyline>
          </svg>
          Saving & Sanitizing JD...
        `;

        // Send custom Company + Title alongside scraped content
        const payload = {
          url: result.url,
          page_title: result.page_title,
          description: result.description,
          company: company,
          title: title
        };

        const response = await fetch(`${apiUrl}/api/jobs/extension`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          if (response.status === 401) {
            chrome.storage.local.remove(['token']);
            showLoginView();
            throw new Error("Session expired. Please log in again.");
          }
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Server returned " + response.status);
        }

        const data = await response.json();
        showStatus(`Saved: ${data.company} - ${data.title}`, "success");
      } catch (err) {
        showStatus(err.message || "Failed to save job", "error");
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `${saveIcon} Save Active Job`;
      }
    });
  });

  // Handle Logout
  logoutBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['token', 'username'], () => {
      showLoginView();
    });
  });

  function showStatus(message, className) {
    statusDiv.className = className;
    statusDiv.innerText = message;
  }
});
