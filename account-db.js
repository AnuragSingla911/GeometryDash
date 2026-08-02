/**
 * AccountDatabase — GitHub Pages–friendly player DB (no backend server)
 *
 * Storage layers:
 *  1. localStorage  — instant create/login & progress on this device
 *  2. data/db.json  — shared JSON database served by GitHub Pages
 *  3. Optional GitHub Contents API sync (when a fine-grained PAT is set
 *     in data/config.json) so the owner can manage accounts in the repo
 */
(function (global) {
  "use strict";

  const LOCAL_KEY = "robotRushAccountDB";
  const SESSION_KEY = "robotRushSessionUser";

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function emptyProgress() {
    return {
      easy: { highScore: 0, bestDistance: 0, bestCoins: 0 },
      medium: { highScore: 0, bestDistance: 0, bestCoins: 0 },
      hard: { highScore: 0, bestDistance: 0, bestCoins: 0 },
      totalCoins: 0,
      gamesPlayed: 0,
      furthestEnv: "desert",
      lastDifficulty: "easy",
    };
  }

  function emptyDb() {
    return { version: 1, updatedAt: null, accounts: {}, leaderboard: [] };
  }

  class AccountDatabase {
    constructor() {
      this.db = emptyDb();
      this.config = {
        repo: "AnuragSingla911/GeometryDash",
        dbPath: "data/db.json",
        branch: "main",
        githubToken: "",
      };
      this.currentUser = null;
      this.remoteReady = false;
      this.lastError = null;
    }

    async init() {
      this._loadLocal();
      await this._loadConfig();
      await this._loadRemote();
      this._restoreSession();
      return this;
    }

    _loadLocal() {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.accounts) this.db = parsed;
        }
      } catch (_) {
        this.db = emptyDb();
      }
    }

    _saveLocal() {
      this.db.updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(this.db));
      } catch (_) { /* quota */ }
    }

    async _loadConfig() {
      try {
        const res = await fetch("./data/config.json", { cache: "no-store" });
        if (res.ok) {
          const cfg = await res.json();
          this.config = { ...this.config, ...cfg };
        }
      } catch (_) { /* offline / first run */ }

      // Owner may also paste a token once in the browser (never committed)
      try {
        const t = localStorage.getItem("robotRushGithubToken");
        if (t) this.config.githubToken = t;
      } catch (_) { /* ignore */ }
    }

    async _loadRemote() {
      try {
        const res = await fetch("./data/db.json", { cache: "no-store" });
        if (!res.ok) return;
        const remote = await res.json();
        if (!remote || !remote.accounts) return;
        this.remoteReady = true;
        // Merge remote accounts into local (remote wins on newer updatedAt per user)
        for (const [user, acc] of Object.entries(remote.accounts)) {
          const local = this.db.accounts[user];
          if (!local) {
            this.db.accounts[user] = acc;
          } else {
            const lt = Date.parse(local.updatedAt || 0) || 0;
            const rt = Date.parse(acc.updatedAt || 0) || 0;
            if (rt >= lt) this.db.accounts[user] = this._mergeAccounts(local, acc);
            else this.db.accounts[user] = this._mergeAccounts(acc, local);
          }
        }
        // Merge leaderboard (keep top unique by username+difficulty)
        const board = [...(remote.leaderboard || []), ...(this.db.leaderboard || [])];
        this.db.leaderboard = this._dedupeLeaderboard(board);
        this._saveLocal();
      } catch (_) {
        this.remoteReady = false;
      }
    }

    _mergeAccounts(older, newer) {
      // Prefer newer progress fields but keep higher scores
      const out = {
        ...older,
        ...newer,
        progress: emptyProgress(),
      };
      const diffs = ["easy", "medium", "hard"];
      for (const d of diffs) {
        const a = (older.progress && older.progress[d]) || {};
        const b = (newer.progress && newer.progress[d]) || {};
        out.progress[d] = {
          highScore: Math.max(a.highScore || 0, b.highScore || 0),
          bestDistance: Math.max(a.bestDistance || 0, b.bestDistance || 0),
          bestCoins: Math.max(a.bestCoins || 0, b.bestCoins || 0),
        };
      }
      const op = older.progress || {};
      const np = newer.progress || {};
      out.progress.totalCoins = Math.max(op.totalCoins || 0, np.totalCoins || 0);
      out.progress.gamesPlayed = Math.max(op.gamesPlayed || 0, np.gamesPlayed || 0);
      out.progress.furthestEnv = this._furthestEnv(op.furthestEnv, np.furthestEnv);
      out.progress.lastDifficulty = np.lastDifficulty || op.lastDifficulty || "easy";
      out.passHash = newer.passHash || older.passHash;
      out.salt = newer.salt || older.salt;
      return out;
    }

    _furthestEnv(a, b) {
      const order = { desert: 0, city: 1, factory: 2 };
      const aa = order[a] ?? 0;
      const bb = order[b] ?? 0;
      return bb >= aa ? b || a || "desert" : a || "desert";
    }

    _dedupeLeaderboard(list) {
      const map = new Map();
      for (const row of list) {
        if (!row || !row.username) continue;
        const key = `${row.username}::${row.difficulty || "medium"}`;
        const prev = map.get(key);
        if (!prev || (row.score || 0) > (prev.score || 0)) map.set(key, row);
      }
      return [...map.values()]
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 50);
    }

    _restoreSession() {
      try {
        const u = localStorage.getItem(SESSION_KEY);
        if (u && this.db.accounts[u]) this.currentUser = u;
      } catch (_) { /* ignore */ }
    }

    _setSession(username) {
      this.currentUser = username;
      try {
        if (username) localStorage.setItem(SESSION_KEY, username);
        else localStorage.removeItem(SESSION_KEY);
      } catch (_) { /* ignore */ }
    }

    getAccount(username = this.currentUser) {
      if (!username) return null;
      return this.db.accounts[username] || null;
    }

    isLoggedIn() {
      return !!this.currentUser && !!this.db.accounts[this.currentUser];
    }

    async createAccount(username, password) {
      const user = String(username || "").trim().toLowerCase();
      if (!/^[a-z0-9_]{3,16}$/.test(user)) {
        throw new Error("Username: 3–16 chars, letters/numbers/_ only");
      }
      if (!password || String(password).length < 4) {
        throw new Error("Password must be at least 4 characters");
      }
      if (this.db.accounts[user]) throw new Error("Username already taken");

      const salt = crypto.getRandomValues(new Uint8Array(8))
        .reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
      const passHash = await sha256(`${salt}:${password}`);
      const now = new Date().toISOString();
      this.db.accounts[user] = {
        username: user,
        salt,
        passHash,
        createdAt: now,
        updatedAt: now,
        progress: emptyProgress(),
      };
      this._saveLocal();
      this._setSession(user);
      await this.syncToGithub();
      return this.db.accounts[user];
    }

    async login(username, password) {
      const user = String(username || "").trim().toLowerCase();
      const acc = this.db.accounts[user];
      if (!acc) throw new Error("Account not found");
      const passHash = await sha256(`${acc.salt}:${password}`);
      if (passHash !== acc.passHash) throw new Error("Wrong password");
      this._setSession(user);
      return acc;
    }

    logout() {
      this._setSession(null);
    }

    /**
     * Record a finished run for the logged-in account.
     */
    async recordRun({ score, distance, coins, difficulty, envId }) {
      if (!this.isLoggedIn()) return null;
      const acc = this.db.accounts[this.currentUser];
      const diff = difficulty || "medium";
      if (!acc.progress) acc.progress = emptyProgress();
      if (!acc.progress[diff]) {
        acc.progress[diff] = { highScore: 0, bestDistance: 0, bestCoins: 0 };
      }
      const bucket = acc.progress[diff];
      const isRecord = score > (bucket.highScore || 0);
      bucket.highScore = Math.max(bucket.highScore || 0, score);
      bucket.bestDistance = Math.max(bucket.bestDistance || 0, Math.floor(distance));
      bucket.bestCoins = Math.max(bucket.bestCoins || 0, coins);
      acc.progress.totalCoins = (acc.progress.totalCoins || 0) + coins;
      acc.progress.gamesPlayed = (acc.progress.gamesPlayed || 0) + 1;
      acc.progress.lastDifficulty = diff;
      acc.progress.furthestEnv = this._furthestEnv(acc.progress.furthestEnv, envId);
      acc.updatedAt = new Date().toISOString();

      this.db.leaderboard.push({
        username: acc.username,
        score: Math.floor(score),
        distance: Math.floor(distance),
        coins,
        difficulty: diff,
        at: acc.updatedAt,
      });
      this.db.leaderboard = this._dedupeLeaderboard(this.db.leaderboard);
      this._saveLocal();
      await this.syncToGithub();
      return { account: acc, isRecord };
    }

    getHighScore(difficulty = "medium", username = this.currentUser) {
      if (username && this.db.accounts[username]) {
        const p = this.db.accounts[username].progress;
        return (p && p[difficulty] && p[difficulty].highScore) || 0;
      }
      // Guest: fall back to legacy key + best on leaderboard for difficulty
      try {
        const legacy = parseInt(localStorage.getItem("robotRushHighScore") || "0", 10) || 0;
        const boardBest = this.db.leaderboard
          .filter((r) => (r.difficulty || "medium") === difficulty)
          .reduce((m, r) => Math.max(m, r.score || 0), 0);
        return Math.max(legacy, boardBest);
      } catch (_) {
        return 0;
      }
    }

    getLeaderboard(limit = 10) {
      return this.db.leaderboard.slice(0, limit);
    }

    setGithubToken(token) {
      this.config.githubToken = token || "";
      try {
        if (token) localStorage.setItem("robotRushGithubToken", token);
        else localStorage.removeItem("robotRushGithubToken");
      } catch (_) { /* ignore */ }
    }

    /**
     * Push local db.json to GitHub so it can be managed in the repo / Pages.
     * Requires a fine-grained PAT with Contents: Read & Write on this repo.
     */
    async syncToGithub() {
      const token = this.config.githubToken;
      if (!token) {
        this.lastError = null;
        return { ok: false, skipped: true };
      }
      const { repo, dbPath, branch } = this.config;
      const apiBase = `https://api.github.com/repos/${repo}/contents/${dbPath}`;
      try {
        // Get current file SHA
        let sha = null;
        const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (getRes.ok) {
          const meta = await getRes.json();
          sha = meta.sha;
        }

        // Public-safe payload (include hashes so cross-device login works)
        const payload = {
          version: this.db.version || 1,
          updatedAt: new Date().toISOString(),
          accounts: this.db.accounts,
          leaderboard: this.db.leaderboard.slice(0, 50),
        };
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
        const putRes = await fetch(apiBase, {
          method: "PUT",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `chore(db): sync player data (${this.currentUser || "system"})`,
            content,
            branch,
            sha: sha || undefined,
          }),
        });
        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({}));
          this.lastError = err.message || `GitHub sync failed (${putRes.status})`;
          return { ok: false, error: this.lastError };
        }
        this.lastError = null;
        return { ok: true };
      } catch (e) {
        this.lastError = e.message || "GitHub sync failed";
        return { ok: false, error: this.lastError };
      }
    }

    exportJson() {
      return JSON.stringify(this.db, null, 2);
    }

    importJson(text) {
      const parsed = JSON.parse(text);
      if (!parsed.accounts) throw new Error("Invalid database file");
      this.db = parsed;
      this._saveLocal();
    }
  }

  global.RobotRushAccountDB = AccountDatabase;
})(typeof window !== "undefined" ? window : globalThis);
