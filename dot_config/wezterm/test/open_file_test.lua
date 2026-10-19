-- Test di utils/open-file.lua con un finto modulo 'wezterm'.
-- Uso, dalla cartella della config:  cd ~/.config/wezterm && luajit test/open_file_test.lua
-- TRIPLE sceglie il sistema finto (utils/platform.lua legge target_triple): Windows, poi Linux in fondo
TRIPLE = 'x86_64-pc-windows-msvc'
package.preload['wezterm'] = function()
  return {
    target_triple = TRIPLE,
    home_dir = '/home/me',
    -- url.parse finto: basta per file://host/percorso#riga
    url = { parse = function(u)
      local path, frag = u:match('^file://[^/]*(/[^#]*)#?(.*)$')
      return { file_path = path, fragment = frag ~= '' and frag or nil }
    end },
    action = { SplitPane = function(t) return t end },
    -- read_dir finto: riesce solo sulle cartelle elencate in DIRS
    read_dir = function(p) if DIRS[p] then return {} end error('not a directory: ' .. p) end,
  }
end
DIRS = { ['D:/AI/Claude/Trinity'] = true }
package.path = './?.lua;' .. package.path
local of = require('utils.open-file')

local failed = 0
local function check(name, ok)
  print((ok and 'ok   ' or 'FAIL ') .. name)
  if not ok then failed = failed + 1 end
end
local function parse(text, cwd) return table.concat({ tostring(select(1, of.parse(text, cwd))), tostring(select(2, of.parse(text, cwd))) }, ' ') end

-- parse ------------------------------------------------------------------------
check('percorso:riga relativo + cwd', parse('src/init.lua:42', '/D:/AI/proj/') == 'D:/AI/proj/src/init.lua 42')
check('cwd senza barra finale', parse('a.lua:1', '/D:/AI/proj') == 'D:/AI/proj/a.lua 1')
check('percorso Windows con unità', parse([[C:\x\y.lua:7]]) == 'C:/x/y.lua 7')
check('percorso MSYS2 /e/...', parse('/d/AI/x.lua:3') == 'd:/AI/x.lua 3')
check('file:// con riga', parse('file://host/C:/x/y.lua#12') == 'C:/x/y.lua 12')
check('file:// MSYS2 senza riga', parse('file://host/d/AI/x.lua') == 'd:/AI/x.lua nil')
check('testo che non è un file', of.parse('ciao mondo') == nil)
check('percorso assoluto senza riga', parse('D:/AI/Claude/Trinity/mise.toml') == 'D:/AI/Claude/Trinity/mise.toml nil')
check('cartella senza riga', parse('D:/AI/Claude/Trinity/tmp/') == 'D:/AI/Claude/Trinity/tmp/ nil')
check('percorso:riga:colonna', parse('D:/AI/x.lua:12:5') == 'D:/AI/x.lua 12')

-- open -------------------------------------------------------------------------
local function fake(domain, procs, cwd)
  local sent, split, activated = {}, nil, nil
  local panes = {}
  for i, proc in ipairs(procs) do
    panes[i] = { get_foreground_process_name = function() return proc end,
      send_text = function(_, t) sent[#sent + 1] = t end,
      activate = function() activated = i end }
  end
  local pane = { get_domain_name = function() return domain end,
    get_current_working_dir = function() return { file_path = cwd or '/D:/AI/proj/' } end }
  local window = { active_tab = function() return { panes = function() return panes end } end,
    perform_action = function(_, a) split = a end }
  return window, pane, function() return sent, split, activated end
end

local w, p, got = fake('local', { [[C:\Appl\Neovim\bin\nvim.exe]] })
check('Neovim aperto: manda :e con riga', of.open(w, p, 'b.lua:9') and got()[1] == '\x1c\x0e:e D:/AI/proj/b.lua|9\r' and select(3, got()) == 1)

w, p, got = fake('local', { 'nvim' }, '/D:/my proj/')
of.open(w, p, 'b.lua:9')
check('Neovim aperto: spazi del percorso protetti', got()[1] == '\x1c\x0e:e D:/my\\ proj/b.lua|9\r')

w, p, got = fake('local', { 'zsh.exe' })
of.open(w, p, 'a.lua:5')
local _, split = got()
check('senza Neovim: SplitPane a destra 50% con +riga', split and split.direction == 'Right' and split.size.Percent == 50
  and split.top_level == nil and split.command.args[3] == '+5' and split.command.args[4] == 'D:/AI/proj/a.lua')

w, p, got = fake('infomaniak', { 'nvim' })
check('pane SSH: non apre niente', of.open(w, p, 'a.lua:5') == false and #got() == 0)

check('open-uri: http lasciato a WezTerm', of.on_open_uri(w, p, 'https://x.org') == nil)
w, p = fake('local', { 'zsh' })
check('open-uri: file:// gestito', of.on_open_uri(w, p, 'file://h/C:/x.lua') == false)
w, p, got = fake('local', { 'zsh' })
local handled = of.on_open_uri(w, p, 'nvim-open:utils/open-file.lua:12')
_, split = got()
check('open-uri: nvim-open: percorso:riga in Neovim', handled == false and split.command.args[3] == '+12' and split.command.args[4] == 'D:/AI/proj/utils/open-file.lua')
w, p = fake('infomaniak', { 'zsh' })
check('open-uri: nvim-open: mai al sistema, anche in SSH', of.on_open_uri(w, p, 'nvim-open:a.lua:1') == false)
w, p, got = fake('local', { 'zsh' })
handled = of.on_open_uri(w, p, 'vscode://file/C:/APPL/my%20dir/wezterm.lua:7')
_, split = got()
check('open-uri: vscode://file/ con %20 e riga', handled == false and split.command.args[3] == '+7' and split.command.args[4] == 'C:/APPL/my dir/wezterm.lua')
-- il caso dei link di prismantis: file senza riga, apre Neovim senza +riga
w, p, got = fake('local', { 'zsh' })
handled = of.on_open_uri(w, p, 'vscode://file/D:/AI/Claude/Trinity/mise.toml')
_, split = got()
check('open-uri: vscode://file/ senza riga', handled == false and split and #split.command.args == 3 and split.command.args[3] == 'D:/AI/Claude/Trinity/mise.toml')

-- cartelle: yazi a destra, anche con un Neovim già aperto nella tab
local function yazi_ok(s, dir)
  return s and s.direction == 'Right' and s.command.args[1] == 'D:/msys64/ucrt64/bin/yazi.exe' and s.command.args[2] == dir
    and s.command.set_environment_variables.YAZI_CONFIG_HOME == 'D:/msys64/home/Sphynx/.config/yazi'
end
w, p, got = fake('local', { 'zsh' })
handled = of.on_open_uri(w, p, 'vscode://file/D:/AI/Claude/Trinity')
_, split = got()
check('cartella (read_dir): yazi a destra', handled == false and yazi_ok(split, 'D:/AI/Claude/Trinity'))
w, p, got = fake('local', { 'nvim' })
of.on_open_uri(w, p, 'vscode://file/D:/AI/Claude/Trinity/tmp/')
local sent
sent, split = got()
check('cartella con barra finale: yazi, niente :e a Neovim', #sent == 0 and yazi_ok(split, 'D:/AI/Claude/Trinity/tmp/'))
check('nvim(): comando Windows + argomenti', table.concat(of.nvim('+', 'x'), ' ') == 'D:/msys64/usr/bin/bash.exe /d/msys64/home/Sphynx/.local/bin/nvim-win.sh + x')

-- Linux: stesso modulo ricaricato con un target_triple Linux ------------------
TRIPLE = 'x86_64-unknown-linux-gnu'
for _, m in ipairs({ 'wezterm', 'utils.platform', 'utils.open-file' }) do package.loaded[m] = nil end
of = require('utils.open-file')
DIRS = { ['/home/me/proj'] = true }
check('linux: nvim() senza bash.exe', table.concat(of.nvim('+3', 'a'), ' ') == 'nvim +3 a')
check('linux: /e/x resta /e/x (niente unità MSYS2)', parse('/e/x.lua:3') == '/e/x.lua 3')
check('linux: relativo dalla cwd', parse('src/a.lua:2', '/home/me/proj/') == '/home/me/proj/src/a.lua 2')
w, p, got = fake('local', { 'zsh' })
handled = of.on_open_uri(w, p, 'vscode://file/home/me/proj/x.ts:4')
_, split = got()
check('linux: vscode://file/home/... tiene la barra iniziale', handled == false and split and table.concat(split.command.args, ' ') == 'nvim +4 /home/me/proj/x.ts')
w, p, got = fake('local', { 'zsh' })
of.on_open_uri(w, p, 'vscode://file/home/me/proj')
_, split = got()
check('linux: cartella in yazi, senza YAZI_CONFIG_HOME', split and split.command.args[1] == 'yazi' and split.command.args[2] == '/home/me/proj'
  and split.command.set_environment_variables == nil)

print(failed == 0 and 'PASS' or ('FAIL: ' .. failed .. ' controlli'))
os.exit(failed == 0 and 0 or 1)
