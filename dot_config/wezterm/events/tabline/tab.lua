-- format-tab-title: ogni tab è un rettangolo [ N icona titolo ··· ● ▐]
local wezterm = require('wezterm')
local config = require('events.tabline.config')
local info = require('events.tabline.pane_info')
local cells = require('events.tabline.cells')

local colors = config.colors.tab

local M = {}

---Prima regola il cui pattern corrisponde al domain, altrimenti una regola vuota
local function match_rule(domain)
   for _, rule in ipairs(config.rules) do
      if domain and domain:match(rule.domain) then
         return rule
      end
   end
   return {}
end

---Colori della tab: attiva > hover > regola > default
local function tab_colors(tab, hover, rule)
   if tab.is_active then
      return colors.active.bg, colors.active.fg
   elseif hover then
      return colors.hover.bg, colors.hover.fg
   end
   return rule.bg or colors.default.bg, rule.fg or colors.default.fg
end

local function has_unseen_output(tab)
   for _, pane in ipairs(tab.panes) do
      if pane.has_unseen_output then
         return true
      end
   end
   return false
end

M.format = function(tab, _, _, _, hover, max_width)
   local rule = match_rule(tab.active_pane.domain_name)
   local prefix = tostring(tab.tab_index + 1) .. ' ' .. (rule.icon and rule.icon .. ' ' or '')
   local title = info.tab_title(
      info.process_name(tab.active_pane.foreground_process_name),
      tab.tab_title,
      tab.active_pane.title,
      max_width,
      6 + wezterm.column_width(prefix)
   )
   local bg, fg = tab_colors(tab, hover, rule)
   local unseen = has_unseen_output(tab)

   -- larghezza minima: WezTerm non ha un'opzione, si allunga il titolo con spazi
   -- (il pallino resta in fondo); mai oltre max_width, che WezTerm riduce se le tab non ci stanno
   local label = ' ' .. prefix .. title
   local width = wezterm.column_width(label) + (unseen and 3 or 0) + 1
   local min_width = math.min(config.min_width, max_width)
   if width < min_width then
      label = label .. string.rep(' ', min_width - width)
   end

   -- rettangolo: WezTerm non ha un raggio per gli angoli, i glifi curvi occupano una cella intera
   local out = {}
   cells.add(out, label, fg, bg, true)
   if unseen then
      -- sulle tab con sfondo della regola l'arancio sparirebbe: usa il colore del testo
      cells.add(out, ' ' .. config.icons.unseen .. ' ', bg == rule.bg and fg or colors.unseen, bg, true)
   end
   -- mezza cella di padding + mezza di stacco: il glifo ha il colore della barra, non della tab,
   -- così la saturazione di foreground_text_hsb tocca solo lo stacco scuro
   cells.add(out, '▐', colors.edge, bg, true)
   return out
end

return M
