" Tema airline carbonfox: colori del tema lualine di nightfox.nvim
" (lua/nightfox/util/lualine.lua). Sezione b = bg0 miscelato al 30% col colore.
" I numeri a 256 colori sono approssimati e servono solo senza termguicolors.
let g:airline#themes#carbonfox#palette = {}
let s:p = g:airline#themes#carbonfox#palette

let s:c = ['#b6b8bb', '#0c0c0c', 145, 16]

function! s:mode(color, cterm, faded, faded_cterm) abort
  return airline#themes#generate_color_map(
        \ ['#0c0c0c', a:color, 16, a:cterm, 'bold'],
        \ ['#f2f4f8', a:faded, 231, a:faded_cterm],
        \ s:c)
endfunction

let s:p.normal      = s:mode('#78a9ff', 111, '#2c3b55',  23)
let s:p.insert      = s:mode('#25be6a',  35, '#144128',  22)
let s:p.commandline = s:mode('#08bdba',  37, '#0b4140',  23)
let s:p.visual      = s:mode('#be95ff', 141, '#413555',  59)
let s:p.replace     = s:mode('#ee5396', 204, '#502135',  53)
let s:p.terminal    = s:mode('#3ddbd9',  80, '#1b4a4a',  23)
let s:p.inactive    = airline#themes#generate_color_map(
      \ ['#78a9ff', '#0c0c0c', 111, 16],
      \ ['#7b7c7e', '#0c0c0c', 102, 16, 'bold'],
      \ ['#6e6f70', '#0c0c0c', 59, 16])
