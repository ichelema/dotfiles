" Tema airline terafox: colori del tema lualine di nightfox.nvim
" (lua/nightfox/util/lualine.lua). Sezione b = bg0 miscelato al 30% col colore.
" I numeri a 256 colori sono approssimati e servono solo senza termguicolors.
let g:airline#themes#terafox#palette = {}
let s:p = g:airline#themes#terafox#palette

let s:c = ['#cbd9d8', '#0f1c1e', 188, 16]

function! s:mode(color, cterm, faded, faded_cterm) abort
  return airline#themes#generate_color_map(
        \ ['#0f1c1e', a:color, 16, a:cterm, 'bold'],
        \ ['#e6eaea', a:faded, 188, a:faded_cterm],
        \ s:c)
endfunction

let s:p.normal      = s:mode('#5a93aa',  67, '#264048',  23)
let s:p.insert      = s:mode('#7aa4a1', 109, '#2f4545',  23)
let s:p.commandline = s:mode('#fda47f', 216, '#56453b',  59)
let s:p.visual      = s:mode('#ad5c7c', 132, '#3e2f3a',  53)
let s:p.replace     = s:mode('#e85c51', 167, '#502f2d',  52)
let s:p.terminal    = s:mode('#ff8349', 209, '#573b2b',  58)
let s:p.inactive    = airline#themes#generate_color_map(
      \ ['#5a93aa', '#0f1c1e', 67, 16],
      \ ['#587b7b', '#0f1c1e', 66, 16, 'bold'],
      \ ['#6d7f8b', '#0f1c1e', 66, 16])
