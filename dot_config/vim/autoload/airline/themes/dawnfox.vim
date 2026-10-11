" Tema airline dawnfox: colori del tema lualine di nightfox.nvim
" (lua/nightfox/util/lualine.lua). Sezione b = bg0 miscelato al 30% col colore.
" I numeri a 256 colori sono approssimati e servono solo senza termguicolors.
let g:airline#themes#dawnfox#palette = {}
let s:p = g:airline#themes#dawnfox#palette

let s:c = ['#625c87', '#ebe5df', 60, 224]

function! s:mode(color, cterm, faded, faded_cterm) abort
  return airline#themes#generate_color_map(
        \ ['#ebe5df', a:color, 224, a:cterm, 'bold'],
        \ ['#575279', a:faded, 60, a:faded_cterm],
        \ s:c)
endfunction

let s:p.normal      = s:mode('#286983',  24, '#b1c0c3', 146)
let s:p.insert      = s:mode('#618774',  66, '#c2c9bf', 151)
let s:p.commandline = s:mode('#ea9d34', 179, '#ebcfac', 223)
let s:p.visual      = s:mode('#907aa9', 103, '#d0c5cf', 188)
let s:p.replace     = s:mode('#b4637a', 132, '#dbbec1', 181)
let s:p.terminal    = s:mode('#d7827e', 174, '#e5c7c2', 187)
let s:p.inactive    = airline#themes#generate_color_map(
      \ ['#286983', '#ebe5df', 24, 224],
      \ ['#a8a3b3', '#ebe5df', 145, 224, 'bold'],
      \ ['#9893a5', '#ebe5df', 103, 224])
