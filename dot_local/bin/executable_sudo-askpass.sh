#!/usr/bin/env bash
# Askpass per sudo (SUDO_ASKPASS): stampa su stdout la password raccolta dalla
# mod sudo-popup di Claude Code, letta dal suo file usa-e-getta.
f="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/claude-sudo-pass"
[[ -f $f ]] || exit 1
cat "$f"
rm -f "$f"
