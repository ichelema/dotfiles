-- Test della tabline (events/tabline) con un finto modulo 'wezterm'.
-- Uso, dalla cartella della config:  cd ~/.config/wezterm && luajit test/tabline_test.lua
-- Nota: il caso "cwd centrata" legge davvero il disco (E:/AI/Claude/Trinity deve essere un repo):
-- dove il repo non c'è (Linux) il controllo viene saltato.

local handlers = {}
package.preload['wezterm'] = function()
  return {
    nerdfonts = setmetatable({}, { __index = function(_, k) return '<' .. k .. '>' end }),
    on = function(ev, f) handlers[ev] = f end,
    truncate_right = function(s, n) return s:sub(1, n) end,
    column_width = function(s) return #s end, -- conta i byte: nei test di larghezza solo ASCII
    format = function(cells) local t = {} for _, c in ipairs(cells) do if c.Text then t[#t+1] = c.Text end end return table.concat(t) end,
    home_dir = [[C:\Users\en27553]],
    action = {},
    mux = { get_workspace_names = function() return WS or { 'default' } end },
  }
end
package.path = './?.lua;./?/init.lua;' .. package.path
require('events.tabline').setup()

local failed = 0
local function check(name, ok)
  print((ok and 'ok   ' or 'FAIL ') .. name)
  if not ok then failed = failed + 1 end
end

local function txt(cells) local t = {} for _, c in ipairs(cells) do if c.Text then t[#t+1] = c.Text end end return table.concat(t) end
local function bgs(cells) local t = {} for _, c in ipairs(cells) do if c.Background then t[#t+1] = c.Background.Color end end return t end
local function fgs(cells) local t = {} for _, c in ipairs(cells) do if c.Foreground then t[#t+1] = c.Foreground.Color end end return t end
local function width(cells) local n = 0 for _, c in ipairs(cells) do if c.Text then n = n + (c.Text == '▐' and 1 or #c.Text) end end return n end
local function fmt_tab(tab, hover, max_width) return handlers['format-tab-title'](tab, {}, {}, {}, hover, max_width or 35) end
local function local_tab(index, active, panes)
  return { tab_index = index, is_active = active, tab_title = '', panes = panes or {},
    active_pane = { domain_name = 'local', foreground_process_name = [[D:\msys64\usr\bin\zsh.exe]], title = 'zsh' } }
end
local function vps_tab(title, panes)
  return { tab_index = 2, is_active = false, tab_title = '', panes = panes or {},
    active_pane = { domain_name = 'infomaniak', foreground_process_name = '', title = title } }
end

-- format-tab-title ---------------------------------------------------------
local c = fmt_tab(local_tab(0, true, { { has_unseen_output = true } }))
check('tab: numero + processo senza .exe', txt(c):find('^ 1 zsh  ') ~= nil)
check('tab: pallino output non letto', txt(c):find('●') ~= nil)
check('tab: attiva #59657D, stacco col colore barra', bgs(c)[1] == '#59657D' and c[#c].Text == '▐' and c[#c - 2].Foreground.Color == '#142433')

local t = vps_tab('x'); t.tab_title = 'vps'
c = fmt_tab(t)
check('tab: regola infomaniak (icona + colore)', txt(c):find(' 3 <md_server> vps  ') ~= nil and bgs(c)[1] == '#7EBED0')
check('tab: hover vince sulla regola', bgs(fmt_tab(t, true))[1] == '#434C5E')
t.tab_title = string.rep('a', 80)
c = fmt_tab(t)
check('tab: titolo lungo troncato', txt(c):find(string.rep('a', 15)) ~= nil and not txt(c):find(string.rep('a', 16)))

c = fmt_tab(vps_tab('x', { { has_unseen_output = true } }))
check('tab: su sfondo regola testo e pallino scuri', bgs(c)[1] == '#7EBED0' and fgs(c)[1] == '#2E3440' and fgs(c)[2] == '#2E3440')
c = fmt_tab(local_tab(0, false, { { has_unseen_output = true } }))
check('tab: inattiva Nord, pallino arancio', bgs(c)[1] == '#3B4252' and fgs(c)[1] == '#B1BDD3' and fgs(c)[2] == '#D08770')

local short = local_tab(1, false); short.active_pane.foreground_process_name = 'zsh'
check('tab: larghezza minima 18', width(fmt_tab(short)) == 18)
check('tab: mai oltre max_width', width(fmt_tab(short, false, 12)) <= 12)
check('tab: stacco di mezza cella in fondo', txt(fmt_tab(short)):sub(-3) == '▐')
short.panes = { { has_unseen_output = true } }
check('tab: pallino in fondo, niente ~', txt(fmt_tab(short)):find('  ● ▐$') ~= nil and not txt(fmt_tab(short)):find('~'))

c = fmt_tab(vps_tab('ov-beb073: ZSH'))
check('tab: VPS senza ": ZSH" e senza simbolo', txt(c):find('^ 3 <md_server> ov%-beb073 ') ~= nil and not txt(c):find('ZSH'))
check('tab: altri titoli remoti invariati', txt(fmt_tab(vps_tab('ov-beb073: nvim'))):find('ov%-beb073: nvim') ~= nil)

-- update-status ------------------------------------------------------------
local function win(key_table, leader, workspace)
  local s = {}
  return { s = s,
    leader_is_active = function() return leader end,
    active_workspace = function() return workspace or 'default' end,
    active_key_table = function() return key_table end,
    set_left_status = function(_, v) s.left = v end,
    set_right_status = function(_, v) s.right = v end }
end
local function pane(domain, proc, path, zoomed)
  return {
    tab = function() return { get_size = function() return { cols = 100 } end,
      panes_with_info = function() return { { is_active = true, is_zoomed = zoomed } } end } end,
    get_foreground_process_name = function() return proc end,
    get_domain_name = function() return domain end,
    get_current_working_dir = function() return path and { file_path = path } or nil end }
end
local function status(w, p) handlers['update-status'](w, p) return w.s end

local s = status(win(nil, true), pane('local', [[C:\x\nvim.exe]], '/E:/AI/Claude/Trinity/', true))
check('status sx: razzo leader + zoom, niente processo', s.left:find('<oct_rocket>') ~= nil and s.left:find('zoom') ~= nil and not s.left:find('nvim'))
s = status(win(nil, false), pane('local', [[C:\x\nvim.exe]], '/E:/AI/Claude/Trinity/', true))
check('status dx: radice git con barra finale', s.right:find('Trinity') ~= nil)
s = status(win(nil, false), pane('local', [[C:\x\ssh.exe]], '/C:/Users/en27553/Documents/', false))
check('status dx: processo ssh + home come ~', s.right:find('<md_ssh> ssh') ~= nil and s.right:find('~/Documents') ~= nil)
check('status dx: domain SSH', status(win(nil, false), pane('infomaniak')).right:find('infomaniak') ~= nil)
s = status(win(nil, false, 'lavoro'), pane('local'))
check('status sx: workspace mai a sinistra', not s.left:find('lavoro') and not s.left:find('default'))

check('hint: pane_resize', status(win('pane_resize'), pane('local')).right:find(' TABLE: pane_resize  Actions: ←/→/↑/↓ ', 1, true) ~= nil)
check('hint: tabs identico', status(win('tabs'), pane('local')).right == ' TABLE: tabs  Actions:n:New|N:New Shell|R:Rename|←/→:Focus|M:Move|C:Close|T:Navigator ')
check('hint: workspace identico', status(win('workspace'), pane('local')).right == ' TABLE: workspace  Actions:N:New|S:Switch|R:Rename|←/→:Prev/Next ')
check('hint: tabella senza testo', status(win('search_mode'), pane('local')).right == ' TABLE: search_mode ')
check('hint: copy_mode', status(win('copy_mode'), pane('local')).right:find(' TABLE: copy_mode  Actions: ', 1, true) ~= nil)
check('hint: leader attivo mostra le lettere', status(win(nil, true), pane('local')).right:find(' LEADER  Actions: p:Pane|t:Tabs', 1, true) ~= nil)
check('hint: la key table vince sul leader', status(win('tabs', true), pane('local')).right:find('^ TABLE: tabs') ~= nil)

check('workspace: nessuna lista con un solo workspace', not status(win(), pane('local')).right:find('|', 1, true))
WS = { 'default', 'lavoro' }
local colors = {}
local wez = package.loaded['wezterm']
local fmt = wez.format
wez.format = function(cells) for _, x in ipairs(cells) do if x.Foreground then colors[#colors + 1] = x.Foreground.Color end end return fmt(cells) end
s = status(win(nil, false, 'lavoro'), pane('local', nil, '/E:/AI/Claude/Trinity/'))
wez.format = fmt
WS = nil
check('workspace: |default|lavoro| in fondo', s.right:find('|default|lavoro| $') ~= nil)
check('workspace: attivo Frost, altri grigi', table.concat(colors, ' '):find('#7B88A1 #4C566A #88C0D0') ~= nil)
local mid = '<oct_file_directory> Trinity'
local repo = io.open('E:/AI/Claude/Trinity/.git/HEAD')
if repo then
  repo:close()
  check('cwd centrata (cols=100, pulsanti=9)', 100 - 9 - #s.right == 50 - math.floor(#mid / 2) and s.right:sub(1, #mid) == mid)
else
  print('skip cwd centrata: E:/AI/Claude/Trinity non è un repo su questa macchina')
end

print(failed == 0 and 'PASS' or ('FAIL: ' .. failed .. ' controlli'))
os.exit(failed == 0 and 0 or 1)
