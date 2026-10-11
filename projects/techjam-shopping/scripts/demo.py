"""Run the backend Agent with the optional terminal decision view.

Examples:
    python -m scripts.demo --catalog data/catalog.jsonl
    python -m scripts.demo --catalog data/catalog.jsonl \
        --message "I want black shoes for running" \
        --message "Actually white and casual"
"""

from __future__ import annotations

import argparse
import json

from starter.agent import Agent


def main() -> None:
    parser = argparse.ArgumentParser(description="Agent decision observability demo")
    parser.add_argument("--catalog", default="data/catalog.jsonl")
    parser.add_argument("--config", default="configs/final.json")
    parser.add_argument("--session-id", default="terminal-demo")
    parser.add_argument(
        "--message",
        action="append",
        help="Run one turn with this message; repeat for a multi-turn example.",
    )
    parser.add_argument(
        "--show-response",
        action="store_true",
        help="Also print the strict official response JSON after each turn.",
    )
    args = parser.parse_args()

    agent = Agent(args.catalog, config_path=args.config, debug=True)
    agent.reset(args.session_id, {"preference_tags": []})
    messages = list(args.message or [])
    if not messages:
        print("Agent decision demo — enter a message; Ctrl-D to finish.")
        while True:
            try:
                message = input("> ").strip()
            except EOFError:
                break
            if message:
                messages.append(message)

    for turn, message in enumerate(messages, start=1):
        response = agent.respond(args.session_id, message, turn, 10)
        if args.show_response:
            print(json.dumps(response, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
