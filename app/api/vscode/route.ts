import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The token file both the VS Code server (--connection-token-file) and this
 *  route read from, so the iframe URL can present the same secret the server
 *  validates. Lives outside the repo (user config dir), like settings.json. */
const TOKEN_FILE = path.join(os.homedir(), ".mission-control", "vscode-token");

export function GET() {
  let token = "";
  try {
    token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    /* no token yet — IDE not provisioned */
  }
  return NextResponse.json({
    up: Boolean(token),
    token,
    localOrigin: "http://127.0.0.1:4320",
    remoteOrigin: "https://ide.decouvertquatrieme.online",
  });
}
