const presetMessages = {
  pricing: 'Hi, I saw your Facebook ad. Can someone tell me pricing and whether setup works with WhatsApp and Gmail?',
  support: 'Hello, our team connected Gmail already, but Messenger replies are still not reaching customers. Can someone help today?'
};

const demoProfiles = {
  pricing: {
    intent: 'Warm pricing lead from Meta ad asking about channel fit and onboarding speed.',
    response: 'Absolutely. AuraFlow can unify Gmail, Facebook leads, Messenger, Instagram, and WhatsApp into one workspace. I can share the Growth plan pricing and a quick setup walkthrough next.',
    owner: 'Suggested owner: Growth desk',
    nextStep: 'Next best action: send pricing summary and offer a setup call this week.'
  },
  support: {
    intent: 'Existing customer support request with channel delivery risk and high urgency.',
    response: 'Thanks for flagging it. We can help you verify the Messenger page connection, webhook health, and reply route today. I am pulling the channel status and preparing the fastest fix path now.',
    owner: 'Suggested owner: Support operations',
    nextStep: 'Next best action: verify page token, webhook verification, and recent delivery failures.'
  }
};

let activeDemoRun = 0;

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setHeaderState() {
  const header = document.querySelector('[data-landing-header]');
  if (!header) return;
  header.classList.toggle('is-scrolled', window.scrollY > 18);
}

function wireHeader() {
  setHeaderState();
  window.addEventListener('scroll', setHeaderState, { passive: true });
}

function wireHeroReveal() {
  window.requestAnimationFrame(() => {
    document.documentElement.classList.add('landing-ready');
  });
}

function animateCount(node) {
  if (!node || node.dataset.counted === 'true') return;
  const target = Number(node.dataset.countUp || 0);
  if (!Number.isFinite(target)) return;
  node.dataset.counted = 'true';
  const startAt = performance.now();
  const duration = 1200;
  const step = (now) => {
    const progress = Math.min((now - startAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = String(Math.round(target * eased));
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

function wireScrollReveal() {
  const revealNodes = [...document.querySelectorAll('[data-reveal]')];
  const countNodes = [...document.querySelectorAll('[data-count-up]')];
  if (!revealNodes.length && !countNodes.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const node = entry.target;
      node.classList.add('in-view');
      if (node.hasAttribute('data-count-up')) {
        animateCount(node);
      } else {
        node.querySelectorAll?.('[data-count-up]').forEach(animateCount);
      }
      observer.unobserve(node);
    });
  }, { threshold: 0.22, rootMargin: '0px 0px -8% 0px' });

  revealNodes.forEach((node) => observer.observe(node));
  countNodes.forEach((node) => observer.observe(node));
}

function wireTiltCards() {
  const cards = document.querySelectorAll('[data-tilt-card]');
  cards.forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const offsetX = (event.clientX - rect.left) / rect.width;
      const offsetY = (event.clientY - rect.top) / rect.height;
      const rotateY = (offsetX - 0.5) * 9;
      const rotateX = (0.5 - offsetY) * 8;
      card.style.setProperty('--tilt-x', `${rotateX.toFixed(2)}deg`);
      card.style.setProperty('--tilt-y', `${rotateY.toFixed(2)}deg`);
      card.style.setProperty('--glow-x', `${(offsetX * 100).toFixed(1)}%`);
      card.style.setProperty('--glow-y', `${(offsetY * 100).toFixed(1)}%`);
    });
    const reset = () => {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
      card.style.setProperty('--glow-x', '50%');
      card.style.setProperty('--glow-y', '50%');
    };
    card.addEventListener('pointerleave', reset);
    reset();
  });
}

function makeTerminalLine(text = '', tone = '') {
  const line = document.createElement('div');
  line.className = `landing-terminal-line${tone ? ` ${tone}` : ''}`;
  return { line, cursor: text };
}

async function typeText(node, text, speed = 18) {
  node.textContent = '';
  for (const char of String(text)) {
    node.textContent += char;
    await sleep(speed);
  }
}

async function runDemo(message = '') {
  const runId = ++activeDemoRun;
  const output = document.querySelector('[data-terminal-output]');
  const summary = document.querySelector('[data-demo-summary]');
  if (!output || !summary) return;

  const normalized = String(message || '').trim();
  const mode = normalized.toLowerCase().includes('messenger') || normalized.toLowerCase().includes('not reaching')
    ? 'support'
    : 'pricing';
  const profile = demoProfiles[mode];

  output.innerHTML = '';
  const customer = document.createElement('div');
  customer.className = 'landing-terminal-line inbound';
  customer.textContent = `> ${normalized}`;
  output.appendChild(customer);

  const analyzing = document.createElement('div');
  analyzing.className = 'landing-terminal-line system';
  output.appendChild(analyzing);
  await typeText(analyzing, '$ Analyzing intent...', 18);
  if (runId !== activeDemoRun) return;

  const intent = document.createElement('div');
  intent.className = 'landing-terminal-line note';
  output.appendChild(intent);
  await typeText(intent, `Intent: ${profile.intent}`, 9);
  if (runId !== activeDemoRun) return;

  summary.innerHTML = `
    <strong>AI status</strong>
    <p>${profile.intent}</p>
    <div class="landing-summary-tags">
      <span class="badge accent">Intent mapped</span>
      <span class="badge success">Draft in progress</span>
    </div>
  `;

  const drafting = document.createElement('div');
  drafting.className = 'landing-terminal-line system';
  output.appendChild(drafting);
  await typeText(drafting, '$ Drafting response...', 18);
  if (runId !== activeDemoRun) return;

  const reply = document.createElement('div');
  reply.className = 'landing-terminal-line ai';
  output.appendChild(reply);
  await typeText(reply, profile.response, 7);
  if (runId !== activeDemoRun) return;

  summary.innerHTML = `
    <strong>AI status</strong>
    <p>${profile.intent}</p>
    <div class="landing-summary-tags">
      <span class="badge accent">Intent mapped</span>
      <span class="badge success">Draft ready</span>
    </div>
  `;

  const owner = document.createElement('div');
  owner.className = 'landing-terminal-line note';
  output.appendChild(owner);
  await typeText(owner, `${profile.owner}. ${profile.nextStep}`, 9);
  if (runId !== activeDemoRun) return;
}

function wireDemoTerminal() {
  const input = document.querySelector('[data-demo-input]');
  const runButton = document.querySelector('[data-demo-run]');
  if (!input || !runButton) return;

  document.querySelectorAll('[data-demo-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-demo-preset');
      input.value = presetMessages[key] || presetMessages.pricing;
    });
  });

  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    runButton.textContent = 'Running...';
    try {
      await runDemo(input.value);
    } finally {
      runButton.disabled = false;
      runButton.textContent = 'Run AI demo';
    }
  });

  window.setTimeout(() => {
    runDemo(input.value);
  }, 140);
}

wireHeader();
wireHeroReveal();
wireScrollReveal();
wireTiltCards();
wireDemoTerminal();
