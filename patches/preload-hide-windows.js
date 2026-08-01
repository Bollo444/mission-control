// Force windowsHide:true on all child_process spawns on Windows.
// Load via NODE_OPTIONS="--require ...patches/preload-hide-windows.js"
const cp = require("node:child_process");
const isWin = process.platform === "win32";
if (!isWin) return;
const origExecFileSync = cp.execFileSync;
cp.execFileSync = function (...args) {
  const opts = args.find((a) => a && typeof a === "object");
  if (opts && opts.windowsHide === undefined) opts.windowsHide = true;
  return origExecFileSync.apply(this, args);
};
const origExecSync = cp.execSync;
cp.execSync = function (...args) {
  const opts = args.find((a) => a && typeof a === "object");
  if (opts && opts.windowsHide === undefined) opts.windowsHide = true;
  return origExecSync.apply(this, args);
};
