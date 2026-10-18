-- update-status: sinistra (leader, zoom), destra (hint della key table | ssh + cwd al centro, workspace)
local wezterm = require('wezterm')
local config = require('events.tabline.config')
local info = require('events.tabline.pane_info')
local cells = require('events.tabline.cells')

local colors = config.colors.status
local icons = config.icons

local M = {}

---Spazi tra la parte centrale e la lista workspace perché il centro parta da metà barra.
---WezTerm non ha una zona centrale: lo status destro è allineato a destra (prima dei pulsanti).
M.center_pad = function(cols, mid_w, ws_w)
   local pad = cols - config.buttons_width - (math.floor(cols / 2) - math.floor(mid_w / 2)) - mid_w - ws_w
   return math.max(pad, 2)
end

---Sinistra: razzo se il leader è attivo, indicatore se la pane è ingrandita
local function left(window, pane)
   local out = {}
   if window:leader_is_active() then
      cells.add(out, ' ' .. icons.leader .. ' ', colors.leader)
   else
      cells.add(out, ' ', colors.idle)
   end
   local tab = pane:tab()
   if tab then
      for _, p in ipairs(tab:panes_with_info()) do
         if p.is_active and p.is_zoomed then
            cells.add(out, icons.zoom .. ' zoom  ', colors.zoom)
         end
      end
   end
   return out
end

---Destra con una key table attiva: nome e suggerimenti
local function right_hints(key_table)
   local out = {}
   cells.add(out, ' TABLE: ' .. key_table .. (config.hints[key_table] or '') .. ' ', colors.hint)
   return out
end

---|ws1|ws2| solo se ce n'è più di uno, attivo evidenziato
local function workspaces(active)
   local out = {}
   local names = wezterm.mux.get_workspace_names()
   if #names > 1 then
      cells.add(out, '|', colors.ws_sep)
      for _, name in ipairs(names) do
         cells.add(out, name, name == active and colors.ws_active or colors.ws_inactive)
         cells.add(out, '|', colors.ws_sep)
      end
      cells.add(out, ' ', colors.idle)
   end
   return out
end

---Destra normale: ssh + cwd al centro, workspace in fondo
local function right_info(window, pane)
   local out = {}
   local ssh = info.ssh(pane)
   if ssh then
      cells.add(out, icons.ssh .. ' ' .. ssh .. '  ', colors.ssh)
   end
   local cwd = info.cwd(pane, ssh == nil)
   if cwd then
      cells.add(out, icons.cwd .. ' ' .. cwd, colors.cwd)
   end

   local ws = workspaces(window:active_workspace())
   local tab = pane:tab()
   local cols = tab and tab:get_size().cols or 0
   cells.add(out, string.rep(' ', M.center_pad(cols, cells.width(out), cells.width(ws))), colors.idle)
   for _, item in ipairs(ws) do
      table.insert(out, item)
   end
   return out
end

M.update = function(window, pane)
   window:set_left_status(wezterm.format(left(window, pane)))
   local key_table = window:active_key_table()
   local right
   if key_table then
      right = right_hints(key_table)
   elseif window:leader_is_active() then
      right = {}
      cells.add(right, config.leader_hint, colors.hint)
   else
      right = right_info(window, pane)
   end
   window:set_right_status(wezterm.format(right))
end

return M
