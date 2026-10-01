# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A [chezmoi](https://www.chezmoi.io/) dotfiles repository for user `ichelema`. It manages configurations for both **Windows** (primary host) and **Linux**, with an external neovim config tracked in a separate repo.

## Local chezmoi Documentation (authoritative reference)

A full offline copy of the chezmoi documentation lives at `support_files/chezmoi-docs/`. This is the **authoritative reference** for chezmoi behavior — prefer it over training-data recall whenever the user asks about a chezmoi command, template function, special file, or config option.

Layout:

| Folder | Use for |
| --- | --- |
| `reference/commands/` | Exact flags and behavior of each `chezmoi <command>` |
| `reference/special-files/` | `.chezmoiignore`, `.chezmoiexternal`, `.chezmoidata`, `.chezmoiscripts`, etc. |
| `reference/special-directories/` | `.chezmoitemplates/`, `.chezmoiscripts/`, etc. |
| `reference/templates/` | Template functions (incl. `bitwarden`, `onepassword`, ...) and variables |
| `reference/configuration-file/` | Options for `~/.config/chezmoi/chezmoi.toml` |
| `reference/source-state-attributes.md` | Naming prefixes (`dot_`, `private_`, `executable_`, `run_*`, ...) |
| `reference/application-order.md` | Order in which chezmoi applies entries |
| `user-guide/` | Higher-level how-tos (templating, scripts, encryption, password managers, machine differences) |
| `developer-guide/` | Internals — only relevant for hacking on chezmoi itself |

Workflow when answering a chezmoi question:

1. `Grep` inside `support_files/chezmoi-docs/` for the command/flag/function name.
2. `Read` the matching file(s) before answering.
3. Cite the doc path in the reply (e.g. `support_files/chezmoi-docs/reference/commands/apply.md`) so the user can verify.

The folder is excluded from chezmoi deployment (per the existing rule "the `support_files/` directory is always ignored by chezmoi"), so nothing here ever lands in the home directory.

## Common chezmoi Commands

```bash
# Apply all dotfiles to the home directory
chezmoi apply

# Preview what would change before applying
chezmoi diff

# Re-read source and apply with verbose output
chezmoi apply -v

# Edit a managed file (opens in $EDITOR, stages on save)
chezmoi edit ~/.config/git/config

# Add a new file to management
chezmoi add ~/.some_new_file

# Update external repos (e.g. neovim_config)
chezmoi update

# Check template rendering
chezmoi execute-template < .chezmoiignore.tmpl
```

## Repository Structure & Conventions

### Chezmoi Naming Prefixes
| Prefix | Deployed as |
|--------|-------------|
| `dot_` | `.` (hidden file/dir) |
| `executable_` | file with `+x` bit |
| `private_` | file with `600` permissions |
| `.tmpl` suffix | processed through Go templates before deployment |

### Key Files
- `.chezmoiexternal.toml` — pulls the neovim config from `git@github.com:ichelema/neovim_config.git` (refreshes every 2h) into `~/.config/nvim` on every OS; on Windows `%LOCALAPPDATA%\nvim` is a junction to it
- `.chezmoiignore.tmpl` — excludes vim plugin cache (`plugged/`), state dirs
- `.chezmoidata.toml` — minimal template data (currently only a `test.color` placeholder)
- `.chezmoiscripts/run_onchange_after_windows-junctions.sh.tmpl` — Windows-only, runs via MSYS2 bash (`[interpreters.sh]` in the local config): creates NTFS junctions (`mklink /J`, no admin needed) so native Windows programs read the config deployed in the MSYS2 home: `C:\Users\<user>\vimfiles` and `~/vimfiles` → `~/.config/vim`, `C:\Users\<user>\.config\git` → `~/.config/git`, `%LOCALAPPDATA%\nvim` → `~/.config/nvim`. Existing real directories are skipped (move them to `.bak` first)

### Platform Branching in Templates
Templates use `{{ if eq .chezmoi.os "windows" }}` / `{{ if ne .chezmoi.os "windows" }}` / `{{ if eq .chezmoi.os "linux" }}` guards. The main branching points are:

- `dot_config/git/config.tmpl`: WinMerge + gvim on Windows; Meld + vim on Linux; OS-specific SSL and credential settings
- `.chezmoiexternal.toml`: different nvim config path per OS
- `.chezmoiignore.tmpl`: vim config is ignored on Windows

### What's Managed Where
| Config | Location | Notes |
|--------|----------|-------|
| Git | `dot_config/git/config.tmpl` | Templated (XDG path, read via junction on Windows); uses `delta` for diffs |
| Vim | `dot_config/vim/` | All OS; vim-plug plugins; on Windows `vimfiles` is a junction to it |
| Neovim | External git repo | `ichelema/neovim_config`; not in this repo |
| Claude Code | `dot_claude/` | `settings.json.tmpl` is a single template: OS-specific parts (`env`, `statusLine`, `model`, `enabledPlugins`) in `{{ if eq .chezmoi.os ... }}` blocks. chezmoi owns the whole file: when Claude rewrites it at runtime (`/model`, `/output-style`…) `chezmoi apply` asks before overwriting — port wanted changes into the template (`re-add` does not work on templates). Skills/hooks/MCP come from the Trinity plugin, not from here |
| Pi agent | `dot_pi/agent/` | Config only: `auth.json`, `sessions/`, `npm/`, `git/`, `tmp/`, `node_modules`, `*.bak` stay out. Pi rewrites `settings.json` at runtime (`defaultModel`, `lastChangelogVersion`): pull those changes back with `chezmoi re-add` before committing |
| LiteLLM proxy | `dot_litellm/` | `litellm_config.yaml`, modules loaded by the proxy (`callbacks.py`, `responses_bridge.py`) and their tests. Secrets are `os.environ/…` references; `master-key.txt`, `pgdata/`, `logs/` stay local. Restart the proxy after `chezmoi apply`. Launchers: `dot_local/bin/executable_litellm-*` (read the key from `master-key.txt` at runtime; `litellm-start-proxy.sh` uses the shared Hindsight pg0 on :5432 and the corporate `SSL_CERT_FILE`, Windows-oriented) |
| mise | `dot_config/mise/config.toml` | Global runtime versions (`[tools]`) |

## Vim Configuration

Located at `dot_config/vim/`. Uses **vim-plug** as plugin manager. The `plugged/` directory is excluded from chezmoi tracking (only `.keep` placeholder committed). State directories (`files/info`, `files/log`, `files/session`, `files/undo`, `files/view`) are similarly excluded.

On Windows, `%USERPROFILE%\vimfiles` is a junction to `~/.config/vim` (created by the junction script). Plugins are not installed automatically: run `:PlugInstall` after changing the plugin list.

## Notes

- Comments throughout scripts are in **Italian**.
- `private_*` files (e.g. `private_colors.conf`) are deployed with restricted permissions and excluded from `chezmoi diff` output.
- The `support_files/` directory is always ignored by chezmoi.

---

# How to Use Chezmoi (reference for this repo)

## Mental Model

- **Source directory**: `~/.local/share/chezmoi` (on Windows: `C:\Users\<utente>\.local\share\chezmoi`) — the Git repo, the source of truth.
- **Target directory**: the home directory (`~` on Linux/macOS, `%USERPROFILE%` on Windows).
- **`chezmoi apply`** writes from the source into the target.
- **`chezmoi add`** does the reverse: imports a real file from the home into the source.

Naming prefixes in source map to target as follows:

| Source                           | Target                                       |
| -------------------------------- | -------------------------------------------- |
| `dot_gitconfig`                  | `~/.gitconfig`                               |
| `dot_config/nvim/init.lua`       | `~/.config/nvim/init.lua`                    |
| `dot_gitconfig.tmpl`             | `~/.gitconfig` (rendered from template)      |
| `private_dot_ssh/config`         | `~/.ssh/config` with restrictive permissions |
| `executable_dot_local/bin/foo`   | `~/.local/bin/foo` with `+x`                 |

> Important: `.chezmoiignore.tmpl` patterns refer to the **target path** (e.g. `.config/vim/**`), not the source name (`dot_config/vim/**`).

## Daily Workflow

| Command                              | When to use it                                       |
| ------------------------------------ | ---------------------------------------------------- |
| `chezmoi add <file>`                 | Import a real file from home into the repo.          |
| `chezmoi add --template <file>`      | Import a file that must vary per OS / machine.       |
| `chezmoi add -r <dir>`               | Import a directory recursively.                      |
| `chezmoi edit <file>`                | Edit the source version of a managed file.           |
| `chezmoi diff`                       | Preview what will change in the home.                |
| `chezmoi apply -nv`                  | Verbose dry-run.                                     |
| `chezmoi apply -v`                   | Apply with verbose output.                           |
| `chezmoi update -v`                  | `git pull` + `apply` in one step.                    |
| `chezmoi cd`                         | Open a subshell in the source directory.            |
| `chezmoi data`                       | Print all template variables available here.        |
| `chezmoi doctor`                     | Diagnose setup issues.                               |
| `chezmoi status`                     | Show which targets differ from source.               |
| `chezmoi execute-template < f.tmpl`  | Render a template without writing it.                |

Suggested pre-apply ritual:

```bash
chezmoi diff
chezmoi apply -nv
chezmoi apply -v
```

## Template Variables (Go templates)

Common variables exposed by chezmoi:

| Variable               | Use                                                          |
| ---------------------- | ------------------------------------------------------------ |
| `.chezmoi.os`          | `linux`, `darwin`, `windows`.                                |
| `.chezmoi.hostname`    | Distinguish laptop / desktop / work machine.                 |
| `.chezmoi.username`    | User-bound paths or settings.                                |
| `.chezmoi.arch`        | `amd64`, `arm64`, etc.                                       |
| `.chezmoi.sourceDir`   | Absolute path of the source directory (useful in scripts).   |
| Custom keys            | Anything under `[data]` in the local `chezmoi.toml`.         |

OS branching pattern used throughout this repo:

```gotemplate
{{- if eq .chezmoi.os "windows" }}
# Windows-only block
{{- else if eq .chezmoi.os "linux" }}
# Linux-only block
{{- end }}
```

## Special Files Cheat Sheet

| File / directory          | Purpose                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `.chezmoiignore.tmpl`     | Exclude target paths from `apply` (templated, conditional per OS).   |
| `.chezmoiexternal.toml`   | Pull in external files / archives / git repos at apply/update time.  |
| `.chezmoiscripts/`        | Holds chezmoi scripts that should NOT be deployed into the home.     |
| `.chezmoi.toml.tmpl`      | Bootstraps the local `chezmoi.toml` during `init` (with prompts).    |
| `.chezmoidata.toml`       | Static template data shared across machines.                         |
| `.chezmoitemplates/`      | Reusable template fragments used via `template "name"`.              |
| `.chezmoiremove`          | Lists target paths to remove on `apply`.                             |
| `.chezmoiversion`         | Minimum required chezmoi version.                                    |
| `.chezmoiroot`            | Moves the source root into a subdirectory of the repo.               |

## Script Naming Convention

Scripts are placed at the repo root or, preferably, inside `.chezmoiscripts/`. The filename encodes when chezmoi runs them:

| Name pattern                            | When it runs                                                          |
| --------------------------------------- | --------------------------------------------------------------------- |
| `run_*.sh` / `run_*.cmd` / `run_*.ps1`  | Every `chezmoi apply`.                                                |
| `run_once_*`                            | Only the first time the rendered content is seen successfully.        |
| `run_onchange_*`                        | Only when the rendered content changes (good for installs / syncs).   |
| `run_before_*`                          | Before files are applied.                                             |
| `run_after_*`                           | After files are applied.                                              |
| `*.tmpl` suffix                         | Script is rendered as a Go template before execution.                 |

**Idempotence is mandatory.** Scripts must be safe to re-run: guard with `if not exist`, `mkdir -p`, "pull if exists else clone", etc. The existing junction script follows this pattern (skips links that already exist).

## Local `chezmoi.toml` (per-machine, NOT versioned)

Lives at `~/.config/chezmoi/chezmoi.toml` and is meant for machine-local settings. Do not commit it; if you need to bootstrap it, ship a `.chezmoi.toml.tmpl` in the repo root that prompts for values during `chezmoi init`.

Typical sections:

```toml
[data]
    name  = "ichelema"
    email = "miboscol@gmail.com"
    role  = "personal"

[git]
    autoCommit = true
    autoPush   = false        # enable only on the primary machine

[diff]
    exclude = ["scripts"]

[status]
    exclude = ["scripts"]

[scriptEnv]
    EDITOR = "vim"

[bitwarden]
    unlock = "auto"           # see Secrets section below
```

## Bootstrapping a New Machine

Controlled flow:

```bash
chezmoi init git@github.com:ichelema/dotfiles.git
chezmoi diff
chezmoi apply -v
```

One-liner (Linux/macOS):

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply ichelema
```

One-liner (Windows PowerShell):

```powershell
iex "&{$(irm 'https://get.chezmoi.io/ps1')}" -- init --apply ichelema
```

On already-configured machines, the daily refresh is just:

```bash
chezmoi update -v
```

## Secrets — Bitwarden Integration

Rules of thumb:

- Never commit tokens, passwords, or private keys in plaintext.
- `private_` only sets restrictive **target** permissions; it does **not** encrypt anything in the repo.
- Use the local `chezmoi.toml` for non-secret machine data, and Bitwarden for real secrets.

Setup (one time):

```bash
# install: winget install Bitwarden.CLI   |   brew install bitwarden-cli   |   npm i -g @bitwarden/cli
bw login <EMAIL>
export BW_SESSION="$(bw unlock --raw)"     # PowerShell: $env:BW_SESSION = bw unlock --raw
```

In `~/.config/chezmoi/chezmoi.toml`:

```toml
[bitwarden]
    unlock = "auto"   # use existing BW_SESSION if set, otherwise prompt to unlock
```

Template helpers:

| Helper                                                   | Use case                                  |
| -------------------------------------------------------- | ----------------------------------------- |
| `(bitwarden "item" "<name>").login.username`             | Account password / username.              |
| `(bitwardenFields "item" "<name>").<field>.value`        | Custom fields (API tokens, client secret).|
| `bitwardenAttachmentByRef "<file>" "item" "<name>"`      | File attachments (SSH keys, certs).       |
| `(bitwardenSecrets "<SECRET_ID>").value`                 | Bitwarden Secrets Manager (`bws`).        |

Example `private_dot_netrc.tmpl`:

```netrc
machine github.com
  login    {{ (bitwarden "item" "github.com").login.username }}
  password {{ (bitwardenFields "item" "github.com").token.value }}
```

Render-test before applying:

```bash
chezmoi execute-template < ~/.local/share/chezmoi/private_dot_netrc.tmpl
```

## Pre-push Security Checks

Before pushing changes, scan staged content for accidental secrets:

```bash
chezmoi cd
git status
git diff --cached
git grep -nE "(token|password|secret|api[_-]?key|BEGIN .*PRIVATE KEY)"
```

If a secret leaked: revoke it, rewrite git history (not just the last commit), regenerate, move it into Bitwarden, and replace the value with a template call.

## Cross-OS Path Strategies

When the same tool lives at different paths on Linux vs Windows:

| Strategy                  | When to pick it                                            |
| ------------------------- | ---------------------------------------------------------- |
| Single template with `if` | Small content differences in the same file.                |
| `.chezmoiignore.tmpl`     | Whole files / trees that don't apply on a given OS.        |
| `.chezmoiexternal.toml`   | Same upstream repo, different target paths per OS.         |
| `run_after_*` script      | Need to copy / junction / install plugins after apply.     |
| Separate per-OS files     | Configs are too divergent to share.                        |

This repo uses all five: ignore for vim state dirs, external for nvim, and the junction script as the bridge between the MSYS2 home and the native Windows paths.

## Troubleshooting

```bash
chezmoi doctor      # environment / binary diagnostics
chezmoi data        # dump all template variables visible right now
chezmoi diff        # what would change
chezmoi status      # which targets are out-of-sync
chezmoi cat <file>  # show the rendered version of a managed file
```
