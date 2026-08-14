/* Antigravity — Mission Control panels inside VS Code.
 *
 * Each activity-bar view is a tree fed by Mission Control's API, reached
 * through the IDE proxy's /mc-api bridge (same origin → no CORS/cookies).
 * The vault view opens real files on disk (the extension host runs on the
 * same machine), so editing + saving is native VS Code.
 */

const vscode = require("vscode");

// The proxy serves MC's API at /mc-api/* on the IDE's origin. The Node
// extension host can't see window.location, so default to the loopback
// proxy port — identical for tunnel users (the tunnel lands on the same
// local proxy).
const MC_BASE =
  (typeof process !== "undefined" &&
    process.env.MC_API_BASE) ||
  "http://127.0.0.1:4320";

async function mc(path, init) {
  const res = await fetch(`${MC_BASE}/mc-api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init && init.headers) },
  });
  if (!res.ok) throw new Error(`MC ${path} → ${res.status}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Tree item model                                                     */
/* ------------------------------------------------------------------ */

class Item extends vscode.TreeItem {
  constructor(label, kind, extra = {}) {
    super(label, kind === "dir" ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.kind = kind;
    Object.assign(this, extra);
    if (extra.command) this.command = extra.command;
  }
}

/* ------------------------------------------------------------------ */
/* Vault tree — files from /api/vault, opens real files on disk        */
/* ------------------------------------------------------------------ */

class VaultProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.nodes = [];
    this.vaultDir = "";
  }
  async refresh() {
    try {
      const [v, m] = await Promise.all([mc("/vault"), mc("/memory")]);
      this.nodes = v.tree ?? [];
      this.vaultDir = m.vaultDir ?? "";
    } catch {
      this.nodes = [];
      this.vaultDir = "";
    }
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(el) {
    return el;
  }
  async getChildren(el) {
    if (!el) {
      if (!this.nodes.length) await this.refresh();
      const top = new Set(this.nodes.map((n) => n.path.split("/")[0]));
      return [...top]
        .sort()
        .map((d) => new Item(d, "dir", { collapsibleState: vscode.TreeItemCollapsibleState.Collapsed, contextValue: "dir" }));
    }
    const prefix = el.label + "/";
    const kids = this.nodes.filter((n) => n.path.startsWith(prefix) && !n.path.slice(prefix.length).includes("/"));
    return kids.map((n) => {
      if (n.dir) return new Item(n.name, "dir", { contextValue: "dir" });
      return new Item(n.name, "file", {
        contextValue: "file",
        description: n.path,
        tooltip: `${n.path}\n${this.vaultDir}\\${n.path}`,
        command: { command: "mc.openFile", title: "Open", arguments: [n.path] },
      });
    });
  }
}

/* ------------------------------------------------------------------ */
/* Agents — fleet from /api/system                                     */
/* ------------------------------------------------------------------ */

class AgentsProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.agents = [];
  }
  async refresh() {
    try {
      const s = await mc("/system");
      this.agents = s.fleet?.agents ?? [];
    } catch {
      this.agents = [];
    }
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(el) {
    return el;
  }
  async getChildren(el) {
    if (el) return [];
    if (!this.agents.length) await this.refresh();
    return this.agents.map(
      (a) =>
        new Item(`${a.state === "ready" ? "●" : "○"} ${a.name}`, "agent", {
          contextValue: "agent",
          description: a.state,
          tooltip: `${a.name} · ${a.state} · ${a.sessions} sessions`,
          command: { command: "mc.launchAgent", title: "Launch", arguments: [a] },
        })
    );
  }
}

/* ------------------------------------------------------------------ */
/* Repos — from /api/repos                                             */
/* ------------------------------------------------------------------ */

class ReposProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.repos = [];
  }
  async refresh() {
    try {
      const r = await mc("/repos");
      this.repos = r.repos ?? [];
    } catch {
      this.repos = [];
    }
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(el) {
    return el;
  }
  async getChildren(el) {
    if (el) return [];
    if (!this.repos.length) await this.refresh();
    return this.repos.map(
      (r) =>
        new Item(`${r.valid ? (r.dirty ? "⬡" : "⎇") : "⊟"} ${r.name}`, "repo", {
          contextValue: "repo",
          description: r.branch || "",
          tooltip: `${r.path}\n${r.valid ? `branch ${r.branch}` : "invalid"}`,
        })
    );
  }
}

/* ------------------------------------------------------------------ */
/* Health — from /api/healer + /api/learning                           */
/* ------------------------------------------------------------------ */

class HealthProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.checks = [];
    this.allOk = true;
    this.insights = [];
  }
  async refresh() {
    try {
      const [h, l] = await Promise.all([mc("/healer"), mc("/learning")]);
      this.checks = h.checks ?? [];
      this.allOk = h.allOk ?? true;
      this.insights = (l.insights ?? []).slice(0, 10);
    } catch {
      this.checks = [];
      this.allOk = true;
      this.insights = [];
    }
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(el) {
    return el;
  }
  async getChildren(el) {
    if (el) return [];
    if (!this.checks.length && !this.insights.length) await this.refresh();
    const out = [];
    if (this.checks.length) {
      const head = new Item(`◉ ${this.allOk ? "All healthy" : "Issues found"}`, "group");
      head.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      const kids = this.checks.map(
        (c) =>
          new Item(`${c.ok ? "●" : "○"} ${c.name}`, "check", {
            description: c.ok ? "ok" : "⚠",
            tooltip: c.detail,
          })
      );
      out.push({ head, kids });
    }
    if (this.insights.length) {
      const head2 = new Item("◈ Learning insights", "group");
      head2.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      const kids2 = this.insights.map(
        (i) =>
          new Item(i.label, "insight", {
            description: i.type,
            tooltip: i.detail,
          })
      );
      out.push({ head2, kids2 });
    }
    return out.flatMap((g) => [g.head, ...g.kids]);
  }
}

/* ------------------------------------------------------------------ */
/* Activity — from /api/memory                                         */
/* ------------------------------------------------------------------ */

class ActivityProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.activity = [];
  }
  async refresh() {
    try {
      const m = await mc("/memory");
      this.activity = m.activity ?? [];
    } catch {
      this.activity = [];
    }
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(el) {
    return el;
  }
  async getChildren(el) {
    if (el) return [];
    if (!this.activity.length) await this.refresh();
    return this.activity.slice(0, 60).map(
      (e) =>
        new Item(`↻ ${e.agentName}`, "activity", {
          description: new Date(e.ts).toLocaleTimeString(),
          tooltip: `${e.action}${e.detail ? " · " + e.detail : ""}`,
        })
    );
  }
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

async function openVaultFile(path) {
  try {
    const m = await mc("/memory");
    const dir = m.vaultDir;
    const uri = vscode.Uri.file(`${dir}\\${path}`);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  } catch (e) {
    vscode.window.showErrorMessage(`Could not open vault file: ${e.message}`);
  }
}

async function launchAgent(a) {
  try {
    await mc(`/launch`, {
      method: "POST",
      body: JSON.stringify({ id: a.id, action: "launch" }),
    });
    vscode.window.showInformationMessage(`Launched ${a.name}`);
  } catch (e) {
    vscode.window.showErrorMessage(`Launch failed: ${e.message}`);
  }
}

async function cloneRepo() {
  const url = await vscode.window.showInputBox({
    prompt: "git clone URL",
    placeHolder: "https://github.com/user/repo.git",
  });
  if (!url) return;
  try {
    await mc(`/repos`, { method: "POST", body: JSON.stringify({ url }) });
    vscode.window.showInformationMessage(`Cloned ${url}`);
  } catch (e) {
    vscode.window.showErrorMessage(`Clone failed: ${e.message}`);
  }
}

async function dispatchAgent(repo) {
  const agentId = await vscode.window.showQuickPick(
    ["hermes", "claude", "pi", "cline", "openclaw", "jcode", "vibe", "codex", "sentinel", "antigravity"],
    { placeHolder: "Pick an agent to dispatch" }
  );
  if (!agentId) return;
  const task = await vscode.window.showInputBox({
    prompt: `Task for ${agentId} in ${repo.name}`,
    placeHolder: "Describe the task…",
  });
  if (!task) return;
  try {
    const r = await mc("/repos");
    const full = (r.repos ?? []).find((x) => x.name === repo.name);
    await mc("/subagents", {
      method: "POST",
      body: JSON.stringify({ agentId, task: `In the repository at ${full?.path}, ${task}` }),
    });
    vscode.window.showInformationMessage(`Dispatched ${agentId} on ${repo.name}`);
  } catch (e) {
    vscode.window.showErrorMessage(`Dispatch failed: ${e.message}`);
  }
}

async function healthCheck() {
  try {
    const h = await mc("/healer");
    vscode.window.showInformationMessage(
      h.allOk ? "All systems healthy ✓" : `Issues found: ${h.checks.filter((c) => !c.ok).length}`
    );
  } catch (e) {
    vscode.window.showErrorMessage(`Health check failed: ${e.message}`);
  }
}

async function autoRepair() {
  try {
    const h = await mc("/healer", {
      method: "POST",
      body: JSON.stringify({ action: "repair" }),
    });
    const n = (h.repairs ?? []).length;
    vscode.window.showInformationMessage(
      n ? `Auto-repair ran ${n} fix(es)` : "Nothing needed repair"
    );
  } catch (e) {
    vscode.window.showErrorMessage(`Repair failed: ${e.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* Activation                                                          */
/* ------------------------------------------------------------------ */

async function activate(context) {
  const vault = new VaultProvider();
  const agents = new AgentsProvider();
  const repos = new ReposProvider();
  const health = new HealthProvider();
  const activity = new ActivityProvider();

  vscode.window.createTreeView("mcVault", { treeDataProvider: vault, showCollapseAll: true });
  vscode.window.createTreeView("mcAgents", { treeDataProvider: agents, showCollapseAll: true });
  vscode.window.createTreeView("mcRepos", { treeDataProvider: repos, showCollapseAll: true });
  vscode.window.createTreeView("mcHealth", { treeDataProvider: health, showCollapseAll: true });
  vscode.window.createTreeView("mcActivity", { treeDataProvider: activity, showCollapseAll: true });

  const regs = [
    vscode.commands.registerCommand("mc.refreshAll", () => {
      void vault.refresh();
      void agents.refresh();
      void repos.refresh();
      void health.refresh();
      void activity.refresh();
    }),
    vscode.commands.registerCommand("mc.openFile", (p) => void openVaultFile(p)),
    vscode.commands.registerCommand("mc.launchAgent", (a) => void launchAgent(a)),
    vscode.commands.registerCommand("mc.cloneRepo", () => void cloneRepo()),
    vscode.commands.registerCommand("mc.dispatchAgent", (r) => void dispatchAgent(r)),
    vscode.commands.registerCommand("mc.healthCheck", () => void healthCheck()),
    vscode.commands.registerCommand("mc.autoRepair", () => void autoRepair()),
    vscode.commands.registerCommand("mc.openTerminal", () => {
      vscode.commands.executeCommand("workbench.action.terminal.new");
    }),
  ];
  context.subscriptions.push(...regs);

  // Warm the panels once on load.
  void vault.refresh();
  void agents.refresh();
  void repos.refresh();
  void health.refresh();
  void activity.refresh();

  vscode.window.setStatusBarMessage("Antigravity · Mission Control panels loaded", 4000);
}

function deactivate() {}

module.exports = { activate, deactivate };
