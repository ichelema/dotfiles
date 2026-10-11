" Tema airline duskfox: colori del tema lualine di nightfox.nvim
" (lua/nightfox/util/lualine.lua). Sezione b = bg0 miscelato al 30% col colore.
" I numeri a 256 colori sono approssimati e servono solo senza termguicolors.
let g:airline#themes#duskfox#palette = {}
let s:p = g:airline#themes#duskfox#palette

let s:c = ['#cdcbe0', '#191726', 188, 16]

function! s:mode(color, cterm, faded, faded_cterm) abort
  return airline#themes#generate_color_map(
        \ ['#191726', a:color, 16, a:cterm, 'bold'],
        \ ['#e0def4', a:faded, 189, a:faded_cterm],
        \ s:c)
endfunction

let s:p.normal      = s:mode('#569fba',  73, '#2b4052',  23)
let s:p.insert      = s:mode('#a3be8c', 144, '#424945',  59)
let s:p.commandline = s:mode('#f6c177', 216, '#5b4a3e',  59)
let s:p.visual      = s:mode('#c4a7e7', 182, '#4c4260',  59)
let s:p.replace     = s:mode('#eb6f92', 204, '#583146',  59)
let s:p.terminal    = s:mode('#ea9a97', 174, '#583e48',  59)
let s:p.inactive    = airline#themes#generate_color_map(
      \ ['#569fba', '#191726', 73, 16],
      \ ['#6e6a86', '#191726', 60, 16, 'bold'],
      \ ['#817c9c', '#191726', 103, 16])
