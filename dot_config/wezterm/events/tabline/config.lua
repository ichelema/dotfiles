-- Tutto ciò che si personalizza nella tabline: misure, icone, colori, regole, suggerimenti.
local wezterm = require('wezterm')
local palette = require('colors.nord')
local nf = wezterm.nerdfonts
local ansi = palette.ansi

return {
   -- larghezza minima di una tab, in celle (stacco compreso)
   min_width = 18,

   -- ponytail: larghezza stimata dei pulsanti integrati (─ □ ✕) a destra, se la cwd non è centrata ritoccala
   buttons_width = 9,

   -- glifi letti a caricamento: un nome sbagliato blocca subito la config, non il redraw
   icons = {
      unseen = '●', -- U+25CF di FiraCode: circa 3/4 dell'altezza di una maiuscola
      leader = nf.oct_rocket,
      zoom = nf.md_fullscreen,
      ssh = nf.md_ssh,
      cwd = nf.oct_file_directory,
   },

   colors = {
      -- palette Nord: Polar Night per le tab, Frost/grigi per l'attiva, Aurora per gli accenti
      tab = {
         default = { bg = '#3B4252', fg = '#B1BDD3' }, -- nord1 / nord4 scurito (-12% luminosità)
         active = { bg = '#59657D', fg = '#ECEFF4' }, -- nord3 schiarito (+6% luminosità) / nord6
         hover = { bg = '#434C5E', fg = '#ECEFF4' }, -- nord2 / nord6: tra inattiva (nord1) e attiva (nord3)
         unseen = '#D08770', -- nord12
         edge = palette.tab_bar.background, -- stacco tra le tab = sfondo della barra
      },
      status = {
         idle = ansi[8],
         leader = ansi[2],
         zoom = ansi[4],
         hint = palette.foreground,
         ssh = ansi[5],
         cwd = ansi[7],
         ws_active = ansi[7], -- Frost
         ws_inactive = '#7B88A1', -- grigio Nord
         ws_sep = palette.brights[1],
      },
   },

   -- regole per tab: vince la prima il cui pattern Lua corrisponde al domain
   -- bg/fg colorano solo le tab inattive, icon va prima del titolo
   rules = {
      { domain = '^infomaniak$', icon = nf.md_server }, -- colori delle tab normali
      { domain = '^ArchLinux$', bg = '#EBCB8B', fg = '#2E3440', icon = nf.linux_archlinux }, -- nord13
   },

   -- suggerimento nello status destro mentre il leader (ALT+/) è attivo
   leader_hint = ' LEADER  Actions: p:Pane|t:Tabs|w:Workspace|z:Font|←/→/↑/↓:Pane|.:Palette|/:Search|l:Launcher|k:Launcher All|y:Select|o:URL|f:File|c:Copy|h:History|b:TabBar ',

   -- suggerimenti nello status destro mentre una key table di config/bindings.lua è attiva
   hints = {
      pane = ' Actions: ←/→/↑/↓|n:Split|N:Split Shell|M:Maximize|C:Close|R:Resize',
      pane_split = '  Actions: SPLIT:←/→/↑/↓|SPLIT SHELL:Alt ←/→/↑/↓',
      pane_resize = '  Actions: ←/→/↑/↓',
      split_launcher = '  Actions: SPLIT SHELL:←/→/↑/↓',
      resize_font = '  Actions: ↑/↓|R:Reset',
      tabs = '  Actions:n:New|N:New Shell|R:Rename|←/→:Focus|M:Move|C:Close|T:Navigator',
      tabs_move = '  Actions:←/→:Move Tab',
      workspace = '  Actions:N:New|S:Switch|R:Rename|←/→:Prev/Next',
      copy_mode = '  Actions: ←/→/↑/↓|w/b:Word|0/9:Line Start/End|v:Select|V:Line|C-v:Block|y:Copy|g/G:Top/Bottom|C-u/C-d:Half Page|C-b/C-f:Page|q:Exit',
   },
}
