" Tema airline nightfox: colori del tema lualine di nightfox.nvim
" (lua/nightfox/util/lualine.lua). Sezione b = bg0 miscelato al 30% col colore.
" I numeri a 256 colori sono approssimati e servono solo senza termguicolors.
let g:airline#themes#nightfox#palette = {}
let s:p = g:airline#themes#nightfox#palette

let s:c = ['#aeafb0', '#131a24', 145, 16]

function! s:mode(color, cterm, faded, faded_cterm) abort
  return airline#themes#generate_color_map(
        \ ['#131a24', a:color, 16, a:cterm, 'bold'],
        \ ['#cdcecf', a:faded, 188, a:faded_cterm],
        \ s:c)
endfunction

let s:p.normal      = s:mode('#719cd6',  74, '#2f4159',  23)
let s:p.insert      = s:mode('#81b29a', 108, '#344847',  59)
let s:p.commandline = s:mode('#dbc074', 180, '#4f4c3c',  59)
let s:p.visual      = s:mode('#9d79d6', 140, '#3c3759',  59)
let s:p.replace     = s:mode('#c94f6d', 167, '#4a2a3a',  53)
let s:p.terminal    = s:mode('#f4a261', 215, '#574336',  59)
let s:p.inactive    = airline#themes#generate_color_map(
      \ ['#719cd6', '#131a24', 74, 16],
      \ ['#71839b', '#131a24', 67, 16, 'bold'],
      \ ['#738091', '#131a24', 102, 16])
