if exists('g:loaded_defer')
  finish
endif
let g:loaded_defer = 1

let s:cpo_save = &cpo
set cpo&vim

function! s:lod(...)
  for l:plug in a:000
    if has_key(g:plugs, l:plug)
      call plug#load(l:plug)
    endif
  endfor
endfunction

function! utility#defer#airline(timer) abort
  call s:lod('vim-airline')
  redraws!
  " redrawtabline
endfunction

function! utility#defer#workspace(timer) abort
  call s:lod('workspace.vim')
endfunction

function! utility#defer#motion(timer) abort
  call s:lod('vim-easymotion', 
             \ 'incsearch.vim', 
             \ 'incsearch-easymotion.vim')
endfunction

function! utility#defer#fzf(timer) abort
  call s:lod('fzf', 'fzf.vim')
endfunction

function! utility#defer#utility1(timer) abort
  call s:lod('tabular',
           \ 'vim-signature',
           \ 'ZoomWin',
           \ 'vim-windowswap',
           \ 'vim-smooth-scroll',
           \ 'vim-devicons')
endfunction

function! utility#defer#utility2(timer) abort
  call s:lod('vim-qf',
           \ 'indentLine',
           \ 'FastFold',
           \ 'neoformat',
           \ 'rainbow',
           \ 'vim-sayonara',
           \ 'MarkLines',
           \ 'lexima.vim',
           \ 'vim-pasta'
           \ )
endfunction

function! utility#defer#utility3(timer) abort
  call s:lod('animate.vim',
           \ 'lens.vim',
           \ 'vim-pasta',
           \ 'vim-matchup',
           \ 'NrrwRgn',
           \ )
endfunction

function! utility#defer#vimade(timer) abort
  call s:lod('vimade')
endfunction

set cpo&
" Ripristina il valore originale di 'cpo'
let &cpo = s:cpo_save
unlet s:cpo_save
