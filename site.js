// Shipyard — shared script for every page.
// Handles progress (XP, streak, completed topics), the header counters,
// the cargo ship on the home page, and the terminal + quiz on topic pages.

import { TOPICS, TOPIC_BY_ID, topicStatus } from './data.js';
import { Shell } from './terminal.js';

/* ───────────── Settings ───────────── */
export const STUDENT_NAME = 'Tejus Sanly';
export const XP_PER_TOPIC = 100;

// Where a new visitor starts: 7 of 10 topics done, 700 XP, 12-day streak.
// Set done to [] and xp/streak to 0/1 to start from scratch.
const START = {
  done: ['linux', 'networking', 'git', 'scripting', 'cicd', 'docker', 'kubernetes'],
  xp: 7 * XP_PER_TOPIC,
  streak: 12,
};

/* ───────────── Progress (saved in the browser) ───────────── */
const KEY = 'shipyard-progress-v2';
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function load() {
  let s = {
    done: Object.fromEntries(START.done.map((id) => [id, true])),
    xp: START.xp,
    streak: START.streak,
    lastDay: dayKey(),
  };
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) s = { ...s, ...JSON.parse(saved) };
  } catch { /* storage blocked — use defaults */ }
  // Daily streak: +1 if you visited yesterday, back to 1 if you skipped a day.
  const today = dayKey();
  if (s.lastDay !== today) {
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    s.streak = s.lastDay === yesterday ? s.streak + 1 : 1;
    s.lastDay = today;
  }
  return s;
}

let progress = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* ignore */ }
  renderAll();
  window.dispatchEvent(new CustomEvent('progress', { detail: progress }));
}

export const getProgress = () => progress;
export const statusOf = (id) => topicStatus(TOPIC_BY_ID[id], progress.done);

export function completeTopic(id) {
  if (progress.done[id]) return false;
  progress = { ...progress, done: { ...progress.done, [id]: true }, xp: progress.xp + XP_PER_TOPIC };
  save();
  return true;
}

export function resetProgress() {
  progress = { done: {}, xp: 0, streak: 1, lastDay: dayKey() };
  save();
}

/* ───────────── Helpers ───────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  });
  kids.flat().forEach((k) => n.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return n;
};
const STATUS_LABEL = { done: 'Loaded', open: 'Ready to load', locked: 'Locked' };
const root = document.body.dataset.root || './';
const doneCount = () => TOPICS.filter((t) => progress.done[t.id]).length;

/* ───────────── Counters (header + home stats) ───────────── */
function renderCounters() {
  const count = doneCount();
  const pct = Math.round((count / TOPICS.length) * 100);
  $$('[data-xp]').forEach((n) => { n.textContent = progress.xp; });
  $$('[data-streak]').forEach((n) => { n.textContent = progress.streak; });
  $$('[data-pct]').forEach((n) => { n.textContent = pct + '%'; });
  $$('[data-count]').forEach((n) => { n.textContent = count; });
  $$('[data-meter]').forEach((n) => { n.style.width = pct + '%'; });
}

/* ───────────── Status badges on topic cards / lists ───────────── */
function renderStatuses() {
  $$('[data-status-of]').forEach((n) => {
    const s = statusOf(n.dataset.statusOf);
    n.dataset.status = s;
    const label = $('[data-status-label]', n) || (n.hasAttribute('data-status-label') ? n : null);
    if (label) label.textContent = STATUS_LABEL[s];
  });
}

/* ───────────── Home page: greeting, next up, ship ───────────── */
function renderHome() {
  const hello = $('[data-hello]');
  if (hello) {
    const h = new Date().getHours();
    hello.textContent = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${STUDENT_NAME.split(' ')[0]}`;
  }
  const next = TOPICS.find((t) => statusOf(t.id) === 'open');
  const nextLink = $('[data-next]');
  if (nextLink) {
    if (next) {
      nextLink.href = `${root}topics/${next.id}.html`;
      nextLink.textContent = `Continue: ${next.title} →`;
    } else {
      nextLink.href = `${root}roadmap.html`;
      nextLink.textContent = 'All topics loaded. View the roadmap →';
    }
  }
  const ship = $('#ship');
  if (ship) ship.innerHTML = shipSVG();
}

// Each finished topic is a container loaded onto the ship.
function shipSVG() {
  const boxes = TOPICS.map((t, i) => {
    const x = 52 + (i % 5) * 98;
    const y = i < 5 ? 148 : 92;
    const s = statusOf(t.id);
    const ribs = [1, 2, 3, 4, 5].map((k) => `<path d="M${x + k * 15.3} ${y + 8}v38" class="rib"/>`).join('');
    return `<a href="${root}topics/${t.id}.html" class="box box-${s}"><title>${t.title}: ${STATUS_LABEL[s]}</title>
      <rect x="${x}" y="${y}" width="92" height="54" rx="3"/>${ribs}<text x="${x + 46}" y="${y + 33}">${t.code}</text></a>`;
  }).join('');
  const first = STUDENT_NAME.split(' ')[0].toUpperCase();
  return `<svg viewBox="0 0 600 290" role="img" aria-label="Cargo ship carrying ${doneCount()} of ${TOPICS.length} topic containers">
    <g class="crane"><path d="M548 204V40h8v164"/><path d="M552 44H430"/><path d="M470 44v34" class="cable"/></g>
    ${boxes}
    <path d="M18 204H584L544 262H60Z" class="hull"/>
    <path d="M30 218H574" class="hull-line"/>
    <text x="300" y="248" class="hull-name">SHIPYARD · ${first}</text>
    <path d="M0 262q25-10 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0V290H0Z" class="sea"/>
  </svg>`;
}

/* ───────────── Topic page: practice terminal ───────────── */
// The shell itself (files, git, docker, kubectl, terraform…) lives in terminal.js.
function setupTerminal(topic) {
  const box = $('#terminal');
  if (!box) return;
  let shell = new Shell(topic);
  let histIndex = -1;
  let draft = '';

  const screen = el('div', { class: 'term', role: 'log', 'aria-label': `Practice terminal for ${topic.title}` });
  const promptEl = el('span', { class: 't-prompt' });
  const input = el('input', { 'aria-label': 'Type a command', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const form = el('form', { class: 't-line' }, promptEl, input);
  const setPrompt = () => { promptEl.textContent = shell.prompt(); };

  const print = (cls, text) => {
    screen.insertBefore(el('pre', { class: cls }, text), form);
    screen.scrollTop = screen.scrollHeight;
  };
  const printCmd = (cmd) => {
    screen.insertBefore(el('pre', { class: 't-cmd' }, el('span', { class: 't-prompt' }, shell.prompt()), ' ' + cmd), form);
    screen.scrollTop = screen.scrollHeight;
  };
  const welcome = () => {
    print('t-sys', `Practice terminal · ${topic.title}\nA simulated Linux machine: try any command below, or type "help".`);
  };
  const run = (cmd) => {
    printCmd(cmd);
    const result = shell.run(cmd);
    if (result.clear) { $$('pre', screen).forEach((p) => p.remove()); }
    result.lines.forEach((l) => print(l.cls === 'err' ? 't-err' : 't-out', l.text));
    setPrompt();
    histIndex = -1;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const cmd = input.value;
    input.value = '';
    if (!cmd.trim()) { printCmd(''); return; }
    run(cmd);
  });

  input.addEventListener('keydown', (e) => {
    const hist = shell.history;
    if (e.key === 'ArrowUp') {
      if (!hist.length) return;
      e.preventDefault();
      if (histIndex === -1) { draft = input.value; histIndex = hist.length; }
      histIndex = Math.max(0, histIndex - 1);
      input.value = hist[histIndex];
    } else if (e.key === 'ArrowDown') {
      if (histIndex === -1) return;
      e.preventDefault();
      histIndex += 1;
      if (histIndex >= hist.length) { histIndex = -1; input.value = draft; } else input.value = hist[histIndex];
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const { line, options } = shell.complete(input.value);
      input.value = line;
      if (options.length > 1) { printCmd(line); print('t-sys', options.join('  ')); }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      $$('pre', screen).forEach((p) => p.remove());
    } else if (e.key === 'c' && e.ctrlKey && !window.getSelection().toString()) {
      e.preventDefault();
      printCmd(`${input.value}^C`);
      input.value = '';
    }
  });
  screen.addEventListener('click', () => { if (!window.getSelection().toString()) input.focus(); });

  screen.append(form);
  welcome();
  setPrompt();

  const resetBtn = el('button', {
    class: 'btn btn-ghost btn-sm', type: 'button',
    onclick: () => {
      shell = new Shell(topic);
      $$('pre', screen).forEach((p) => p.remove());
      welcome(); setPrompt(); input.focus();
    },
  }, 'Reset terminal');
  const chips = el('ol', { class: 'chips' },
    topic.commands.map((c) => el('li', {}, el('button', {
      class: 'chip', type: 'button', title: c.desc,
      onclick: () => { run(c.cmd); input.focus({ preventScroll: true }); },
    }, el('code', {}, c.cmd), el('span', {}, c.desc)))));
  box.replaceChildren(
    screen,
    el('div', { class: 'term-bar' },
      el('p', { class: 'term-hint' }, '↑ ↓ previous commands · Tab completes · Ctrl+L clears · everything resets on reload'),
      resetBtn),
    el('h3', {}, 'Try these, in order'),
    chips,
  );
}

/* ───────────── Topic page: quiz ───────────── */
function setupQuiz(topic) {
  const box = $('#quiz');
  if (!box) return;

  const draw = (practice = false) => {
    const status = statusOf(topic.id);
    box.replaceChildren();

    if (status === 'locked') {
      const links = topic.needs.filter((n) => !progress.done[n]).map((n) => el('a', { href: `${n}.html` }, TOPIC_BY_ID[n].title));
      box.append(el('p', { class: 'notice' }, 'This quiz unlocks after you finish ',
        links.flatMap((a, i) => (i ? [' and ', a] : [a])), '. You can still read the lesson and use the terminal.'));
      return;
    }
    if (status === 'done' && !practice) {
      box.append(el('div', { class: 'result good' }, 'You passed this quiz. This container is loaded.',
        el('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => draw(true) }, 'Practice again')));
      return;
    }

    const picks = {};
    const total = topic.quiz.length;
    const check = el('button', { class: 'btn', type: 'button', disabled: '' }, `Answer all ${total} questions`);
    const qs = topic.quiz.map((q, i) => {
      const opts = q.options.map((o, j) => el('button', {
        class: 'opt', type: 'button',
        onclick: (e) => {
          picks[i] = j;
          $$('.opt', e.target.parentNode).forEach((b) => b.classList.remove('picked'));
          e.target.classList.add('picked');
          if (Object.keys(picks).length === total) { check.disabled = false; check.textContent = 'Check answers'; }
        },
      }, o));
      return el('fieldset', { class: 'q' }, el('legend', {}, `${i + 1}. ${q.q}`), el('div', { class: 'opts' }, opts), el('p', { class: 'why', hidden: '' }));
    });

    check.addEventListener('click', () => {
      let score = 0;
      topic.quiz.forEach((q, i) => {
        const right = picks[i] === q.answer;
        if (right) score += 1;
        $$('.opt', qs[i]).forEach((b, j) => {
          b.disabled = true;
          if (j === q.answer) b.classList.add('right');
          else if (j === picks[i]) b.classList.add('wrong');
        });
        const why = $('.why', qs[i]);
        why.hidden = false;
        why.textContent = (right ? 'Correct. ' : 'Not quite. ') + q.why;
      });
      check.remove();
      if (score === total) {
        const gained = completeTopic(topic.id);
        const unlocked = TOPICS.filter((t) => t.needs.includes(topic.id) && statusOf(t.id) === 'open');
        box.append(el('div', { class: 'result good' },
          `${score}/${total}. ${gained ? `Container loaded, +${XP_PER_TOPIC} XP.` : 'Nice work.'}`,
          unlocked.map((t) => el('a', { class: 'btn btn-pink btn-sm', href: `${t.id}.html` }, `Next: ${t.title} →`)),
          el('a', { class: 'btn btn-light btn-sm', href: `${root}index.html#ship` }, 'See your ship')));
        renderTopicStatus(topic);
      } else {
        box.append(el('div', { class: 'result bad' }, `${score}/${total} correct. You need all ${total} to load this container.`,
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => draw(practice) }, 'Try again')));
      }
    });

    box.append(...qs, check);
  };
  draw();
}

function renderTopicStatus(topic) {
  const s = statusOf(topic.id);
  $$('[data-topic-status]').forEach((n) => { n.dataset.status = s; n.textContent = STATUS_LABEL[s]; });
  const code = $('.big-code');
  if (code) code.dataset.status = s;
}

/* ───────────── Every page ───────────── */
function renderAll() {
  renderCounters();
  renderStatuses();
  renderHome();
}

function init() {
  // Highlight the current page in the navbar
  const page = document.body.dataset.page;
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === page));

  // Reset button in the footer (asks once before erasing)
  $$('[data-reset]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.armed) {
        resetProgress();
        b.textContent = 'Progress reset';
        delete b.dataset.armed;
        const quiz = $('#quiz');
        if (quiz) location.reload();
      } else {
        b.dataset.armed = '1';
        b.textContent = 'Click again to erase all progress';
        setTimeout(() => { if (b.dataset.armed) { delete b.dataset.armed; b.textContent = 'Reset progress'; } }, 4000);
      }
    });
  });

  // Mobile menu
  const toggle = $('.menu-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  renderAll();

  const topic = TOPIC_BY_ID[document.body.dataset.topic];
  if (topic) {
    renderTopicStatus(topic);
    setupTerminal(topic);
    setupQuiz(topic);
  }
  save();
}

init();
