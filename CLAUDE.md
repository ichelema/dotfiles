# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A [chezmoi](https://www.chezmoi.io/) dotfiles repository for user `sphynx79`. It manages configurations for both **Windows** (primary host) and **Linux** (Hyprland/Wayland desktop), with an external neovim config tracked in a separate repo.

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
chezmoi edit ~/.gitconfig

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
- `.chezmoiexternal.toml` — pulls the neovim config from `git@github.com:sphynx79/neovim_config.git` (refreshes every 2h); path differs by OS (`~/.config/nvim` on Linux/macOS, `AppData/Local/nvim` on Windows)
- `.chezmoiignore.tmpl` — excludes vim plugin cache (`plugged/`), state dirs, and on Windows excludes the entire `dot_config/vim/` and `dot_config/hypr/` trees
- `.chezmoidata.toml` — minimal template data (currently only a `test.color` placeholder)
- `.chezmoiscripts/run_after_vim-sync.cmd.tmpl` — Windows-only post-apply script: uses `robocopy` to sync vim files into `%USERPROFILE%\vimfiles` and auto-runs `vim.exe -c "PlugInstall"`

### Platform Branching in Templates
Templates use `{{ if eq .chezmoi.os "windows" }}` / `{{ if ne .chezmoi.os "windows" }}` / `{{ if eq .chezmoi.os "linux" }}` guards. The main branching points are:

- `dot_gitconfig.tmpl`: WinMerge + gvim on Windows; Meld + vim on Linux; OS-specific SSL and credential settings
- `.chezmoiexternal.toml`: different nvim config path per OS
- `.chezmoiignore.tmpl`: vim and hypr configs are ignored on Windows

### What's Managed Where
| Config | Location | Notes |
|--------|----------|-------|
| Git | `dot_gitconfig.tmpl` | Templated; uses `delta` for diffs |
| Vim | `dot_config/vim/` | Linux/macOS only; vim-plug plugins; Windows uses robocopy sync instead |
| Neovim | External git repo | `sphynx79/neovim_config`; not in this repo |
| Hyprland | `dot_config/hypr/` | Linux only; 50+ helper scripts in `bin/`, 16+ themes in `themes/` |

## Hyprland Configuration Architecture

The Hyprland setup is the largest part of the repo (~350 files). Key structure:

- `executable_hyprland.conf` — main Hyprland config
- `executable_pyprland.toml` — Pyprland plugin daemon config
- `hypridle.conf`, `hyprlock.conf` — idle/lock screen daemons
- `bin/` — 50+ shell/Python scripts for volume, brightness, screenshots, launchers, theme switching, etc.
- `themes/` — 16+ complete theme packages (Catppuccin, Nord, Gruvbox, Tokyo Night, Rose Pine, Kanagawa, Everforest, Flexoki, and custom variants). Each theme contains per-app configs for alacritty, btop, kitty, neovim, waybar, hyprland, hyprlock, walker, etc.
- `pyprland.d/` — modular pyprland configs (scratchpads, shortcuts)
- `shaders/` — GLSL shaders (vibrance, OLED, grayscale, etc.)
- `private_colors.conf` — autogenerated by `wallbash`; do not edit manually

## Vim Configuration

Located at `dot_config/vim/`. Uses **vim-plug** as plugin manager. The `plugged/` directory is excluded from chezmoi tracking (only `.keep` placeholder committed). State directories (`files/info`, `files/log`, `files/session`, `files/undo`, `files/view`) are similarly excluded.

On Windows, vim files live in `%USERPROFILE%\vimfiles` and are synced by the post-apply script rather than deployed directly by chezmoi.

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

**Idempotence is mandatory.** Scripts must be safe to re-run: guard with `if not exist`, `mkdir -p`, "pull if exists else clone", etc. The existing `run_after_vim-sync.cmd.tmpl` follows this pattern (uses `robocopy /L /MIR` to detect drift, then `/MIR` only when needed).

## Local `chezmoi.toml` (per-machine, NOT versioned)

Lives at `~/.config/chezmoi/chezmoi.toml` and is meant for machine-local settings. Do not commit it; if you need to bootstrap it, ship a `.chezmoi.toml.tmpl` in the repo root that prompts for values during `chezmoi init`.

Typical sections:

```toml
[data]
    name  = "sphynx79"
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
chezmoi init git@github.com:sphynx79/dotfiles.git
chezmoi diff
chezmoi apply -v
```

One-liner (Linux/macOS):

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply sphynx79
```

One-liner (Windows PowerShell):

```powershell
iex "&{$(irm 'https://get.chezmoi.io/ps1')}" -- init --apply sphynx79
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

This repo uses all five: ignore for `vim` and `hypr` on Windows, external for nvim per-OS path, and the `run_after_vim-sync.cmd.tmpl` script as the bridge between `dot_config/vim` and `%USERPROFILE%\vimfiles`.

## Troubleshooting

```bash
chezmoi doctor      # environment / binary diagnostics
chezmoi data        # dump all template variables visible right now
chezmoi diff        # what would change
chezmoi status      # which targets are out-of-sync
chezmoi cat <file>  # show the rendered version of a managed file
```
