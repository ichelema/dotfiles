-- Costruzione delle liste di FormatItem usate da wezterm.format.
local wezterm = require('wezterm')

local M = {}

---Aggiunge un testo colorato a `list`. bg e bold sono facoltativi:
---le tab li usano, lo status resta sullo sfondo della barra.
M.add = function(list, text, fg, bg, bold)
   if bg then
      table.insert(list, { Background = { Color = bg } })
   end
   table.insert(list, { Foreground = { Color = fg } })
   if bold then
      table.insert(list, { Attribute = { Intensity = 'Bold' } })
   end
   table.insert(list, { Text = text })
end

---Larghezza in celle del testo di una lista di FormatItem
M.width = function(list)
   local n = 0
   for _, item in ipairs(list) do
      if item.Text then
         n = n + wezterm.column_width(item.Text)
      end
   end
   return n
end

return M
