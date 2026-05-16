#!/usr/bin/env python3
"""
pstudio-cli.py  —  Push prompts / skills into Prompt Studio from any agent or shell.

Usage examples
--------------
# Push a skill prompt
python pstudio-cli.py push --type skill --title "My Skill" --prompt "You are a helpful assistant…"

# Push an image prompt (with tags and model)
python pstudio-cli.py push --type image --project "游戏角色" --title "赛博武士" \
    --prompt "A cyberpunk samurai, neon lights…" --model "GPT Image 2" --tags "游戏,角色"

# Read prompt from stdin (pipe-friendly)
echo "Describe the scene in vivid detail…" | python pstudio-cli.py push --type image --title "Scene"

# List projects
python pstudio-cli.py projects

# MCP / JSON mode (agent-friendly, one JSON object per call)
python pstudio-cli.py push --json '{"type":"skill","title":"T","prompt":"P…"}'

Environment
-----------
PSTUDIO_PORT   override server port (default 8767)
PSTUDIO_PROJECT  default project name
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error

BASE_URL = f"http://localhost:{os.environ.get('PSTUDIO_PORT', '8767')}"


def _post(path: str, data: dict) -> dict:
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        BASE_URL + path,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            return json.loads(body)
        except Exception:
            return {"ok": False, "error": body}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _get(path: str) -> dict:
    try:
        with urllib.request.urlopen(BASE_URL + path, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"ok": False, "error": str(e)}


def cmd_push(args):
    # Resolve payload from --json flag or individual flags
    if args.json:
        try:
            payload = json.loads(args.json)
        except json.JSONDecodeError as e:
            print(f"Error: invalid JSON — {e}", file=sys.stderr)
            sys.exit(1)
    else:
        prompt = args.prompt
        if not prompt:
            if not sys.stdin.isatty():
                prompt = sys.stdin.read().strip()
            if not prompt:
                print("Error: --prompt is required (or pipe text via stdin)", file=sys.stderr)
                sys.exit(1)

        payload = {
            "type":         args.type,
            "title":        args.title or "",
            "prompt":       prompt,
            "model":        args.model or "",
            "tags":         [t.strip() for t in (args.tags or "").split(",") if t.strip()],
            "aspect":       args.aspect or "",
            "analysis":     args.analysis or "",
        }

    # Project resolution: CLI flag > env var > first project
    project_name = (getattr(args, "project", None) or
                    os.environ.get("PSTUDIO_PROJECT") or
                    payload.get("project_name") or "")
    if project_name:
        payload["project_name"] = project_name

    result = _post("/api/cli/push", payload)

    if result.get("ok"):
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(f"Error: {result.get('error', result)}", file=sys.stderr)
        sys.exit(1)


def cmd_projects(_args):
    result = _get("/api/cli/projects")
    if result.get("ok"):
        for p in result.get("projects", []):
            print(f"{p['id']}  {p['name']}")
    else:
        print(f"Error: {result.get('error', result)}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        prog="pstudio-cli",
        description="Push prompts into Prompt Studio from any agent or shell.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # ── push ──────────────────────────────────────────────────────────────
    p_push = sub.add_parser("push", help="Push a prompt / skill into Prompt Studio")
    p_push.add_argument("--type",     default="skill",
                        choices=["image", "video", "skill"],
                        help="Prompt type (default: skill)")
    p_push.add_argument("--project",  help="Project name (created if not exists)")
    p_push.add_argument("--title",    help="Prompt title")
    p_push.add_argument("--prompt",   help="Prompt text (omit to read from stdin)")
    p_push.add_argument("--model",    help="Model name, e.g. 'GPT Image 2'")
    p_push.add_argument("--tags",     help="Comma-separated tags, e.g. 'game,npc'")
    p_push.add_argument("--aspect",   help="Aspect ratio, e.g. '16:9' (image only)")
    p_push.add_argument("--analysis", help="Analysis / notes")
    p_push.add_argument("--json",     metavar="JSON",
                        help="Pass all fields as a single JSON object instead of flags")
    p_push.set_defaults(func=cmd_push)

    # ── projects ──────────────────────────────────────────────────────────
    p_proj = sub.add_parser("projects", help="List all projects")
    p_proj.set_defaults(func=cmd_projects)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
