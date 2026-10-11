" Tema airline dayfox: colori del tema lualine di nightfox.nvim
" (lua/nightfox/util/lualine.lua). Sezione b = bg0 miscelato al 30% col colore.
" I numeri a 256 colori sono approssimati e servono solo senza termguicolors.
let g:airline#themes#dayfox#palette = {}
let s:p = g:airline#themes#dayfox#palette

let s:c = ['#643f61', '#e4dcd4', 59, 188]

function! s:mode(color, cterm, faded, faded_cterm) abort
  return airline#themes#generate_color_map(
        \ ['#e4dcd4', a:color, 188, a:cterm, 'bold'],
        \ ['#3d2b5a', a:faded, 53, a:faded_cterm],
        \ s:c)
endfunction

let s:p.normal      = s:mode('#2848a9',  25, '#acb0c7', 146)
let s:p.insert      = s:mode('#396847',  59, '#b1b9aa', 145)
let s:p.commandline = s:mode('#ac5402', 130, '#d3b395', 180)
let s:p.visual      = s:mode('#6e33ce',  62, '#c1a9d2', 146)
let s:p.replace     = s:mode('#a5222f', 124, '#d1a4a3', 181)
let s:p.terminal    = s:mode('#955f61',  95, '#ccb7b2', 181)
let s:p.inactive    = airline#themes#generate_color_map(
      \ ['#2848a9', '#e4dcd4', 25, 188],
      \ ['#824d5b', '#e4dcd4', 95, 188, 'bold'],
      \ ['#837a72', '#e4dcd4', 101, 188])
