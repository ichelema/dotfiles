-- Letture dalla tab e dalla pane, senza disegno: processo, titolo, cwd, ssh.
local wezterm = require('wezterm')

local M = {}

---Nome del processo senza percorso né .exe
M.process_name = function(path)
   local name = path:gsub('(.*[/\\])(.*)', '%2')
   return (name:gsub('%.exe$', ''))
end

---Testo del titolo della tab, troncato in modo che con `inset` celle di contorno stia in max_width
M.tab_title = function(process_name, static_title, active_title, max_width, inset)
   local title

   if process_name:len() > 0 and static_title:len() == 0 then
      title = process_name .. '  '
   elseif static_title:len() > 0 then
      title = static_title .. '  '
   else
      -- titolo dalla pane (domain SSH: WezTerm non vede il processo remoto);
      -- la zsh remota lo imposta come 'host: ZSH', il suffisso non cambia mai
      title = active_title:gsub(':%s*[Zz][Ss][Hh]$', '') .. '  '
   end

   if title:len() > max_width - inset then
      local diff = title:len() - max_width + inset
      title = wezterm.truncate_right(title, title:len() - diff)
   end

   return title
end

---Nome della radice git se la cwd è in un repo, altrimenti il percorso con ~
---@param pane table
---@param search_git boolean false per i domain remoti: il percorso non esiste in locale
M.cwd = function(pane, search_git)
   local url = pane:get_current_working_dir()
   local path = url and url.file_path
   if not path or path == '' then
      return nil
   end
   path = path:gsub('^/(%a:)', '%1') -- Windows: /C:/x -> C:/x
   path = path:gsub('(.)/$', '%1') -- WezTerm chiude le cartelle con /

   if search_git then
      local dir = path
      while dir and dir ~= '' do
         -- .git è una cartella nei repo e un file nei worktree
         local f = io.open(dir .. '/.git/HEAD') or io.open(dir .. '/.git')
         if f then
            f:close()
            return dir:match('[^/]+$')
         end
         dir = dir:match('^(.*)/[^/]*$')
      end
   end

   local home = wezterm.home_dir:gsub('\\', '/')
   if path:sub(1, #home):lower() == home:lower() then
      path = '~' .. path:sub(#home + 1)
   end
   return path
end

---Nome del domain SSH, 'ssh' se il processo in primo piano è ssh, altrimenti nil
M.ssh = function(pane)
   local domain = pane:get_domain_name()
   if domain and domain ~= 'local' then
      return domain
   end
   local process = pane:get_foreground_process_name() or ''
   if process:match('[/\\]ssh%.exe$') or process:match('[/\\]ssh$') then
      return 'ssh'
   end
   return nil
end

return M
