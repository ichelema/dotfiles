local wezterm = require('wezterm')

local M = {}

M.setup = function()
	wezterm.on("gui-startup", function(cmd)
	  local tab, pane, window = wezterm.mux.spawn_window(cmd or {})
	  local gui_window = window:gui_window()
	  gui_window:set_position(1400, 4)  -- x, y
	end)
end

return M
