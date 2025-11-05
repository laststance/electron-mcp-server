// Renderer Process Logic
// This file handles all UI interactions and state management

// State
let counter = 0;
const eventLog = [];

// Utility function to log events
function logEvent(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = {
    timestamp,
    message,
    type,
  };

  eventLog.push(logEntry);

  const logElement = document.getElementById('event-log');
  if (logElement) {
    const logItem = document.createElement('div');
    logItem.className = `log-item log-${type}`;
    logItem.textContent = `[${timestamp}] ${message}`;
    logElement.appendChild(logItem);

    // Auto-scroll to bottom
    logElement.scrollTop = logElement.scrollHeight;
  }

  console.log(`[${timestamp}] ${message}`);
}

// Basic Actions
function setupBasicActions() {
  const createBtn = document.getElementById('create-btn');
  const submitBtn = document.getElementById('submit-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const resultDiv = document.getElementById('action-result');

  if (createBtn) {
    createBtn.addEventListener('click', () => {
      resultDiv.textContent = '✅ Create New Item button clicked!';
      resultDiv.className = 'result-box success';
      logEvent('Create New Item button clicked', 'success');
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      resultDiv.textContent = '✅ Submit Form button clicked!';
      resultDiv.className = 'result-box success';
      logEvent('Submit Form button clicked', 'success');
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      resultDiv.textContent = '⚠️ Cancel Operation button clicked!';
      resultDiv.className = 'result-box warning';
      logEvent('Cancel Operation button clicked', 'warning');
    });
  }
}

// Form Handling
function setupFormHandling() {
  const form = document.getElementById('demo-form');
  const resultDiv = document.getElementById('form-result');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      resultDiv.innerHTML = `
        <strong>✅ Form Submitted Successfully!</strong><br>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `;
      resultDiv.className = 'result-box success';

      logEvent(`Form submitted: ${JSON.stringify(data)}`, 'success');
    });
  }

  // Individual input change listeners
  const inputs = ['name', 'email', 'age', 'description'];
  inputs.forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('change', (e) => {
        logEvent(`${id} changed to: ${e.target.value}`, 'info');
      });
    }
  });
}

// Selection Handling
function setupSelectionHandling() {
  const countrySelect = document.getElementById('country');
  const submitBtn = document.getElementById('selection-submit');
  const resultDiv = document.getElementById('selection-result');

  if (countrySelect) {
    countrySelect.addEventListener('change', (e) => {
      logEvent(
        `Country selected: ${e.target.options[e.target.selectedIndex].text}`,
        'info'
      );
    });
  }

  const genderRadios = document.querySelectorAll('input[name="gender"]');
  genderRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      logEvent(`Gender selected: ${e.target.value}`, 'info');
    });
  });

  const termsCheckbox = document.getElementById('terms');
  if (termsCheckbox) {
    termsCheckbox.addEventListener('change', (e) => {
      logEvent(
        `Terms checkbox ${e.target.checked ? 'checked' : 'unchecked'}`,
        'info'
      );
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const country =
        countrySelect?.options[countrySelect.selectedIndex]?.text || 'None';
      const gender =
        document.querySelector('input[name="gender"]:checked')?.value || 'None';
      const terms = termsCheckbox?.checked || false;

      const data = { country, gender, terms };

      resultDiv.innerHTML = `
        <strong>✅ Selection Submitted!</strong><br>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `;
      resultDiv.className = 'result-box success';

      logEvent(`Selection submitted: ${JSON.stringify(data)}`, 'success');
    });
  }
}

// Counter Logic
function setupCounter() {
  const counterValue = document.getElementById('counter-value');
  const incrementBtn = document.getElementById('increment');
  const decrementBtn = document.getElementById('decrement');
  const resetBtn = document.getElementById('reset-counter');

  function updateCounter() {
    if (counterValue) {
      counterValue.textContent = counter;
    }
  }

  if (incrementBtn) {
    incrementBtn.addEventListener('click', () => {
      counter++;
      updateCounter();
      logEvent(`Counter incremented to ${counter}`, 'success');
    });
  }

  if (decrementBtn) {
    decrementBtn.addEventListener('click', () => {
      counter--;
      updateCounter();
      logEvent(`Counter decremented to ${counter}`, 'info');
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      counter = 0;
      updateCounter();
      logEvent('Counter reset to 0', 'warning');
    });
  }
}

// Event Log Management
function setupEventLog() {
  const clearLogBtn = document.getElementById('clear-log');

  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', () => {
      const logElement = document.getElementById('event-log');
      if (logElement) {
        logElement.innerHTML = '';
      }
      eventLog.length = 0;
      logEvent('Event log cleared', 'info');
    });
  }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  logEvent('✨ MCP Demo App initialized', 'success');

  setupBasicActions();
  setupFormHandling();
  setupSelectionHandling();
  setupCounter();
  setupEventLog();

  logEvent('🎯 All event listeners registered', 'success');
  logEvent(
    '📡 Ready for MCP Server commands on port 9222',
    'info'
  );
});

// Global error handler
window.addEventListener('error', (event) => {
  logEvent(`❌ Error: ${event.message}`, 'error');
  console.error('Global error:', event);
});

// Expose some functions globally for testing
window.mcpDemo = {
  getCounter: () => counter,
  getEventLog: () => eventLog,
  logEvent,
};
