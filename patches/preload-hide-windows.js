// Force windowsHide:true on child_process spawns on Windows.
// Load via NODE_OPTIONS="--require ...patches/preload-hide-windows.js"
//
// OmniRoute's CLI (bin/omniroute.mjs) re-spawns the real server
// (dist/server-ws.mjs) with child_process.spawn() but does NOT pass
// windowsHide. Because pm2 starts the CLI with no console, Windows then
// allocates the server child a brand-new VISIBLE console window at every
// login. This preload monkey-patches the child_process entry points so every
// child inherits a hidden window on win32.
const cp = require("node:child_process");
const isWin = process.platform === "win32";
if (!isWin) return;

function hide(opts) {
  if (opts && typeof opts === "object" && opts.windowsHide === undefined) {
    opts.windowsHide = true;
  }
}

// spawn(command[, args][, options]) — args is an array when present.
const origSpawn = cp.spawn;
cp.spawn = function (command, args, options) {
  let opts;
  if (Array.isArray(args)) {
    opts = options;
  } else {
    opts = args && typeof args === "object" ? args : options;
    if (!Array.isArray(args)) args = [];
  }
  hide(opts);
  return origSpawn.call(this, command, args, opts);
};

// spawnSync has the same signature as spawn.
const origSpawnSync = cp.spawnSync;
cp.spawnSync = function (command, args, options) {
  let opts;
  if (Array.isArray(args)) {
    opts = options;
  } else {
    opts = args && typeof args === "object" ? args : options;
    if (!Array.isArray(args)) args = [];
  }
  hide(opts);
  return origSpawnSync.call(this, command, args, opts);
};

// exec/execFile sync variants: options is the trailing non-array object
// (skip arrays so an args list is never mistaken for options).
function lastObjectArg(args) {
  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i];
    if (a && typeof a === "object" && !Array.isArray(a)) return a;
  }
  return null;
}

const origExecSync = cp.execSync;
cp.execSync = function (...args) {
  hide(lastObjectArg(args));
  return origExecSync.apply(this, args);
};

const origExecFileSync = cp.execFileSync;
cp.execFileSync = function (...args) {
  hide(lastObjectArg(args));
  return origExecFileSync.apply(this, args);
};
