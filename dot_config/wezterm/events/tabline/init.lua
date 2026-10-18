-- Tabline: tab a rettangolo con colori Nord e status bar (leader, zoom, hint, ssh, cwd, workspace).
--   config.lua    tutto ciò che si personalizza
--   tab.lua       format-tab-title
--   status.lua    update-status
--   pane_info.lua letture da tab e pane (processo, titolo, cwd, ssh)
--   cells.lua     costruzione dei FormatItem
-- Test: cd /c/APPL/WezTerm && luajit test/tabline_test.lua
local wezterm = require('wezterm')

local M = {}

M.setup = function()
   wezterm.on('format-tab-title', require('events.tabline.tab').format)
   wezterm.on('update-status', require('events.tabline.status').update)
end

return M
