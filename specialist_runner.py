#!/usr/bin/env python3
"""
gstack × AgentCall — specialist runner (v2, boardroom-inspired).

Thin Python supervisor around one AgentCall bridge. It appends JSON
commands to a per-specialist `.cmds` file which is streamed to the
bridge's stdin — on POSIX by the launch.sh scripts' process substitution
(`bridge.py < <(tail -n 0 -f <id>.cmds)`, exactly as before), and on
Windows by an in-process pump thread (Git Bash can't run that process
substitution — it hangs — so the bridge is spawned natively there).

Responsibilities
----------------
1. Spawn the bridge via scripts/launch.sh (audio) or launch-visual.sh
   (avatar) on POSIX, or directly as a Python subprocess with a stdin
   pump on Windows.
2. Tail the bridge's event file (<session_dir>/<id>.jsonl) and:
     • greet on first participant.joined or call.bot_ready
     • (LISTENER only) forward user.message events to the intelligence bus
       inbox, dropping echoes from other specialist bots.
     • on tts.error / call.ended, log + shut down.
3. Tail the intelligence-bus outbox file
   (/tmp/gstack-intelligence/outbox/<id>.jsonl) and turn each line into a
   tts.speak command appended to the bridge's cmds file.
4. On SIGTERM / SIGINT: append {"command":"leave"} to cmds, wait briefly
   for call.ended, then exit.

Only ONE runner per session should be flagged --listener. That runner is
the single source of user.message events pushed to the intelligence bus —
other bots hear the room via their own bridges but their transcripts are
ignored. This is the boardroom LISTENER pattern; it's how we avoid N-times
duplicate events and bot-to-bot feedback loops.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os


# Subprocess env hardening — we only pass the bridge what it needs, so
# unrelated dev secrets (AWS, GitHub, etc.) don't leak into vendored code.
_SAFE_ENV_KEYS = frozenset({
    # POSIX / cross-platform
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "PWD",
    "LANG", "LC_ALL", "LC_CTYPE", "TERM", "TZ",
    "PYTHONUNBUFFERED", "PYTHONPATH",
    "AGENTCALL_API_KEY", "AGENTCALL_API_URL",
    # Windows OS essentials — the interpreter needs these just to start, and
    # for TLS/socket, temp-dir, and home-dir (~/.agentcall) resolution.
    # These names don't exist on POSIX, so listing them is harmless there.
    "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT",
    "TEMP", "TMP", "APPDATA", "LOCALAPPDATA",
    "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "USERNAME",
    "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE",
})


def _safe_env() -> dict:
    return {k: v for k, v in os.environ.items() if k in _SAFE_ENV_KEYS}
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────────────
# Paths
# ──────────────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent
SCRIPTS_DIR = ROOT / "scripts"
LAUNCH_AUDIO  = SCRIPTS_DIR / "launch.sh"
LAUNCH_VISUAL = SCRIPTS_DIR / "launch-visual.sh"

# Intelligence bus — shared across all specialists in all sessions.
# Intelligence bus — per-user directory with mode 0700 so other users on a
# shared host cannot drop arbitrary lines into a specialist's outbox (which
# would be spoken in the meeting in the bot's voice). The plain
# /tmp/gstack-intelligence path is symlinked here for backwards compat.
import getpass as _getpass
def _bus_dir() -> Path:
    uid = os.getuid() if hasattr(os, "getuid") else 0
    # POSIX stays on "/tmp" exactly as before — docs, SKILL.md, and
    # bin/brain-status.sh all reference /tmp, and macOS's per-user $TMPDIR
    # could otherwise split the bus between the server (full env) and the
    # runner (whose scrubbed env may lack TMPDIR). Only Windows needs %TEMP%
    # (gettempdir): there a bare "/tmp" resolves against the current drive.
    base = Path(tempfile.gettempdir()) if os.name == "nt" else Path("/tmp")
    p = base / f"gstack-intelligence-{uid}"
    p.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        os.chmod(p, 0o700)
    except Exception:
        pass
    (p / "outbox").mkdir(parents=True, exist_ok=True, mode=0o700)
    # Back-compat symlink so old paths keep working for THIS user only.
    legacy = base / "gstack-intelligence"
    try:
        if not legacy.exists():
            legacy.symlink_to(p, target_is_directory=True)
    except Exception:
        pass
    return p

BUS_DIR = _bus_dir()
INBOX = BUS_DIR / "inbox.jsonl"
SPOKEN = BUS_DIR / "spoken.jsonl"   # recently-spoken bot TTS text (all bots), for echo dedup


def _norm_text(t: str) -> str:
    """Lowercase, keep alnum + spaces, collapse whitespace — for fuzzy echo
    matching between heard transcripts and spoken bot text."""
    return " ".join("".join(c for c in (t or "").lower() if c.isalnum() or c.isspace()).split())


def _record_spoken(text: str) -> None:
    """Append bot-spoken TTS text to the shared registry so the listener can
    drop it if STT echoes it back as a 'human' utterance (feedback D)."""
    text = (text or "").strip()
    if not text:
        return
    try:
        with open(SPOKEN, "a", buffering=1) as fh:
            fh.write(json.dumps({"ts": time.time(), "text": text}) + "\n")
    except Exception:
        pass


def _is_echo_of_bot(text: str, window_s: float = 30.0) -> bool:
    """True if `text` matches something a bot spoke in the last window — the
    bot's own TTS transcribed back and (mis)attributed to a human (feedback D).
    Length-guarded so short genuine human lines aren't dropped."""
    norm = _norm_text(text)
    if len(norm) < 8:
        return False
    cutoff = time.time() - window_s
    try:
        lines = SPOKEN.read_text(encoding="utf-8").splitlines()[-200:]
    except Exception:
        return False
    for line in reversed(lines):
        try:
            rec = json.loads(line)
        except Exception:
            continue
        if rec.get("ts", 0) < cutoff:
            break
        spoken = _norm_text(rec.get("text", ""))
        if not spoken:
            continue
        if norm in spoken or spoken in norm:
            return True
        # Containment alone misses the common case: STT rarely transcribes the
        # bot verbatim ("gstack" comes back as "GS TAC", "AIYC"), so a drifted
        # echo slips through and lands in the transcript as a human turn.
        # Fall back to a similarity ratio, but only on reasonably long lines
        # and at a high threshold, so genuine human speech is never dropped.
        if len(norm) >= 20 and difflib.SequenceMatcher(None, norm, spoken).ratio() >= 0.82:
            return True
    return False

# Cross-bot echo filter — display names of every known bot (self included).
# Listener runner drops user.message events where `speaker.name` matches any
# of these (case-insensitive). Sourced from data/specialists.json so adding
# a specialist there automatically propagates here. The "host bot" names
# (Claude/Juno/Codex) are added because those are the names a coding-agent
# bridge tends to use, regardless of whether they're in the specialist set.
def _load_specialist_names() -> set[str]:
    here = Path(__file__).resolve().parent
    json_path = here / "data" / "specialists.json"
    names: set[str] = {"Claude", "Juno", "Codex"}
    if json_path.is_file():
        try:
            for s in json.loads(json_path.read_text()):
                if "name" in s:
                    names.add(s["name"])
        except Exception:
            pass
    # Hardcoded fallback so a misplaced data dir never breaks the echo guard.
    names.update({
        "YC Office Hours", "CEO", "Eng Manager", "Senior Designer", "DX Lead",
        "Design Partner", "Design Explorer", "Design Engineer", "Staff Engineer",
        "Debugger", "Designer Who Codes", "DX Tester", "QA Lead", "CSO",
        "Release Engineer", "Deploy Engineer", "SRE", "Retro Facilitator",
    })
    return names

SPECIALIST_DISPLAY_NAMES = _load_specialist_names()


# Per-specialist opening questions — the listener (chair) opens the meeting by
# asking the room something in persona instead of everyone reciting a flat
# intro into silence. Sourced from data/specialists.json (opening_question).
def _load_opening_questions() -> dict[str, str]:
    here = Path(__file__).resolve().parent
    json_path = here / "data" / "specialists.json"
    out: dict[str, str] = {}
    if json_path.is_file():
        try:
            for s in json.loads(json_path.read_text()):
                q = (s.get("opening_question") or "").strip()
                if s.get("id") and q:
                    out[s["id"]] = q
        except Exception:
            pass
    return out

OPENING_QUESTIONS = _load_opening_questions()


# ──────────────────────────────────────────────────────────────────────────────
# Runner
# ──────────────────────────────────────────────────────────────────────────────

class Runner:
    def __init__(self, args):
        self.meet_url: str = args.meet_url
        self.spec_id:  str = args.specialist_id
        self.display_name: str = args.name
        self.role: str = args.role
        self.description: str = args.description
        self.voice: str = args.voice
        self.mode: str = (args.mode or "audio").lower()
        self.session_dir: Path = Path(args.session_dir).resolve()
        self.avatar_port: int = int(args.avatar_port or 0)
        self.is_listener: bool = bool(args.listener)
        self.brief: str = (args.brief or "").strip()[:500]

        self.session_dir.mkdir(parents=True, exist_ok=True)

        self.cmds_path:   Path = self.session_dir / f"{self.spec_id}.cmds"
        self.events_path: Path = self.session_dir / f"{self.spec_id}.jsonl"
        self.outbox_path: Path = BUS_DIR / "outbox" / f"{self.spec_id}.jsonl"

        # Touch files so the tail threads never race on stat.
        self.cmds_path.touch(exist_ok=True)
        self.events_path.touch(exist_ok=True)
        self.outbox_path.touch(exist_ok=True)

        # Append runner logs to the shared orchestrator log (same file
        # launch.sh uses so all correlated lines stay in one place).
        self.log_path: Path = self.session_dir / "orchestrator.log"
        self.log_fh = open(self.log_path, "a", buffering=1)

        self.greeted = False
        self.bot_ready = False
        self.seen_self_join = False
        self.shutting_down = False
        self.call_ended = False
        self.bridge_proc: subprocess.Popen | None = None
        # Cross-specialist speech lock: only one bot speaks at a time so
        # overlapping TTS doesn't garble the meeting.
        self.speech_lock_path: Path = BUS_DIR / "speaking.lock"
        self._holding_lock = False
        self._lock_acquired_ts: float = 0.0

    # ── logging ────────────────────────────────────────────────────────────
    def log(self, msg: str):
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{ts}] [{self.spec_id}] {msg}\n"
        try:
            self.log_fh.write(line)
        except Exception:
            pass
        try:
            sys.stderr.write(line)
            sys.stderr.flush()
        except Exception:
            pass

    # ── command append ─────────────────────────────────────────────────────
    def send_cmd(self, cmd: dict) -> None:
        """Append one JSON command line to the bridge's cmds file.

        The bridge receives appended lines immediately — via launch.sh's
        `tail -n 0 -f` process substitution on POSIX, or the runner's
        `_cmds_pump` thread on Windows. Thread-safe because we open
        append-only and each write is one line.
        """
        try:
            with open(self.cmds_path, "a", buffering=1) as fh:
                fh.write(json.dumps(cmd) + "\n")
            self.log(f"→ cmds: {cmd.get('command', '?')}")
        except Exception as e:
            self.log(f"cmd append failed: {e}")

    def _tts_speak_cmd(self, text: str, voice: str | None = None,
                       destination: str | None = None) -> dict:
        """Build a tts.speak command. Avatar mode no longer adds
        destination='meeting' by default — see below.

        History (kept because we've flipped this twice and need to stop):

          v1 — no default. Bridge auto-routes to webpage. Webpage's
                 AudioContext starts SUSPENDED in AgentCall's headless
                 Chrome (no user gesture). Audio queued but never plays.
                 USER HEARS NOTHING.
          v2 — default destination='meeting' to force the bridge to use
                 tts.generate with destination=meeting (skip webpage
                 entirely, inject audio straight into the meeting bus).
                 Worked at the time.
          v3 — CURRENT. avatar-page/agentcall-audio.js + index.html now
                 call ctx.resume() on load (the primeAudio IIFE), so the
                 webpage audio context is no longer suspended. With that
                 patch the plain webpage path WORKS. Meanwhile AgentCall
                 silently broke destination=meeting: tts.done fires but
                 no audio reaches the meeting (verified live across
                 multiple calls — every single message was inaudible
                 until we bypassed via plain tts.speak).

        So the audio-context resume patch + plain tts.speak is the
        reliable combination. Do NOT re-add the destination=meeting
        default unless you've verified BOTH that the resume patch is
        broken AND that AgentCall's destination=meeting routing is
        actually delivering audio again.

        Per-message overrides are still honored — a brain or test can
        pass destination='meeting' explicitly via the outbox if it ever
        becomes useful again.
        """
        # Record what we're about to say so the listener can drop it if STT
        # echoes it back as a 'human' utterance (echo-loop guard, feedback D).
        _record_spoken(text)
        cmd: dict = {
            "command": "tts.speak",
            "text": text,
            "voice": voice or self.voice,
        }
        if destination:
            cmd["destination"] = destination
        return cmd

    # ── greeting ───────────────────────────────────────────────────────────
    def greeting_text(self) -> str:
        """The LISTENER (chair — first specialist in the dispatch) opens the
        meeting by asking the room its persona question, so the conversation
        starts immediately instead of N bots reciting intros into silence.
        Everyone else says just their name — the chair holds the floor."""
        if not self.is_listener:
            who = self.display_name if self.display_name.lower() != self.role.lower() \
                else self.role
            return f"{who} here."

        brief_sentence = ""
        if self.brief:
            b = " ".join(self.brief.split())
            if len(b) > 80:
                b = b[:80].rstrip() + "…"
            brief_sentence = f"I've read the brief: {b}. "

        opener = OPENING_QUESTIONS.get(self.spec_id, "")
        if opener:
            return (
                f"Hi, I'm the {self.role} from gstack. {brief_sentence}{opener}"
            ).strip()

        # Fallback (no opening_question in data): the old full intro.
        desc = (self.description or "").rstrip()
        if desc and not desc.endswith((".", "!", "?")):
            desc += "."
        return (
            f"Hi, I'm the {self.role} from gstack. "
            f"{desc} {brief_sentence}Ready when you need me."
        ).strip()

    def greet_once(self, reason: str) -> None:
        if self.greeted or self.shutting_down:
            return
        self.greeted = True
        text = self.greeting_text()
        self.log(f"greeting ({reason}): {text!r}")
        # Serialize greetings through the cross-bot lock so multiple specialists
        # don't all greet at once and talk over each other (feedback A). Matches
        # the mid-call speak path; the lock releases on this greet's tts.done,
        # letting the next waiting bot greet in turn.
        self._acquire_speech_lock()
        self.send_cmd(self._tts_speak_cmd(text))

    # ── bridge spawn (native, cross-platform) ──────────────────────────────
    def _find_bridge_script(self) -> Path:
        """Locate the vendored AgentCall bridge for this mode.

        Same search order the old bash launchers used, but resolved in Python
        so there's no dependency on bash. Honors the BRIDGE_SCRIPT /
        BRIDGE_VISUAL_SCRIPT env overrides just like the launchers did.
        """
        if self.mode == "avatar":
            fname, override = "bridge-visual.py", os.environ.get("BRIDGE_VISUAL_SCRIPT")
        else:
            fname, override = "bridge.py", os.environ.get("BRIDGE_SCRIPT")
        home = Path.home()
        candidates = [
            ROOT / "vendor" / fname,   # our vendored, patched copy (preferred)
            home / ".claude" / "skills" / "join-meeting" / "scripts" / "python" / fname,
            home / ".claude" / "skills" / "agentcall" / "scripts" / "python" / fname,
            home / ".claude" / "plugins" / "marketplaces" / "agentcall" / "scripts" / "python" / fname,
            home / ".claude" / "plugins" / "cache" / "agentcall" / "join-meeting" / "1.0.0" / "scripts" / "python" / fname,
        ]
        if override:
            candidates.insert(0, Path(override))
        for p in candidates:
            if p and p.is_file():
                return p.resolve()
        raise RuntimeError(
            f"{fname} not found — set "
            f"{'BRIDGE_VISUAL_SCRIPT' if self.mode == 'avatar' else 'BRIDGE_SCRIPT'}"
        )

    def start_bridge(self) -> None:
        """Spawn the AgentCall bridge.

        POSIX: via the scripts/launch*.sh bash launchers, exactly as always
        (`bridge.py < <(tail -n 0 -f CMDS) &`).

        Windows: natively — Git Bash cannot run that process substitution
        (the launcher hangs on exit instead of returning in <1s, so the
        runner's timeout would kill the bridge before it connects). There
        the bridge is spawned as a direct child and a pump thread streams
        the .cmds file to its stdin.
        """
        if os.name == "nt":
            self._start_bridge_windows()
        else:
            self._start_bridge_posix()

    def _start_bridge_posix(self) -> None:
        if self.mode == "avatar":
            if not self.avatar_port:
                raise RuntimeError("--avatar-port required in avatar mode")
            script = LAUNCH_VISUAL
            cmd = [
                "bash", str(script),
                self.meet_url, self.spec_id, self.display_name,
                self.voice, str(self.session_dir), str(self.avatar_port),
            ]
        else:
            script = LAUNCH_AUDIO
            cmd = [
                "bash", str(script),
                self.meet_url, self.spec_id, self.display_name,
                self.voice, str(self.session_dir),
            ]

        if not script.exists():
            raise RuntimeError(f"launch script missing: {script}")

        self.log(f"spawning bridge via {script.name} mode={self.mode}")

        # IMPORTANT: do NOT capture bash's stdout via PIPE. launch.sh uses
        # `<(tail -n 0 -f CMDS)` process substitution, and the tail child
        # inherits the stdout fd of its parent shell. If we pipe bash's
        # stdout to Python, `communicate()` blocks until that fd closes —
        # but tail keeps it open for the bridge's lifetime, so we'd hang.
        # Route launch.sh output into orchestrator.log (same file
        # launch.sh itself redirects the bridge's stdio into) and wait on
        # the bash script with a short timeout.
        log_fh = open(self.session_dir / "orchestrator.log", "a")
        self.bridge_proc = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=log_fh,
            stderr=log_fh,
            text=True,
            env=_safe_env(),
        )
        try:
            rc = self.bridge_proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            # launch.sh should exit in <2s after spawning. If it doesn't,
            # something is wrong with the script itself.
            self.bridge_proc.kill()
            raise RuntimeError("launch.sh did not exit within 10s")
        finally:
            try:
                log_fh.close()
            except Exception:
                pass
        if rc != 0:
            raise RuntimeError(f"launcher exited rc={rc}")

    def _start_bridge_windows(self) -> None:
        if self.mode == "avatar" and not self.avatar_port:
            raise RuntimeError("--avatar-port required in avatar mode")

        bridge = self._find_bridge_script()

        cmd = [sys.executable, str(bridge), self.meet_url,
               "--name", self.display_name,
               "--voice", self.voice,
               "--vad-timeout", os.environ.get("VAD_TIMEOUT", "0.8"),
               "--output", str(self.events_path)]
        if self.mode == "avatar":
            cmd += ["--ui-port", str(self.avatar_port)]
            screenshare_port = os.environ.get("SCREENSHARE_PORT")
            if screenshare_port:
                cmd += ["--screenshare-port", screenshare_port]

        # Bridge stdout/stderr → orchestrator.log (same file the launchers
        # redirected into). Keep the handle on self so it isn't GC-closed
        # while the bridge is still writing.
        self._bridge_log_fh = open(self.session_dir / "orchestrator.log",
                                   "a", encoding="utf-8", errors="replace")
        # Same env hardening as the launcher path — never hand the vendored
        # bridge the full shell environment.
        env = _safe_env()
        env["PYTHONUNBUFFERED"] = "1"

        self.log(f"spawning bridge natively: {bridge.name} mode={self.mode}")
        self.bridge_proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=self._bridge_log_fh,
            stderr=self._bridge_log_fh,
            cwd=str(ROOT),
            env=env,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        # Parity with the launchers: record the bridge pid.
        try:
            with open(self.session_dir / "session.pid", "a", encoding="utf-8") as fh:
                fh.write(f"{self.bridge_proc.pid}\n")
        except Exception:
            pass

        # Feed appended .cmds lines to the bridge's stdin — the cross-platform
        # replacement for `< <(tail -n 0 -f CMDS)`.
        threading.Thread(target=self._cmds_pump, daemon=True).start()

        # Fail fast (and loudly) if the bridge dies on startup — the failure
        # class that used to be invisible on Windows.
        time.sleep(0.6)
        rc = self.bridge_proc.poll()
        if rc is not None:
            tail = ""
            try:
                tail = (self.session_dir / "orchestrator.log").read_text(
                    encoding="utf-8", errors="replace")[-1000:]
            except Exception:
                pass
            raise RuntimeError(f"bridge exited immediately rc={rc}\n{tail}".rstrip())
        self.log(f"bridge running pid={self.bridge_proc.pid}")

    def _cmds_pump(self) -> None:
        """Tail the .cmds file and forward new lines to the bridge's stdin.

        Cross-platform stand-in for `bridge < <(tail -n 0 -f CMDS)`. Seeks to
        end first so pre-existing lines don't re-fire (matches `tail -n 0`),
        and runs until the bridge process exits (so a `leave` written during
        shutdown is still delivered).
        """
        try:
            fh = open(self.cmds_path, "r", encoding="utf-8")
        except Exception as e:
            self.log(f"cmds pump open failed: {e}")
            return
        try:
            fh.seek(0, os.SEEK_END)
            proc = self.bridge_proc
            while proc and proc.poll() is None:
                line = fh.readline()
                if not line:
                    time.sleep(0.1)
                    continue
                if not line.endswith("\n"):
                    line += "\n"
                try:
                    proc.stdin.write(line)
                    proc.stdin.flush()
                except Exception as e:
                    self.log(f"cmds pump write failed: {e}")
                    break
        finally:
            try:
                fh.close()
            except Exception:
                pass

    # ── bridge-event tail ──────────────────────────────────────────────────
    def _events_tail(self) -> None:
        """Tail <session>/<id>.jsonl forever. Dispatches to handle_event.

        Opens the file and seeks to end-of-file (we only process events that
        land after we started — prior lines were from earlier runs).
        """
        try:
            fh = open(self.events_path, "r", encoding="utf-8")
            fh.seek(0, os.SEEK_END)
        except Exception as e:
            self.log(f"events tail open failed: {e}")
            return

        while not self.shutting_down:
            line = fh.readline()
            if not line:
                time.sleep(0.25)
                continue
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except Exception:
                self.log(f"non-json event: {line[:160]}")
                continue
            try:
                self.handle_event(event)
            except Exception as e:
                self.log(f"handle_event error: {e}")

        try:
            fh.close()
        except Exception:
            pass

    def handle_event(self, event: dict) -> None:
        kind = event.get("event") or event.get("type") or ""

        # Persist the cloud call_id the moment the bridge creates the call, so
        # /recall can END the AgentCall call itself. Killing local processes
        # does NOT evict the bot from the room (live-test feedback #1) — only
        # the AgentCall API does. recall reads <session_dir>/<spec_id>.callid.
        if kind == "call.created":
            cid = event.get("call_id")
            if cid:
                try:
                    (self.session_dir / f"{self.spec_id}.callid").write_text(str(cid))
                    self.log(f"call_id recorded: {cid}")
                except Exception as e:
                    self.log(f"call_id persist failed: {e}")
            return

        # Track when the bot is actually inside the meeting. Anything that
        # produces audio BEFORE this gets silently dropped by the AgentCall
        # server (no meeting audio context yet → tts.done with no playback).
        if kind == "call.bot_ready":
            self.bot_ready = True
            self.greet_once("call.bot_ready")
            return

        if kind == "greeting.prompt":
            # The skill-emitted prompt fires only after the bot is in the
            # meeting AND a participant has joined — so it's safe to greet.
            self.bot_ready = True
            self.greet_once("greeting.prompt")
            return

        if kind == "participant.joined":
            name = (event.get("name") or "").strip()
            if not self.seen_self_join and name and name.lower() == self.display_name.lower():
                self.seen_self_join = True
                return
            # Only greet on participant.joined if the bot has confirmed entry.
            # Otherwise the join event might be from the meeting roster being
            # snapshotted while we're still in the waiting room.
            if self.bot_ready:
                self.greet_once("participant.joined")
            return

        if kind == "user.message" and self.is_listener:
            self._forward_to_inbox(event)
            return

        if kind == "call.ended":
            self.log(f"call ended: reason={event.get('reason')}")
            self.call_ended = True
            self.shutting_down = True
            return

        if kind in ("tts.done", "tts.error", "tts.interrupted"):
            # Speech finished — release the cross-bot lock so others can talk.
            if kind == "tts.error":
                self.log(f"tts.error: {event.get('reason')}")
            self._release_speech_lock()
            return

    # ── listener → inbox forwarding ────────────────────────────────────────
    def _forward_to_inbox(self, event: dict) -> None:
        """Push user.message to the intelligence bus inbox, minus echoes."""
        speaker = ""
        sp = event.get("speaker")
        if isinstance(sp, dict):
            speaker = (sp.get("name") or "").strip()
        elif isinstance(sp, str):
            speaker = sp.strip()

        # Echo filter — any known specialist/host display name gets dropped.
        if speaker and speaker.lower() in {n.lower() for n in SPECIALIST_DISPLAY_NAMES}:
            return

        text = (event.get("text") or "").strip()
        if not text:
            return

        # Text-based echo guard: the bot's own TTS often gets transcribed back
        # and (mis)attributed to a human speaker — drop it (feedback D). The
        # speaker-name filter above misses this because STT picks a human name.
        if _is_echo_of_bot(text):
            self.log(f"dropped echo (bot TTS): {text[:80]!r}")
            return

        entry = {
            "ts":            time.time(),
            "specialist_id": self.spec_id,
            "name":          self.display_name,
            "role":          self.role,
            "description":   self.description,
            "brief":         self.brief,
            "speaker":       speaker,
            "text":          text,
        }
        try:
            with open(INBOX, "a", buffering=1) as fh:
                fh.write(json.dumps(entry) + "\n")
            self.log(f"→ inbox [{speaker}]: {text[:80]!r}")
        except Exception as e:
            self.log(f"inbox write failed: {e}")

    # ── shared speech lock ────────────────────────────────────────────────
    # Cross-bot lock so only one specialist talks at a time. Lock file format:
    #   "<pid> <acquire-ts>"
    # Self-healing: any holder past TTS_MAX_HOLD seconds, or whose PID is
    # dead, is stolen by the next acquirer. A per-runner watchdog also
    # force-releases its own lock if held past TTS_MAX_HOLD without a
    # tts.done event arriving — defense against stuck locks if the bridge
    # crashes mid-TTS.
    TTS_MAX_HOLD: float = 12.0

    def _acquire_speech_lock(self, max_wait: float = 12.0) -> bool:
        """Wait until the cross-bot lock is free, then claim it."""
        deadline = time.time() + max_wait
        while time.time() < deadline:
            if not self.speech_lock_path.exists():
                break
            try:
                contents = self.speech_lock_path.read_text(encoding="utf-8").strip().split()
                pid = int(contents[0])
                ts = float(contents[1]) if len(contents) > 1 else 0.0
                stale_age = time.time() - ts
                # Holder dead OR stale OR it's us already → break and re-claim.
                if (stale_age > self.TTS_MAX_HOLD
                        or not self._pid_alive(pid)
                        or pid == os.getpid()):
                    break
            except Exception:
                break  # corrupt lock → steal
            time.sleep(0.1)
        try:
            self.speech_lock_path.write_text(f"{os.getpid()} {time.time()}\n",
                                             encoding="utf-8")
            self._holding_lock = True
            self._lock_acquired_ts = time.time()
            return True
        except Exception as e:
            self.log(f"lock write failed: {e}")
            return False

    def _release_speech_lock(self) -> None:
        if not self._holding_lock:
            return
        self._holding_lock = False
        try:
            # Only remove if it's still ours.
            contents = self.speech_lock_path.read_text(encoding="utf-8").strip().split()
            if contents and int(contents[0]) == os.getpid():
                self.speech_lock_path.unlink(missing_ok=True)
        except Exception:
            pass

    def _speech_lock_watchdog(self) -> None:
        """Force-release the lock if we've been holding it past the budget.

        Defends against a stuck lock if the bridge never emits tts.done
        (crash, hang, or the AgentCall server dropping the response).
        Polls cheaply every 1s.
        """
        while not self.shutting_down:
            try:
                if self._holding_lock:
                    held_for = time.time() - getattr(self, "_lock_acquired_ts", 0)
                    if held_for > self.TTS_MAX_HOLD:
                        self.log(f"watchdog: force-releasing stale lock held {held_for:.1f}s")
                        self._release_speech_lock()
            except Exception:
                pass
            time.sleep(1.0)

    @staticmethod
    def _pid_alive(pid: int) -> bool:
        if os.name == "nt":
            # os.kill(pid, 0) on Windows calls TerminateProcess — it would
            # KILL the process we're only trying to probe. Query the handle.
            try:
                pid = int(pid)
            except Exception:
                return False
            if pid <= 0:
                return False
            import ctypes
            from ctypes import wintypes
            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            STILL_ACTIVE = 259
            k = ctypes.windll.kernel32
            k.OpenProcess.restype = wintypes.HANDLE
            k.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
            h = k.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
            if not h:
                return False
            try:
                code = wintypes.DWORD()
                if not k.GetExitCodeProcess(h, ctypes.byref(code)):
                    return False
                return code.value == STILL_ACTIVE
            finally:
                k.CloseHandle(h)
        try:
            os.kill(pid, 0)
            return True
        except (ProcessLookupError, PermissionError, OSError):
            return False

    # ── outbox tail → tts.speak / send_chat / screenshare ─────────────────
    def _outbox_tail(self) -> None:
        """Claude session writes reply JSON lines; runner forwards them.

        The outbox is a JSONL command stream. Three command shapes:

          {"text": "..."}                   → tts.speak (default)
          {"text": "...",
           "also_chat": true}               → tts.speak + meeting.send_chat
                                              (workaround for sessions where
                                              AgentCall's TTS-to-WebRTC audio
                                              injection is silent but chat
                                              still reaches the room — every
                                              spoken line is mirrored into
                                              the meeting chat panel)
          {"action": "send_chat",
           "message": "..."}                → meeting.send_chat
          {"action": "screenshare.start",
           "url": "https://..."}            → bridge-visual screenshare URL
          {"action": "screenshare.start",
           "port": 3001}                    → bridge-visual screenshare port
          {"action": "screenshare.stop"}    → bridge-visual screenshare off
        """
        try:
            fh = open(self.outbox_path, "r", encoding="utf-8")
            fh.seek(0, os.SEEK_END)
        except Exception as e:
            self.log(f"outbox open failed: {e}")
            return

        while not self.shutting_down:
            line = fh.readline()
            if not line:
                time.sleep(0.25)
                continue
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except Exception:
                self.log(f"outbox non-json: {line[:160]}")
                continue

            action = (msg.get("action") or "").strip()

            # --- screenshare control (bridge-visual mode only) ---
            if action == "screenshare.start":
                if self.mode != "avatar":
                    self.log("screenshare.start ignored: not avatar mode")
                    continue
                cmd = {"command": "screenshare.start"}
                if msg.get("url"):
                    cmd["url"] = msg["url"]
                elif msg.get("port"):
                    cmd["port"] = int(msg["port"])
                else:
                    self.log("screenshare.start: need url or port")
                    continue
                self.log(f"← outbox: screenshare.start {cmd.get('url') or cmd.get('port')}")
                self.send_cmd(cmd)
                continue
            if action == "screenshare.stop":
                self.log("← outbox: screenshare.stop")
                self.send_cmd({"command": "screenshare.stop"})
                continue

            # --- chat (no speech lock; chat doesn't collide) ---
            if action == "send_chat":
                chat = (msg.get("message") or "").strip()
                if not chat:
                    continue
                self.log(f"← outbox: send_chat {chat[:60]!r}")
                self.send_cmd({"command": "send_chat", "message": chat})
                continue

            # --- default: tts.speak ---
            text = (msg.get("text") or "").strip()
            if not text:
                continue
            voice = msg.get("voice") or self.voice
            # Honor an outbox-supplied destination (lets a brain force
            # webpage-only audio for testing); otherwise _tts_speak_cmd
            # picks the right default for the bridge mode.
            destination = msg.get("destination")
            # Wait for the room to be quiet before speaking.
            self._acquire_speech_lock()
            self.log(f"← outbox: {text[:80]!r}")
            self.send_cmd(self._tts_speak_cmd(text, voice=voice,
                                              destination=destination))
            # Optional chat mirror — useful when AgentCall's TTS-to-WebRTC
            # audio path silently drops audio (tts.done fires but no one
            # hears anything). Chat goes through a different API path that
            # is empirically reliable, so the spoken content still reaches
            # the room as readable text. Brain opts in per-message.
            if msg.get("also_chat"):
                self.log(f"← outbox: also_chat mirror {text[:60]!r}")
                self.send_cmd({"command": "send_chat", "message": text})

    # ── main ───────────────────────────────────────────────────────────────
    def install_signal_handlers(self) -> None:
        def handler(signum, _frame):
            self.log(f"caught signal {signum}")
            self.shutdown(from_signal=True)
            os._exit(0)
        signal.signal(signal.SIGTERM, handler)
        signal.signal(signal.SIGINT, handler)

    def run(self) -> int:
        self.log(
            f"runner starting id={self.spec_id} name={self.display_name!r} "
            f"role={self.role!r} mode={self.mode} listener={self.is_listener} "
            f"session={self.session_dir}"
        )
        self.install_signal_handlers()

        try:
            self.start_bridge()
        except Exception as e:
            self.log(f"bridge spawn failed: {e}")
            return 2

        # Background tails for bridge events and intelligence outbox.
        threading.Thread(target=self._events_tail, daemon=True).start()
        threading.Thread(target=self._outbox_tail, daemon=True).start()
        threading.Thread(target=self._speech_lock_watchdog, daemon=True).start()

        # Fallback greeting — only fires if bot reached the meeting but no
        # greeting.prompt arrived. NEVER fires while the bot is still in
        # the waiting room: tts before bot_ready is dropped silently by the
        # AgentCall server, so firing early just wastes the greeting.
        def delayed_greet():
            for _ in range(120):  # poll up to 4 minutes
                time.sleep(2)
                if self.shutting_down or self.greeted:
                    return
                if self.bot_ready:
                    # Bot is in. Wait one more beat to give the natural
                    # greeting.prompt a chance to fire first.
                    time.sleep(3)
                    if not self.greeted and not self.shutting_down:
                        self.greet_once("timeout-fallback")
                    return
        threading.Thread(target=delayed_greet, daemon=True).start()

        # Idle loop — tails are threaded, signals drive shutdown. We just
        # park here until call ends or we're signalled.
        try:
            while not self.shutting_down:
                time.sleep(0.5)
        except KeyboardInterrupt:
            self.shutdown(from_signal=True)

        # If call ended naturally (not signalled), do polite cleanup but
        # don't double-send leave.
        if not self.call_ended:
            self.shutdown(from_signal=False)

        self.log(f"runner exiting (call_ended={self.call_ended})")
        return 0

    # ── shutdown ───────────────────────────────────────────────────────────
    def shutdown(self, from_signal: bool) -> None:
        if self.shutting_down and not from_signal:
            return
        self.shutting_down = True
        self.log(f"shutdown from_signal={from_signal}")
        try:
            if not self.call_ended:
                self.send_cmd({"command": "leave"})
                # Give bridge a moment to process leave + emit call.ended.
                time.sleep(2)
        except Exception as e:
            self.log(f"leave append failed: {e}")

        # Windows only: the runner owns the bridge process (native spawn), so
        # reap it here instead of leaving an orphan that keeps the bot in the
        # meeting until AgentCall's alone-timeout. On POSIX bridge_proc is the
        # long-exited launch.sh, and the bridge exits on its own after
        # processing `leave` — exactly as before.
        proc = self.bridge_proc
        if os.name == "nt" and proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--meet-url",      required=True)
    p.add_argument("--specialist-id", required=True)
    p.add_argument("--name",          required=True)
    p.add_argument("--role",          required=True)
    p.add_argument("--description",   required=True)
    p.add_argument("--voice",         default="af_heart")
    p.add_argument("--mode",          choices=("audio", "avatar"), default="avatar")
    p.add_argument("--session-dir",   required=True,
                   help="per-dispatch dir; holds <id>.cmds, <id>.jsonl, session.pid, orchestrator.log")
    p.add_argument("--avatar-port", type=int, default=0,
                   help="avatar-mode only — local port serving the avatar page")
    p.add_argument("--listener", action="store_true",
                   help="forward this bridge's user.message events to the intelligence-bus inbox")
    p.add_argument("--brief", default="",
                   help="optional free-text brief referenced in the greeting")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    return Runner(args).run()


if __name__ == "__main__":
    sys.exit(main())
