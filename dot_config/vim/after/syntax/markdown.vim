" vim-markdown (g:vim_markdown_math): la regione $...$ del plugin e' multiriga, quindi un
" $ isolato (es. $ARGUMENTS nei command di Claude Code) apre una formula che inghiotte il
" file fino al $ successivo. Qui la formula inline e' limitata a una riga; $$...$$ invariato.
if get(g:, 'vim_markdown_math', 0)
    syntax clear mkdMath
    syntax region mkdMath start="\\\@<!\$" end="\$" skip="\\\$" contains=@tex keepend oneline
    syntax region mkdMath start="\\\@<!\$\$" end="\$\$" skip="\\\$" contains=@tex keepend
endif
