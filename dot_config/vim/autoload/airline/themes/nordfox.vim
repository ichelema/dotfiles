" Tema airline nordfox: colori del tema lualine di nightfox.nvim
" (lua/nightfox/util/lualine.lua). Sezione b = bg0 miscelato al 30% col colore.
" I numeri a 256 colori sono approssimati e servono solo senza termguicolors.
let g:airline#themes#nordfox#palette = {}
let s:p = g:airline#themes#nordfox#palette

let s:c = ['#abb1bb', '#232831', 145, 17]

function! s:mode(color, cterm, faded, faded_cterm) abort
  return airline#themes#generate_color_map(
        \ ['#232831', a:color, 17, a:cterm, 'bold'],
        \ ['#cdcecf', a:faded, 188, a:faded_cterm],
        \ s:c)
endfunction

let s:p.normal      = s:mode('#81a1c1', 109, '#3f4c5c',  59)
let s:p.insert      = s:mode('#a3be8c', 144, '#49554c',  59)
let s:p.commandline = s:mode('#ebcb8b', 222, '#5f594c',  59)
let s:p.visual      = s:mode('#b48ead', 139, '#4f4756',  59)
let s:p.replace     = s:mode('#bf616a', 131, '#523942',  59)
let s:p.terminal    = s:mode('#c9826b', 173, '#554342',  59)
let s:p.inactive    = airline#themes#generate_color_map(
      \ ['#81a1c1', '#232831', 109, 17],
      \ ['#7e8188', '#232831', 102, 17, 'bold'],
      \ ['#60728a', '#232831', 60, 17])
