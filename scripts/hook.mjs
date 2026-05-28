#!/usr/bin/env node
// return space — cross-platform Claude Code hook.
//   node hook.mjs start   → every Nth task: ring the bowl + open the breathing companion
//   node hook.mjs stop    → if this was a breathing turn, ring the bowl ("come back")
// Opens only once every OPEN_EVERY prompts so quick tasks aren't interrupted.
// Stays silent on stdout so nothing leaks into the model context, and never blocks
// the hook (all players/openers are detached + unref'd).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const SOUND = join(ROOT, "sounds", "singing-bowl.mp3");
const PAGE = join(ROOT, "breathe.html");
const COUNTER = join(tmpdir(), "return-space.count");
const ACTIVE = join(tmpdir(), "return-space.active");
// Open the breathing companion once every N prompts (override with RETURN_SPACE_EVERY).
const OPEN_EVERY = Number(process.env.RETURN_SPACE_EVERY) || 8;

const mode = process.argv[2] || "stop";
const plat = process.platform;

// Try a list of [command, args] in order until one launches without an
// immediate error (e.g. the binary isn't installed on this machine).
function tryChain(candidates, i = 0) {
  if (i >= candidates.length) return;
  const [cmd, args] = candidates[i];
  let child;
  try {
    child = spawn(cmd, args, { stdio: "ignore", detached: true });
  } catch {
    return tryChain(candidates, i + 1);
  }
  child.on("error", () => tryChain(candidates, i + 1));
  child.unref();
}

function playSound() {
  if (!existsSync(SOUND)) return;
  if (plat === "darwin") {
    tryChain([["afplay", [SOUND]]]);
  } else if (plat === "win32") {
    const uri = SOUND.replace(/\\/g, "/");
    const ps =
      "Add-Type -AssemblyName presentationCore; " +
      "$p = New-Object System.Windows.Media.MediaPlayer; " +
      `$p.Open([uri]'${uri}'); $p.Play(); Start-Sleep -Seconds 11`;
    tryChain([["powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps]]]);
  } else {
    tryChain([
      ["ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", SOUND]],
      ["mpv", ["--no-video", "--really-quiet", SOUND]],
      ["mpg123", ["-q", SOUND]],
      ["cvlc", ["--play-and-exit", "--intf", "dummy", SOUND]],
      ["paplay", [SOUND]],
      ["aplay", ["-q", SOUND]],
    ]);
  }
}

function openPage() {
  if (!existsSync(PAGE)) return;
  if (plat === "darwin") {
    tryChain([["open", [PAGE]]]);
  } else if (plat === "win32") {
    tryChain([["cmd", ["/c", "start", "", PAGE]]]);
  } else {
    tryChain([["xdg-open", [PAGE]]]);
  }
}

if (mode === "start") {
  // Count prompts; only open on every Nth one so quick tasks aren't interrupted.
  let count = 0;
  try { count = parseInt(readFileSync(COUNTER, "utf8"), 10) || 0; } catch {}
  count += 1;
  if (count >= OPEN_EVERY) {
    try { writeFileSync(COUNTER, "0"); } catch {}
    try { writeFileSync(ACTIVE, "1"); } catch {}   // mark this turn as a breathing turn
    playSound();
    openPage();
  } else {
    try { writeFileSync(COUNTER, String(count)); } catch {}
    try { rmSync(ACTIVE, { force: true }); } catch {}
  }
} else {
  // stop: only ring the "come back" bowl if this turn opened the companion.
  if (existsSync(ACTIVE)) {
    try { rmSync(ACTIVE, { force: true }); } catch {}
    playSound();
  }
}
// No explicit exit: children are detached + unref'd, so the event loop drains
// and this process exits on its own while the sound keeps playing.
