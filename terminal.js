// Shipyard practice terminal — a simulated Linux shell that runs in the browser.
// Nothing here touches a real computer: files, containers, pods, cloud resources
// and git history all live in memory and reset when the page reloads.
//
// Supports: pipes (|), redirects (> >> 2>), && || ;, variables ($X, $?),
// quotes, globs (*), for-loops, if-statements and running shell scripts.
// Tools: core Linux commands, networking tools, git, npm, gh, docker,
// aws, kubectl and terraform — each with its own state.

const HOME = '/home/tejus';
const USER = 'tejus';
const HOST = 'shipyard';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ───────────── small helpers ───────────── */
const nl = (s) => (s && !s.endsWith('\n') ? s + '\n' : s || '');
const ok = (out = '') => ({ out: nl(out), err: '', code: 0 });
const fail = (err, code = 1, out = '') => ({ out: nl(out), err: nl(err), code });
const hex = (n) => { let s = ''; while (s.length < n) s += Math.floor(Math.random() * 16).toString(16); return s; };
const alnum = (n) => { const c = 'bcdfghjklmnpqrstvwxz2456789'; let s = ''; while (s.length < n) s += c[Math.floor(Math.random() * c.length)]; return s; };
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const fakeIp = (name) => { const h = hash(name); return `${(h % 200) + 20}.${(h >> 8) % 255}.${(h >> 16) % 255}.${((h >> 24) % 250) + 2}`; };
const two = (n) => String(n).padStart(2, '0');
const lsTime = (d) => `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${two(d.getHours())}:${two(d.getMinutes())}`;
const longDate = (d) => `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} ${d.getFullYear()}`;
const ago = (t) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 172800) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
const agoWords = (t) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  const say = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (s < 60) return say(s, 'second');
  if (s < 3600) return say(Math.floor(s / 60), 'minute');
  if (s < 172800) return say(Math.floor(s / 3600), 'hour');
  return say(Math.floor(s / 86400), 'day');
};
// Align rows of cells into columns (like `column -t`)
const table = (rows, gap = 3) => {
  const w = [];
  rows.forEach((r) => r.forEach((c, i) => { w[i] = Math.max(w[i] || 0, String(c).length); }));
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? String(c) : String(c).padEnd(w[i] + gap))).join('')).join('\n');
};
// Parse flags. `valued` lists flags that take a value, e.g. ['-n', '--name'].
function opts(args, valued = []) {
  const flags = new Set();
  const vals = {};
  const all = {};
  const rest = [];
  const setVal = (k, v) => { vals[k] = v; (all[k] = all[k] || []).push(v); };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { rest.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      const k = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (eq > 0) setVal(k, a.slice(eq + 1));
      else if (valued.includes('--' + k)) setVal(k, args[++i]);
      else flags.add(k);
    } else if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
      if (valued.includes(a.slice(0, 2))) setVal(a[1], a.length > 2 ? a.slice(2) : args[++i]);
      else [...a.slice(1)].forEach((ch) => flags.add(ch));
    } else rest.push(a);
  }
  return { flags, vals, all, rest };
}
// Line-by-line diff (LCS) for git diff
function lineDiff(a, b) {
  const A = a.split('\n'); const B = b.split('\n');
  if (A[A.length - 1] === '') A.pop();
  if (B[B.length - 1] === '') B.pop();
  const m = A.length; const n = B.length;
  const L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [`@@ -1,${m} +1,${n} @@`];
  let i = 0; let j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { out.push(' ' + A[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push('-' + A[i++]); else out.push('+' + B[j++]);
  }
  while (i < m) out.push('-' + A[i++]);
  while (j < n) out.push('+' + B[j++]);
  return out.join('\n');
}

const MAN = {
  ls: 'list directory contents', cd: 'change the current directory', pwd: 'print the current directory',
  cat: 'print files', echo: 'print text', mkdir: 'make directories', touch: 'create empty files',
  rm: 'remove files or directories', cp: 'copy files', mv: 'move or rename files', head: 'first lines of a file',
  tail: 'last lines of a file', grep: 'search text for a pattern', wc: 'count lines, words and bytes',
  sort: 'sort lines', uniq: 'remove duplicate lines', find: 'search for files', chmod: 'change file permissions',
  chown: 'change file owner', ps: 'list processes', top: 'show running processes', kill: 'stop a process',
  systemctl: 'control system services', journalctl: 'read service logs', df: 'disk space', free: 'memory usage',
  ping: 'check a host is reachable', curl: 'transfer data from a URL', dig: 'look up DNS records',
  nslookup: 'look up DNS records', ss: 'show network sockets', ip: 'show network interfaces',
  traceroute: 'show the network path to a host', git: 'version control', docker: 'build and run containers',
  kubectl: 'control a Kubernetes cluster', terraform: 'infrastructure as code', aws: 'Amazon Web Services CLI',
  npm: 'Node.js package manager', gh: 'GitHub CLI', crontab: 'schedule jobs', bash: 'run a shell script',
};

/* ───────────── the shell ───────────── */
export class Shell {
  constructor(topic) {
    this.topic = topic;
    this.root = { type: 'dir', children: {}, mode: 0o755, owner: 'root', mtime: new Date() };
    this.cwd = HOME;
    this.prevDir = HOME;
    this.env = { USER, HOME, HOSTNAME: HOST, SHELL: '/bin/bash', PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'en_US.UTF-8', TERM: 'xterm-256color' };
    this.lastCode = 0;
    this.history = [];
    this.services = { nginx: 'active', ssh: 'active', docker: 'active', cron: 'active' };
    this.installed = new Set(['git', 'curl', 'docker', 'kubectl', 'terraform', 'aws', 'npm', 'node', 'gh', 'python3', 'vim', 'nano']);
    this.procs = [
      { pid: 1, user: 'root', cpu: 0.0, mem: 0.3, cmd: '/sbin/init' },
      { pid: 640, user: 'root', cpu: 0.0, mem: 0.2, cmd: 'sshd: /usr/sbin/sshd -D', svc: 'ssh' },
      { pid: 702, user: 'root', cpu: 0.0, mem: 0.1, cmd: '/usr/sbin/cron -f', svc: 'cron' },
      { pid: 812, user: 'root', cpu: 0.1, mem: 0.4, cmd: 'nginx: master process /usr/sbin/nginx', svc: 'nginx' },
      { pid: 813, user: 'www-data', cpu: 0.2, mem: 0.6, cmd: 'nginx: worker process', svc: 'nginx' },
      { pid: 920, user: 'root', cpu: 0.8, mem: 2.1, cmd: '/usr/bin/dockerd -H fd://', svc: 'docker' },
      { pid: 1402, user: USER, cpu: 0.0, mem: 0.1, cmd: '-bash' },
    ];
    this.nextPid = 2100;
    this.repos = {};
    this.gitConfig = { 'user.name': 'Tejus Sanly', 'user.email': 'tejus@example.com' };
    this.docker = {
      images: [
        { repo: 'nginx', tag: '1.27-alpine', id: 'b5e0d2f4c1a8', size: '48.3MB', created: Date.now() - 21 * 864e5 },
        { repo: 'node', tag: '20-alpine', id: '7a1c9e3d0b22', size: '135MB', created: Date.now() - 14 * 864e5 },
      ],
      containers: [],
    };
    this.endpoints = {}; // port -> () => {status, type, body}
    this.k8s = null;
    this.aws = null;
    this.tf = { init: false, state: {} };
    this.gh = { runs: [] };
    this.cmds = this.buildCommands();
    this.seed(topic ? topic.id : 'linux');
  }

  /* ───── file system ───── */
  abs(p) {
    if (p === undefined || p === '') return this.cwd;
    if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
    if (p === '-') return this.prevDir;
    const parts = (p.startsWith('/') ? p : this.cwd + '/' + p).split('/');
    const out = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop(); else out.push(part);
    }
    return '/' + out.join('/');
  }
  node(p) {
    const parts = this.abs(p).split('/').filter(Boolean);
    let n = this.root;
    for (const part of parts) {
      if (!n || n.type !== 'dir') return null;
      n = n.children[part];
    }
    return n || null;
  }
  split(p) {
    const a = this.abs(p);
    const i = a.lastIndexOf('/');
    return [a.slice(0, i) || '/', a.slice(i + 1)];
  }
  mkdirp(p, owner = USER) {
    let n = this.root;
    for (const part of this.abs(p).split('/').filter(Boolean)) {
      if (!n.children[part]) n.children[part] = { type: 'dir', children: {}, mode: 0o755, owner, mtime: new Date() };
      n = n.children[part];
      if (n.type !== 'dir') return null;
    }
    return n;
  }
  write(p, content, { append = false, mode, owner = USER, cmd = 'bash' } = {}) {
    const [dirPath, name] = this.split(p);
    const dir = this.node(dirPath);
    if (!dir || dir.type !== 'dir') return `${cmd}: ${p}: No such file or directory`;
    const ex = dir.children[name];
    if (ex && ex.type === 'dir') return `${cmd}: ${p}: Is a directory`;
    if (ex) { ex.content = append ? ex.content + content : content; ex.mtime = new Date(); } else {
      dir.children[name] = { type: 'file', content, mode: mode || 0o644, owner, mtime: new Date() };
    }
    return null;
  }
  put(p, content, mode, owner) { // seed helper: creates parent folders
    const [dirPath] = this.split(p);
    this.mkdirp(dirPath, owner);
    this.write(p, content, { mode, owner });
  }
  read(p, cmd) {
    const n = this.node(p);
    if (!n) return { err: `${cmd}: ${p}: No such file or directory` };
    if (n.type === 'dir') return { err: `${cmd}: ${p}: Is a directory` };
    return { content: n.content };
  }
  walk(p, base = '') { // all files below a dir -> [[relativePath, node]]
    const n = this.node(p);
    if (!n || n.type !== 'dir') return [];
    const out = [];
    for (const [name, child] of Object.entries(n.children)) {
      const rel = base ? `${base}/${name}` : name;
      if (child.type === 'dir') out.push(...this.walk(`${this.abs(p)}/${name}`, rel)); else out.push([rel, child]);
    }
    return out;
  }
  pretty(p) { return p === HOME ? '~' : p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p; }
  prompt() { return `${USER}@${HOST}:${this.pretty(this.cwd)}$`; }
  glob(word) {
    const slash = word.lastIndexOf('/');
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    const pat = word.slice(slash + 1);
    const dir = this.node(dirPart || '.');
    if (!dir || dir.type !== 'dir') return [word];
    const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const hits = Object.keys(dir.children).filter((n) => re.test(n) && (pat.startsWith('.') || !n.startsWith('.'))).sort();
    return hits.length ? hits.map((h) => dirPart + h) : [word];
  }

  /* ───── parsing ───── */
  expandVar(s, i) {
    const nx = s[i + 1];
    if (nx === '?') return [String(this.lastCode), i + 2];
    if (nx === '$') return ['1402', i + 2];
    if (nx === '{') { const j = s.indexOf('}', i); if (j > 0) return [this.env[s.slice(i + 2, j)] ?? '', j + 1]; }
    if (nx === '(') { // $(command)
      let depth = 0; let j = i + 1;
      for (; j < s.length; j++) { if (s[j] === '(') depth++; else if (s[j] === ')' && --depth === 0) break; }
      const r = this.exec(s.slice(i + 2, j));
      return [r.out.replace(/\n+$/, '').replace(/\n/g, ' '), j + 1];
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i + 1));
    if (m) return [this.env[m[0]] ?? '', i + 1 + m[0].length];
    if (nx && /[0-9]/.test(nx)) return [this.env['$' + nx] ?? '', i + 2];
    return ['$', i + 1];
  }
  tokenize(line) {
    const toks = [];
    let cur = null;
    const push = () => { if (cur) { toks.push(cur); cur = null; } };
    const add = (s, quoted = false, globby = false) => {
      if (!cur) cur = { t: 'w', v: '', q: false, g: false };
      cur.v += s; if (quoted) cur.q = true; if (globby) cur.g = true;
    };
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      const two2 = line.slice(i, i + 2);
      if (c === ' ' || c === '\t') { push(); i++; continue; }
      if (c === "'") {
        const j = line.indexOf("'", i + 1);
        if (j < 0) throw new Error('unexpected EOF while looking for matching `\'\'');
        add(line.slice(i + 1, j), true); i = j + 1; continue;
      }
      if (c === '"') {
        let j = i + 1; let s = '';
        while (j < line.length && line[j] !== '"') {
          if (line[j] === '\\' && j + 1 < line.length && '"$\\`'.includes(line[j + 1])) { s += line[j + 1]; j += 2; continue; }
          if (line[j] === '$') { const [v, n] = this.expandVar(line, j); s += v; j = n; continue; }
          s += line[j]; j++;
        }
        if (j >= line.length) throw new Error('unexpected EOF while looking for matching `"\'');
        add(s, true); i = j + 1; continue;
      }
      if (c === '\\') { add(line[i + 1] || ''); i += 2; continue; }
      if (c === '$') { const [v, n] = this.expandVar(line, i); add(v); i = n; continue; }
      if (!cur && line.slice(i, i + 4) === '2>&1') { push(); toks.push({ t: 'op', v: '2>&1' }); i += 4; continue; }
      if (!cur && two2 === '2>') { push(); toks.push({ t: 'op', v: '2>' }); i += 2; continue; }
      if (['&&', '||', '>>'].includes(two2)) { push(); toks.push({ t: 'op', v: two2 }); i += 2; continue; }
      if ('|;>&'.includes(c)) { push(); toks.push({ t: 'op', v: c === '&' ? ';' : c }); i++; continue; }
      if (c === '<') { push(); toks.push({ t: 'op', v: '<' }); i++; continue; }
      if (c === '#' && !cur) break;
      if (c === '~' && !cur && (i + 1 === line.length || line[i + 1] === '/' || line[i + 1] === ' ')) { add(HOME); i++; continue; }
      if (c === '*' || c === '?') { add(c, false, true); i++; continue; }
      add(c); i++;
    }
    push();
    return toks;
  }

  /* ───── running ───── */
  // Run one line typed by the user. Returns [{cls, text}] plus clear flag.
  run(line) {
    const trimmed = line.trim();
    if (!trimmed) return { lines: [] };
    this.history.push(trimmed);
    if (trimmed === 'clear' || trimmed === 'reset') return { lines: [], clear: true };
    const r = this.exec(trimmed);
    const lines = [];
    if (r.out) lines.push({ cls: 'out', text: r.out.replace(/\n$/, '') });
    if (r.err) lines.push({ cls: 'err', text: r.err.replace(/\n$/, '') });
    return { lines };
  }

  // Execute a statement list: handles for / if, ; && ||
  exec(line, depth = 0) {
    if (depth > 20) return fail('bash: maximum nesting reached');
    const s = line.trim();
    let m = /^for\s+(\w+)\s+in\s+(.*?)\s*;\s*do\s+([\s\S]*?)\s*;?\s*done\s*$/.exec(s);
    if (m) return this.runFor(m[1], m[2], m[3], depth);
    m = /^if\s+([\s\S]*?)\s*;\s*then\s+([\s\S]*?)(?:\s*;\s*else\s+([\s\S]*?))?\s*;?\s*fi\s*$/.exec(s);
    if (m) return this.runIf(m[1], m[2], m[3], depth);
    if (/^(for|if|while|until|case)\b/.test(s)) {
      return fail(/^(while|until|case)\b/.test(s) ? `bash: ${s.split(' ')[0]} loops aren't available in this practice terminal. Try a for loop: for i in 1 2 3; do echo $i; done` : 'bash: syntax error: incomplete statement (check your ; do … done or ; then … fi)', 2);
    }
    // Split on ; && || at the top level, but keep for/if blocks whole
    const parts = this.splitStatements(s);
    let out = ''; let err = ''; let code = this.lastCode;
    for (const { text, op } of parts) {
      if (op === '&&' && code !== 0) continue;
      if (op === '||' && code === 0) continue;
      const r = /^(for|if)\b/.test(text.trim()) ? this.exec(text, depth + 1) : this.runPipeline(text);
      out += r.out; err += r.err; code = r.code;
      this.lastCode = code;
      if (r.exit) return { out, err, code, exit: true };
    }
    return { out, err, code };
  }
  splitStatements(s) {
    const parts = []; let buf = ''; let op = null; let q = null; let block = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { buf += c; if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; buf += c; continue; }
      const word = /^(for|if|done|fi)\b/.exec(s.slice(i));
      const atStart = i === 0 || /[\s;]/.test(s[i - 1]);
      if (word && atStart) { if (word[1] === 'for' || word[1] === 'if') block++; else block = Math.max(0, block - 1); }
      if (block === 0) {
        const two2 = s.slice(i, i + 2);
        if (two2 === '&&' || two2 === '||') { parts.push({ text: buf, op }); op = two2; buf = ''; i++; continue; }
        if (c === ';' || (c === '&' && s[i + 1] !== '&' && s[i - 1] !== '>')) { parts.push({ text: buf, op }); op = ';'; buf = ''; continue; }
      }
      buf += c;
    }
    parts.push({ text: buf, op });
    return parts.filter((p) => p.text.trim());
  }
  runFor(name, list, body, depth) {
    let items;
    const range = /^\{(-?\d+)\.\.(-?\d+)\}$/.exec(list.trim());
    if (range) {
      const a = +range[1]; const b = +range[2]; items = [];
      for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) { items.push(String(i)); if (items.length > 200) break; }
    } else {
      try { items = this.words(this.tokenize(list)); } catch (e) { return fail('bash: ' + e.message, 2); }
    }
    let out = ''; let err = ''; let code = 0;
    for (const it of items.slice(0, 200)) {
      this.env[name] = it;
      const r = this.exec(body, depth + 1);
      out += r.out; err += r.err; code = r.code;
      if (r.exit) break;
    }
    return { out, err, code };
  }
  runIf(cond, yes, no, depth) {
    const c = this.exec(cond, depth + 1);
    const branch = c.code === 0 ? yes : no;
    if (!branch) return { out: c.out, err: c.err, code: 0 };
    const r = this.exec(branch, depth + 1);
    return { out: c.out + r.out, err: c.err + r.err, code: r.code };
  }
  words(toks) {
    const out = [];
    for (const t of toks) {
      if (t.t !== 'w') continue;
      if (t.g && !t.q) out.push(...this.glob(t.v)); else out.push(t.v);
    }
    return out;
  }
  runPipeline(text) {
    let toks;
    try { toks = this.tokenize(text); } catch (e) { return fail('bash: ' + e.message, 2); }
    const stages = [[]];
    toks.forEach((t) => { if (t.t === 'op' && t.v === '|') stages.push([]); else stages[stages.length - 1].push(t); });
    let stdin = ''; let err = ''; let res = ok();
    for (const stage of stages) {
      if (!stage.length) return fail("bash: syntax error near unexpected token `|'", 2);
      res = this.runSimple(stage, stdin);
      err += res.err;
      stdin = res.out;
      if (res.exit) break;
    }
    return { out: res.out, err, code: res.code, exit: res.exit };
  }
  runSimple(toks, stdin) {
    const argTok = []; let outFile = null; let append = false; let errFile = null; let mergeErr = false; let inFile = null;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === 'op') {
        if (t.v === '>' || t.v === '>>') {
          const f = toks[++i];
          if (!f || f.t !== 'w') return fail("bash: syntax error near unexpected token `newline'", 2);
          outFile = f.v; append = t.v === '>>';
        } else if (t.v === '2>') { const f = toks[++i]; errFile = f ? f.v : null; } else if (t.v === '2>&1') mergeErr = true;
        else if (t.v === '<') { const f = toks[++i]; inFile = f ? f.v : null; }
      } else argTok.push(t);
    }
    if (inFile) {
      const r = this.read(inFile, 'bash');
      if (r.err) return fail(r.err);
      stdin = r.content;
    }
    let args = this.words(argTok);
    // VAR=value
    while (args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0])) {
      const eq = args[0].indexOf('=');
      this.env[args[0].slice(0, eq)] = args[0].slice(eq + 1);
      args = args.slice(1);
    }
    if (!args.length) return ok();
    let r = this.call(args, stdin);
    if (mergeErr) r = { ...r, out: r.out + r.err, err: '' };
    if (errFile) r = { ...r, err: '' };
    if (outFile) {
      if (outFile !== '/dev/null') {
        const e = this.write(outFile, r.out, { append });
        if (e) return fail(e.replace(/^bash/, 'bash'));
      }
      r = { ...r, out: '' };
    }
    return r;
  }
  call(args, stdin) {
    let [name, ...rest] = args;
    if (name === 'sudo') {
      if (!rest.length) return fail('usage: sudo command');
      [name, ...rest] = rest;
    }
    if (name.includes('/')) return this.runScript(name, rest);
    const fn = this.cmds[name];
    if (!fn) {
      if (['vim', 'vi', 'nano', 'emacs', 'less', 'more', 'htop', 'watch', 'ssh', 'python', 'python3', 'node'].includes(name) && !(name === 'node' && rest[0] === '-v')) {
        return fail(`${name}: interactive programs can't run in this practice terminal.\nTip: write files with  echo "text" > file.txt  and read them with  cat file.txt`);
      }
      return fail(`bash: ${name}: command not found`, 127);
    }
    try {
      return fn(rest, stdin) || ok();
    } catch (e) {
      return fail(`${name}: ${e.message}`);
    }
  }
  runScript(path, args) {
    const n = this.node(path);
    if (!n) return fail(`bash: ${path}: No such file or directory`, 127);
    if (n.type === 'dir') return fail(`bash: ${path}: Is a directory`, 126);
    if (!(n.mode & 0o100)) return fail(`bash: ${path}: Permission denied\nTip: make it executable first with  chmod +x ${path.replace(/^\.\//, '')}`, 126);
    return this.runScriptText(n.content, args);
  }
  runScriptText(text, args = []) {
    const saved = {};
    args.forEach((a, i) => { saved['$' + (i + 1)] = this.env['$' + (i + 1)]; this.env['$' + (i + 1)] = a; });
    const lines = text.split('\n');
    let out = ''; let err = ''; let code = 0; let strict = false;
    for (let i = 0; i < lines.length; i++) {
      let l = lines[i].trim();
      if (!l || l.startsWith('#')) continue;
      if (/^set\s+-[a-z]*e/.test(l)) { strict = true; continue; }
      if (/^(for|if)\b/.test(l) && !/\b(done|fi)\s*$/.test(l)) { // gather a multi-line block
        let depth = 0; const block = [];
        for (; i < lines.length; i++) {
          const b = lines[i].trim();
          if (/^(for|if)\b/.test(b)) depth++;
          if (/^(done|fi)\b/.test(b)) depth--;
          block.push(b);
          if (depth === 0) break;
        }
        l = block.join('; ').replace(/\b(do|then|else);/g, '$1');
      }
      const ex = /^exit(?:\s+(\d+))?$/.exec(l);
      if (ex) { code = +(ex[1] || 0); break; }
      const r = this.exec(l);
      out += r.out; err += r.err; code = r.code;
      if (strict && code !== 0) break;
    }
    Object.entries(saved).forEach(([k, v]) => { if (v === undefined) delete this.env[k]; else this.env[k] = v; });
    return { out, err, code };
  }

  /* ───── tab completion ───── */
  complete(line) {
    const m = /(\S*)$/.exec(line);
    const word = m[1];
    const before = line.slice(0, line.length - word.length);
    const first = !before.trim() || /(\||&&|;)\s*$/.test(before);
    let options = [];
    if (first && !word.includes('/')) options = Object.keys(this.cmds).filter((c) => c.startsWith(word));
    else {
      const slash = word.lastIndexOf('/');
      const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
      const dir = this.node(dirPart || '.');
      if (dir && dir.type === 'dir') {
        options = Object.entries(dir.children)
          .filter(([n]) => n.startsWith(word.slice(slash + 1)) && (word.slice(slash + 1).startsWith('.') || !n.startsWith('.')))
          .map(([n, c]) => dirPart + n + (c.type === 'dir' ? '/' : ''));
      }
    }
    if (!options.length) return { line, options: [] };
    if (options.length === 1) return { line: before + options[0] + (options[0].endsWith('/') ? '' : ' '), options: [] };
    let pre = options[0];
    options.forEach((o) => { while (!o.startsWith(pre)) pre = pre.slice(0, -1); });
    return { line: before + pre, options: options.sort() };
  }

  /* ───── commands ───── */
  buildCommands() {
    const sh = this;
    const C = {};

    /* --- shell basics --- */
    C.help = () => {
      const t = sh.topic;
      const lines = [
        'This is a practice terminal. Everything is simulated and resets when you reload the page.',
        '',
        'Shell basics: ls  cd  pwd  cat  echo  mkdir  touch  rm  cp  mv  head  tail  grep  wc  sort',
        '              sed  jq  find  tree  chmod  history  whoami  date  env  export  man  clear',
        'Linux:        ps  top  kill  systemctl  journalctl  df  free  uptime  uname  apt',
        'Networking:   ping  curl  dig  nslookup  host  ss  ip  traceroute',
        'Tools:        git  npm  gh  docker  aws  kubectl  terraform',
        'Shell syntax: pipes |   redirects > >>   && ||   variables NAME=x $NAME   for … do … done',
      ];
      if (t) lines.push('', `Try these for ${t.title}:`, ...t.commands.map((c) => `  ${c.cmd.padEnd(44)} ${c.desc}`));
      lines.push('', 'Keys: ↑/↓ previous commands · Tab completes names · Ctrl+L clears');
      return ok(lines.join('\n'));
    };
    C.man = ([cmd]) => (cmd ? (MAN[cmd] || C[cmd] ? ok(`${cmd} - ${MAN[cmd] || 'a command available in this terminal'}\n\nType "help" to see examples you can try.`) : fail(`No manual entry for ${cmd}`, 16)) : fail('What manual page do you want?'));
    C.history = () => ok(sh.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join('\n'));
    C.echo = (args) => {
      let a = args; let newline = true; let esc = false;
      while (a[0] === '-n' || a[0] === '-e') { if (a[0] === '-n') newline = false; else esc = true; a = a.slice(1); }
      let s = a.join(' ');
      if (esc) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      return { out: newline ? s + '\n' : s, err: '', code: 0 };
    };
    C.printf = (args) => ok((args[0] || '').replace(/%s/g, () => args.splice(1, 1)[0] || '').replace(/\\n/g, '\n'));
    C.pwd = () => ok(sh.cwd);
    C.cd = ([p]) => {
      const target = p === undefined ? HOME : sh.abs(p);
      const n = sh.node(target);
      if (!n) return fail(`bash: cd: ${p}: No such file or directory`);
      if (n.type !== 'dir') return fail(`bash: cd: ${p}: Not a directory`);
      sh.prevDir = sh.cwd; sh.cwd = target; sh.env.PWD = target;
      return ok(p === '-' ? target : '');
    };
    C.whoami = () => ok(USER);
    C.id = () => ok('uid=1000(tejus) gid=1000(tejus) groups=1000(tejus),27(sudo),999(docker)');
    C.groups = () => ok('tejus sudo docker');
    C.hostname = ([f]) => ok(f === '-I' ? '10.0.2.15 172.17.0.1' : HOST);
    C.date = () => { const d = new Date(); return ok(`${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} UTC ${d.getFullYear()}`); };
    C.uname = ([f]) => ok(f === '-a' ? 'Linux shipyard 6.8.0-45-generic #45-Ubuntu SMP x86_64 GNU/Linux' : f === '-r' ? '6.8.0-45-generic' : 'Linux');
    C.uptime = () => { const d = new Date(); return ok(` ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} up 12 days,  3:41,  1 user,  load average: 0.08, 0.12, 0.10`); };
    C.env = () => ok(Object.entries(sh.env).filter(([k]) => !k.startsWith('$')).map(([k, v]) => `${k}=${v}`).join('\n'));
    C.printenv = ([k]) => (k ? (sh.env[k] !== undefined ? ok(sh.env[k]) : { out: '', err: '', code: 1 }) : C.env());
    C.export = (args) => {
      if (!args.length) return C.env();
      args.forEach((a) => { const eq = a.indexOf('='); if (eq > 0) sh.env[a.slice(0, eq)] = a.slice(eq + 1); });
      return ok();
    };
    C.unset = (args) => { args.forEach((a) => delete sh.env[a]); return ok(); };
    C.true = () => ok();
    C.false = () => ({ out: '', err: '', code: 1 });
    C.sleep = () => ok();
    C.exit = () => ({ out: 'logout\n(This practice terminal stays open, so keep going!)\n', err: '', code: 0, exit: true });
    C.which = (args) => {
      const found = args.filter((a) => C[a] || sh.installed.has(a));
      return { out: found.map((a) => `/usr/bin/${a}`).join('\n') + (found.length ? '\n' : ''), err: '', code: found.length === args.length ? 0 : 1 };
    };
    C.type = (args) => ok(args.map((a) => (C[a] ? `${a} is /usr/bin/${a}` : `bash: type: ${a}: not found`)).join('\n'));
    C.alias = () => ok("alias ll='ls -alF'\nalias la='ls -A'");
    C.ll = (args) => C.ls(['-alF', ...args]);
    C.test = (args) => {
      const a = args[args.length - 1] === ']' ? args.slice(0, -1) : args;
      const yes = { out: '', err: '', code: 0 }; const no = { out: '', err: '', code: 1 };
      if (a.length === 2) {
        const [f, p] = a; const n = sh.node(p);
        if (f === '-f') return n && n.type === 'file' ? yes : no;
        if (f === '-d') return n && n.type === 'dir' ? yes : no;
        if (f === '-e') return n ? yes : no;
        if (f === '-x') return n && n.mode & 0o100 ? yes : no;
        if (f === '-z') return p === '' ? yes : no;
        if (f === '-n') return p !== '' ? yes : no;
      }
      if (a.length === 3) {
        const [x, op, y] = a;
        const r = { '=': x === y, '==': x === y, '!=': x !== y, '-eq': +x === +y, '-ne': +x !== +y, '-gt': +x > +y, '-lt': +x < +y, '-ge': +x >= +y, '-le': +x <= +y }[op];
        if (r !== undefined) return r ? yes : no;
      }
      if (a.length === 1) return a[0] ? yes : no;
      return a.length === 0 ? no : fail('test: unsupported expression', 2);
    };
    C['['] = C.test;

    /* --- files --- */
    C.ls = (args) => {
      const o = opts(args);
      const long = o.flags.has('l'); const all = o.flags.has('a') || o.flags.has('A'); const classify = o.flags.has('F');
      const targets = o.rest.length ? o.rest : ['.'];
      const fmtMode = (n) => (n.type === 'dir' ? 'd' : '-') + [6, 3, 0].map((s) => { const b = (n.mode >> s) & 7; return (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (b & 1 ? 'x' : '-'); }).join('');
      const entry = (name, n) => {
        const label = name + (classify ? (n.type === 'dir' ? '/' : n.mode & 0o100 ? '*' : '') : '');
        if (!long) return label;
        const size = n.type === 'dir' ? 4096 : n.content.length;
        return `${fmtMode(n)} ${n.type === 'dir' ? 2 : 1} ${(n.owner || USER).padEnd(5)} ${(n.owner || USER).padEnd(5)} ${String(size).padStart(5)} ${lsTime(n.mtime)} ${label}`;
      };
      let out = ''; let err = ''; let code = 0;
      targets.forEach((t, idx) => {
        const n = sh.node(t);
        if (!n) { err += `ls: cannot access '${t}': No such file or directory\n`; code = 2; return; }
        if (n.type === 'file') { out += entry(t, n) + '\n'; return; }
        let names = Object.keys(n.children).sort((x, y) => x.replace(/^\./, '').localeCompare(y.replace(/^\./, '')));
        if (!all) names = names.filter((x) => !x.startsWith('.'));
        const rows = names.map((x) => entry(x, n.children[x]));
        if (all && o.flags.has('a')) rows.unshift(entry('.', n), entry('..', n));
        if (targets.length > 1) out += `${idx ? '\n' : ''}${t}:\n`;
        if (long) out += `total ${names.length * 4}\n`;
        out += rows.length ? (long ? rows.join('\n') : rows.join('  ')) + '\n' : '';
      });
      return { out, err, code };
    };
    C.dir = C.ls;
    C.tree = ([p = '.']) => {
      const n = sh.node(p);
      if (!n || n.type !== 'dir') return fail(`${p} [error opening dir]`);
      const lines = [p]; let dirs = 0; let files = 0;
      const rec = (node, prefix) => {
        const names = Object.keys(node.children).filter((x) => !x.startsWith('.') && x !== 'node_modules').sort();
        names.forEach((name, i) => {
          const last = i === names.length - 1; const child = node.children[name];
          lines.push(`${prefix}${last ? '└── ' : '├── '}${name}`);
          if (child.type === 'dir') { dirs++; rec(child, prefix + (last ? '    ' : '│   ')); } else files++;
        });
      };
      rec(n, '');
      return ok(`${lines.join('\n')}\n\n${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`);
    };
    C.cat = (args, stdin) => {
      const o = opts(args);
      if (!o.rest.length) return ok(stdin);
      let out = ''; let err = ''; let code = 0;
      o.rest.forEach((f) => {
        const r = sh.read(f, 'cat');
        if (r.err) { err += r.err + '\n'; code = 1; } else out += o.flags.has('n') ? r.content.split('\n').map((l, i, arr) => (i === arr.length - 1 && l === '' ? '' : `${String(i + 1).padStart(6)}\t${l}`)).join('\n') : r.content;
      });
      return { out: nl(out), err, code };
    };
    C.touch = (args) => {
      for (const f of args) {
        const n = sh.node(f);
        if (n) n.mtime = new Date(); else { const e = sh.write(f, '', { cmd: 'touch' }); if (e) return fail(`touch: cannot touch '${f}': No such file or directory`); }
      }
      return ok();
    };
    C.mkdir = (args) => {
      const o = opts(args);
      if (!o.rest.length) return fail('mkdir: missing operand');
      for (const d of o.rest) {
        if (sh.node(d)) { if (o.flags.has('p')) continue; return fail(`mkdir: cannot create directory '${d}': File exists`); }
        const [parent, name] = sh.split(d);
        const pn = sh.node(parent);
        if (!pn && !o.flags.has('p')) return fail(`mkdir: cannot create directory '${d}': No such file or directory\nTip: use mkdir -p to create parent folders too`);
        if (o.flags.has('p')) sh.mkdirp(d); else pn.children[name] = { type: 'dir', children: {}, mode: 0o755, owner: USER, mtime: new Date() };
      }
      return ok();
    };
    C.rm = (args) => {
      const o = opts(args);
      if (!o.rest.length) return fail('rm: missing operand');
      let err = '';
      for (const f of o.rest) {
        const a = sh.abs(f);
        const n = sh.node(a);
        if (!n) { if (!o.flags.has('f')) err += `rm: cannot remove '${f}': No such file or directory\n`; continue; }
        if (n.type === 'dir' && !o.flags.has('r') && !o.flags.has('R')) { err += `rm: cannot remove '${f}': Is a directory\n`; continue; }
        if (a === '/' || a === HOME) { err += `rm: refusing to remove '${f}' (even in practice!)\n`; continue; }
        const [parent, name] = sh.split(a);
        delete sh.node(parent).children[name];
        if (sh.cwd.startsWith(a + '/') || sh.cwd === a) sh.cwd = parent;
      }
      return { out: '', err, code: err ? 1 : 0 };
    };
    C.rmdir = ([d]) => {
      const n = sh.node(d);
      if (!n) return fail(`rmdir: failed to remove '${d}': No such file or directory`);
      if (n.type !== 'dir') return fail(`rmdir: failed to remove '${d}': Not a directory`);
      if (Object.keys(n.children).length) return fail(`rmdir: failed to remove '${d}': Directory not empty`);
      const [p, name] = sh.split(d); delete sh.node(p).children[name];
      return ok();
    };
    const copyNode = (n) => (n.type === 'dir'
      ? { ...n, mtime: new Date(), children: Object.fromEntries(Object.entries(n.children).map(([k, v]) => [k, copyNode(v)])) }
      : { ...n, mtime: new Date() });
    const cpmv = (args, move) => {
      const cmd = move ? 'mv' : 'cp';
      const o = opts(args);
      if (o.rest.length < 2) return fail(`${cmd}: missing destination file operand`);
      const dest = o.rest.pop();
      const dn = sh.node(dest);
      for (const src of o.rest) {
        const sn = sh.node(src);
        if (!sn) return fail(`${cmd}: cannot stat '${src}': No such file or directory`);
        if (sn.type === 'dir' && !move && !o.flags.has('r') && !o.flags.has('R')) return fail(`cp: -r not specified; omitting directory '${src}'`);
        let [tParent, tName] = sh.split(dest);
        if (dn && dn.type === 'dir') { tParent = sh.abs(dest); tName = sh.split(src)[1]; }
        const pn = sh.node(tParent);
        if (!pn || pn.type !== 'dir') return fail(`${cmd}: cannot create '${dest}': No such file or directory`);
        pn.children[tName] = move ? sn : copyNode(sn);
        if (move) { const [sp, sname] = sh.split(src); if (sh.abs(src) !== `${tParent}/${tName}`) delete sh.node(sp).children[sname]; }
      }
      return ok();
    };
    C.cp = (a) => cpmv(a, false);
    C.mv = (a) => cpmv(a, true);
    const textOf = (files, stdin, cmd) => {
      if (!files.length) return { text: stdin };
      let text = '';
      for (const f of files) { const r = sh.read(f, cmd); if (r.err) return { err: r.err }; text += r.content; }
      return { text };
    };
    const headTail = (args, stdin, tail) => {
      let n = 10; const rest = []; let follow = false;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n') n = +args[++i];
        else if (/^-\d+$/.test(args[i])) n = +args[i].slice(1);
        else if (/^-n\d+$/.test(args[i])) n = +args[i].slice(2);
        else if (args[i] === '-f' || args[i] === '-F') follow = true;
        else rest.push(args[i]);
      }
      const r = textOf(rest, stdin, tail ? 'tail' : 'head');
      if (r.err) return fail(r.err);
      const lines = r.text.replace(/\n$/, '').split('\n');
      const pick = tail ? lines.slice(-n) : lines.slice(0, n);
      return ok(pick.join('\n') + (follow ? '\n… (tail -f keeps watching for new lines; in a real terminal press Ctrl+C to stop)' : ''));
    };
    C.head = (a, s) => headTail(a, s, false);
    C.tail = (a, s) => headTail(a, s, true);
    C.wc = (args, stdin) => {
      const o = opts(args);
      const r = textOf(o.rest, stdin, 'wc');
      if (r.err) return fail(r.err);
      const l = (r.text.match(/\n/g) || []).length; const w = r.text.split(/\s+/).filter(Boolean).length; const c = r.text.length;
      const name = o.rest.length === 1 ? ' ' + o.rest[0] : '';
      if (o.flags.has('l')) return ok(`${l}${name}`);
      if (o.flags.has('w')) return ok(`${w}${name}`);
      if (o.flags.has('c')) return ok(`${c}${name}`);
      return ok(`${String(l).padStart(3)} ${String(w).padStart(3)} ${String(c).padStart(4)}${name}`);
    };
    C.grep = (args, stdin) => {
      const o = opts(args, ['-e']);
      const pattern = o.vals.e ?? o.rest.shift();
      if (pattern === undefined) return fail('Usage: grep [OPTION]... PATTERNS [FILE]...', 2);
      let re;
      try { re = new RegExp(o.flags.has('F') ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern, o.flags.has('i') ? 'i' : ''); } catch { return fail('grep: invalid pattern', 2); }
      let files = o.rest;
      if (o.flags.has('r') || o.flags.has('R')) files = (files.length ? files : ['.']).flatMap((d) => (sh.node(d)?.type === 'dir' ? sh.walk(d).map(([rel]) => (d === '.' ? rel : `${d}/${rel}`)) : [d]));
      const sources = files.length ? files.map((f) => { const r = sh.read(f, 'grep'); return { f, text: r.content, err: r.err }; }) : [{ f: '', text: stdin }];
      let out = ''; let err = ''; let count = 0;
      sources.forEach(({ f, text, err: e }) => {
        if (e) { err += e + '\n'; return; }
        let c = 0;
        text.replace(/\n$/, '').split('\n').forEach((line, i) => {
          if (re.test(line) !== o.flags.has('v')) {
            c++;
            if (!o.flags.has('c') && !o.flags.has('l')) out += `${files.length > 1 ? f + ':' : ''}${o.flags.has('n') ? i + 1 + ':' : ''}${line}\n`;
          }
        });
        if (o.flags.has('c')) out += `${files.length > 1 ? f + ':' : ''}${c}\n`;
        if (o.flags.has('l') && c) out += f + '\n';
        count += c;
      });
      return { out, err, code: count ? 0 : 1 };
    };
    C.sort = (args, stdin) => {
      const o = opts(args);
      const r = textOf(o.rest, stdin, 'sort'); if (r.err) return fail(r.err);
      let lines = r.text.replace(/\n$/, '').split('\n');
      lines = o.flags.has('n') ? lines.sort((x, y) => parseFloat(x) - parseFloat(y)) : lines.sort();
      if (o.flags.has('r')) lines.reverse();
      if (o.flags.has('u')) lines = [...new Set(lines)];
      return ok(lines.join('\n'));
    };
    C.uniq = (args, stdin) => {
      const o = opts(args);
      const r = textOf(o.rest, stdin, 'uniq'); if (r.err) return fail(r.err);
      const out = [];
      r.text.replace(/\n$/, '').split('\n').forEach((l) => {
        const last = out[out.length - 1];
        if (last && last.l === l) last.n++; else out.push({ l, n: 1 });
      });
      return ok(out.map((x) => (o.flags.has('c') ? `${String(x.n).padStart(7)} ${x.l}` : x.l)).join('\n'));
    };
    C.sed = (args, stdin) => {
      const inPlace = args.includes('-i');
      const rest = args.filter((a) => a !== '-i' && a !== '-e');
      const [expr, ...files] = rest;
      const m = expr && /^s(.)(.*?)\1(.*?)\1([gi]*)$/.exec(expr);
      if (!m) return fail("sed: only substitutions are supported here, e.g.  sed 's/old/new/g' file.txt   or   sed -i 's/t3.micro/t3.small/' main.tf");
      let re;
      try { re = new RegExp(m[2], m[4].includes('g') ? (m[4].includes('i') ? 'gi' : 'g') : m[4].includes('i') ? 'i' : ''); } catch { return fail('sed: invalid regular expression'); }
      const apply = (t) => t.split('\n').map((l) => l.replace(re, m[3].replace(/\\\//g, '/').replace(/&/g, '$$&'))).join('\n');
      if (!files.length) return { out: apply(stdin), err: '', code: 0 };
      let out = '';
      for (const f of files) {
        const r = sh.read(f, 'sed');
        if (r.err) return fail(r.err.replace(/^sed: /, "sed: can't read ").replace(': No such', ': No such'));
        if (inPlace) sh.write(f, apply(r.content)); else out += apply(r.content);
      }
      return { out, err: '', code: 0 };
    };
    C.jq = (args, stdin) => {
      const o = opts(args);
      const filter = o.rest[0] || '.';
      const r = textOf(o.rest.slice(1), stdin, 'jq');
      if (r.err) return fail(r.err, 2);
      let data;
      try { data = JSON.parse(r.text); } catch { return fail('jq: error: input is not valid JSON', 2); }
      const path = filter.replace(/^\./, '').match(/[^.[\]]+|\[\d*\]/g) || [];
      let vals = [data];
      for (const p of path) {
        if (p === '[]') vals = vals.flatMap((v) => (Array.isArray(v) ? v : []));
        else if (/^\[\d+\]$/.test(p)) vals = vals.map((v) => (v == null ? null : v[+p.slice(1, -1)]));
        else vals = vals.map((v) => (v == null ? null : v[p] === undefined ? null : v[p]));
      }
      return ok(vals.map((v) => (o.flags.has('r') && typeof v === 'string' ? v : JSON.stringify(v, null, 2))).join('\n'));
    };
    C.cut = (args, stdin) => {
      const o = opts(args, ['-d', '-f']);
      const r = textOf(o.rest, stdin, 'cut'); if (r.err) return fail(r.err);
      const d = o.vals.d ?? '\t'; const fields = String(o.vals.f || '1').split(',').map((x) => +x - 1);
      return ok(r.text.replace(/\n$/, '').split('\n').map((l) => fields.map((i) => l.split(d)[i] ?? '').join(d)).join('\n'));
    };
    C.find = (args) => {
      const start = args[0] && !args[0].startsWith('-') ? args[0] : '.';
      const nameI = args.indexOf('-name'); const typeI = args.indexOf('-type');
      const pat = nameI >= 0 ? args[nameI + 1] : null; const type = typeI >= 0 ? args[typeI + 1] : null;
      const re = pat ? new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$') : null;
      const n = sh.node(start);
      if (!n) return fail(`find: '${start}': No such file or directory`);
      const out = [];
      const rec = (node, p) => {
        const name = p.split('/').pop();
        if ((!re || re.test(name)) && (!type || (type === 'd') === (node.type === 'dir'))) out.push(p);
        if (node.type === 'dir') Object.keys(node.children).sort().forEach((k) => { if (k !== 'node_modules' && k !== '.git') rec(node.children[k], `${p}/${k}`); });
      };
      rec(n, start);
      return ok(out.join('\n'));
    };
    C.chmod = (args) => {
      const o = { rest: args.filter((a) => a !== '-R') };
      const [mode, ...files] = o.rest;
      if (!mode || !files.length) return fail('chmod: missing operand');
      for (const f of files) {
        const n = sh.node(f);
        if (!n) return fail(`chmod: cannot access '${f}': No such file or directory`);
        if (/^[0-7]{3}$/.test(mode)) n.mode = parseInt(mode, 8);
        else {
          const m = /^([ugoa]*)([+-=])([rwx]+)$/.exec(mode);
          if (!m) return fail(`chmod: invalid mode: '${mode}'`);
          const who = m[1] || 'a'; let bits = 0;
          for (const p of m[3]) { const v = { r: 4, w: 2, x: 1 }[p]; if (who.includes('u') || who.includes('a')) bits |= v << 6; if (who.includes('g') || who.includes('a')) bits |= v << 3; if (who.includes('o') || who.includes('a')) bits |= v; }
          n.mode = m[2] === '+' ? n.mode | bits : m[2] === '-' ? n.mode & ~bits : bits;
        }
      }
      return ok();
    };
    C.chown = (args) => {
      const [owner, ...files] = args.filter((a) => a !== '-R');
      for (const f of files) { const n = sh.node(f); if (!n) return fail(`chown: cannot access '${f}': No such file or directory`); n.owner = owner.split(':')[0]; }
      return ok();
    };
    C.du = (args) => {
      const o = opts(args);
      const p = o.rest[0] || '.';
      const n = sh.node(p); if (!n) return fail(`du: cannot access '${p}': No such file or directory`);
      const size = n.type === 'dir' ? sh.walk(p).reduce((s, [, f]) => s + f.content.length, 0) + 4096 : n.content.length;
      return ok(`${o.flags.has('h') ? (size / 1024).toFixed(1) + 'K' : Math.ceil(size / 1024)}\t${p}`);
    };
    C.stat = ([f]) => {
      const n = sh.node(f); if (!n) return fail(`stat: cannot statx '${f}': No such file or directory`);
      return ok(`  File: ${f}\n  Size: ${n.type === 'dir' ? 4096 : n.content.length}\t${n.type === 'dir' ? 'directory' : 'regular file'}\nAccess: (0${(n.mode & 0o777).toString(8)})  Uid: ( 1000/ ${n.owner})\nModify: ${n.mtime.toISOString().replace('T', ' ').slice(0, 19)}`);
    };
    C.bash = (args) => (args.length ? (sh.node(args[0]) ? sh.runScriptText(sh.read(args[0], 'bash').content || '', args.slice(1)) : fail(`bash: ${args[0]}: No such file or directory`, 127)) : fail('bash: an interactive shell is already running. Try: bash script.sh'));
    C.sh = C.bash;
    C.source = (args) => C.bash(args);
    C['.'] = C.source;

    /* --- Linux system --- */
    C.ps = (args) => {
      const full = args.some((a) => /aux|-ef|-e/.test(a));
      const procs = sh.procs.filter((p) => full || p.user === USER);
      if (!full) return ok(table([['PID', 'TTY', 'TIME', 'CMD'], ...procs.map((p) => [p.pid, 'pts/0', '00:00:00', p.cmd.split(' ')[0].replace(/^-/, '')]), [sh.nextPid, 'pts/0', '00:00:00', 'ps']]));
      return ok(table([['USER', 'PID', '%CPU', '%MEM', 'STAT', 'COMMAND'], ...procs.map((p) => [p.user, p.pid, p.cpu.toFixed(1), p.mem.toFixed(1), 'Ss', p.cmd]), [USER, sh.nextPid, '0.0', '0.1', 'R+', 'ps ' + args.join(' ')]], 2));
    };
    C.top = () => {
      const d = new Date();
      const head = `top - ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} up 12 days,  3:41,  1 user,  load average: 0.08, 0.12, 0.10\nTasks: ${sh.procs.length + 96} total,   1 running, ${sh.procs.length + 95} sleeping,   0 stopped,   0 zombie\n%Cpu(s):  2.3 us,  0.7 sy,  0.0 ni, 96.8 id,  0.1 wa\nMiB Mem :   3936.2 total,   1873.4 free,    912.6 used,   1150.2 buff/cache\n`;
      const rows = [...sh.procs].sort((a, b) => b.cpu - a.cpu).map((p) => [p.pid, p.user, p.cpu.toFixed(1), p.mem.toFixed(1), p.cmd.split(' ')[0].replace(/:$/, '')]);
      return ok(head + '\n' + table([['PID', 'USER', '%CPU', '%MEM', 'COMMAND'], ...rows], 2) + '\n\n(top normally refreshes live; this is one snapshot. Press q to quit in a real terminal.)');
    };
    C.htop = C.top;
    C.kill = (args) => {
      const pids = args.filter((a) => /^\d+$/.test(a)).map(Number);
      if (!pids.length) return fail('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid');
      let err = '';
      pids.forEach((pid) => {
        const p = sh.procs.find((x) => x.pid === pid);
        if (!p) { err += `bash: kill: (${pid}) - No such process\n`; return; }
        if (pid === 1) { err += 'bash: kill: (1) - Operation not permitted\n'; return; }
        // killing any process of a service takes the whole service down
        sh.procs = sh.procs.filter((x) => x !== p && (!p.svc || x.svc !== p.svc));
        if (p.svc) sh.services[p.svc] = 'failed';
      });
      return { out: '', err, code: err ? 1 : 0 };
    };
    C.pkill = ([name]) => {
      const hit = sh.procs.filter((p) => p.cmd.includes(name));
      if (!hit.length) return { out: '', err: '', code: 1 };
      return C.kill(hit.map((p) => String(p.pid)));
    };
    C.pgrep = ([name]) => {
      const hit = sh.procs.filter((p) => p.cmd.includes(name));
      return { out: hit.map((p) => p.pid).join('\n') + (hit.length ? '\n' : ''), err: '', code: hit.length ? 0 : 1 };
    };
    const svcProcs = { nginx: ['nginx: master process /usr/sbin/nginx', 'nginx: worker process'], ssh: ['sshd: /usr/sbin/sshd -D'], cron: ['/usr/sbin/cron -f'], docker: ['/usr/bin/dockerd -H fd://'], prometheus: ['/usr/bin/prometheus --config.file=/etc/prometheus/prometheus.yml'], grafana: ['/usr/sbin/grafana-server'] };
    C.systemctl = (args) => {
      const [action, rawName] = args.filter((a) => !a.startsWith('-'));
      const name = (rawName || '').replace(/\.service$/, '');
      if (!action) return C.systemctl(['list-units']);
      if (action === 'list-units' || action === 'list-unit-files') {
        return ok(table([['UNIT', 'LOAD', 'ACTIVE', 'SUB', 'DESCRIPTION'], ...Object.entries(sh.services).map(([s, st]) => [`${s}.service`, 'loaded', st === 'active' ? 'active' : st === 'failed' ? 'failed' : 'inactive', st === 'active' ? 'running' : 'dead', s])], 2));
      }
      if (!name) return fail(`systemctl ${action}: missing service name, e.g. systemctl ${action} nginx`);
      if (!(name in sh.services)) return fail(`Unit ${name}.service could not be found.`, 4);
      const setProcs = (on) => {
        sh.procs = sh.procs.filter((p) => p.svc !== name);
        if (on) (svcProcs[name] || [name]).forEach((cmd, i) => sh.procs.push({ pid: sh.nextPid++, user: i && name === 'nginx' ? 'www-data' : 'root', cpu: 0.1, mem: 0.4, cmd, svc: name }));
      };
      if (action === 'start' || action === 'restart' || action === 'reload') { sh.services[name] = 'active'; setProcs(true); return ok(); }
      if (action === 'stop') { sh.services[name] = 'inactive'; setProcs(false); return ok(); }
      if (action === 'enable' || action === 'disable') return ok(`${action === 'enable' ? 'Created symlink' : 'Removed'} /etc/systemd/system/multi-user.target.wants/${name}.service.`);
      if (action === 'is-active') return { out: (sh.services[name] === 'active' ? 'active' : sh.services[name] === 'failed' ? 'failed' : 'inactive') + '\n', err: '', code: sh.services[name] === 'active' ? 0 : 3 };
      if (action === 'status') {
        const st = sh.services[name];
        const pids = sh.procs.filter((p) => p.svc === name);
        const lines = [`${st === 'active' ? '●' : '○'} ${name}.service - ${{ nginx: 'A high performance web server and a reverse proxy server', ssh: 'OpenBSD Secure Shell server', cron: 'Regular background program processing daemon', docker: 'Docker Application Container Engine', prometheus: 'Prometheus monitoring server', grafana: 'Grafana dashboards' }[name] || name}`,
          `     Loaded: loaded (/lib/systemd/system/${name}.service; enabled; preset: enabled)`,
          `     Active: ${st === 'active' ? 'active (running) since ' + longDate(new Date(Date.now() - 3 * 3600e3)) + '; 3h ago' : st === 'failed' ? 'failed (Result: signal) since ' + longDate(new Date()) : 'inactive (dead)'}`];
        if (pids.length) lines.push(`   Main PID: ${pids[0].pid} (${name})`, '     CGroup: /system.slice/' + name + '.service', ...pids.map((p, i) => `             ${i === pids.length - 1 ? '└─' : '├─'}${p.pid} "${p.cmd}"`));
        if (st === 'failed') lines.push('', `Tip: start it again with  sudo systemctl start ${name}`);
        return { out: lines.join('\n') + '\n', err: '', code: st === 'active' ? 0 : 3 };
      }
      return fail(`systemctl: unknown command '${action}'. Try: status, start, stop, restart, enable, disable, list-units`);
    };
    C.service = ([name, action]) => C.systemctl([action, name]);
    C.journalctl = (args) => {
      const o = opts(args, ['-u', '-n']);
      const name = (o.vals.u || 'system').replace(/\.service$/, '');
      const n = +(o.vals.n || 6);
      const d = new Date();
      const t = (m) => { const x = new Date(d - m * 60e3); return `${MONTHS[x.getMonth()]} ${two(x.getDate())} ${two(x.getHours())}:${two(x.getMinutes())}:${two(x.getSeconds())}`; };
      const logs = {
        nginx: ['Starting nginx.service - A high performance web server...', 'Started nginx.service - A high performance web server.', '10.0.2.2 "GET / HTTP/1.1" 200 615', '10.0.2.2 "GET /health HTTP/1.1" 200 2', '10.0.2.2 "GET /favicon.ico HTTP/1.1" 404 153', sh.services.nginx === 'active' ? '10.0.2.2 "GET /api/users HTTP/1.1" 200 1032' : 'nginx.service: Main process exited, code=killed, status=15/TERM'],
        ssh: ['Server listening on 0.0.0.0 port 22.', 'Accepted publickey for tejus from 10.0.2.2 port 51022', 'pam_unix(sshd:session): session opened for user tejus'],
        docker: ['Starting up', 'Loading containers: done.', 'Docker daemon commit=8e96db1 version=27.3.1', 'API listen on /run/docker.sock'],
        cron: ['(tejus) CMD (/home/tejus/scripts/backup.sh)', '(root) CMD (test -x /usr/sbin/anacron)'],
      }[name] || ['Reached target multi-user.target - Multi-User System.', 'Started session 4 of user tejus.'];
      return ok(logs.slice(-n).map((l, i, a) => `${t((a.length - i) * 7)} ${HOST} ${name === 'system' ? 'systemd[1]' : name + '[' + (name === 'nginx' ? 812 : 640) + ']'}: ${l}`).join('\n'));
    };
    C.df = (args) => {
      const h = args.some((a) => a.includes('h'));
      return ok(h ? table([['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'], ['/dev/sda1', '40G', '13G', '25G', '35%', '/'], ['tmpfs', '1.9G', '0', '1.9G', '0%', '/dev/shm'], ['/dev/sda15', '105M', '6.1M', '99M', '6%', '/boot/efi']], 2)
        : table([['Filesystem', '1K-blocks', 'Used', 'Available', 'Use%', 'Mounted on'], ['/dev/sda1', '41152736', '13631488', '26128128', '35%', '/']], 2));
    };
    C.free = (args) => ok(args.some((a) => a.includes('h'))
      ? table([['', 'total', 'used', 'free', 'shared', 'buff/cache', 'available'], ['Mem:', '3.8Gi', '912Mi', '1.8Gi', '12Mi', '1.1Gi', '2.7Gi'], ['Swap:', '2.0Gi', '0B', '2.0Gi']], 2)
      : table([['', 'total', 'used', 'free', 'shared', 'buff/cache', 'available'], ['Mem:', '4030668', '934502', '1918361', '12288', '1177805', '2841020'], ['Swap:', '2097148', '0', '2097148']], 2));
    C.lsb_release = () => ok('Distributor ID:\tUbuntu\nDescription:\tUbuntu 24.04.1 LTS\nRelease:\t24.04\nCodename:\tnoble');
    C.apt = (args) => {
      const [action, ...pkgs] = args.filter((a) => !a.startsWith('-'));
      if (action === 'update') return ok('Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nGet:2 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]\nFetched 126 kB in 1s (98.4 kB/s)\nReading package lists... Done\nAll packages are up to date.');
      if (action === 'install') {
        if (!pkgs.length) return fail('E: Missing package name. Try: sudo apt install tree');
        const out = ['Reading package lists... Done', 'Building dependency tree... Done'];
        pkgs.forEach((p) => {
          if (sh.installed.has(p)) out.push(`${p} is already the newest version.`);
          else { sh.installed.add(p); out.push(`The following NEW packages will be installed:\n  ${p}`, `Get:1 http://archive.ubuntu.com/ubuntu noble/main amd64 ${p} [${(hash(p) % 900) + 40} kB]`, `Setting up ${p} ...`); }
        });
        out.push('0 upgraded, ' + pkgs.length + ' newly installed, 0 to remove.');
        return ok(out.join('\n'));
      }
      if (action === 'remove') { pkgs.forEach((p) => sh.installed.delete(p)); return ok(`Removing ${pkgs.join(' ')} ...`); }
      if (action === 'list') return ok('Listing... Done\n' + [...sh.installed].sort().map((p) => `${p}/noble,now amd64 [installed]`).join('\n'));
      return fail('Usage: apt update | apt install <package> | apt remove <package> | apt list --installed');
    };
    C['apt-get'] = C.apt;
    C.crontab = (args) => {
      const cron = sh.node(`${HOME}/.crontab`);
      if (args.includes('-l')) return cron && cron.content.trim() ? ok(cron.content) : fail(`no crontab for ${USER}`);
      if (args.includes('-e')) return fail("crontab -e opens an editor, which isn't available here.\nInstead add a line like this:\n  (crontab -l; echo \"0 3 * * * /home/tejus/scripts/backup.sh\") | crontab -");
      if (args.includes('-r')) { sh.write(`${HOME}/.crontab`, ''); return ok(); }
      return fail('usage: crontab -l | crontab -r | crontab <file>');
    };
    // `crontab -` / `crontab file` read from stdin or a file
    const cronBase = C.crontab;
    C.crontab = (args, stdin) => {
      if (args[0] === '-') { sh.write(`${HOME}/.crontab`, nl(stdin)); return ok(); }
      if (args[0] && !args[0].startsWith('-')) { const r = sh.read(args[0], 'crontab'); if (r.err) return fail(r.err); sh.write(`${HOME}/.crontab`, nl(r.content)); return ok(); }
      return cronBase(args, stdin);
    };

    /* --- networking --- */
    const KNOWN = { 'example.com': '93.184.215.14', 'google.com': '142.250.183.14', 'www.google.com': '142.250.183.36', 'github.com': '140.82.121.3', 'api.github.com': '140.82.121.6', 'localhost': '127.0.0.1', 'shipyard.dev': '185.199.108.153', 'cloudflare.com': '104.16.132.229' };
    const resolve = (host) => {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
      if (KNOWN[host]) return KNOWN[host];
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) return fakeIp(host);
      return null;
    };
    C.ping = (args) => {
      const o = opts(args, ['-c']);
      const host = o.rest[0];
      if (!host) return fail('ping: usage error: Destination address required', 2);
      const ip = resolve(host);
      if (!ip) return fail(`ping: ${host}: Name or service not known`, 2);
      const n = Math.min(+(o.vals.c || 4), 10);
      const base = host === 'localhost' || ip.startsWith('127.') ? 0.04 : 8 + (hash(host) % 40);
      const times = Array.from({ length: n }, (_, i) => +(base + ((hash(host + i) % 100) / 50)).toFixed(host === 'localhost' ? 3 : 1));
      const lines = [`PING ${host} (${ip}) 56(84) bytes of data.`, ...times.map((t, i) => `64 bytes from ${ip}: icmp_seq=${i + 1} ttl=${ip.startsWith('127.') ? 64 : 117} time=${t} ms`), '', `--- ${host} ping statistics ---`, `${n} packets transmitted, ${n} received, 0% packet loss, time ${n * 1001 - 1000}ms`, `rtt min/avg/max/mdev = ${Math.min(...times)}/${(times.reduce((a, b) => a + b, 0) / n).toFixed(3)}/${Math.max(...times)}/0.412 ms`];
      if (!o.vals.c) lines.push('', '(A real ping keeps going until you press Ctrl+C. Use -c 3 to send 3 pings.)');
      return ok(lines.join('\n'));
    };
    C.dig = (args) => {
      const short = args.includes('+short');
      const host = args.find((a) => !a.startsWith('+') && !a.startsWith('@') && !['A', 'MX', 'AAAA', 'NS', 'TXT', 'CNAME'].includes(a));
      const type = args.find((a) => ['A', 'MX', 'AAAA', 'NS', 'TXT', 'CNAME'].includes(a)) || 'A';
      if (!host) return fail('Usage: dig example.com [+short]');
      const ip = resolve(host);
      if (!ip) return ok(short ? '' : `;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN\n;; QUESTION SECTION:\n;${host}.\t\t\tIN\t${type}`);
      const ans = type === 'MX' ? `10 mail.${host}.` : type === 'NS' ? `ns1.${host}.` : ip;
      if (short) return ok(ans);
      return ok(`; <<>> DiG 9.18.28 <<>> ${host}\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: ${hash(host) % 65535}\n\n;; QUESTION SECTION:\n;${host}.\t\t\tIN\t${type}\n\n;; ANSWER SECTION:\n${host}.\t\t300\tIN\t${type}\t${ans}\n\n;; Query time: 12 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)`);
    };
    C.nslookup = ([host]) => {
      const ip = host && resolve(host);
      if (!host) return fail('Usage: nslookup example.com');
      if (!ip) return fail(`Server:\t\t127.0.0.53\nAddress:\t127.0.0.53#53\n\n** server can't find ${host}: NXDOMAIN`);
      return ok(`Server:\t\t127.0.0.53\nAddress:\t127.0.0.53#53\n\nNon-authoritative answer:\nName:\t${host}\nAddress: ${ip}`);
    };
    C.host = ([h]) => { const ip = h && resolve(h); return ip ? ok(`${h} has address ${ip}`) : fail(`Host ${h} not found: 3(NXDOMAIN)`); };
    C.traceroute = ([host]) => {
      const ip = host && resolve(host);
      if (!ip) return fail(`${host || ''}: Name or service not known\nUsage: traceroute example.com`);
      const hops = ['_gateway (10.0.2.2)', 'router.isp.net (100.64.0.1)', 'core1.isp.net (100.64.12.9)', `ix-${hash(host) % 90}.transit.net (${fakeIp(host + 'x')})`, `${host} (${ip})`];
      return ok(`traceroute to ${host} (${ip}), 30 hops max, 60 byte packets\n` + hops.map((h, i) => ` ${i + 1}  ${h}  ${(i * 3.1 + 0.4).toFixed(3)} ms  ${(i * 3.3 + 0.5).toFixed(3)} ms  ${(i * 3.2 + 0.6).toFixed(3)} ms`).join('\n'));
    };
    C.tracepath = C.traceroute;
    const listening = () => {
      const rows = [];
      if (sh.services.ssh === 'active') rows.push(['tcp', 'LISTEN', '0.0.0.0:22', 'sshd', 640]);
      if (sh.services.nginx === 'active') rows.push(['tcp', 'LISTEN', '0.0.0.0:80', 'nginx', 812]);
      rows.push(['udp', 'UNCONN', '127.0.0.53:53', 'systemd-resolve', 410]);
      sh.docker.containers.filter((c) => c.status === 'running').forEach((c) => c.ports.forEach((p) => rows.push(['tcp', 'LISTEN', `0.0.0.0:${p.host}`, 'docker-proxy', 3000 + p.host % 1000])));
      Object.keys(sh.endpoints).forEach((port) => { if (!rows.some((r) => r[2].endsWith(':' + port))) rows.push(['tcp', 'LISTEN', `127.0.0.1:${port}`, sh.endpoints[port].proc || 'node', 4000 + (+port % 1000)]); });
      return rows;
    };
    C.ss = () => ok(table([['Netid', 'State', 'Local Address:Port', 'Process'], ...listening().map((r) => [r[0], r[1], r[2], `users:(("${r[3]}",pid=${r[4]}))`])], 2));
    C.netstat = () => ok('Active Internet connections (only servers)\n' + table([['Proto', 'Local Address', 'State', 'PID/Program name'], ...listening().map((r) => [r[0], r[2], r[1] === 'LISTEN' ? 'LISTEN' : '', `${r[4]}/${r[3]}`])], 2));
    C.ip = ([sub]) => {
      if (sub === 'route' || sub === 'r') return ok('default via 10.0.2.2 dev eth0 proto dhcp metric 100\n10.0.2.0/24 dev eth0 proto kernel scope link src 10.0.2.15\n172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1');
      return ok('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN\n    inet 127.0.0.1/8 scope host lo\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n    link/ether 08:00:27:4e:66:a1 brd ff:ff:ff:ff:ff:ff\n    inet 10.0.2.15/24 brd 10.0.2.255 scope global dynamic eth0\n3: docker0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0');
    };
    C.ifconfig = () => ok('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 10.0.2.15  netmask 255.255.255.0  broadcast 10.0.2.255\n        ether 08:00:27:4e:66:a1  txqueuelen 1000  (Ethernet)\n\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0');
    C.curl = (args) => {
      const o = opts(args, ['-X', '-d', '-H', '-o', '--data', '--request', '--header', '-w', '-u']);
      let url = o.rest[0];
      if (!url) return fail("curl: try 'curl --help' or 'curl --manual' for more information\nExample: curl -I https://example.com", 2);
      if (!/^[a-z]+:\/\//i.test(url)) url = 'http://' + url;
      let u;
      try { u = new URL(url); } catch { return fail(`curl: (3) URL rejected: Bad hostname`, 3); }
      const headOnly = o.flags.has('I') || o.flags.has('head');
      const method = o.vals.X || o.vals.request || (o.vals.d || o.vals.data ? 'POST' : headOnly ? 'HEAD' : 'GET');
      const host = u.hostname; const port = u.port || (u.protocol === 'https:' ? '443' : '80');
      let res;
      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
        const c = sh.docker.containers.find((x) => x.status === 'running' && x.ports.some((p) => String(p.host) === port));
        if (c) { res = c.serve(u.pathname, method); } else if (sh.endpoints[port]) res = sh.endpoints[port].handle(u, method, o.vals.d || o.vals.data);
        else if (port === '80' && sh.services.nginx === 'active') res = { status: 200, type: 'text/html', body: '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is successfully installed and working.</p>\n</body>\n</html>' };
        else return fail(`curl: (7) Failed to connect to ${host} port ${port} after 0 ms: Couldn't connect to server${port === '80' ? '\nTip: nginx is stopped. Start it with  sudo systemctl start nginx' : sh.topic?.id === 'docker' ? `\nTip: nothing is listening on port ${port}. Start a container with  docker run -d -p ${port}:80 nginx` : ''}`, 7);
      } else {
        if (!resolve(host)) return fail(`curl: (6) Could not resolve host: ${host}`, 6);
        if (host === 'api.github.com') res = { status: 200, type: 'application/json; charset=utf-8', body: u.pathname.startsWith('/users/') ? JSON.stringify({ login: u.pathname.split('/')[2], public_repos: 12, followers: 34 }, null, 2) : JSON.stringify({ current_user_url: 'https://api.github.com/user', repository_url: 'https://api.github.com/repos/{owner}/{repo}' }, null, 2) };
        else if (host === 'google.com') res = { status: 301, type: 'text/html; charset=UTF-8', location: 'https://www.google.com/', body: '<HTML><HEAD><TITLE>301 Moved</TITLE></HEAD><BODY>The document has moved <A HREF="https://www.google.com/">here</A>.</BODY></HTML>' };
        else if (host === 'example.com') res = { status: 200, type: 'text/html; charset=UTF-8', body: '<!doctype html>\n<html>\n<head><title>Example Domain</title></head>\n<body>\n<h1>Example Domain</h1>\n<p>This domain is for use in illustrative examples in documents.</p>\n</body>\n</html>' };
        else if (u.pathname === '/health' || u.pathname === '/healthz') res = { status: 200, type: 'application/json', body: '{"status":"ok"}' };
        else res = { status: 200, type: 'text/html; charset=UTF-8', body: `<!doctype html>\n<html><head><title>${host}</title></head><body><h1>${host}</h1></body></html>` };
      }
      const reason = { 200: 'OK', 201: 'Created', 301: 'Moved Permanently', 404: 'Not Found', 500: 'Internal Server Error', 503: 'Service Unavailable' }[res.status] || '';
      const headers = [`HTTP/${u.protocol === 'https:' ? '2' : '1.1'} ${res.status}${u.protocol === 'https:' ? '' : ' ' + reason}`, `content-type: ${res.type}`, `content-length: ${res.body.length}`, `date: ${new Date().toUTCString()}`, `server: ${res.server || (host === 'localhost' ? 'nginx/1.27.2' : host.includes('google') ? 'gws' : host.includes('github') ? 'github.com' : 'ECS (nyd/D11E)')}`];
      if (res.location) headers.push(`location: ${res.location}`);
      if (headOnly) return ok(headers.join('\n'));
      if (o.vals.o) { sh.write(o.vals.o, res.body + '\n'); return o.flags.has('s') ? ok() : ok(`  % Total    % Received % Xferd  Average Speed   Time\n100  ${String(res.body.length).padStart(5)}  100  ${String(res.body.length).padStart(5)}    0     0   ${res.body.length * 9}      0 --:--:--`); }
      const fails = o.flags.has('f') || o.flags.has('fail');
      if (fails && res.status >= 400) return fail(`curl: (22) The requested URL returned error: ${res.status}`, 22);
      return ok((o.flags.has('i') || o.flags.has('v') ? headers.join('\n') + '\n\n' : '') + res.body);
    };
    C.wget = (args) => {
      const url = args.find((a) => !a.startsWith('-'));
      if (!url) return fail('wget: missing URL');
      const name = url.split('/').pop() || 'index.html';
      const r = C.curl(['-s', '-o', name.includes('.') ? name : 'index.html', url]);
      if (r.code) return r;
      return ok(`--${new Date().toISOString().slice(0, 19).replace('T', ' ')}--  ${url}\nHTTP request sent, awaiting response... 200 OK\nSaving to: '${name.includes('.') ? name : 'index.html'}'\n\n'${name.includes('.') ? name : 'index.html'}' saved`);
    };

    /* --- git, npm, gh, docker, aws, kubectl, terraform --- */
    C.git = (args) => sh.git(args);
    C.npm = (args) => sh.npm(args);
    C.npx = (args) => (args[0] ? fail(`npx: ${args[0]} isn't available in this practice terminal. Try: npm test, npm run build`) : fail('npx: missing command'));
    C.node = (args) => (args[0] === '-v' || args[0] === '--version' ? ok('v20.18.0') : fail("node: the interactive Node.js prompt isn't available here. Try: node -v"));
    C.gh = (args) => sh.ghCmd(args);
    C.docker = (args) => sh.dockerCmd(args);
    C.aws = (args) => sh.awsCmd(args);
    C.kubectl = (args) => sh.kubectl(args);
    C.k = C.kubectl;
    C.minikube = ([a]) => (a === 'status' ? ok('minikube\ntype: Control Plane\nhost: Running\nkubelet: Running\napiserver: Running\nkubeconfig: Configured') : ok(`😄  minikube ${a || ''} (simulated). The cluster is already running. Try: kubectl get nodes`));
    C.terraform = (args) => sh.terraform(args);
    C.tf = C.terraform;
    C.promtool = (args) => (args[0] === 'check' ? ok(`Checking ${args[2] || 'prometheus.yml'}\n  SUCCESS: ${args[2] || 'prometheus.yml'} is valid prometheus config file syntax`) : fail('Usage: promtool check config prometheus.yml'));
    return C;
  }

  /* ═════════════ git ═════════════ */
  repoAt() {
    let p = this.cwd;
    while (true) {
      if (this.repos[p] && this.node(p + '/.git')) return this.repos[p];
      if (p === '/') return null;
      p = p.slice(0, p.lastIndexOf('/')) || '/';
    }
  }
  newRepo(root) {
    const r = { root, head: 'main', branches: {}, commits: {}, index: {}, remotes: {}, remoteBranches: {}, upstream: {}, stash: [] };
    this.repos[root] = r;
    this.mkdirp(root + '/.git');
    this.put(root + '/.git/HEAD', 'ref: refs/heads/main\n');
    return r;
  }
  ignored(repo) {
    const gi = this.node(repo.root + '/.gitignore');
    const pats = ['.git', ...(gi ? gi.content.split('\n').map((l) => l.trim().replace(/\/$/, '')).filter((l) => l && !l.startsWith('#')) : [])];
    return (rel) => pats.some((p) => rel === p || rel.startsWith(p + '/') || (p.startsWith('*.') && rel.endsWith(p.slice(1))));
  }
  workSnap(repo) {
    const ig = this.ignored(repo);
    return Object.fromEntries(this.walk(repo.root).filter(([rel]) => !ig(rel)).map(([rel, n]) => [rel, n.content]));
  }
  headCommit(repo) { return repo.branches[repo.head] ? repo.commits[repo.branches[repo.head]] : null; }
  headSnap(repo) { const c = this.headCommit(repo); return c ? c.snap : {}; }
  makeCommit(repo, msg, snap, parents) {
    const id = hex(40);
    repo.commits[id] = { id, msg, snap: { ...snap }, parents, author: `${this.gitConfig['user.name']} <${this.gitConfig['user.email']}>`, date: new Date() };
    repo.branches[repo.head] = id;
    return id;
  }
  ancestors(repo, id) {
    const out = []; const seen = new Set(); const stack = [id];
    while (stack.length) {
      const x = stack.shift();
      if (!x || seen.has(x)) continue;
      seen.add(x); out.push(x);
      stack.push(...(repo.commits[x]?.parents || []));
    }
    return out;
  }
  setWorkTree(repo, fromSnap, toSnap) {
    Object.keys(fromSnap).forEach((rel) => {
      if (!(rel in toSnap)) { const [p, name] = this.split(`${repo.root}/${rel}`); const pn = this.node(p); if (pn) delete pn.children[name]; }
    });
    Object.entries(toSnap).forEach(([rel, content]) => this.put(`${repo.root}/${rel}`, content));
  }
  git(args) {
    const [sub, ...rest] = args;
    if (!sub) return ok('usage: git [--version] <command> [<args>]\n\nCommon commands: init clone status add commit log diff branch checkout switch merge push pull remote restore reset stash');
    if (sub === '--version' || sub === 'version') return ok('git version 2.43.0');
    if (sub === 'config') {
      const o = opts(rest);
      if (o.flags.has('list') || o.flags.has('l')) return ok(Object.entries(this.gitConfig).map(([k, v]) => `${k}=${v}`).join('\n'));
      const [k, ...v] = o.rest;
      if (!k) return fail('usage: git config [--global] user.name "Your Name"');
      if (!v.length) return this.gitConfig[k] ? ok(this.gitConfig[k]) : { out: '', err: '', code: 1 };
      this.gitConfig[k] = v.join(' ');
      return ok();
    }
    if (sub === 'init') {
      const dir = rest[0] ? this.abs(rest[0]) : this.cwd;
      this.mkdirp(dir);
      if (this.repos[dir] && this.node(dir + '/.git')) return ok(`Reinitialized existing Git repository in ${dir}/.git/`);
      this.newRepo(dir);
      return ok(`Initialized empty Git repository in ${dir}/.git/`);
    }
    if (sub === 'clone') {
      const url = rest.find((a) => !a.startsWith('-'));
      if (!url) return fail('usage: git clone <repo> [<dir>]');
      const name = (rest.filter((a) => !a.startsWith('-'))[1]) || url.replace(/\.git$/, '').split(/[/:]/).pop();
      const dir = this.abs(name);
      if (this.node(dir)) return fail(`fatal: destination path '${name}' already exists and is not an empty directory.`, 128);
      if (!/github\.com|gitlab\.com|bitbucket\.org|^git@/.test(url)) return fail(`fatal: repository '${url}' not found`, 128);
      const repo = this.newRepo(dir);
      const files = { 'README.md': `# ${name}\n\nCloned from ${url}\n`, 'src/index.js': "console.log('hello from " + name + "');\n", '.gitignore': 'node_modules\n' };
      Object.entries(files).forEach(([rel, c]) => this.put(`${dir}/${rel}`, c));
      repo.index = { ...files };
      const id = this.makeCommit(repo, 'Initial commit', files, []);
      repo.remotes.origin = url; repo.remoteBranches.main = id; repo.upstream.main = 'origin/main';
      return ok(`Cloning into '${name}'...\nremote: Enumerating objects: 12, done.\nremote: Counting objects: 100% (12/12), done.\nReceiving objects: 100% (12/12), 3.21 KiB | 3.21 MiB/s, done.\nResolving deltas: 100% (2/2), done.`);
    }
    const repo = this.repoAt();
    if (!repo) return fail('fatal: not a git repository (or any of the parent directories): .git\nTip: run  git init  first, or cd into a project folder', 128);
    const rel = (p) => { const a = this.abs(p); return a === repo.root ? '' : a.slice(repo.root.length + 1); };
    const head = this.headSnap(repo);
    const work = () => this.workSnap(repo);
    const changes = () => {
      const w = work(); const idx = repo.index;
      const staged = []; const unstaged = []; const untracked = [];
      new Set([...Object.keys(head), ...Object.keys(idx)]).forEach((f) => {
        if (!(f in head) && f in idx) staged.push(['new file', f]);
        else if (f in head && !(f in idx)) staged.push(['deleted', f]);
        else if (head[f] !== idx[f]) staged.push(['modified', f]);
      });
      Object.keys(idx).forEach((f) => { if (!(f in w)) unstaged.push(['deleted', f]); else if (w[f] !== idx[f]) unstaged.push(['modified', f]); });
      Object.keys(w).forEach((f) => { if (!(f in idx)) untracked.push(f); });
      return { staged: staged.sort((a, b) => a[1].localeCompare(b[1])), unstaged: unstaged.sort((a, b) => a[1].localeCompare(b[1])), untracked: untracked.sort() };
    };
    const short = (id) => id.slice(0, 7);
    const aheadBy = () => {
      const local = repo.branches[repo.head]; const remote = repo.remoteBranches[repo.head];
      if (!local || !remote || !repo.upstream[repo.head]) return null;
      const anc = this.ancestors(repo, local);
      const i = anc.indexOf(remote);
      return i < 0 ? anc.length : i;
    };
    const o = opts(rest, ['-m', '-n', '--message']);

    switch (sub) {
      case 'status': {
        const { staged, unstaged, untracked } = changes();
        if (o.flags.has('s') || o.flags.has('short')) {
          const lines = [];
          const files = new Set([...staged.map((x) => x[1]), ...unstaged.map((x) => x[1])]);
          [...files].sort().forEach((f) => {
            const s = staged.find((x) => x[1] === f); const u = unstaged.find((x) => x[1] === f);
            const code = (x) => (!x ? ' ' : x[0] === 'new file' ? 'A' : x[0] === 'deleted' ? 'D' : 'M');
            lines.push(`${code(s)}${code(u)} ${f}`);
          });
          untracked.forEach((f) => lines.push(`?? ${f}`));
          return ok(lines.join('\n'));
        }
        const out = [`On branch ${repo.head}`];
        const ahead = aheadBy();
        if (ahead === 0) out.push(`Your branch is up to date with 'origin/${repo.head}'.`);
        else if (ahead > 0) out.push(`Your branch is ahead of 'origin/${repo.head}' by ${ahead} commit${ahead > 1 ? 's' : ''}.`, '  (use "git push" to publish your local commits)');
        if (!this.headCommit(repo)) out.push('', 'No commits yet');
        if (staged.length) out.push('', 'Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)', ...staged.map(([k, f]) => `        ${(k + ':').padEnd(12)}${f}`));
        if (unstaged.length) out.push('', 'Changes not staged for commit:', '  (use "git add <file>..." to update what will be committed)', '  (use "git restore <file>..." to discard changes in working directory)', ...unstaged.map(([k, f]) => `        ${(k + ':').padEnd(12)}${f}`));
        if (untracked.length) out.push('', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)', ...untracked.map((f) => `        ${f}`));
        if (!staged.length && !unstaged.length && !untracked.length) out.push(this.headCommit(repo) ? 'nothing to commit, working tree clean' : '\nnothing to commit (create/copy files and use "git add" to track)');
        else if (!staged.length) out.push('', unstaged.length ? 'no changes added to commit (use "git add" and/or "git commit -a")' : 'nothing added to commit but untracked files present (use "git add" to track)');
        return ok(out.join('\n'));
      }
      case 'add': {
        if (!o.rest.length && !o.flags.has('A') && !o.flags.has('all')) return fail('Nothing specified, nothing added.\nhint: Maybe you wanted to say \'git add .\'?');
        const w = work();
        const targets = o.flags.has('A') || o.flags.has('all') ? [''] : o.rest.map(rel);
        for (const t of targets) {
          const matchW = Object.keys(w).filter((f) => !t || f === t || f.startsWith(t + '/'));
          const matchI = Object.keys(repo.index).filter((f) => !t || f === t || f.startsWith(t + '/'));
          if (!matchW.length && !matchI.length) return fail(`fatal: pathspec '${t}' did not match any files`, 128);
          matchW.forEach((f) => { repo.index[f] = w[f]; });
          matchI.forEach((f) => { if (!(f in w)) delete repo.index[f]; });
        }
        return ok();
      }
      case 'rm': {
        const t = o.rest.map(rel);
        t.forEach((f) => { delete repo.index[f]; if (!o.flags.has('cached')) { const [p, n] = this.split(`${repo.root}/${f}`); const pn = this.node(p); if (pn) delete pn.children[n]; } });
        return ok(t.map((f) => `rm '${f}'`).join('\n'));
      }
      case 'commit': {
        const msg = o.vals.m || o.vals.message || (o.flags.has('m') ? o.rest[0] : undefined);
        if (o.flags.has('a')) {
          const w = work();
          Object.keys(repo.index).forEach((f) => { if (f in w) repo.index[f] = w[f]; else delete repo.index[f]; });
        }
        if (!msg) return fail('Aborting commit: no message.\nTip: git commit -m "Describe your change"');
        const { staged, unstaged, untracked } = changes();
        if (!staged.length) {
          return { out: `On branch ${repo.head}\n${unstaged.length ? 'Changes not staged for commit:\n' + unstaged.map(([k, f]) => `        ${(k + ':').padEnd(12)}${f}`).join('\n') + '\n\nno changes added to commit (use "git add" and/or "git commit -a")' : untracked.length ? 'nothing added to commit but untracked files present (use "git add" to track)' : 'nothing to commit, working tree clean'}\n`, err: '', code: 1 };
        }
        const first = !this.headCommit(repo);
        const parent = repo.branches[repo.head];
        const id = this.makeCommit(repo, msg, repo.index, parent ? [parent] : []);
        let plus = 0; let minus = 0;
        staged.forEach(([, f]) => {
          const a = (head[f] || '').split('\n').filter(Boolean); const b = (repo.index[f] || '').split('\n').filter(Boolean);
          plus += b.filter((l) => !a.includes(l)).length; minus += a.filter((l) => !b.includes(l)).length;
        });
        const lines = [`[${repo.head}${first ? ' (root-commit)' : ''} ${short(id)}] ${msg}`, ` ${staged.length} file${staged.length > 1 ? 's' : ''} changed${plus ? `, ${plus} insertion${plus > 1 ? 's' : ''}(+)` : ''}${minus ? `, ${minus} deletion${minus > 1 ? 's' : ''}(-)` : ''}`];
        staged.filter(([k]) => k !== 'modified').forEach(([k, f]) => lines.push(` ${k === 'new file' ? 'create' : 'delete'} mode 100644 ${f}`));
        return ok(lines.join('\n'));
      }
      case 'log': {
        const start = repo.branches[repo.head];
        if (!start) return fail(`fatal: your current branch '${repo.head}' does not have any commits yet`, 128);
        let max = o.vals.n ? +o.vals.n : Infinity;
        o.rest.forEach((r) => { if (/^-\d+$/.test(r)) max = +r.slice(1); });
        rest.forEach((r) => { if (/^-\d+$/.test(r)) max = +r.slice(1); });
        const ids = this.ancestors(repo, start).slice(0, max);
        const deco = (id) => {
          const d = [];
          if (id === repo.branches[repo.head]) d.push(`HEAD -> ${repo.head}`);
          Object.entries(repo.branches).forEach(([b, x]) => { if (x === id && b !== repo.head) d.push(b); });
          Object.entries(repo.remoteBranches).forEach(([b, x]) => { if (x === id) d.push(`origin/${b}`); });
          return d.length ? ` (${d.join(', ')})` : '';
        };
        if (o.flags.has('oneline')) return ok(ids.map((id) => `${short(id)}${deco(id)} ${repo.commits[id].msg}`).join('\n'));
        return ok(ids.map((id) => { const c = repo.commits[id]; return `commit ${id}${deco(id)}\n${c.parents.length > 1 ? `Merge: ${c.parents.map(short).join(' ')}\n` : ''}Author: ${c.author}\nDate:   ${longDate(c.date)} +0200\n\n    ${c.msg}\n`; }).join('\n'));
      }
      case 'show': {
        const c = this.headCommit(repo);
        if (!c) return fail("fatal: your current branch does not have any commits yet", 128);
        const parent = c.parents[0] ? repo.commits[c.parents[0]].snap : {};
        const files = new Set([...Object.keys(c.snap), ...Object.keys(parent)]);
        const diffs = [...files].filter((f) => c.snap[f] !== parent[f]).map((f) => `diff --git a/${f} b/${f}\n--- ${f in parent ? 'a/' + f : '/dev/null'}\n+++ ${f in c.snap ? 'b/' + f : '/dev/null'}\n${lineDiff(parent[f] || '', c.snap[f] || '')}`);
        return ok(`commit ${c.id} (HEAD -> ${repo.head})\nAuthor: ${c.author}\nDate:   ${longDate(c.date)} +0200\n\n    ${c.msg}\n\n${diffs.join('\n')}`);
      }
      case 'diff': {
        const staged = o.flags.has('staged') || o.flags.has('cached');
        const a = staged ? head : repo.index; const b = staged ? repo.index : work();
        const filter = o.rest.map(rel);
        const files = [...new Set([...Object.keys(a), ...(staged ? Object.keys(b) : Object.keys(b).filter((f) => f in a))])]
          .filter((f) => a[f] !== b[f] && (!filter.length || filter.some((x) => f === x || f.startsWith(x + '/')))).sort();
        if (o.flags.has('stat')) return ok(files.map((f) => ` ${f} | changed`).join('\n') + (files.length ? `\n ${files.length} file(s) changed` : ''));
        return ok(files.map((f) => `diff --git a/${f} b/${f}\n--- ${f in a ? 'a/' + f : '/dev/null'}\n+++ ${f in b ? 'b/' + f : '/dev/null'}\n${lineDiff(a[f] || '', b[f] || '')}`).join('\n'));
      }
      case 'branch': {
        if (o.flags.has('d') || o.flags.has('D')) {
          const b = o.rest[0];
          if (!repo.branches[b]) return fail(`error: branch '${b}' not found`);
          if (b === repo.head) return fail(`error: cannot delete branch '${b}' used by worktree at '${repo.root}'`);
          const id = repo.branches[b]; delete repo.branches[b];
          return ok(`Deleted branch ${b} (was ${short(id)}).`);
        }
        if (o.rest[0]) {
          if (!repo.branches[repo.head]) return fail(`fatal: not a valid object name: '${repo.head}'`, 128);
          if (repo.branches[o.rest[0]]) return fail(`fatal: a branch named '${o.rest[0]}' already exists`, 128);
          repo.branches[o.rest[0]] = repo.branches[repo.head];
          return ok();
        }
        const names = [...new Set([repo.head, ...Object.keys(repo.branches)])].sort();
        let out = names.map((b) => (b === repo.head ? `* ${b}` : `  ${b}`)).join('\n');
        if (o.flags.has('a')) out += '\n' + Object.keys(repo.remoteBranches).map((b) => `  remotes/origin/${b}`).join('\n');
        return ok(out);
      }
      case 'checkout':
      case 'switch': {
        const create = o.flags.has('b') || o.flags.has('c') || o.flags.has('B');
        const target = o.rest[0];
        if (!target) return fail(`usage: git ${sub} [-${sub === 'switch' ? 'c' : 'b'}] <branch>`);
        if (sub === 'checkout' && !create && !repo.branches[target] && (rest.includes('--') || this.node(target))) {
          const f = rel(target);
          if (!(f in repo.index)) return fail(`error: pathspec '${target}' did not match any file(s) known to git`);
          this.put(`${repo.root}/${f}`, repo.index[f]);
          return ok(`Updated 1 path from the index`);
        }
        if (create) {
          if (repo.branches[target] && !o.flags.has('B')) return fail(`fatal: a branch named '${target}' already exists`, 128);
          if (repo.branches[repo.head]) repo.branches[target] = repo.branches[repo.head];
          repo.head = target;
          return ok(`Switched to a new branch '${target}'`);
        }
        if (target === repo.head) return ok(`Already on '${target}'`);
        if (!repo.branches[target]) {
          if (repo.remoteBranches[target]) { repo.branches[target] = repo.remoteBranches[target]; repo.upstream[target] = `origin/${target}`; } else return fail(`error: pathspec '${target}' did not match any file(s) known to git${sub === 'switch' ? '\nTip: create it with  git switch -c ' + target : '\nTip: create it with  git checkout -b ' + target}`);
        }
        const targetSnap = repo.commits[repo.branches[target]].snap;
        if (repo.branches[target] !== repo.branches[repo.head]) {
          const { staged, unstaged } = changes();
          const dirty = [...staged, ...unstaged].map((x) => x[1]);
          if (dirty.length) return fail(`error: Your local changes to the following files would be overwritten by checkout:\n${dirty.map((f) => '\t' + f).join('\n')}\nPlease commit your changes or stash them before you switch branches.\nAborting`);
          this.setWorkTree(repo, head, targetSnap);
          repo.index = { ...targetSnap };
        }
        repo.head = target;
        return ok(`Switched to branch '${target}'` + (repo.upstream[target] ? `\nYour branch is up to date with 'origin/${target}'.` : ''));
      }
      case 'merge': {
        const b = o.rest[0];
        if (!b || !repo.branches[b]) return fail(`merge: ${b || ''} - not something we can merge`);
        const ours = repo.branches[repo.head]; const theirs = repo.branches[b];
        if (ours === theirs || this.ancestors(repo, ours).includes(theirs)) return ok('Already up to date.');
        const theirSnap = repo.commits[theirs].snap;
        if (this.ancestors(repo, theirs).includes(ours)) {
          this.setWorkTree(repo, head, theirSnap);
          repo.index = { ...theirSnap }; repo.branches[repo.head] = theirs;
          const changed = Object.keys({ ...head, ...theirSnap }).filter((f) => head[f] !== theirSnap[f]);
          return ok(`Updating ${short(ours)}..${short(theirs)}\nFast-forward\n${changed.map((f) => ` ${f} | changed`).join('\n')}\n ${changed.length} file${changed.length === 1 ? '' : 's'} changed`);
        }
        const merged = { ...head, ...theirSnap };
        this.setWorkTree(repo, head, merged);
        repo.index = { ...merged };
        this.makeCommit(repo, `Merge branch '${b}'`, merged, [ours, theirs]);
        return ok(`Merge made by the 'ort' strategy.\n ${Object.keys(theirSnap).filter((f) => head[f] !== theirSnap[f]).length} file(s) changed`);
      }
      case 'remote': {
        if (o.rest[0] === 'add') { repo.remotes[o.rest[1]] = o.rest[2]; return ok(); }
        if (o.rest[0] === 'remove' || o.rest[0] === 'rm') { delete repo.remotes[o.rest[1]]; return ok(); }
        if (o.flags.has('v')) return ok(Object.entries(repo.remotes).map(([n, u]) => `${n}\t${u} (fetch)\n${n}\t${u} (push)`).join('\n'));
        return ok(Object.keys(repo.remotes).join('\n'));
      }
      case 'push': {
        if (!repo.remotes.origin) return fail("fatal: No configured push destination.\nTip: git remote add origin git@github.com:tejus/project.git", 128);
        const branch = o.rest[1] || repo.head;
        const id = repo.branches[branch];
        if (!id) return fail(`error: src refspec ${branch} does not match any\nerror: failed to push some refs to '${repo.remotes.origin}'`);
        if (!repo.upstream[branch] && !o.flags.has('u') && !o.flags.has('set-upstream') && !o.rest[1]) return fail(`fatal: The current branch ${branch} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream origin ${branch}\n`, 128);
        const before = repo.remoteBranches[branch];
        if (before === id) return ok('Everything up-to-date');
        repo.remoteBranches[branch] = id;
        const n = before ? this.ancestors(repo, id).indexOf(before) : this.ancestors(repo, id).length;
        const lines = [`Enumerating objects: ${n * 3 + 2}, done.`, `Counting objects: 100% (${n * 3 + 2}/${n * 3 + 2}), done.`, `Writing objects: 100% (${n * 2 + 1}/${n * 2 + 1}), ${n * 312 + 100} bytes | ${n * 312 + 100}.00 KiB/s, done.`];
        const host = repo.remotes.origin.replace(/^git@/, '').replace(/^https:\/\//, '').replace(/\.git$/, '');
        if (!before) lines.push('remote:', `remote: Create a pull request for '${branch}' on GitHub by visiting:`, `remote:      https://${host.replace(':', '/')}/pull/new/${branch}`, 'remote:');
        lines.push(`To ${repo.remotes.origin}`, before ? `   ${short(before)}..${short(id)}  ${branch} -> ${branch}` : ` * [new branch]      ${branch} -> ${branch}`);
        if (o.flags.has('u') || o.flags.has('set-upstream') || !repo.upstream[branch]) { repo.upstream[branch] = `origin/${branch}`; if (o.flags.has('u') || o.flags.has('set-upstream')) lines.push(`branch '${branch}' set up to track 'origin/${branch}'.`); }
        if (this.node(repo.root + '/.github/workflows')) {
          const run = this.addRun('push', branch, repo.commits[id].msg);
          lines.push('', `▶ GitHub Actions started workflow "CI" (run ${run.id}) for this push. Check it with: gh run list`);
        }
        return ok(lines.join('\n'));
      }
      case 'pull':
      case 'fetch': {
        if (!repo.remotes.origin) return fail("fatal: 'origin' does not appear to be a git repository", 128);
        return ok(sub === 'pull' ? 'Already up to date.' : '');
      }
      case 'restore': {
        const files = o.rest.map(rel);
        if (!files.length) return fail('fatal: you must specify path(s) to restore', 128);
        files.forEach((f) => {
          const match = (x) => !f || f === '.' || x === f || x.startsWith(f + '/');
          if (o.flags.has('staged')) { Object.keys({ ...repo.index, ...head }).filter(match).forEach((x) => { if (x in head) repo.index[x] = head[x]; else delete repo.index[x]; }); } else Object.keys(repo.index).filter(match).forEach((x) => this.put(`${repo.root}/${x}`, repo.index[x]));
        });
        return ok();
      }
      case 'reset': {
        const hard = o.flags.has('hard');
        const target = o.rest[0] || 'HEAD';
        let id = repo.branches[repo.head];
        const back = /^HEAD~(\d+)$/.exec(target);
        if (back) for (let i = 0; i < +back[1]; i++) id = repo.commits[id]?.parents[0];
        if (!id) return fail(`fatal: ambiguous argument '${target}': unknown revision`, 128);
        const snap = repo.commits[id].snap;
        if (hard) this.setWorkTree(repo, this.workSnap(repo), { ...snap, ...Object.fromEntries(changes().untracked.map((f) => [f, this.workSnap(repo)[f]])) });
        repo.branches[repo.head] = id;
        if (!o.flags.has('soft')) repo.index = { ...snap };
        return ok(hard ? `HEAD is now at ${short(id)} ${repo.commits[id].msg}` : back ? `Unstaged changes after reset:\n${Object.keys(this.workSnap(repo)).filter((f) => this.workSnap(repo)[f] !== snap[f] && f in snap).map((f) => 'M\t' + f).join('\n')}` : '');
      }
      case 'stash': {
        if (o.rest[0] === 'list') return ok(repo.stash.map((s, i) => `stash@{${i}}: WIP on ${repo.head}: ${s.msg}`).join('\n'));
        if (o.rest[0] === 'pop' || o.rest[0] === 'apply') {
          const s = o.rest[0] === 'pop' ? repo.stash.shift() : repo.stash[0];
          if (!s) return fail('No stash entries found.');
          this.setWorkTree(repo, {}, s.work); repo.index = { ...s.index };
          return ok(`On branch ${repo.head}\nChanges restored from the stash.${o.rest[0] === 'pop' ? '\nDropped refs/stash@{0}' : ''}`);
        }
        const { staged, unstaged } = changes();
        if (!staged.length && !unstaged.length) return ok('No local changes to save');
        const w = this.workSnap(repo);
        const tracked = Object.fromEntries(Object.entries(w).filter(([f]) => f in repo.index || f in head));
        repo.stash.unshift({ work: tracked, index: { ...repo.index }, msg: this.headCommit(repo)?.msg || '' });
        this.setWorkTree(repo, tracked, head); repo.index = { ...head };
        return ok(`Saved working directory and index state WIP on ${repo.head}: ${short(repo.branches[repo.head] || '0000000')} ${this.headCommit(repo)?.msg || ''}`);
      }
      default:
        return fail(`git: '${sub}' is not a git command. See 'git' for common commands.`);
    }
  }

  /* ═════════════ npm + gh (CI/CD) ═════════════ */
  npm(args) {
    const [sub, ...rest] = args;
    if (sub === '-v' || sub === '--version') return ok('10.8.2');
    if (!sub) return ok('Usage: npm <command>\n\nCommon: npm install, npm test, npm run build, npm run lint, npm start');
    const pkgNode = this.node('package.json');
    if (!pkgNode) return fail(`npm error code ENOENT\nnpm error path ${this.cwd}/package.json\nnpm error enoent Could not read package.json: no such file or directory\nTip: cd into a project folder that has a package.json`, 254);
    let pkg;
    try { pkg = JSON.parse(pkgNode.content); } catch { return fail('npm error JSON.parse Invalid package.json — check the commas and quotes'); }
    const installed = !!this.node('node_modules');
    const script = sub === 'run' || sub === 'run-script' ? rest[0] : sub === 'test' || sub === 't' ? 'test' : sub === 'start' ? 'start' : null;
    if (sub === 'install' || sub === 'i' || sub === 'ci') {
      const extra = rest.filter((r) => !r.startsWith('-'));
      if (extra.length) {
        pkg.dependencies = { ...(pkg.dependencies || {}), ...Object.fromEntries(extra.map((d) => [d, '^' + ((hash(d) % 9) + 1) + '.' + (hash(d) % 20) + '.0'])) };
        this.write('package.json', JSON.stringify(pkg, null, 2) + '\n');
      }
      this.mkdirp('node_modules/.bin');
      ['react', 'vite', 'vitest', 'eslint', ...extra].forEach((d) => this.mkdirp('node_modules/' + d));
      const n = 312 + extra.length * 7;
      return ok(`\nadded ${n} packages, and audited ${n + 1} packages in ${3 + extra.length}s\n\n${Math.floor(n / 4)} packages are looking for funding\n  run \`npm fund\` for details\n\nfound 0 vulnerabilities`);
    }
    if (sub === 'ls' || sub === 'list') return ok(`${pkg.name}@${pkg.version} ${this.cwd}\n` + Object.entries({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }).map(([k, v], i, a) => `${i === a.length - 1 ? '└──' : '├──'} ${k}@${v.replace('^', '')}`).join('\n'));
    if (!script) return fail(`Unknown command: "${sub}"\n\nTo see a list of supported npm commands, run:\n  npm help`);
    const cmd = pkg.scripts && pkg.scripts[script];
    if (!cmd) return fail(`npm error Missing script: "${script}"\n\nTo see a list of scripts, run:\n  npm run`);
    const header = `\n> ${pkg.name}@${pkg.version} ${script}\n> ${cmd}\n`;
    const tool = cmd.split(' ')[0];
    if (!installed) return fail(`${header}\nsh: 1: ${tool}: not found\nTip: install the dependencies first with  npm install`, 127);
    if (script === 'test') {
      const t = this.testResult();
      if (!t.pass) return { out: `${header}\n ✓ src/math.test.js (3 tests) 4ms\n ✗ src/app.test.js (2 tests | 1 failed) 6ms\n   ✗ greet() returns a welcome message\n     AssertionError: expected 'Hello BUG' to be 'Hello Tejus'\n\n Test Files  1 failed | 1 passed (2)\n      Tests  1 failed | 4 passed (5)\n`, err: '', code: 1 };
      return ok(`${header}\n ✓ src/math.test.js (3 tests) 4ms\n ✓ src/app.test.js (2 tests) 6ms\n\n Test Files  2 passed (2)\n      Tests  5 passed (5)\n   Duration  412ms`);
    }
    if (script === 'build') {
      this.mkdirp('dist/assets');
      this.write('dist/index.html', '<!doctype html><html><head><title>Shipyard</title><script type="module" src="/assets/index-3f9c2a1.js"></script></head><body><div id="root"></div></body></html>\n');
      this.write('dist/assets/index-3f9c2a1.js', '/* built bundle */\n');
      return ok(`${header}\nvite v6.3.5 building for production...\n✓ 34 modules transformed.\ndist/index.html                   0.46 kB │ gzip:  0.30 kB\ndist/assets/index-3f9c2a1.js    143.21 kB │ gzip: 46.02 kB\n✓ built in 1.84s`);
    }
    if (script === 'lint') return ok(`${header}\n✔ No problems found (12 files checked)`);
    if (script === 'start' || script === 'dev') {
      this.endpoints['5173'] = { proc: 'node', handle: () => ({ status: 200, type: 'text/html', server: 'vite', body: '<!doctype html>\n<html><head><title>Shipyard (dev)</title></head><body><div id="root">Shipyard dev server</div></body></html>' }) };
      return ok(`${header}\n  VITE v6.3.5  ready in 312 ms\n\n  ➜  Local:   http://localhost:5173/\n\n(The dev server is now running in the background. Try: curl localhost:5173)`);
    }
    return ok(`${header}\n(done)`);
  }
  testResult() {
    const repo = this.repoAt();
    const root = repo ? repo.root : this.cwd;
    const bad = this.walk(root + '/src').some(([, n]) => /\bBUG\b/.test(n.content));
    return { pass: !bad };
  }
  addRun(event, branch, title) {
    const pass = this.testResult().pass;
    const run = { id: 11843000 + this.gh.runs.length * 7 + 7, title, workflow: 'CI', branch, event, status: pass ? 'success' : 'failure', at: Date.now(), secs: pass ? 48 : 31 };
    this.gh.runs.unshift(run);
    return run;
  }
  ghCmd(args) {
    const [a, b, ...rest] = args;
    const icon = (r) => (r.status === 'success' ? '✓' : r.status === 'failure' ? 'X' : '*');
    if (!a) return ok('Work seamlessly with GitHub from the command line.\n\nUSAGE\n  gh run list | gh run view [id] | gh run watch | gh workflow list | gh workflow run <file> | gh pr create | gh repo view');
    if (a === '--version') return ok('gh version 2.62.0');
    if (a === 'auth' && b === 'status') return ok('github.com\n  ✓ Logged in to github.com account tejus (keyring)\n  - Active account: true\n  - Token scopes: \'repo\', \'workflow\'');
    if (a === 'run' && (b === 'list' || !b)) {
      if (!this.gh.runs.length) return ok('no runs found');
      return ok(table([['STATUS', 'TITLE', 'WORKFLOW', 'BRANCH', 'EVENT', 'ID', 'ELAPSED', 'AGE'], ...this.gh.runs.slice(0, 10).map((r) => [icon(r), r.title.slice(0, 28), r.workflow, r.branch, r.event, r.id, `${r.secs}s`, `about ${agoWords(r.at)}`])], 2));
    }
    if (a === 'run' && (b === 'view' || b === 'watch')) {
      const id = rest[0] && /^\d+$/.test(rest[0]) ? +rest[0] : this.gh.runs[0]?.id;
      const r = this.gh.runs.find((x) => x.id === id);
      if (!r) return fail(`could not find any workflow run with ID ${rest[0] || ''}`);
      const steps = ['Set up job', 'Run actions/checkout@v4', 'Run actions/setup-node@v4', 'Run npm ci', 'Run npm run lint', 'Run npm test', 'Run npm run build', 'Complete job'];
      const failAt = r.status === 'failure' ? 5 : 99;
      const lines = [`${icon(r)} ${r.branch} ${r.workflow} · ${r.id}`, `Triggered via ${r.event} about ${agoWords(r.at)}`, '', 'JOBS', `${icon(r)} build in ${r.secs}s (ID ${r.id + 1})`, ...steps.map((s, i) => `  ${i < failAt ? '✓' : i === failAt ? 'X' : '-'} ${s}`)];
      if (r.status === 'failure') lines.push('', 'ANNOTATIONS', 'X Process completed with exit code 1.', '  build: .github#1', '', 'Tip: a test failed. Run  npm test  to see which one, fix it, commit and push again.');
      else lines.push('', `✓ Run ${r.workflow} (${r.id}) completed with 'success'`);
      return { out: lines.join('\n') + '\n', err: '', code: r.status === 'failure' && b === 'watch' ? 1 : 0 };
    }
    if (a === 'workflow' && b === 'list') return ok(table([['NAME', 'STATE', 'ID'], ['CI', 'active', '98213345'], ['Deploy', 'active', '98213346']], 2));
    if (a === 'workflow' && b === 'run') {
      const file = rest[0] || 'ci.yml';
      const repo = this.repoAt();
      const run = this.addRun('workflow_dispatch', repo ? repo.head : 'main', 'Manual run');
      return ok(`✓ Created workflow_dispatch event for ${file} at ${run.branch}\n\nTo see runs for this workflow, try: gh run list --workflow=${file}`);
    }
    if (a === 'pr' && b === 'create') {
      const repo = this.repoAt();
      if (!repo) return fail('could not determine base repo: not a git repository');
      if (repo.head === 'main') return fail("must be on a branch other than main to create a pull request.\nTip: git checkout -b feature/my-change");
      if (!repo.remoteBranches[repo.head]) return fail(`aborted: you must first push the current branch to a remote, or use the --head flag\nTip: git push -u origin ${repo.head}`);
      return ok(`\nCreating pull request for ${repo.head} into main in tejus/shipyard\n\nhttps://github.com/tejus/shipyard/pull/${17 + this.gh.runs.length}`);
    }
    if (a === 'pr' && b === 'list') return ok('Showing 1 of 1 open pull request in tejus/shipyard\n\n#16  Add health check endpoint  feature/health  about 2 days ago');
    if (a === 'repo' && b === 'view') return ok('tejus/shipyard\nA DevOps learning site\n\n  Stars: 12  Forks: 3  Watchers: 2');
    return fail(`unknown command "${args.join(' ')}" for "gh"\nTry: gh run list, gh run view, gh workflow run ci.yml, gh pr create`);
  }

  /* ═════════════ docker ═════════════ */
  findImage(ref) {
    const [repo, tag = 'latest'] = ref.includes(':') && !ref.endsWith(':') ? [ref.slice(0, ref.lastIndexOf(':')), ref.slice(ref.lastIndexOf(':') + 1)] : [ref, 'latest'];
    return this.docker.images.find((i) => (i.repo === repo && i.tag === tag) || i.id.startsWith(ref));
  }
  pullImage(ref) {
    const [repo, tag = 'latest'] = ref.split(':');
    const known = ['nginx', 'node', 'redis', 'postgres', 'httpd', 'alpine', 'ubuntu', 'hello-world', 'python', 'mysql', 'busybox', 'grafana/grafana', 'prom/prometheus'];
    if (!known.includes(repo) && !repo.includes('/')) return null;
    const img = { repo, tag, id: hex(12), size: { alpine: '7.8MB', 'hello-world': '13.3kB', busybox: '4.3MB', redis: '117MB', postgres: '432MB', ubuntu: '78.1MB', python: '1.02GB' }[repo] || '187MB', created: Date.now() - 9 * 864e5 };
    this.docker.images.push(img);
    return img;
  }
  dockerCmd(args) {
    const d = this.docker;
    let [sub, ...rest] = args;
    if (sub === 'container' || sub === 'image') { const map = { ls: sub === 'container' ? 'ps' : 'images', rm: sub === 'container' ? 'rm' : 'rmi', prune: 'prune' }; sub = map[rest[0]] || rest[0]; rest = rest.slice(1); }
    if (!sub) return ok('Usage:  docker [OPTIONS] COMMAND\n\nCommon Commands:\n  run   build   ps   images   pull   push   stop   start   rm   rmi   logs   exec   tag');
    if (sub === '--version' || sub === '-v') return ok('Docker version 27.3.1, build ce12230');
    if (sub === 'version') return ok('Client: Docker Engine - Community\n Version:           27.3.1\n API version:       1.47\n\nServer: Docker Engine - Community\n Engine:\n  Version:          27.3.1');
    if (this.services.docker !== 'active') return fail('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\nTip: sudo systemctl start docker');
    const sizeOf = (c) => (c.image.startsWith('alpine') ? '0B' : '1.09kB');
    const find = (ref) => d.containers.find((c) => c.name === ref || c.id.startsWith(ref));
    switch (sub) {
      case 'info': return ok(`Containers: ${d.containers.length}\n Running: ${d.containers.filter((c) => c.status === 'running').length}\n Stopped: ${d.containers.filter((c) => c.status !== 'running').length}\nImages: ${d.images.length}\nServer Version: 27.3.1\nStorage Driver: overlay2\nOperating System: Ubuntu 24.04.1 LTS`);
      case 'images': return ok(table([['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE'], ...d.images.map((i) => [i.repo, i.tag, i.id.slice(0, 12), agoWords(i.created), i.size])], 3));
      case 'pull': {
        const ref = rest[0];
        if (!ref) return fail('"docker pull" requires exactly 1 argument.');
        const tag = ref.includes(':') ? '' : ':latest';
        if (this.findImage(ref)) return ok(`${ref.split(':')[1] || 'latest'}: Pulling from library/${ref.split(':')[0]}\nDigest: sha256:${hex(64)}\nStatus: Image is up to date for ${ref}${tag}`);
        const img = this.pullImage(ref);
        if (!img) return fail(`Error response from daemon: pull access denied for ${ref.split(':')[0]}, repository does not exist or may require 'docker login'`);
        return ok(`${tag ? 'Using default tag: latest\n' : ''}${img.tag}: Pulling from library/${img.repo}\n${hex(12)}: Pull complete\n${hex(12)}: Pull complete\nDigest: sha256:${hex(64)}\nStatus: Downloaded newer image for ${img.repo}:${img.tag}\ndocker.io/library/${img.repo}:${img.tag}`);
      }
      case 'build': {
        const o = opts(rest, ['-t', '--tag', '-f', '--file']);
        const ctx = o.rest[0];
        if (!ctx) return fail('ERROR: "docker buildx build" requires exactly 1 argument.\nTip: don\'t forget the dot at the end:  docker build -t myapp:1.0 .');
        const dfPath = o.vals.f || o.vals.file || `${ctx}/Dockerfile`;
        const df = this.node(dfPath);
        if (!df) return fail(`ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory\nTip: run docker build in the folder that has the Dockerfile`);
        const steps = df.content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
        const from = steps.find((s) => /^FROM\s/i.test(s));
        if (!from) return fail('ERROR: failed to solve: dockerfile parse error: no FROM instruction found');
        const base = from.split(/\s+/)[1];
        const lines = ['[+] Building 9.7s (' + (steps.length + 2) + '/' + (steps.length + 2) + ') FINISHED', ' => [internal] load build definition from Dockerfile', ' => [internal] load metadata for docker.io/library/' + base, ' => [internal] load .dockerignore'];
        if (!this.findImage(base)) { if (!this.pullImage(base)) return fail(`ERROR: failed to solve: ${base}: pull access denied, repository does not exist`); }
        let i = 0; let html = null; let cmdLine = null; let expose = null;
        for (const s of steps) {
          const [instr, ...argv] = s.split(/\s+/);
          const I = instr.toUpperCase();
          if (I === 'FROM') { lines.push(` => [1/${steps.filter((x) => /^(FROM|RUN|COPY|ADD|WORKDIR)/i.test(x)).length}] ${s}`); i = 1; continue; }
          if (I === 'COPY' || I === 'ADD') {
            const srcs = argv.slice(0, -1).filter((x) => !x.startsWith('--'));
            for (const src of srcs) if (!this.node(`${ctx}/${src}`) && !src.includes('*')) return fail(`${lines.join('\n')}\n => ERROR [${i + 1}] ${s}\nERROR: failed to solve: failed to compute cache key: "/${src}": not found`);
            const idx = srcs.find((x) => /index\.html$/.test(x)) || (srcs.includes('.') ? 'index.html' : null);
            if (idx && this.node(`${ctx}/${idx}`)) html = this.node(`${ctx}/${idx}`).content;
          }
          if (I === 'CMD' || I === 'ENTRYPOINT') cmdLine = argv.join(' ');
          if (I === 'EXPOSE') expose = argv[0];
          if (['RUN', 'COPY', 'ADD', 'WORKDIR'].includes(I)) { i++; lines.push(` => [${i}/${steps.filter((x) => /^(FROM|RUN|COPY|ADD|WORKDIR)/i.test(x)).length}] ${s}`); }
          if (I === 'RUN' && /npm (ci|install)/.test(s)) lines.push(' => => # added 312 packages in 6s');
        }
        const tag = o.vals.t || o.vals.tag;
        const [repo, t = 'latest'] = tag ? tag.split(':') : ['<none>', '<none>'];
        d.images = d.images.filter((x) => !(x.repo === repo && x.tag === t));
        const img = { repo, tag: t, id: hex(12), size: base.startsWith('nginx') ? '48.4MB' : base.startsWith('node') ? '142MB' : '95MB', created: Date.now(), html, base, cmd: cmdLine, expose };
        d.images.unshift(img);
        lines.push(' => exporting to image', ' => => exporting layers', ` => => writing image sha256:${img.id}${hex(52)}`, tag ? ` => => naming to docker.io/library/${repo}:${t}` : '');
        return ok(lines.filter(Boolean).join('\n'));
      }
      case 'run': {
        const o = opts(rest, ['-p', '--publish', '--name', '-e', '--env', '-v', '--volume', '-w']);
        const ref = o.rest[0];
        if (!ref) return fail('"docker run" requires at least 1 argument.\nUsage:  docker run [OPTIONS] IMAGE [COMMAND] [ARG...]\nExample: docker run -d -p 8080:80 --name web nginx');
        const cmdArgs = o.rest.slice(1);
        let img = this.findImage(ref);
        let pulled = '';
        if (!img) {
          img = this.pullImage(ref);
          if (!img) return fail(`Unable to find image '${ref}${ref.includes(':') ? '' : ':latest'}' locally\ndocker: Error response from daemon: pull access denied for ${ref.split(':')[0]}, repository does not exist or may require 'docker login'.${ref === 'shipyard' || ref.startsWith('shipyard:') ? '\nTip: build it first:  docker build -t shipyard:1.0 .' : ''}`, 125);
          pulled = `Unable to find image '${ref}${ref.includes(':') ? '' : ':latest'}' locally\n${img.tag}: Pulling from library/${img.repo}\n${hex(12)}: Pull complete\nStatus: Downloaded newer image for ${img.repo}:${img.tag}\n`;
        }
        const name = o.vals.name || `${['eager', 'brave', 'clever', 'jolly', 'quirky', 'zen'][hash(String(Date.now())) % 6]}_${['turing', 'hopper', 'lovelace', 'torvalds', 'ritchie'][d.containers.length % 5]}`;
        if (d.containers.some((c) => c.name === name)) return fail(`docker: Error response from daemon: Conflict. The container name "/${name}" is already in use. You have to remove (or rename) that container to be able to reuse that name.\nTip: docker rm -f ${name}`, 125);
        const ports = (o.all.p || o.all.publish || []).map((p) => { const parts = String(p).split(':'); return { host: +parts[parts.length - 2] || +parts[0], cont: +parts[parts.length - 1] }; });
        for (const p of ports) {
          const used = d.containers.some((c) => c.status === 'running' && c.ports.some((x) => x.host === p.host)) || (p.host === 80 && this.services.nginx === 'active');
          if (used) return fail(`docker: Error response from daemon: driver failed programming external connectivity: Bind for 0.0.0.0:${p.host} failed: port is already allocated.${p.host === 80 ? '\nTip: nginx on this machine already uses port 80. Try -p 8080:80' : ''}`, 125);
        }
        const isServer = /nginx|httpd|node|redis|postgres|mysql|grafana|prometheus/.test(img.repo) || img.html || img.base;
        const id = hex(64);
        const base = img.base || img.repo;
        const c = {
          id, name, image: `${img.repo}:${img.tag}`, ports, status: 'running', created: Date.now(),
          cmd: img.cmd || (base.startsWith('nginx') ? '"/docker-entrypoint.…"' : base.startsWith('node') ? '"docker-entrypoint.s…"' : '"/bin/sh"'),
          logs: base.startsWith('nginx') || img.html ? ['/docker-entrypoint.sh: Configuration complete; ready for start up', `${new Date().toISOString()} [notice] 1#1: nginx/1.27.2`, `${new Date().toISOString()} [notice] 1#1: start worker processes`] : base.startsWith('node') ? ['Server listening on port 3000'] : base.startsWith('redis') ? ['Ready to accept connections tcp'] : [],
          env: o.all.e || [],
        };
        c.serve = (path, method) => {
          c.logs.push(`172.17.0.1 - - [${new Date().toUTCString()}] "${method} ${path} HTTP/1.1" ${path === '/' || path === '/index.html' ? 200 : 404} 615 "-" "curl/8.5.0"`);
          if (path !== '/' && path !== '/index.html') return { status: 404, type: 'text/html', body: '<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center><hr><center>nginx/1.27.2</center></body></html>' };
          return { status: 200, type: 'text/html', body: img.html ? img.html.replace(/\n$/, '') : base.startsWith('node') ? 'Hello from Node.js!' : '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is successfully installed and working.</p>\n</body>\n</html>' };
        };
        // One-off commands (docker run alpine echo hi / hello-world)
        if (img.repo === 'hello-world') { c.status = 'exited'; c.exit = 0; d.containers.push(c); return ok(`${pulled}\nHello from Docker!\nThis message shows that your installation appears to be working correctly.\n\nTo generate this message, Docker took the following steps:\n 1. The Docker client contacted the Docker daemon.\n 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.\n 3. The Docker daemon created a new container from that image.\n 4. The Docker daemon streamed that output to the Docker client.`); }
        if (cmdArgs.length || !isServer) {
          c.status = 'exited'; c.exit = 0; c.cmd = `"${(cmdArgs.join(' ') || 'sh').slice(0, 18)}"`;
          if (!o.flags.has('rm')) d.containers.push(c);
          if (!cmdArgs.length) return ok(`${pulled}(The container started a shell and exited because there was nothing to do.\nTry:  docker run alpine echo "hello from a container")`);
          const inner = cmdArgs[0] === 'sh' && cmdArgs[1] === '-c' ? cmdArgs.slice(2).join(' ') : cmdArgs.join(' ');
          if (/^(cat \/etc\/os-release)/.test(inner)) return ok(pulled + (img.repo === 'ubuntu' ? 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"' : 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.3\nPRETTY_NAME="Alpine Linux v3.20"'));
          if (/^uname/.test(inner)) return ok(pulled + 'Linux');
          if (/^hostname/.test(inner)) return ok(pulled + id.slice(0, 12));
          if (/^echo /.test(inner)) return ok(pulled + inner.slice(5).replace(/^["']|["']$/g, ''));
          if (/^ls/.test(inner)) return ok(pulled + 'bin    dev    etc    home   lib    media  mnt    opt    proc   root   run    sbin   srv    sys    tmp    usr    var');
          return ok(`${pulled}(ran "${inner}" inside the container)`);
        }
        d.containers.push(c);
        if (o.flags.has('d') || o.flags.has('detach')) return ok(pulled + id);
        return ok(`${pulled}${c.logs.join('\n')}\n\n(The container is running in the foreground. In a real terminal you'd press Ctrl+C to stop it.\nHere it keeps running in the background. Next time use -d to run detached.)`);
      }
      case 'ps': {
        const all = rest.includes('-a') || rest.includes('--all');
        const quiet = rest.includes('-q');
        const list = d.containers.filter((c) => all || c.status === 'running');
        if (quiet) return ok(list.map((c) => c.id.slice(0, 12)).join('\n'));
        return ok(table([['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'], ...list.map((c) => [c.id.slice(0, 12), c.image, c.cmd, agoWords(c.created), c.status === 'running' ? `Up ${agoWords(c.started || c.created).replace(' ago', '')}` : `Exited (${c.exit ?? 0}) ${agoWords(c.stopped || c.created)}`, c.status === 'running' ? c.ports.map((p) => `0.0.0.0:${p.host}->${p.cont}/tcp`).join(', ') : '', c.name])], 3));
      }
      case 'stop':
      case 'kill':
      case 'start':
      case 'restart': {
        if (!rest.length) return fail(`"docker ${sub}" requires at least 1 argument.`);
        const out = []; let err = '';
        rest.filter((r) => !r.startsWith('-')).forEach((ref) => {
          const c = find(ref);
          if (!c) { err += `Error response from daemon: No such container: ${ref}\n`; return; }
          if (sub === 'start' || sub === 'restart') {
            const clash = c.ports.find((p) => d.containers.some((x) => x !== c && x.status === 'running' && x.ports.some((y) => y.host === p.host)));
            if (clash) { err += `Error response from daemon: Bind for 0.0.0.0:${clash.host} failed: port is already allocated\n`; return; }
            c.status = 'running'; c.started = Date.now();
          } else { c.status = 'exited'; c.exit = sub === 'kill' ? 137 : 0; c.stopped = Date.now(); }
          out.push(ref);
        });
        return { out: nl(out.join('\n')), err, code: err ? 1 : 0 };
      }
      case 'rm': {
        const force = rest.includes('-f') || rest.includes('--force');
        const out = []; let err = '';
        rest.filter((r) => !r.startsWith('-')).forEach((ref) => {
          const c = find(ref);
          if (!c) { err += `Error response from daemon: No such container: ${ref}\n`; return; }
          if (c.status === 'running' && !force) { err += `Error response from daemon: cannot remove container "/${c.name}": container is running: stop the container before removing or force remove\n`; return; }
          d.containers = d.containers.filter((x) => x !== c);
          out.push(ref);
        });
        return { out: nl(out.join('\n')), err, code: err ? 1 : 0 };
      }
      case 'rmi': {
        const out = []; let err = '';
        rest.filter((r) => !r.startsWith('-')).forEach((ref) => {
          const img = this.findImage(ref);
          if (!img) { err += `Error response from daemon: No such image: ${ref}\n`; return; }
          const user = d.containers.find((c) => c.image === `${img.repo}:${img.tag}`);
          if (user && !rest.includes('-f')) { err += `Error response from daemon: conflict: unable to remove repository reference "${ref}" (must force) - container ${user.id.slice(0, 12)} is using its referenced image ${img.id.slice(0, 12)}\n`; return; }
          d.images = d.images.filter((x) => x !== img);
          out.push(`Untagged: ${img.repo}:${img.tag}`, `Deleted: sha256:${img.id}${hex(52)}`);
        });
        return { out: nl(out.join('\n')), err, code: err ? 1 : 0 };
      }
      case 'logs': {
        const o = opts(rest, ['--tail', '-n']);
        const c = find(o.rest[0] || '');
        if (!c) return fail(`Error response from daemon: No such container: ${o.rest[0] || ''}`);
        const n = +(o.vals.tail || o.vals.n || 1000);
        return ok(c.logs.slice(-n).join('\n') + (o.flags.has('f') ? '\n… (logs -f keeps streaming; press Ctrl+C in a real terminal)' : ''));
      }
      case 'exec': {
        const o = opts(rest);
        const [ref, ...cmd] = o.rest;
        const c = find(ref || '');
        if (!c) return fail(`Error response from daemon: No such container: ${ref || ''}`);
        if (c.status !== 'running') return fail(`Error response from daemon: container ${c.id.slice(0, 12)} is not running`);
        const line = cmd.join(' ');
        if (!line || /^(sh|bash|\/bin\/sh|\/bin\/bash)$/.test(line)) return ok(`(An interactive shell inside "${c.name}" would open here. In this practice terminal, run single commands instead, e.g.\n  docker exec ${c.name} ls /usr/share/nginx/html)`);
        if (/^ls/.test(line)) return ok(/html/.test(line) ? '50x.html\nindex.html' : 'bin\ndev\netc\nhome\nlib\nproc\nroot\nrun\nsbin\ntmp\nusr\nvar');
        if (/^cat .*index\.html/.test(line)) return ok(c.serve('/', 'GET').body);
        if (/^cat \/etc\/os-release/.test(line)) return ok('NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.3');
        if (/^(env|printenv)/.test(line)) return ok(`PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOSTNAME=${c.id.slice(0, 12)}\n${c.env.join('\n')}\nNGINX_VERSION=1.27.2`);
        if (/^hostname/.test(line)) return ok(c.id.slice(0, 12));
        if (/^echo /.test(line)) return ok(line.slice(5));
        if (/^(nginx -v)/.test(line)) return { out: '', err: 'nginx version: nginx/1.27.2\n', code: 0 };
        return ok(`(ran "${line}" inside ${c.name})`);
      }
      case 'tag': {
        const [src, dst] = rest;
        const img = src && this.findImage(src);
        if (!img) return fail(`Error response from daemon: No such image: ${src || ''}`);
        if (!dst) return fail('"docker tag" requires exactly 2 arguments.');
        const [repo, tag = 'latest'] = dst.split(/:(?=[^:/]+$)/);
        d.images.unshift({ ...img, repo, tag });
        return ok();
      }
      case 'push': {
        const ref = rest[0];
        const img = ref && this.findImage(ref);
        if (!img) return fail(`An image does not exist locally with the tag: ${ref || ''}`);
        if (!img.repo.includes('/')) return fail(`The push refers to repository [docker.io/library/${img.repo}]\ndenied: requested access to the resource is denied\nTip: tag it with your registry name first, e.g.\n  docker tag ${img.repo}:${img.tag} ghcr.io/tejus/${img.repo}:${img.tag}\n  docker push ghcr.io/tejus/${img.repo}:${img.tag}`);
        return ok(`The push refers to repository [${img.repo.includes('.') ? img.repo : 'docker.io/' + img.repo}]\n${hex(12)}: Pushed\n${hex(12)}: Pushed\n${hex(12)}: Mounted from library/nginx\n${img.tag}: digest: sha256:${hex(64)} size: 1784`);
      }
      case 'login': return ok('Login Succeeded');
      case 'inspect': {
        const c = find(rest[0] || '');
        if (!c) return fail(`Error: No such object: ${rest[0] || ''}`);
        return ok(JSON.stringify([{ Id: c.id, Name: '/' + c.name, State: { Status: c.status, Running: c.status === 'running' }, Config: { Image: c.image }, NetworkSettings: { IPAddress: '172.17.0.' + (2 + d.containers.indexOf(c)), Ports: Object.fromEntries(c.ports.map((p) => [`${p.cont}/tcp`, [{ HostIp: '0.0.0.0', HostPort: String(p.host) }]])) } }], null, 2));
      }
      case 'stats': return ok(table([['CONTAINER ID', 'NAME', 'CPU %', 'MEM USAGE / LIMIT', 'NET I/O'], ...d.containers.filter((c) => c.status === 'running').map((c) => [c.id.slice(0, 12), c.name, `${(hash(c.id) % 30) / 100}%`, `${(hash(c.name) % 20) + 4}MiB / 3.84GiB`, '1.2kB / 0B'])], 3) + '\n(stats normally refreshes live; this is one snapshot)');
      case 'prune':
      case 'system': {
        const before = d.containers.length;
        d.containers = d.containers.filter((c) => c.status === 'running');
        return ok(`Deleted Containers:\n${before - d.containers.length} stopped container(s)\n\nTotal reclaimed space: ${(before - d.containers.length) * 1.1}kB`);
      }
      case 'network': return ok(table([['NETWORK ID', 'NAME', 'DRIVER', 'SCOPE'], ['3c1f2a9b8d7e', 'bridge', 'bridge', 'local'], ['9a8b7c6d5e4f', 'host', 'host', 'local'], ['1f2e3d4c5b6a', 'none', 'null', 'local']], 3));
      case 'volume': return ok(table([['DRIVER', 'VOLUME NAME'], ['local', 'shipyard_data']], 3));
      case 'compose': return fail('docker compose isn\'t included in this practice terminal yet. Use docker run for each container, e.g.\n  docker run -d -p 8080:80 --name web nginx');
      default: return fail(`docker: '${sub}' is not a docker command.\nSee 'docker --help'`);
    }
  }

  /* ═════════════ AWS ═════════════ */
  awsInit() {
    if (this.aws) return this.aws;
    this.aws = {
      region: 'ap-south-1',
      buckets: {
        'shipyard-assets': { created: new Date(Date.now() - 50 * 864e5), objects: { 'logo.svg': 2048, 'index.html': 1532, 'css/site.css': 9120 } },
        'shipyard-backups': { created: new Date(Date.now() - 23 * 864e5), objects: { 'db-2026-11-23.sql.gz': 1844211 } },
      },
      instances: [
        { id: 'i-0a1b2c3d4e5f60718', name: 'web-01', type: 't3.micro', state: 'running', ip: '13.233.41.77', az: 'ap-south-1a' },
        { id: 'i-0f9e8d7c6b5a40312', name: 'worker-01', type: 't3.small', state: 'stopped', ip: '', az: 'ap-south-1b' },
      ],
    };
    return this.aws;
  }
  awsCmd(args) {
    const a = this.awsInit();
    const o = opts(args, ['--instance-ids', '--image-id', '--instance-type', '--count', '--region', '--query', '--output', '--tag-specifications', '--profile']);
    const [svc, op, ...pos] = o.rest;
    if (!svc || svc === 'help') return ok('usage: aws <command> <subcommand> [parameters]\n\nTry: aws s3 ls · aws s3 mb s3://my-bucket · aws ec2 describe-instances · aws sts get-caller-identity');
    if (o.flags.has('version') || svc === '--version') return ok('aws-cli/2.18.4 Python/3.12.6 Linux/6.8.0 exe/x86_64.ubuntu.24');
    const ec2Inst = (i) => ({ InstanceId: i.id, InstanceType: i.type, State: { Name: i.state }, PublicIpAddress: i.ip || undefined, Placement: { AvailabilityZone: i.az }, Tags: [{ Key: 'Name', Value: i.name }] });
    if (svc === 'sts' && op === 'get-caller-identity') return ok(JSON.stringify({ UserId: 'AIDA4EXAMPLEUSERID', Account: '123456789012', Arn: 'arn:aws:iam::123456789012:user/tejus' }, null, 4));
    if (svc === 'configure') {
      if (op === 'list') return ok(`      Name                    Value             Type    Location\n      ----                    -----             ----    --------\n   profile                <not set>             None    None\naccess_key     ****************7XQA shared-credentials-file\nsecret_key     ****************p2Lk shared-credentials-file\n    region               ${a.region}      config-file    ~/.aws/config`);
      if (op === 'set' && pos[0] === 'region') { a.region = pos[1]; return ok(); }
      return fail("aws configure asks for keys interactively, which isn't possible here. Try: aws configure list");
    }
    if (svc === 'iam' && op === 'list-users') return ok(JSON.stringify({ Users: [{ UserName: 'tejus', UserId: 'AIDA4EXAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/tejus' }, { UserName: 'ci-deployer', UserId: 'AIDA4EXAMPLECIUSER', Arn: 'arn:aws:iam::123456789012:user/ci-deployer' }] }, null, 4));
    if (svc === 's3') {
      const parse = (u) => { const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(u || ''); return m ? { bucket: m[1], key: m[2] } : null; };
      if (op === 'ls') {
        const t = parse(pos[0]);
        if (!t) return ok(Object.entries(a.buckets).map(([n, b]) => `${b.created.toISOString().slice(0, 19).replace('T', ' ')} ${n}`).join('\n'));
        const b = a.buckets[t.bucket];
        if (!b) return fail('An error occurred (NoSuchBucket) when calling the ListObjectsV2 operation: The specified bucket does not exist', 254);
        const keys = Object.entries(b.objects).filter(([k]) => k.startsWith(t.key));
        const dirs = new Set(); const files = [];
        keys.forEach(([k, s]) => { const restKey = k.slice(t.key.length); if (restKey.includes('/') && !o.flags.has('recursive')) dirs.add(restKey.split('/')[0]); else files.push([restKey, s]); });
        return ok([...[...dirs].map((x) => `                           PRE ${x}/`), ...files.map(([k, s]) => `${new Date(Date.now() - 864e5).toISOString().slice(0, 19).replace('T', ' ')} ${String(s).padStart(10)} ${k}`)].join('\n'));
      }
      if (op === 'mb') {
        const t = parse(pos[0]);
        if (!t) return fail('usage: aws s3 mb s3://bucket-name');
        if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(t.bucket)) return fail(`make_bucket failed: s3://${t.bucket} An error occurred (InvalidBucketName): Bucket names must be 3-63 characters: lowercase letters, numbers, dots and hyphens`);
        if (a.buckets[t.bucket]) return fail(`make_bucket failed: s3://${t.bucket} An error occurred (BucketAlreadyOwnedByYou)`);
        a.buckets[t.bucket] = { created: new Date(), objects: {} };
        return ok(`make_bucket: ${t.bucket}`);
      }
      if (op === 'rb') {
        const t = parse(pos[0]);
        if (!t || !a.buckets[t.bucket]) return fail('remove_bucket failed: NoSuchBucket');
        if (Object.keys(a.buckets[t.bucket].objects).length && !o.flags.has('force')) return fail(`remove_bucket failed: s3://${t.bucket} An error occurred (BucketNotEmpty): The bucket you tried to delete is not empty\nTip: add --force to delete everything in it`);
        delete a.buckets[t.bucket];
        return ok(`remove_bucket: ${t.bucket}`);
      }
      if (op === 'cp' || op === 'mv' || op === 'sync') {
        const [src, dst] = pos;
        const td = parse(dst); const ts = parse(src);
        if (td) {
          const b = a.buckets[td.bucket];
          if (!b) return fail(`upload failed: ${src} to ${dst} An error occurred (NoSuchBucket)`);
          const n = this.node(src || '');
          if (!n) return fail(`The user-provided path ${src} does not exist.`, 255);
          const files = n.type === 'dir' ? this.walk(src).map(([rel, f]) => [`${src.replace(/\/$/, '')}/${rel}`, rel, f]) : [[src, src.split('/').pop(), n]];
          if (n.type === 'dir' && op === 'cp' && !o.flags.has('recursive')) return fail(`upload failed: ${src} is a directory. Use --recursive`);
          const out = files.map(([local, rel, f]) => { const key = td.key && !td.key.endsWith('/') && n.type !== 'dir' ? td.key : `${td.key}${rel}`; b.objects[key] = f.content.length; return `upload: ${local} to s3://${td.bucket}/${key}`; });
          if (op === 'mv') C_rm(this, src);
          return ok(out.join('\n'));
        }
        if (ts) {
          const b = a.buckets[ts.bucket];
          if (!b || !(ts.key in b.objects)) return fail(`fatal error: An error occurred (404) when calling the HeadObject operation: Key "${ts.key}" does not exist`);
          const local = dst === '.' || dst.endsWith('/') ? `${dst === '.' ? '' : dst}${ts.key.split('/').pop()}` : dst;
          this.write(local, `(downloaded from s3://${ts.bucket}/${ts.key})\n`);
          return ok(`download: s3://${ts.bucket}/${ts.key} to ${local}`);
        }
        return fail('usage: aws s3 cp <LocalPath> s3://bucket/key  or  aws s3 cp s3://bucket/key <LocalPath>');
      }
      if (op === 'rm') {
        const t = parse(pos[0]);
        const b = t && a.buckets[t.bucket];
        if (!b) return fail('delete failed: NoSuchBucket');
        const keys = Object.keys(b.objects).filter((k) => (o.flags.has('recursive') ? k.startsWith(t.key) : k === t.key));
        keys.forEach((k) => delete b.objects[k]);
        return ok(keys.map((k) => `delete: s3://${t.bucket}/${k}`).join('\n'));
      }
      return fail(`aws s3: unknown command "${op || ''}". Try: ls, mb, rb, cp, mv, rm, sync`);
    }
    if (svc === 'ec2') {
      const ids = (o.vals['instance-ids'] || '').split(/[ ,]+/).concat(pos).filter((x) => /^i-/.test(x));
      const pick = () => { const found = ids.map((id) => a.instances.find((i) => i.id === id)); const missing = ids.find((id, k) => !found[k]); return { found, missing }; };
      if (op === 'describe-instances') {
        if (o.vals.query && /PublicIpAddress/.test(o.vals.query)) return ok(JSON.stringify(a.instances.filter((i) => i.state !== 'terminated').map((i) => i.ip || null), null, 4));
        if (o.vals.output === 'table' || o.vals.query) return ok(table([['ID', 'NAME', 'TYPE', 'STATE', 'PUBLIC IP'], ...a.instances.map((i) => [i.id, i.name, i.type, i.state, i.ip || '-'])], 3));
        return ok(JSON.stringify({ Reservations: a.instances.map((i) => ({ Instances: [ec2Inst(i)] })) }, null, 4));
      }
      if (op === 'run-instances') {
        const n = +(o.vals.count || 1);
        if (!o.vals['image-id']) return fail('aws: error: the following arguments are required: --image-id\nExample: aws ec2 run-instances --image-id ami-0abcdef1234567890 --instance-type t3.micro --count 1');
        const made = Array.from({ length: Math.min(n, 5) }, (_, k) => { const i = { id: 'i-0' + hex(16), name: `instance-${a.instances.length + k + 1}`, type: o.vals['instance-type'] || 't3.micro', state: 'pending', ip: '', az: `${a.region}a` }; a.instances.push(i); setTimeout(() => { if (i.state === 'pending') { i.state = 'running'; i.ip = fakeIp(i.id); } }, 4000); return i; });
        return ok(JSON.stringify({ Instances: made.map(ec2Inst) }, null, 4) + '\n(It will be "running" in a few seconds. Check with: aws ec2 describe-instances --output table)');
      }
      if (['start-instances', 'stop-instances', 'terminate-instances', 'reboot-instances'].includes(op)) {
        if (!ids.length) return fail(`aws: error: the following arguments are required: --instance-ids\nExample: aws ec2 ${op} --instance-ids ${a.instances[1].id}`);
        const { found, missing } = pick();
        if (missing) return fail(`An error occurred (InvalidInstanceID.NotFound) when calling the ${op.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())} operation: The instance ID '${missing}' does not exist`, 254);
        const next = { 'start-instances': 'running', 'stop-instances': 'stopped', 'terminate-instances': 'terminated', 'reboot-instances': 'running' }[op];
        const out = found.map((i) => { const prev = i.state; if (i.state !== 'terminated') { i.state = next; i.ip = next === 'running' ? i.ip || fakeIp(i.id) : ''; } return { InstanceId: i.id, CurrentState: { Name: op === 'start-instances' ? 'pending' : op === 'stop-instances' ? 'stopping' : op === 'terminate-instances' ? 'shutting-down' : 'running' }, PreviousState: { Name: prev } }; });
        if (op === 'reboot-instances') return ok();
        return ok(JSON.stringify({ [op === 'start-instances' ? 'StartingInstances' : op === 'stop-instances' ? 'StoppingInstances' : 'TerminatingInstances']: out }, null, 4));
      }
      if (op === 'describe-regions') return ok(table([['RegionName', 'Endpoint'], ...['ap-south-1', 'eu-central-1', 'us-east-1', 'us-west-2'].map((r) => [r, `ec2.${r}.amazonaws.com`])], 3));
      if (op === 'describe-security-groups') return ok(JSON.stringify({ SecurityGroups: [{ GroupName: 'web-sg', GroupId: 'sg-0123456789abcdef0', IpPermissions: [{ FromPort: 80, ToPort: 80, IpProtocol: 'tcp' }, { FromPort: 443, ToPort: 443, IpProtocol: 'tcp' }, { FromPort: 22, ToPort: 22, IpProtocol: 'tcp' }] }] }, null, 4));
      return fail(`aws ec2: "${op || ''}" isn't available here. Try: describe-instances, run-instances, start-instances, stop-instances, terminate-instances, describe-regions`);
    }
    return fail(`aws: "${svc}" isn't available in this practice terminal. Try: aws s3, aws ec2, aws sts, aws iam, aws configure`);
  }

  /* ═════════════ Kubernetes ═════════════ */
  k8sInit(replicas = 2, extra = false) {
    if (this.k8s) return this.k8s;
    const k = {
      nodes: [{ name: 'node-1', role: 'control-plane', age: Date.now() - 12 * 864e5 }, { name: 'node-2', role: '<none>', age: Date.now() - 12 * 864e5 }],
      deployments: {},
      pods: [],
      services: { kubernetes: { ns: 'default', type: 'ClusterIP', ip: '10.96.0.1', ports: '443/TCP', selector: null, created: Date.now() - 12 * 864e5 } },
      forwards: {},
    };
    this.k8s = k;
    this.k8sDeploy('shipyard', 'shipyard:1.0', replicas, 'default', Date.now() - 3 * 3600e3);
    this.k8s.services.shipyard = { ns: 'default', type: 'NodePort', ip: '10.96.142.18', ports: '80:30080/TCP', selector: 'shipyard', created: Date.now() - 3 * 3600e3 };
    if (extra) {
      this.k8sDeploy('prometheus', 'prom/prometheus:v2.54.1', 1, 'monitoring', Date.now() - 5 * 864e5);
      this.k8sDeploy('grafana', 'grafana/grafana:11.3.0', 1, 'monitoring', Date.now() - 5 * 864e5);
    }
    return k;
  }
  k8sDeploy(name, image, replicas, ns = 'default', created = Date.now()) {
    const k = this.k8s;
    k.deployments[name] = { name, ns, image, replicas, revisions: [image], created };
    this.k8sReconcile(created);
  }
  k8sReconcile(created = Date.now()) {
    const k = this.k8s;
    k.pods = k.pods.filter((p) => !p.deploy || (k.deployments[p.deploy] && k.deployments[p.deploy].image === p.image));
    Object.values(k.deployments).forEach((d) => {
      const mine = k.pods.filter((p) => p.deploy === d.name);
      const rs = (hash(d.name + d.image).toString(16) + hash(d.image).toString(16)).slice(0, 10);
      for (let i = mine.length; i < d.replicas; i++) {
        k.pods.push({ name: `${d.name}-${rs}-${alnum(5)}`, deploy: d.name, ns: d.ns, image: d.image, status: d.image.includes(':bad') || d.image.includes('doesnotexist') ? 'ImagePullBackOff' : 'Running', restarts: 0, created, node: `node-${(k.pods.length % 2) + 1}`, ip: `10.244.${(k.pods.length % 2) + 1}.${10 + k.pods.length}` });
      }
      mine.slice(d.replicas).forEach((p) => { k.pods = k.pods.filter((x) => x !== p); });
    });
  }
  parseYaml(text) {
    return text.split(/^---\s*$/m).map((doc) => {
      const get = (re) => { const m = re.exec(doc); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null; };
      return { kind: get(/^kind:\s*(.+)$/m), name: get(/^metadata:\s*\n(?:\s+.*\n)*?\s+name:\s*(.+)$/m) || get(/^\s+name:\s*(.+)$/m), replicas: +(get(/^\s+replicas:\s*(\d+)/m) || 1), image: get(/^\s+image:\s*(.+)$/m), type: get(/^\s+type:\s*(.+)$/m), port: get(/^\s+port:\s*(\d+)/m), nodePort: get(/^\s+nodePort:\s*(\d+)/m) };
    }).filter((d) => d.kind);
  }
  kubectl(args) {
    const k = this.k8sInit();
    const o = opts(args, ['-n', '--namespace', '-o', '--output', '-f', '--filename', '--image', '--replicas', '--port', '--type', '--tail', '--to-revision', '--target-port', '-l', '--selector', '-c']);
    const [verb, ...pos] = o.rest;
    const ns = o.vals.n || o.vals.namespace || 'default';
    const allNs = o.flags.has('A') || o.flags.has('all-namespaces');
    const wide = (o.vals.o || o.vals.output) === 'wide';
    const out = o.vals.o || o.vals.output;
    if (!verb) return ok('kubectl controls the Kubernetes cluster manager.\n\nBasic Commands:\n  get  describe  create  apply  delete  scale  expose  logs  rollout  set  top  port-forward');
    const kind = (s = '') => ({ po: 'pods', pod: 'pods', pods: 'pods', deploy: 'deployments', deployment: 'deployments', deployments: 'deployments', svc: 'services', service: 'services', services: 'services', no: 'nodes', node: 'nodes', nodes: 'nodes', ns: 'namespaces', namespace: 'namespaces', namespaces: 'namespaces', all: 'all', rs: 'replicasets', replicaset: 'replicasets', replicasets: 'replicasets' }[s.toLowerCase()] || s);
    const splitRef = (a, b) => (a && a.includes('/') ? [kind(a.split('/')[0]), a.split('/')[1]] : [kind(a), b]);
    const podRows = (list) => [allNs ? ['NAMESPACE', 'NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', ...(wide ? ['IP', 'NODE'] : [])] : ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', ...(wide ? ['IP', 'NODE'] : [])], ...list.map((p) => [...(allNs ? [p.ns] : []), p.name, p.status === 'Running' ? '1/1' : '0/1', p.status, p.restarts, ago(p.created), ...(wide ? [p.ip, p.node] : [])])];
    const inNs = (x) => allNs || x.ns === ns;
    const deployRows = () => [['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE', ...(wide ? ['IMAGES'] : [])], ...Object.values(k.deployments).filter(inNs).map((d) => { const ready = k.pods.filter((p) => p.deploy === d.name && p.status === 'Running').length; return [d.name, `${ready}/${d.replicas}`, d.replicas, ready, ago(d.created), ...(wide ? [d.image] : [])]; })];
    const svcRows = () => [['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'], ...Object.entries(k.services).filter(([, s]) => inNs(s)).map(([n, s]) => [n, s.type, s.ip, s.type === 'LoadBalancer' ? '34.120.' + (hash(n) % 200) + '.' + (hash(n + 'x') % 200) : '<none>', s.ports, ago(s.created)])];
    const notFound = (t, n) => fail(`Error from server (NotFound): ${t} "${n}" not found`);
    switch (verb) {
      case 'version': return ok('Client Version: v1.31.2\nKustomize Version: v5.4.2\nServer Version: v1.31.0');
      case 'cluster-info': return ok('Kubernetes control plane is running at https://192.168.49.2:8443\nCoreDNS is running at https://192.168.49.2:8443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy');
      case 'config': return ok(pos[0] === 'get-contexts' ? 'CURRENT   NAME       CLUSTER    AUTHINFO   NAMESPACE\n*         minikube   minikube   minikube   default' : 'minikube');
      case 'get': {
        const [t, name] = splitRef(pos[0], pos[1]);
        if (!t) return fail('You must specify the type of resource to get. Try: kubectl get pods');
        if (t === 'pods') {
          let list = k.pods.filter(inNs);
          if (o.vals.l) { const v = o.vals.l.split('=')[1]; list = list.filter((p) => p.deploy === v); }
          if (name) { const p = list.find((x) => x.name === name); if (!p) return notFound('pods', name); list = [p]; }
          if (out === 'name') return ok(list.map((p) => `pod/${p.name}`).join('\n'));
          if (out === 'yaml' && list[0]) return ok(`apiVersion: v1\nkind: Pod\nmetadata:\n  name: ${list[0].name}\n  namespace: ${list[0].ns}\n  labels:\n    app: ${list[0].deploy}\nspec:\n  containers:\n  - name: app\n    image: ${list[0].image}\nstatus:\n  phase: ${list[0].status}\n  podIP: ${list[0].ip}`);
          if (!list.length) return ok(`No resources found in ${ns} namespace.`);
          return ok(table(podRows(list), 3));
        }
        if (t === 'deployments') { if (name && !k.deployments[name]) return notFound('deployments.apps', name); const rows = deployRows(); return rows.length > 1 ? ok(table(name ? [rows[0], ...rows.filter((r) => r[0] === name)] : rows, 3)) : ok(`No resources found in ${ns} namespace.`); }
        if (t === 'services') { if (name && !k.services[name]) return notFound('services', name); const rows = svcRows(); return ok(table(name ? [rows[0], ...rows.filter((r) => r[0] === name)] : rows, 3)); }
        if (t === 'replicasets') return ok(table([['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'], ...Object.values(k.deployments).filter(inNs).map((d) => { const p = k.pods.find((x) => x.deploy === d.name); return [p ? p.name.split('-').slice(0, -1).join('-') : d.name, d.replicas, d.replicas, d.replicas, ago(d.created)]; })], 3));
        if (t === 'nodes') return ok(table([['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION', ...(wide ? ['INTERNAL-IP', 'OS-IMAGE'] : [])], ...k.nodes.map((n, i) => [n.name, 'Ready', n.role, ago(n.age), 'v1.31.0', ...(wide ? [`192.168.49.${i + 2}`, 'Ubuntu 22.04.4 LTS'] : [])])], 3));
        if (t === 'namespaces') return ok(table([['NAME', 'STATUS', 'AGE'], ['default', 'Active', '12d'], ['kube-system', 'Active', '12d'], ...(Object.values(k.deployments).some((d) => d.ns === 'monitoring') ? [['monitoring', 'Active', '5d']] : [])], 3));
        if (t === 'all') {
          const pods = k.pods.filter(inNs);
          return ok([table(podRows(pods).map((r, i) => (i ? [`pod/${r[0]}`, ...r.slice(1)] : r)), 3), '', table(svcRows().map((r, i) => (i ? [`service/${r[0]}`, ...r.slice(1)] : r)), 3), '', table(deployRows().map((r, i) => (i ? [`deployment.apps/${r[0]}`, ...r.slice(1)] : r)), 3)].join('\n'));
        }
        return fail(`error: the server doesn't have a resource type "${pos[0]}"`);
      }
      case 'describe': {
        const [t, name] = splitRef(pos[0], pos[1]);
        if (t === 'pods') {
          const p = k.pods.find((x) => x.name === name || (name && x.name.startsWith(name)));
          if (!p) return notFound('pods', name || '');
          return ok(`Name:             ${p.name}\nNamespace:        ${p.ns}\nNode:             ${p.node}/192.168.49.${p.node.slice(-1) * 1 + 1}\nStart Time:       ${longDate(new Date(p.created))}\nLabels:           app=${p.deploy}\nStatus:           ${p.status === 'Running' ? 'Running' : 'Pending'}\nIP:               ${p.ip}\nContainers:\n  app:\n    Image:          ${p.image}\n    Port:           80/TCP\n    State:          ${p.status === 'Running' ? 'Running' : 'Waiting\n      Reason:       ImagePullBackOff'}\n    Ready:          ${p.status === 'Running'}\n    Restart Count:  ${p.restarts}\nEvents:\n  Type    Reason     Age   From               Message\n  ----    ------     ----  ----               -------\n  Normal  Scheduled  ${ago(p.created)}   default-scheduler  Successfully assigned ${p.ns}/${p.name} to ${p.node}\n  ${p.status === 'Running' ? `Normal  Pulled     ${ago(p.created)}   kubelet            Container image "${p.image}" already present on machine\n  Normal  Started    ${ago(p.created)}   kubelet            Started container app` : `Warning  Failed    ${ago(p.created)}   kubelet            Failed to pull image "${p.image}": not found\n  Warning  BackOff   ${ago(p.created)}   kubelet            Back-off pulling image "${p.image}"`}`);
        }
        if (t === 'deployments') {
          const d = k.deployments[name];
          if (!d) return notFound('deployments.apps', name || '');
          const ready = k.pods.filter((p) => p.deploy === d.name && p.status === 'Running').length;
          return ok(`Name:                   ${d.name}\nNamespace:              ${d.ns}\nSelector:               app=${d.name}\nReplicas:               ${d.replicas} desired | ${d.replicas} updated | ${d.replicas} total | ${ready} available | ${d.replicas - ready} unavailable\nStrategyType:           RollingUpdate\nRollingUpdateStrategy:  25% max unavailable, 25% max surge\nPod Template:\n  Containers:\n   app:\n    Image:        ${d.image}\n    Port:         80/TCP\nEvents:\n  Normal  ScalingReplicaSet  ${ago(d.created)}  deployment-controller  Scaled up replica set to ${d.replicas}`);
        }
        if (t === 'nodes') { const n = k.nodes.find((x) => x.name === name) || k.nodes[0]; return ok(`Name:               ${n.name}\nRoles:              ${n.role}\nConditions:\n  Ready             True    KubeletReady   kubelet is posting ready status\nCapacity:\n  cpu:                2\n  memory:             3936Mi\n  pods:               110\nNon-terminated Pods: (${k.pods.filter((p) => p.node === n.name).length} in total)`); }
        if (t === 'services') { const s = k.services[name]; if (!s) return notFound('services', name || ''); return ok(`Name:              ${name}\nNamespace:         ${s.ns}\nSelector:          ${s.selector ? 'app=' + s.selector : '<none>'}\nType:              ${s.type}\nIP:                ${s.ip}\nPort:              <unset>  ${s.ports}\nEndpoints:         ${k.pods.filter((p) => p.deploy === s.selector).map((p) => p.ip + ':80').join(',') || '<none>'}`); }
        return fail(`error: the server doesn't have a resource type "${pos[0] || ''}"`);
      }
      case 'create': {
        const [t, name] = pos;
        if (kind(t) === 'deployments') {
          if (!name || !o.vals.image) return fail('error: required flag(s) "image" not set\nExample: kubectl create deployment web --image=nginx --replicas=2');
          if (k.deployments[name]) return fail(`error: failed to create deployment: deployments.apps "${name}" already exists`);
          this.k8sDeploy(name, o.vals.image, +(o.vals.replicas || 1), ns);
          return ok(`deployment.apps/${name} created`);
        }
        if (kind(t) === 'namespaces') return ok(`namespace/${name} created`);
        return fail('Try: kubectl create deployment web --image=nginx');
      }
      case 'apply': {
        const f = o.vals.f || o.vals.filename;
        if (!f) return fail('error: must specify one of -f and -k\nExample: kubectl apply -f deployment.yaml');
        const files = this.node(f)?.type === 'dir' ? this.walk(f).filter(([r]) => /\.ya?ml$/.test(r)).map(([r]) => `${f}/${r}`) : [f];
        const lines = [];
        for (const file of files) {
          const r = this.read(file, 'error: the path');
          if (r.err) return fail(`error: the path "${file}" does not exist`);
          const docs = this.parseYaml(r.content);
          if (!docs.length) return fail(`error: error validating "${file}": missing "kind" — is this a Kubernetes YAML file?`);
          for (const d of docs) {
            if (d.kind === 'Deployment') {
              const ex = k.deployments[d.name];
              if (!ex) { this.k8sDeploy(d.name, d.image || 'nginx:latest', d.replicas, ns); lines.push(`deployment.apps/${d.name} created`); } else if (ex.image === d.image && ex.replicas === d.replicas) lines.push(`deployment.apps/${d.name} unchanged`);
              else { if (ex.image !== d.image) { ex.image = d.image; ex.revisions.push(d.image); } ex.replicas = d.replicas; this.k8sReconcile(); lines.push(`deployment.apps/${d.name} configured`); }
            } else if (d.kind === 'Service') {
              const ex = k.services[d.name];
              const port = d.port || '80';
              const ports = d.type === 'NodePort' ? `${port}:${d.nodePort || 30000 + (hash(d.name) % 2767)}/TCP` : `${port}/TCP`;
              if (ex && ex.type === (d.type || 'ClusterIP') && ex.ports === ports) lines.push(`service/${d.name} unchanged`);
              else { k.services[d.name] = { ns, type: d.type || 'ClusterIP', ip: `10.96.${hash(d.name) % 255}.${hash(d.name + 'i') % 255}`, ports, selector: d.name, created: ex ? ex.created : Date.now() }; lines.push(`service/${d.name} ${ex ? 'configured' : 'created'}`); }
            } else lines.push(`${d.kind.toLowerCase()}/${d.name} created`);
          }
        }
        return ok(lines.join('\n'));
      }
      case 'scale': {
        const [t, name] = splitRef(pos[0], pos[1]);
        const d = k.deployments[name];
        if (t !== 'deployments' || !d) return notFound('deployments.apps', name || '');
        if (o.vals.replicas === undefined) return fail('error: required flag(s) "replicas" not set');
        d.replicas = +o.vals.replicas;
        this.k8sReconcile();
        return ok(`deployment.apps/${name} scaled`);
      }
      case 'delete': {
        if (o.vals.f) { const docs = this.parseYaml(this.read(o.vals.f, 'x').content || ''); docs.forEach((d) => { if (d.kind === 'Deployment') delete k.deployments[d.name]; if (d.kind === 'Service') delete k.services[d.name]; }); this.k8sReconcile(); return ok(docs.map((d) => `${d.kind.toLowerCase()}${d.kind === 'Deployment' ? '.apps' : ''} "${d.name}" deleted`).join('\n')); }
        const [t, ...names] = pos[0] && pos[0].includes('/') ? [kind(pos[0].split('/')[0]), pos[0].split('/')[1]] : [kind(pos[0]), ...pos.slice(1)];
        if (!names.length) return fail('error: resource(s) were provided, but no name was specified');
        const outL = [];
        for (const raw of names) {
          const name = raw.replace(/^(pods?|deployments?(\.apps)?|deploy|services?|svc)\//, '');
          if (t === 'pods') {
            const p = k.pods.find((x) => x.name === name);
            if (!p) return notFound('pods', name);
            k.pods = k.pods.filter((x) => x !== p);
            outL.push(`pod "${name}" deleted`);
            this.k8sReconcile();
          } else if (t === 'deployments') {
            if (!k.deployments[name]) return notFound('deployments.apps', name);
            delete k.deployments[name]; this.k8sReconcile(); outL.push(`deployment.apps "${name}" deleted`);
          } else if (t === 'services') {
            if (!k.services[name]) return notFound('services', name);
            delete k.services[name]; outL.push(`service "${name}" deleted`);
          } else return fail(`error: the server doesn't have a resource type "${pos[0]}"`);
        }
        return ok(outL.join('\n'));
      }
      case 'expose': {
        const [t, name] = splitRef(pos[0], pos[1]);
        if (t !== 'deployments' || !k.deployments[name]) return notFound('deployments.apps', name || '');
        if (k.services[name]) return fail(`Error from server (AlreadyExists): services "${name}" already exists`);
        const port = o.vals.port || '80'; const type = o.vals.type || 'ClusterIP';
        k.services[name] = { ns, type, ip: `10.96.${hash(name) % 255}.${hash(name + 'i') % 255}`, ports: type === 'NodePort' || type === 'LoadBalancer' ? `${port}:${30000 + (hash(name) % 2767)}/TCP` : `${port}/TCP`, selector: name, created: Date.now() };
        return ok(`service/${name} exposed`);
      }
      case 'set': {
        if (pos[0] !== 'image') return fail('Try: kubectl set image deployment/shipyard app=shipyard:2.0');
        const [, ref, assign] = pos;
        const name = (ref || '').split('/')[1] || pos[2];
        const d = k.deployments[name];
        if (!d) return notFound('deployments.apps', name || '');
        const img = (assign && assign.includes('=') ? assign : pos[3] || '').split('=')[1];
        if (!img) return fail('error: you must specify the new image, e.g. app=shipyard:2.0');
        d.image = img; d.revisions.push(img);
        this.k8sReconcile();
        return ok(`deployment.apps/${name} image updated`);
      }
      case 'rollout': {
        const [action, ref, ref2] = pos;
        const name = ref && ref.includes('/') ? ref.split('/')[1] : ref2;
        const d = k.deployments[name];
        if (!d) return notFound('deployments.apps', name || '');
        if (action === 'status') {
          const bad = k.pods.some((p) => p.deploy === name && p.status !== 'Running');
          return bad ? fail(`Waiting for deployment "${name}" rollout to finish: 0 of ${d.replicas} updated replicas are available...\nerror: deployment "${name}" exceeded its progress deadline\nTip: the image can't be pulled. Roll back with  kubectl rollout undo deployment/${name}`) : ok(`deployment "${name}" successfully rolled out`);
        }
        if (action === 'history') return ok(`deployment.apps/${name}\nREVISION  CHANGE-CAUSE\n` + d.revisions.map((img, i) => `${i + 1}         ${i === 0 ? '<none>' : `image updated to ${img}`}`).join('\n'));
        if (action === 'undo') {
          if (d.revisions.length < 2) return fail(`error: no rollout history found for deployment "${name}"`);
          const to = o.vals['to-revision'] ? +o.vals['to-revision'] : d.revisions.length - 1;
          d.image = d.revisions[to - 1]; d.revisions.push(d.image);
          this.k8sReconcile();
          return ok(`deployment.apps/${name} rolled back`);
        }
        if (action === 'restart') { k.pods = k.pods.filter((p) => p.deploy !== name); this.k8sReconcile(); return ok(`deployment.apps/${name} restarted`); }
        return fail('Try: kubectl rollout status|history|undo|restart deployment/<name>');
      }
      case 'logs': {
        const ref = pos[0] || '';
        const p = ref.startsWith('deploy') ? k.pods.find((x) => x.deploy === ref.split('/')[1]) : k.pods.find((x) => x.name === ref);
        if (!p) return notFound('pods', ref);
        if (p.status !== 'Running') return fail(`Error from server (BadRequest): container "app" in pod "${p.name}" is waiting to start: trying and failing to pull image`);
        const t0 = Date.now();
        const lines = p.deploy === 'prometheus' ? ['level=info msg="Server is ready to receive web requests."', 'level=info msg="Completed loading of configuration file" filename=/etc/prometheus/prometheus.yml']
          : Array.from({ length: 12 }, (_, i) => { const d = new Date(t0 - (12 - i) * 41e3); const errLine = this.topic?.id === 'monitoring' && i % 4 === 3; return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} ${errLine ? 'ERROR' : 'INFO '} ${errLine ? 'GET /api/orders 500 db timeout after 3000ms' : ['GET /api/health 200 3ms', 'GET / 200 12ms', 'GET /api/users 200 41ms', 'POST /api/login 200 88ms'][i % 4]}`; });
        return ok(lines.slice(-(+(o.vals.tail || 1000))).join('\n'));
      }
      case 'top': {
        const t = kind(pos[0]);
        if (t === 'nodes') return ok(table([['NAME', 'CPU(cores)', 'CPU%', 'MEMORY(bytes)', 'MEMORY%'], ...k.nodes.map((n, i) => [n.name, `${210 + i * 95}m`, `${10 + i * 5}%`, `${1480 + i * 312}Mi`, `${38 + i * 8}%`])], 3));
        if (t === 'pods') return ok(table([['NAME', 'CPU(cores)', 'MEMORY(bytes)'], ...k.pods.filter(inNs).filter((p) => p.status === 'Running').map((p) => [p.name, `${(hash(p.name) % 40) + 3}m`, `${(hash(p.name + 'm') % 90) + 40}Mi`])], 3));
        return fail('Try: kubectl top pods  or  kubectl top nodes');
      }
      case 'port-forward': {
        const [ref, map] = pos;
        const [local, remote] = (map || '').split(':');
        if (!ref || !local) return fail('Example: kubectl port-forward svc/shipyard 8080:80');
        const name = ref.split('/')[1] || ref;
        if (!k.services[name] && !k.deployments[name] && !k.pods.find((p) => p.name === name)) return notFound('services', name);
        this.endpoints[local] = { proc: 'kubectl', handle: () => ({ status: 200, type: 'text/html', body: `<!doctype html>\n<html><head><title>Shipyard</title></head><body><h1>Shipyard</h1><p>Served by pod ${k.pods.find((p) => p.deploy === name)?.name || name} (${k.deployments[name]?.image || ''})</p></body></html>` }) };
        return ok(`Forwarding from 127.0.0.1:${local} -> ${remote || local}\nForwarding from [::1]:${local} -> ${remote || local}\n(Running in the background. Try: curl localhost:${local})`);
      }
      case 'exec': return ok('(kubectl exec runs a command inside a pod. In this practice terminal, try  kubectl logs <pod>  or  kubectl describe pod <pod>  instead.)');
      default: return fail(`error: unknown command "${verb}" for "kubectl"\nTry: get, describe, create, apply, delete, scale, expose, set image, rollout, logs, top`);
    }
  }

  /* ═════════════ Terraform ═════════════ */
  tfConfig() {
    const files = Object.entries(this.node('.')?.children || {}).filter(([n, f]) => n.endsWith('.tf') && f.type === 'file');
    const resources = {}; const outputs = {}; const errors = [];
    files.forEach(([fname, f]) => {
      const text = f.content;
      if ((text.match(/{/g) || []).length !== (text.match(/}/g) || []).length) errors.push(`Error: Unclosed configuration block\n\n  on ${fname}: There is no closing brace for a block. Check every { has a matching }.`);
      const blocks = [];
      const head = /(resource|output)\s+"([^"]+)"(?:\s+"([^"]+)")?\s*{/g;
      let m;
      while ((m = head.exec(text))) {
        let depth = 1; let j = head.lastIndex;
        for (; j < text.length && depth; j++) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; }
        blocks.push({ kind: m[1], a: m[2], b: m[3], body: text.slice(head.lastIndex, j - 1) });
        head.lastIndex = j;
      }
      blocks.forEach(({ kind, a, b, body }) => {
        if (kind === 'output') { const v = /value\s*=\s*([^\n}]+)/.exec(body); if (v) outputs[a] = v[1].trim(); return; }
        const attrs = {};
        const top = body.replace(/\w+\s*=\s*{[^}]*}/g, '');
        top.split(/\n|;/).forEach((l) => { const x = /^\s*(\w+)\s*=\s*"?([^"#\n{}]*?)"?\s*$/.exec(l); if (x && x[2] !== '') attrs[x[1]] = x[2].trim(); });
        const tagName = /Name\s*=\s*"([^"]+)"/.exec(body);
        if (tagName) attrs['tags.Name'] = tagName[1];
        resources[`${a}.${b}`] = { type: a, name: b, attrs };
      });
    });
    return { files: files.map(([n]) => n), resources, outputs, errors };
  }
  terraform(args) {
    const [sub, ...rest] = args;
    const o = opts(rest);
    const tf = this.tf;
    const cfg = this.tfConfig();
    if (!sub) return ok('Usage: terraform [global options] <subcommand> [args]\n\nMain commands:\n  init      Prepare your working directory\n  validate  Check whether the configuration is valid\n  plan      Show changes required by the current configuration\n  apply     Create or update infrastructure\n  destroy   Destroy previously-created infrastructure\n\nOther: fmt, state list, state show, output, show, version');
    if (sub === 'version' || sub === '-v' || sub === '--version') return ok('Terraform v1.9.8\non linux_amd64\n+ provider registry.terraform.io/hashicorp/aws v5.74.0');
    if (sub === 'init') {
      if (!cfg.files.length) return ok('Terraform initialized in an empty directory!\n\nThe directory has no Terraform configuration files. You may begin working\nwith Terraform immediately by creating Terraform configuration files.');
      tf.init = true;
      this.mkdirp('.terraform/providers');
      this.write('.terraform.lock.hcl', '# This file is maintained automatically by "terraform init".\nprovider "registry.terraform.io/hashicorp/aws" {\n  version = "5.74.0"\n}\n');
      return ok('Initializing the backend...\nInitializing provider plugins...\n- Finding hashicorp/aws versions matching "~> 5.0"...\n- Installing hashicorp/aws v5.74.0...\n- Installed hashicorp/aws v5.74.0 (signed by HashiCorp)\nTerraform has created a lock file .terraform.lock.hcl\n\nTerraform has been successfully initialized!\n\nYou may now begin working with Terraform. Try running "terraform plan" to see\nany changes that are required for your infrastructure.');
    }
    if (sub === 'fmt') return ok();
    if (!cfg.files.length) return fail('Error: No configuration files\n\nApply requires configuration to be present. Tip: cd into the folder with your .tf files');
    if (!tf.init || !this.node('.terraform')) return fail('Error: Inconsistent dependency lock file\n\nThe following dependency selections recorded in the lock file are inconsistent\nwith the current configuration:\n  - provider registry.terraform.io/hashicorp/aws: required by this configuration but no version is selected\n\nTo make the initial dependency selections that will initialize the dependency\nlock file, run:\n  terraform init');
    if (cfg.errors.length) return fail(cfg.errors.join('\n\n'));
    if (sub === 'validate') return ok('Success! The configuration is valid.');
    const fullAttrs = (r) => {
      const a = { ...r.attrs };
      if (r.type === 'aws_s3_bucket') { a.arn = '(known after apply)'; a.id = '(known after apply)'; }
      if (r.type === 'aws_instance') { a.public_ip = '(known after apply)'; a.id = '(known after apply)'; }
      return a;
    };
    const plan = (destroyAll = false) => {
      const add = []; const change = []; const del = [];
      if (!destroyAll) Object.entries(cfg.resources).forEach(([addr, r]) => { const s = tf.state[addr]; if (!s) add.push(addr); else if (JSON.stringify(s.attrs) !== JSON.stringify(r.attrs)) change.push(addr); });
      Object.keys(tf.state).forEach((addr) => { if (destroyAll || !cfg.resources[addr]) del.push(addr); });
      return { add, change, del };
    };
    const describe = (p) => {
      const lines = [];
      const block = (addr, sym, attrs) => {
        const [type, name] = addr.split('.');
        const w = Math.max(...Object.keys(attrs).map((k) => k.length));
        lines.push(`  # ${addr} will be ${sym === '+' ? 'created' : sym === '-' ? 'destroyed' : 'updated in-place'}`, `  ${sym} resource "${type}" "${name}" {`, ...Object.entries(attrs).map(([k, v]) => `      ${sym} ${k.padEnd(w)} = ${v.startsWith('(') ? v : `"${v}"`}`), '    }', '');
      };
      p.add.forEach((a) => block(a, '+', fullAttrs(cfg.resources[a])));
      p.change.forEach((a) => {
        const before = tf.state[a].attrs; const after = cfg.resources[a].attrs;
        const diff = Object.fromEntries(Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]).map((k) => [k, `"${before[k] || ''}" -> "${after[k] || ''}"`]));
        const [type, name] = a.split('.');
        lines.push(`  # ${a} will be updated in-place`, `  ~ resource "${type}" "${name}" {`, ...Object.entries(diff).map(([k, v]) => `      ~ ${k} = ${v}`), '    }', '');
      });
      p.del.forEach((a) => block(a, '-', tf.state[a].attrs));
      return lines;
    };
    if (sub === 'plan' || sub === 'apply' || sub === 'destroy') {
      const destroying = sub === 'destroy';
      const p = plan(destroying);
      const total = p.add.length + p.change.length + p.del.length;
      if (!total) return ok(destroying ? 'No changes. No objects need to be destroyed.' : '\nNo changes. Your infrastructure matches the configuration.\n\nTerraform has compared your real infrastructure against your configuration\nand found no differences, so no changes are needed.');
      const head = ['', 'Terraform used the selected providers to generate the following execution', 'plan. Resource actions are indicated with the following symbols:', ...(p.add.length ? ['  + create'] : []), ...(p.change.length ? ['  ~ update in-place'] : []), ...(p.del.length ? ['  - destroy'] : []), '', 'Terraform will perform the following actions:', '', ...describe(p), `Plan: ${p.add.length} to add, ${p.change.length} to change, ${p.del.length} to destroy.`];
      if (sub === 'plan') return ok(head.join('\n') + '\n\nNote: You didn\'t use the -out option to save this plan. Run "terraform apply" to make these changes.');
      const auto = o.flags.has('auto-approve');
      const lines = [...head, '', auto ? '' : `Do you want to perform these actions?\n  Terraform will perform the actions described above.\n  Only 'yes' will be accepted to approve.\n\n  Enter a value: yes   (auto-answered in this practice terminal; use -auto-approve to skip the question)\n`];
      const a = this.awsInit();
      p.del.forEach((addr) => {
        const s = tf.state[addr];
        lines.push(`${addr}: Destroying... [id=${s.id}]`, `${addr}: Destruction complete after 1s`);
        if (s.type === 'aws_s3_bucket') delete a.buckets[s.attrs.bucket];
        if (s.type === 'aws_instance') { const i = a.instances.find((x) => x.id === s.id); if (i) i.state = 'terminated'; }
        delete tf.state[addr];
      });
      p.change.forEach((addr) => {
        const r = cfg.resources[addr]; const s = tf.state[addr];
        lines.push(`${addr}: Modifying... [id=${s.id}]`, `${addr}: Modifications complete after 2s [id=${s.id}]`);
        s.attrs = { ...r.attrs };
        if (r.type === 'aws_instance') { const i = a.instances.find((x) => x.id === s.id); if (i) { i.type = r.attrs.instance_type || i.type; i.name = r.attrs['tags.Name'] || i.name; } }
      });
      p.add.forEach((addr) => {
        const r = cfg.resources[addr];
        let id = r.attrs.bucket || `${r.name}-${hex(8)}`;
        if (r.type === 'aws_s3_bucket') a.buckets[r.attrs.bucket || r.name] = { created: new Date(), objects: {} };
        if (r.type === 'aws_instance') { id = 'i-0' + hex(16); a.instances.push({ id, name: r.attrs['tags.Name'] || r.name, type: r.attrs.instance_type || 't3.micro', state: 'running', ip: fakeIp(id), az: `${a.region}a` }); }
        tf.state[addr] = { type: r.type, name: r.name, id, attrs: { ...r.attrs } };
        lines.push(`${addr}: Creating...`, `${addr}: Creation complete after ${r.type === 'aws_instance' ? '13s' : '2s'} [id=${id}]`);
      });
      lines.push('', `${destroying ? 'Destroy' : 'Apply'} complete! Resources: ${destroying ? `${p.del.length} destroyed` : `${p.add.length} added, ${p.change.length} changed, ${p.del.length} destroyed`}.`);
      const outs = this.tfOutputs(cfg);
      if (!destroying && Object.keys(outs).length) lines.push('', 'Outputs:', '', ...Object.entries(outs).map(([k, v]) => `${k} = "${v}"`));
      this.write('terraform.tfstate', JSON.stringify({ version: 4, terraform_version: '1.9.8', resources: Object.values(tf.state).map((s) => ({ type: s.type, name: s.name, instances: [{ attributes: { id: s.id, ...s.attrs } }] })) }, null, 2) + '\n');
      return ok(lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n'));
    }
    if (sub === 'state') {
      if (rest[0] === 'list') return ok(Object.keys(tf.state).join('\n'));
      if (rest[0] === 'show') {
        const s = tf.state[rest[1]];
        if (!s) return fail(`No instance found for the given address!\n\nTip: run  terraform state list  to see addresses`);
        const attrs = { id: s.id, ...s.attrs };
        if (s.type === 'aws_instance') attrs.public_ip = this.awsInit().instances.find((i) => i.id === s.id)?.ip || '';
        const w = Math.max(...Object.keys(attrs).map((k) => k.length));
        return ok(`# ${rest[1]}:\nresource "${s.type}" "${s.name}" {\n${Object.entries(attrs).map(([k, v]) => `    ${k.padEnd(w)} = "${v}"`).join('\n')}\n}`);
      }
      return fail('Usage: terraform state list | terraform state show <address>');
    }
    if (sub === 'output') {
      const outs = this.tfOutputs(cfg);
      if (!Object.keys(tf.state).length) return fail('╷\n│ Warning: No outputs found\n│ The state file either has no outputs defined, or all the defined outputs are empty. Run terraform apply first.\n╵');
      return ok(Object.entries(outs).map(([k, v]) => `${k} = "${v}"`).join('\n'));
    }
    if (sub === 'show') return Object.keys(tf.state).length ? ok(Object.keys(tf.state).map((addr) => this.terraform(['state', 'show', addr]).out).join('\n')) : ok('No state.');
    return fail(`Terraform has no command named "${sub}".\n\nTo see all of Terraform's top-level commands, run:\n  terraform -help`);
  }
  tfOutputs(cfg) {
    const out = {};
    Object.entries(cfg.outputs).forEach(([k, expr]) => {
      const m = /^([\w]+)\.([\w]+)\.([\w]+)$/.exec(expr);
      if (!m) { out[k] = expr.replace(/"/g, ''); return; }
      const s = this.tf.state[`${m[1]}.${m[2]}`];
      if (!s) return;
      if (m[3] === 'public_ip') out[k] = this.awsInit().instances.find((i) => i.id === s.id)?.ip || '';
      else if (m[3] === 'id') out[k] = s.id;
      else if (m[3] === 'arn') out[k] = `arn:aws:s3:::${s.attrs.bucket || s.id}`;
      else out[k] = s.attrs[m[3]] || '';
    });
    return out;
  }

  /* ═════════════ starting files for each topic ═════════════ */
  seed(topicId) {
    const P = (p, c, m, o) => this.put(p, c, m, o);
    // Shared system files
    P('/etc/hostname', `${HOST}\n`, 0o644, 'root');
    P('/etc/os-release', 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nID=ubuntu\n', 0o644, 'root');
    P('/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\tshipyard\n10.0.2.20\tdb.internal\n10.0.2.21\tcache.internal\n', 0o644, 'root');
    P('/etc/resolv.conf', 'nameserver 127.0.0.53\noptions edns0 trust-ad\nsearch .\n', 0o644, 'root');
    P('/etc/passwd', 'root:x:0:0:root:/root:/bin/bash\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\ntejus:x:1000:1000:Tejus Sanly:/home/tejus:/bin/bash\n', 0o644, 'root');
    P('/etc/nginx/nginx.conf', 'user www-data;\nworker_processes auto;\n\nhttp {\n    server {\n        listen 80;\n        root /var/www/html;\n        location /health { return 200 "ok"; }\n    }\n}\n', 0o644, 'root');
    P('/var/www/html/index.html', '<h1>Welcome to nginx on shipyard</h1>\n', 0o644, 'root');
    const d = new Date();
    const stamp = (m) => { const x = new Date(d - m * 60e3); return `${MONTHS[x.getMonth()]} ${two(x.getDate())} ${two(x.getHours())}:${two(x.getMinutes())}:${two(x.getSeconds())}`; };
    P('/var/log/syslog', [
      `${stamp(58)} shipyard systemd[1]: Started cron.service - Regular background program processing daemon.`,
      `${stamp(51)} shipyard CRON[2211]: (tejus) CMD (/home/tejus/scripts/backup.sh)`,
      `${stamp(40)} shipyard nginx[812]: 10.0.2.2 "GET / HTTP/1.1" 200 615`,
      `${stamp(33)} shipyard sshd[640]: Accepted publickey for tejus from 10.0.2.2 port 51022`,
      `${stamp(21)} shipyard kernel: [UFW BLOCK] IN=eth0 SRC=185.220.101.4 DST=10.0.2.15 PROTO=TCP DPT=23`,
      `${stamp(12)} shipyard nginx[812]: 10.0.2.2 "GET /api/users HTTP/1.1" 200 1032`,
      `${stamp(6)} shipyard dockerd[920]: time="${d.toISOString()}" level=info msg="Container health status changed" status=healthy`,
      `${stamp(2)} shipyard nginx[812]: 10.0.2.2 "GET /favicon.ico HTTP/1.1" 404 153`,
    ].join('\n') + '\n', 0o640, 'root');
    P('/var/log/nginx/access.log', ['10.0.2.2 - - "GET / HTTP/1.1" 200 615', '10.0.2.2 - - "GET /about HTTP/1.1" 200 1204', '10.0.2.7 - - "GET /api/users HTTP/1.1" 200 1032', '10.0.2.7 - - "GET /admin HTTP/1.1" 403 153', '10.0.2.2 - - "GET /favicon.ico HTTP/1.1" 404 153', '10.0.2.9 - - "POST /api/login HTTP/1.1" 200 88', '10.0.2.9 - - "GET /api/orders HTTP/1.1" 500 42', '10.0.2.2 - - "GET / HTTP/1.1" 200 615'].join('\n') + '\n', 0o644, 'root');
    this.mkdirp('/tmp'); this.mkdirp('/usr/bin', 'root'); this.mkdirp('/bin', 'root');
    P(`${HOME}/.bashrc`, '# ~/.bashrc\nexport PATH="$HOME/bin:$PATH"\nalias ll=\'ls -alF\'\n');
    P(`${HOME}/notes.txt`, 'DevOps notes\n- learn linux\n- learn git\n- learn docker\n- learn kubernetes\n');

    // The shipyard web project (used by git, CI/CD and docker)
    const project = (root) => {
      const files = {
        'README.md': '# Shipyard\n\nA DevOps learning site.\n',
        'index.html': '<!doctype html>\n<html>\n<head><title>Shipyard</title></head>\n<body>\n  <h1>Shipyard</h1>\n  <p>Learn DevOps, one container at a time.</p>\n</body>\n</html>\n',
        'src/app.js': "export function greet(name) {\n  return 'Hello ' + name;\n}\n",
        'src/app.test.js': "import { greet } from './app.js';\n\ntest('greet() returns a welcome message', () => {\n  expect(greet('Tejus')).toBe('Hello Tejus');\n});\n",
        'src/math.js': 'export const add = (a, b) => a + b;\n',
        'package.json': JSON.stringify({ name: 'shipyard', version: '1.0.0', scripts: { dev: 'vite', start: 'vite', build: 'vite build', test: 'vitest run', lint: 'eslint src' }, dependencies: { react: '^19.1.0' }, devDependencies: { vite: '^6.3.5', vitest: '^3.2.0', eslint: '^9.30.0' } }, null, 2) + '\n',
        '.gitignore': 'node_modules\ndist\n',
        'Dockerfile': '# Serve the site with nginx\nFROM nginx:1.27-alpine\nCOPY index.html /usr/share/nginx/html/index.html\nEXPOSE 80\n',
        '.github/workflows/ci.yml': 'name: CI\non: [push, pull_request]\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci\n      - run: npm run lint\n      - run: npm test\n      - run: npm run build\n',
      };
      Object.entries(files).forEach(([rel, c]) => P(`${root}/${rel}`, c));
      const repo = this.newRepo(root);
      const first = { 'README.md': files['README.md'], 'index.html': files['index.html'] };
      repo.index = { ...first };
      const c1 = this.makeCommit(repo, 'Initial commit', first, []);
      repo.commits[c1].date = new Date(Date.now() - 3 * 864e5);
      repo.index = { ...files };
      const c2 = this.makeCommit(repo, 'Add app, tests and CI workflow', files, [c1]);
      repo.commits[c2].date = new Date(Date.now() - 864e5);
      repo.remotes.origin = 'git@github.com:tejus/shipyard.git';
      repo.remoteBranches.main = c2; repo.upstream.main = 'origin/main';
      return repo;
    };

    switch (topicId) {
      case 'linux':
        P(`${HOME}/deploy.sh`, '#!/usr/bin/env bash\necho "Deploying Shipyard..."\necho "Copying files to /var/www/html"\necho "Restarting nginx"\necho "Done!"\n');
        P(`${HOME}/logs/app.log`, '2026-11-24 09:00:01 INFO  App started on port 3000\n2026-11-24 09:14:22 INFO  GET /api/users 200\n2026-11-24 09:15:03 ERROR Database connection timeout\n2026-11-24 09:15:09 INFO  Reconnected to database\n2026-11-24 10:02:44 WARN  Slow request: GET /api/orders took 2300ms\n2026-11-24 10:30:12 ERROR Payment service returned 503\n');
        this.mkdirp(`${HOME}/projects`);
        break;
      case 'networking':
        P(`${HOME}/urls.txt`, 'https://example.com\nhttps://github.com\nhttps://api.github.com\n');
        break;
      case 'git':
      case 'cicd': {
        const repo = project(`${HOME}/shipyard`);
        this.cwd = `${HOME}/shipyard`;
        if (topicId === 'git') {
          P(`${HOME}/shipyard/src/app.js`, "export function greet(name) {\n  return 'Hello ' + name + '!';\n}\n");
          P(`${HOME}/shipyard/TODO.md`, '- add a login page\n- write more tests\n');
        } else {
          this.gh.runs = [
            { id: 11842991, title: 'Add app, tests and CI workflow', workflow: 'CI', branch: 'main', event: 'push', status: 'success', at: Date.now() - 864e5, secs: 51 },
            { id: 11842984, title: 'Fix header layout', workflow: 'CI', branch: 'main', event: 'push', status: 'failure', at: Date.now() - 2 * 864e5, secs: 33 },
            { id: 11842977, title: 'Initial commit', workflow: 'CI', branch: 'main', event: 'push', status: 'success', at: Date.now() - 3 * 864e5, secs: 47 },
          ];
        }
        void repo;
        break;
      }
      case 'scripting':
        P(`${HOME}/scripts/hello.sh`, '#!/usr/bin/env bash\n# Say hello to whoever is logged in\nNAME=$USER\necho "Hello, $NAME!"\necho "Today is $(date)"\necho "You are in $(pwd)"\n', 0o755);
        P(`${HOME}/scripts/deploy.sh`, '#!/usr/bin/env bash\nset -euo pipefail\n\nENV=staging\necho "Building the app..."\necho "Running tests..."\nfor step in lint test build; do\n  echo "  ✓ $step"\ndone\necho "Deploying to $ENV"\nif [ -f ~/scripts/config.env ]; then\n  echo "Using config.env"\nfi\necho "Deploy finished"\n');
        P(`${HOME}/scripts/backup.sh`, '#!/usr/bin/env bash\n# Back up the logs folder\nmkdir -p ~/backups\ncp ~/scripts/config.env ~/backups/config.env.bak\necho "Backup saved to ~/backups"\n', 0o755);
        P(`${HOME}/scripts/config.env`, 'APP_PORT=3000\nDB_HOST=db.internal\nLOG_LEVEL=info\n');
        P(`${HOME}/.crontab`, '# m h dom mon dow command\n0 2 * * * /home/tejus/scripts/backup.sh\n');
        this.cwd = `${HOME}/scripts`;
        break;
      case 'docker':
        project(`${HOME}/shipyard`);
        this.cwd = `${HOME}/shipyard`;
        break;
      case 'cloud':
        this.awsInit();
        P(`${HOME}/report.csv`, 'month,visits\nsep,1200\noct,1850\nnov,2400\n');
        P(`${HOME}/.aws/config`, '[default]\nregion = ap-south-1\noutput = json\n');
        break;
      case 'kubernetes':
        this.k8sInit(2);
        P(`${HOME}/k8s/deployment.yaml`, 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: shipyard\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: shipyard\n  template:\n    metadata:\n      labels:\n        app: shipyard\n    spec:\n      containers:\n      - name: app\n        image: shipyard:1.1\n        ports:\n        - containerPort: 80\n');
        P(`${HOME}/k8s/service.yaml`, 'apiVersion: v1\nkind: Service\nmetadata:\n  name: shipyard\nspec:\n  type: NodePort\n  selector:\n    app: shipyard\n  ports:\n  - port: 80\n    nodePort: 30080\n');
        P(`${HOME}/k8s/redis.yaml`, 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: redis\nspec:\n  replicas: 1\n  template:\n    spec:\n      containers:\n      - name: redis\n        image: redis:7-alpine\n');
        this.cwd = `${HOME}/k8s`;
        break;
      case 'iac':
        this.awsInit();
        P(`${HOME}/infra/main.tf`, 'terraform {\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> 5.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "ap-south-1"\n}\n\nresource "aws_s3_bucket" "logs" {\n  bucket = "shipyard-logs-tejus"\n}\n\nresource "aws_instance" "web" {\n  ami           = "ami-0dee22c13ea7a9a67"\n  instance_type = "t3.micro"\n\n  tags = {\n    Name = "shipyard-web"\n  }\n}\n');
        P(`${HOME}/infra/outputs.tf`, 'output "web_ip" {\n  value = aws_instance.web.public_ip\n}\n\noutput "logs_bucket" {\n  value = aws_s3_bucket.logs.bucket\n}\n');
        P(`${HOME}/infra/README.md`, 'Try: terraform init, terraform plan, terraform apply\n\nThen change something and plan again:\n  sed -i \'s/t3.micro/t3.small/\' main.tf\n  terraform plan\n\nOr add a new resource:\n  echo \'resource "aws_s3_bucket" "backups" { bucket = "shipyard-backups-tejus" }\' >> main.tf\n');
        this.cwd = `${HOME}/infra`;
        break;
      case 'monitoring': {
        this.k8sInit(3, true);
        this.services.prometheus = 'active'; this.services.grafana = 'active';
        this.procs.push({ pid: 1510, user: 'root', cpu: 1.4, mem: 3.2, cmd: '/usr/bin/prometheus --config.file=/etc/prometheus/prometheus.yml', svc: 'prometheus' }, { pid: 1544, user: 'root', cpu: 0.6, mem: 2.4, cmd: '/usr/sbin/grafana-server', svc: 'grafana' });
        P(`${HOME}/monitoring/prometheus.yml`, 'global:\n  scrape_interval: 15s\n\nrule_files:\n  - alerts.yml\n\nscrape_configs:\n  - job_name: shipyard\n    static_configs:\n      - targets: ["shipyard:80"]\n  - job_name: node\n    static_configs:\n      - targets: ["node-1:9100", "node-2:9100"]\n');
        P(`${HOME}/monitoring/alerts.yml`, 'groups:\n  - name: shipyard\n    rules:\n      - alert: HighErrorRate\n        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05\n        for: 5m\n        labels:\n          severity: page\n        annotations:\n          summary: "More than 5% of requests are failing"\n      - alert: InstanceDown\n        expr: up == 0\n        for: 1m\n');
        const json = (o) => ({ status: 200, type: 'application/json', server: 'prometheus', body: JSON.stringify(o) });
        this.endpoints['9090'] = {
          proc: 'prometheus',
          handle: (u) => {
            if (u.pathname === '/-/healthy') return { status: 200, type: 'text/plain', server: 'prometheus', body: 'Prometheus Server is Healthy.' };
            if (u.pathname === '/api/v1/alerts') return json({ status: 'success', data: { alerts: [{ labels: { alertname: 'HighErrorRate', severity: 'page', job: 'shipyard' }, annotations: { summary: 'More than 5% of requests are failing' }, state: 'firing', activeAt: new Date(Date.now() - 18 * 60e3).toISOString(), value: '0.083' }] } });
            if (u.pathname === '/api/v1/targets') return json({ status: 'success', data: { activeTargets: [{ labels: { job: 'shipyard', instance: 'shipyard:80' }, health: 'up' }, { labels: { job: 'node', instance: 'node-1:9100' }, health: 'up' }, { labels: { job: 'node', instance: 'node-2:9100' }, health: 'up' }] } });
            if (u.pathname === '/api/v1/query') {
              const q = (u.searchParams.get('query') || '').replace(/\s/g, '');
              const t = Math.floor(Date.now() / 1000);
              if (q === 'up') return json({ status: 'success', data: { resultType: 'vector', result: [{ metric: { job: 'shipyard', instance: 'shipyard:80' }, value: [t, '1'] }, { metric: { job: 'node', instance: 'node-1:9100' }, value: [t, '1'] }, { metric: { job: 'node', instance: 'node-2:9100' }, value: [t, '1'] }] } });
              if (/http_requests_total/.test(q) && /5\.\./.test(q)) return json({ status: 'success', data: { resultType: 'vector', result: [{ metric: { job: 'shipyard', status: '500' }, value: [t, '0.083'] }] } });
              if (/http_requests_total/.test(q)) return json({ status: 'success', data: { resultType: 'vector', result: [{ metric: { job: 'shipyard' }, value: [t, '14.2'] }] } });
              if (/latency|duration/.test(q)) return json({ status: 'success', data: { resultType: 'vector', result: [{ metric: { job: 'shipyard', quantile: '0.95' }, value: [t, '0.412'] }] } });
              if (/memory|cpu/.test(q)) return json({ status: 'success', data: { resultType: 'vector', result: [{ metric: { instance: 'node-1:9100' }, value: [t, '0.38'] }, { metric: { instance: 'node-2:9100' }, value: [t, '0.46'] }] } });
              return json({ status: 'success', data: { resultType: 'vector', result: [] } });
            }
            return { status: 404, type: 'text/plain', server: 'prometheus', body: '404 page not found' };
          },
        };
        this.endpoints['3000'] = { proc: 'grafana', handle: (u) => (u.pathname === '/api/health' ? json({ commit: 'a1b2c3d', database: 'ok', version: '11.3.0' }) : { status: 200, type: 'text/html', server: 'grafana', body: '<!doctype html><html><head><title>Grafana</title></head><body>Grafana dashboard: Shipyard overview (requests, errors, latency, saturation)</body></html>' }) };
        this.cwd = `${HOME}/monitoring`;
        break;
      }
      default: break;
    }
    this.env.PWD = this.cwd;
  }
}

// used by `aws s3 mv` to remove the local file after upload
function C_rm(sh, p) { const [parent, name] = sh.split(p); const pn = sh.node(parent); if (pn) delete pn.children[name]; }
