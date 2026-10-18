-- Apre in Neovim un file citato nel terminale: link file:// oppure testo "percorso:riga".
-- Se nella tab c'è già un Neovim gli manda :e, altrimenti apre un pannello a destra.
-- Una cartella si apre in yazi, in un pannello a destra.
-- Adattato da open_file di C:\Download\wezterm.lua
local wezterm = require('wezterm')
local platform = require('utils.platform')()

-- yazi per le cartelle: Neovim, con netrw spento e nvim-tree caricato a richiesta, mostra un buffer vuoto
local NVIM, YAZI, YAZI_ENV
if platform.is_win then
   -- stesso avvio della funzione zsh `nvim`: ambiente MSYS2 ripulito, config Windows
   NVIM = { 'E:/msys64/usr/bin/bash.exe', '/e/msys64/home/Sphynx/.local/bin/nvim-win.sh' }
   -- YAZI_CONFIG_HOME come in ~/.config/zsh/modules/env.zsh: WezTerm non passa da zsh
   YAZI = 'E:/msys64/ucrt64/bin/yazi.exe'
   YAZI_ENV = { YAZI_CONFIG_HOME = 'E:/msys64/home/Sphynx/.config/yazi' }
else
   NVIM = { 'nvim' }
   YAZI = 'yazi'
end

local M = {}

---Comando che avvia Neovim con gli argomenti dati (lo usa anche lo scrollback in config/bindings.lua)
function M.nvim(...)
   local args = {}
   for _, a in ipairs(NVIM) do
      args[#args + 1] = a
   end
   for _, a in ipairs({ ... }) do
      args[#args + 1] = a
   end
   return args
end

---Percorso nel formato che capisce il Neovim nativo di Windows: barre in avanti, lettera di unità.
---Su Linux resta com'è: /a/x è un percorso vero, non l'unità A: di MSYS2
local function windows_path(p)
   if not platform.is_win then
      return p
   end
   p = p:gsub('\\', '/')
   p = p:gsub('^/(%a)/', '%1:/') -- MSYS2: /e/AI -> e:/AI
   p = p:gsub('^/(%a:)', '%1') -- file URI: /C:/x -> C:/x
   return p
end

---Percorso assoluto e riga da un link file://, da "percorso:riga" o da un percorso senza riga;
---nil se il testo non è un file. I percorsi relativi partono da cwd (file_path della pane).
function M.parse(text, cwd)
   local path, row
   if text:find('^file:') then
      local url = wezterm.url.parse(text)
      path, row = url.file_path, url.fragment
   else
      path, row = text:match('^(%a:[^:]+):(%d+)') -- C:\x\y.lua:42
      if not path then
         path, row = text:match('^([^%s:]+):(%d+)')
      end
      -- senza riga: il percorso intero (i link vscode://file/ di prismantis ai file e alle cartelle)
      if not path and not text:find('%s') then
         path = text
      end
   end
   if not path or path == '' then
      return nil
   end
   path = windows_path(path)
   if not path:find('^%a:/') and not path:find('^/') and cwd then
      path = windows_path(cwd):gsub('/$', '') .. '/' .. path
   end
   return path, tonumber(row)
end

---Pannello a destra largo metà; SplitPane come gli altri split: pane:split{top_level=true} lasciava la tab larga metà finestra
local function split_right(window, pane, command)
   window:perform_action(wezterm.action.SplitPane({ direction = 'Right', size = { Percent = 50 }, command = command }), pane)
end

---Apre il file in Neovim, o la cartella in yazi; false se il testo non è un percorso o la pane non è locale
function M.open(window, pane, text)
   -- in una pane SSH il percorso è sul server: il Neovim locale non lo trova
   if not text or pane:get_domain_name() ~= 'local' then
      return false
   end
   local cwd = pane:get_current_working_dir()
   local path, row = M.parse(text, cwd and cwd.file_path)
   if not path then
      return false
   end

   -- read_dir riesce solo su una cartella
   if path:find('/$') or pcall(wezterm.read_dir, path) then
      split_right(window, pane, { args = { YAZI, path }, set_environment_variables = YAZI_ENV })
      return true
   end

   for _, p in ipairs(window:active_tab():panes()) do
      if (p:get_foreground_process_name() or ''):find('nvim') then
         -- CTRL-\ CTRL-N: torna in normal mode da qualsiasi modalità, poi :e file|riga
         local escaped = path:gsub('([ %%#|])', '\\%1')
         p:send_text('\x1c\x0e:e ' .. escaped .. (row and ('|' .. row) or '') .. '\r')
         p:activate()
         return true
      end
   end

   split_right(window, pane, { args = row and M.nvim('+' .. row, path) or M.nvim(path) })
   return true
end

---Gestore di 'open-uri': i link file:// e nvim-open: vanno in Neovim, gli altri restano a WezTerm (browser)
function M.on_open_uri(window, pane, uri)
   -- nvim-open:percorso:riga viene dalla regola in config/general.lua; mai al sistema, non saprebbe aprirlo
   if uri:find('^nvim%-open:') then
      M.open(window, pane, uri:sub(#'nvim-open:' + 1))
      return false
   end
   -- vscode://file/<percorso>:<riga>: l'unico schema di file che Claude Code accetta nei link
   if uri:find('^vscode://file/') then
      -- la barra dopo "file" è l'inizio del percorso: /home/x su Linux, /E:/x su Windows (diventa E:/x)
      local target = uri:sub(#'vscode://file' + 1)
         :gsub('%%(%x%x)', function(h) return string.char(tonumber(h, 16)) end)
         :gsub('^/(%a:)', '%1')
      M.open(window, pane, target)
      return false
   end
   if uri:find('^file:') and M.open(window, pane, uri) then
      return false
   end
end

return M
