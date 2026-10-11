" vim: set sw=2 ts=2 sts=2 et tw=120 foldmarker={{{,}}} foldmethod=marker nospell:

"" Vim plugin file
" Fats status line
" Author: Boscolo Michele <miboscol@gmail.com>

""""""""""""""""""""""""""""""""""""""" Global Variables

" Chech if enable custom statusLine {{{
  if get(g:, 'disable_my_fast_statusline', 0)
    finish
  endif
" }}}

" Dont load more than once {{{
  let g:loaded_longStl = get(g:, 'loaded_longStl',  0)
  if g:loaded_longStl == 1
    finish
  endif
  let g:loaded_longStl = 1
" }}}

" Global Config {{{
  let s:time = ''

  " Global git status for all buffers
  let s:GitStatus = {"enabled": 1}
  " How many times until we update Git information without a write
  let s:GitMaxCacheExp = 1000
  " Shose theme [default, one-vim]
  let s:Theme = "meterial" 

" }}}

" Set Color {{{

  " Background Colors
  " From left to right
  if s:Theme == "default" 

    let s:errLblColor   = "#af0000"     " Error label background color
    let s:warnLblColor  = "#ff8700"     " Warning label background color
    let s:clkLblColor   = "#0a2c3b"     " Clock label background color
    let s:nLblColor     = "#005F5F"     " Normal mode label background color
    let s:vLblColor     = "#87005F"     " Visual mode label background color
    let s:rLblColor     = "#52ba00"     " Replace mode label background color
    let s:iLblColor     = "#008700"     " Insert mode label background color
    let s:sLblColor     = "#0056c4"     " Select mode label background color
    let s:oLblColor     = "#996BA0"     " Other modes label background color
    let s:disLblColor   = "#3f3f45"     " Inactive window mode label background color
    let s:flnLblColor   = "#292C33"     " Filename label background color
    let s:mFlgColor     = "#7e7e89"     " Modified flag color
    let s:infBColor     = "#005f87"     " Information bar background color
    let s:disInfBColor  = "#3f3f45"     " Inactive window information bar background color
    let s:rcLbl         = "#87005F"     " Right corner label background color

    " FG colors
    let s:white         = "#fcfcfc"     " White foreground color
    let s:orange        = "#c66628"     " Orange foreground colr
    let s:purpel        = "#7f95d0"     " Purpel foreground color
    let s:black         = "#000000"     " Black foreground color
  elseif s:Theme == "one-vim"

    let s:errLblColor   = "#be5046"     " Error label background color
    let s:warnLblColor  = "#be5046"     " Warning label background color
    let s:clkLblColor   = "#0a2c3b"     " Clock label background color
    let s:nLblColor     = "#98c379"     " Normal mode label background color
    let s:vLblColor     = "#87005F"     " Visual mode label background color
    let s:rLblColor     = "#50a14f"     " Replace mode label background color
    let s:iLblColor     = "#61afef"     " Insert mode label background color
    let s:sLblColor     = "#c678dd"     " Select mode label background color
    let s:oLblColor     = "#996BA0"     " Other modes label background color
    let s:disLblColor   = "#3f3f45"     " Inactive window mode label background color
    let s:flnLblColor   = "#292C33"     " Filename label background color
    let s:mFlgColor     = "#7e7e89"     " Modified flag color
    let s:infBColor     = "#44AEBC"     " Information bar background color
    let s:disInfBColor  = "#3f3f45"     " Inactive window information bar background color
    let s:rcLbl         = "#c678dd"     " Right corner label background color

    " FG colors
    let s:white         = "#fcfcfc"     " White foreground color
    let s:orange        = "#c66628"     " Orange foreground colr
    let s:purpel        = "#7f95d0"     " Purpel foreground color
    let s:black         = "#000000"     " Black foreground color
  elseif s:Theme == "meterial"
    let s:errLblColor   = "#F07178"     " Error label background color
    let s:warnLblColor  = "#F07178"     " Warning label background color
    let s:clkLblColor   = "#0a2c3b"     " Clock label background color
    let s:nLblColor     = "#C3E88D"     " Normal mode label background color
    let s:vLblColor     = "#87005F"     " Visual mode label background color
    let s:rLblColor     = "#50a14f"     " Replace mode label background color
    let s:iLblColor     = "#82AAFF"     " Insert mode label background color
    let s:sLblColor     = "#C792EA"     " Select mode label background color
    let s:oLblColor     = "#996BA0"     " Other modes label background color
    let s:disLblColor   = "#3f3f45"     " Inactive window mode label background color
    let s:flnLblColor   = "#292C33"     " Filename label background color
    let s:mFlgColor     = "#7e7e89"     " Modified flag color
    let s:infBColor     = "#82AAFF"     " Information bar background color
    let s:disInfBColor  = "#3f3f45"     " Inactive window information bar background color
    let s:rcLbl         = "#C792EA"     " Right corner label background color

    " FG colors
    let s:white         = "#fcfcfc"     " White foreground color
    let s:orange        = "#F78C6C"     " Orange foreground colr

    let s:purpel        = "#C792EA"     " Purpel foreground color
    let s:black         = "#000000"     " Black foreground color
  endif

" }}}

" Set Symbol {{{

  " let s:lnumSym     = "Ln"          " Line number symbol ()
  let s:lnumSym       = "\ue0a1"      " Line number symbol ()
  let s:lpercSym      = "\uf777"      " Line number symbol ()
  let s:cnumSym       = "Col"         " Column number symbol
  let s:rASym         = "\ue0b0"      " Right arrow symbol ()
  let s:lASym         = "\ue0b2"      " Left arrow symbol ()
  let s:tagNameSym    = "\u21b3"      " Tag name symbol (↳)
  let s:sepASym       = "\ue0b9"      " One color Strick separating information bar components ( )
  let s:sepBSym       = "\ue0b8"      " Two color Strick separating information bar components ( )
  let s:gitBranchSym  = "\ue0a0"      " Git branch symbol ()
  let s:gitInsSym     = "\u2714"      " Git inserted lines symbol ( ✔ )
  let s:gitDelSym     = "\u2718"      " Git deleted lines symbol ( ✘ )
  let s:gitUnTckSym   = "??"          " Git untracked file symbol
  let s:readonlySym   = "\ue0a2"      " Readonly flag symbol ()
  let s:modifySym     = "\uf0e7"      " Modify flag symbol ( ⚡)

" }}}

" Static Dictionary {{{
  " I use dictionary for fast initialization and redraw

  " FileType symbol {{{
    let s:fileType = 
          \ {
          \  "": "",
          \  "typescript":        " ",
          \  "html":              " ",
          \  "scss":              " ",
          \  "css":               " ",
          \  "javascript":        " ",
          \  "javascriptreact":   " ",
          \  "markdown":          " ",
          \  "sh":                " ",
          \  "zsh":               " ",
          \  "vim":               " ",
          \  "rust":              " ",
          \  "cpp":               " ",
          \  "c":                 " ",
          \  "go":                " ",
          \  "ruby":              " ",
          \  "lua":               " ",
          \  "haskel":            " ",
          \  "python":            " ",
          \  "json":              "ﬥ ",
          \  "text":              " ",
          \  "yaml":               " ",
          \  "nerdtree":          " ",
          \ }
  " }}}

  " Status Mode {{{
    " Mode labels dictionary
    " [disabled|enabled][mode()]
    let s:modeMap =
          \ {
            \ "0":{
              \ "n":      "%#DisLbl# NORMAL %#DisLblSepFln#"    .    s:rASym,
              \ "c":      "%#DisLbl# NORMAL %#DisLblSepFln#"    .    s:rASym,
              \ "V":      "%#DisLbl# VISUAL %#DisLblSepFln#"    .    s:rASym,
              \ "v":      "%#DisLbl# VISUAL %#DisLblSepFln#"    .    s:rASym,
              \ "\<C-V>": "%#DisLbl# V·BLOCK %#DisLblSepFln#"   .    s:rASym,
              \ "i":      "%#DisLbl# INSERT %#DisLblSepFln#"    .    s:rASym,
              \ "R":      "%#DisLbl# REPLACE %#DisLblSepFln#"   .    s:rASym,
              \ "s":      "%#DisLbl# SELECT %#DisLblSepFln#"    .    s:rASym,
              \ "S":      "%#DisLbl# SELECT %#DisLblSepFln#"    .    s:rASym,
              \ "\<C-S>": "%#DisLbl# SELECT %#DisLblSepFln#"    .    s:rASym,
              \ "!":      "%#DisLbl# OTHER %#DisLblSepFln#"     .    s:rASym,
              \ "t":      "%#DisLbl# OTHER %#DisLblSepFln#"     .    s:rASym,
              \ "r":      "%#DisLbl# OTHER %#DisLblSepFln#"     .    s:rASym,
            \ }, 
            \ "1":{
              \ "n":      "%#NLbl# NORMAL %#NLblSepFln#"    .    s:rASym,
              \ "c":      "%#NLbl# NORMAL %#NLblSepFln#"    .    s:rASym,
              \ "V":      "%#VLbl# VISUAL %#VLblSepFln#"    .    s:rASym,
              \ "v":      "%#VLbl# VISUAL %#VLblSepFln#"    .    s:rASym,
              \ "\<C-V>": "%#VLbl# V·BLOCK %#VLblSepFln#"   .    s:rASym,
              \ "i":      "%#ILbl# INSERT %#ILblSepFln#"    .    s:rASym,
              \ "R":      "%#RLbl# REPLACE %#RLblSepFln#"   .    s:rASym,
              \ "s":      "%#SLbl# SELECT %#SLblSepFln#"    .    s:rASym,
              \ "S":      "%#SLbl# SELECT %#SLblSepFln#"    .    s:rASym,
              \ "\<C-S>": "%#SLbl# SELECT %#SLblSepFln#"    .    s:rASym,
              \ "!":      "%#OLBL# OTHER %#OLblSepFln#"     .    s:rASym,
              \ "t":      "%#OLBL# OTHER %#OLblSepFln#"     .    s:rASym,
              \ "r":      "%#OLBL# OTHER %#OLblSepFln#"     .    s:rASym,
            \ }
          \ }
   " }}}

  " Modified flag {{{
    let s:modifiedFlag =
          \ {
            \ 0:{
              \ 0: "%#DisInfBSepFln#", 1: "%#InfBSepFln#"
            \ },
            \ 1:{
              \ 0: "%#MFlagSepFln#" . s:lASym . "%#MFlag# %#DisInfBSepMFlag#",
              \ 1: "%#MFlagSepFln#" . s:lASym . "%#MFlag# %#InfBSepMFlag#"
            \ }
          \ }
  " }}}

" }}}

" Helper functions {{{

  " Utils function {{{
    function! s:IsTempFile()
      if !empty(&buftype) | return 1 | endif
      if &previewwindow | return 1 | endif
      let filename = expand('%:p')
      if filename =~# '^/tmp' | return 1 | endif
      if filename =~# '^fugitive:' | return 1 | endif
      return 0
    endfunction

    function s:GetFilename(buf) " {{{ 
      " If inside git repo, get path relative to git root, otherwise show full path

      let l:flname = fnamemodify(expand("#" . a:buf), ":~:.")

      " if s:GitStatus[a:buf]["IsGit"]
      "     return fnamemodify(s:GitStatus[a:buf]["RootDir"], ":t") .
      "                 \ substitute(l:flname, s:GitStatus[a:buf]["RootDir"], "", "")
      " endif

      return l:flname
    endfunction " }}}

    function s:GetFileType(buf) " {{{
      let l:fileType = getbufvar(a:buf, '&filetype') 
      try
        let l:icon = s:fileType[l:fileType]
      catch
        let l:icon = " " " not found   
      endtry

      return " %(" . l:icon . l:fileType . "%)"
    endfunction " }}}


  " }}}

    function s:UpdateWinStl() " {{{
      if &previewwindow | return | endif
      if s:IsTempFile() | return | endif
      " Status lines manager
      let l:bottomRightWin = winnr('$')

      let l:winnr = winnr()
      let l:bufnum = winbufnr(l:winnr)
      let l:winbufname = bufname(l:bufnum)
      let l:winid = win_getid(l:winnr)
      let l:isPrv = getwinvar(l:winnr, "&pvw")
      let l:isHelp = getbufvar(l:winbufname, "&ft") ==# "help"
      let l:isQf = getwinvar(l:winnr, '&syntax') == 'qf'
      let l:isNerdTree = getwinvar(l:winnr, "&ft") == 'nerdtree'

      " if l:winbufname ==# g:TagList_title
      "     " Set the taglist status line
      "     call setwinvar(n, '&statusline', "%!SetTaglistSts()")
      "     let l:taglistWin = n

      if l:isPrv || l:isHelp || l:isQf
        " Set straight line
        call setwinvar(l:winnr, '&statusline',
              \ "%#StraightLine#%{" .
              \ "repeat('_',\ winwidth(win_id2win(".l:winid.")))" .
              \ "}")
      elseif l:isNerdTree
        " NerdTree line
        call setwinvar(l:winnr, '&statusline',
              \ "%#StraightLine#" .
              \ "%Y" .
              \ "%=" .
              \ " ")
      else
        " Other windows status lines
        call setwinvar(l:winnr, '&statusline',
              \ "%!SetStatusLine(".l:winid.")")
      end
    endfunction   " }}}

    function SetStatusLine(winid) " {{{
      " Builds the status line
      let l:winnum = win_id2win(a:winid)
      let l:buf = winbufnr(l:winnum)
      let l:isActiveWindow = (l:winnum == winnr())

      " Initialize Git
      " call s:GitInit(l:buf)

      " Mode
      let l:sts = s:modeMap[l:isActiveWindow][mode()]

      " File name
      let l:sts .= s:BuildFilenameLbl(l:buf, l:isActiveWindow)

      " Left align
      let l:sts .= "%="

      " Modified flag
      let l:sts .= s:modifiedFlag[getbufvar(l:buf, "&modified")][l:isActiveWindow]

      " Information bar
      let l:sts .= s:BuildInfBar(l:buf, l:isActiveWindow)

      return l:sts
    endfunction " }}}

    function s:BuildFilenameLbl(buf, isActiveWindow) " {{{
      " Builds file name
      let l:bufreadonly = getbufvar(a:buf, "&readonly") ||
            \ (getbufvar(a:buf, "&modifiable") == 0)

      let l:bufmodify = getbufvar(a:buf, "&modified")

      let l:filename = (getbufvar(a:buf, '&filetype') == "mail") ?
            \ "New mail" :
            \ s:GetFilename(a:buf)

      let l:middleText = "%#FlnLbl#" . l:filename . " " .
            \ ((l:bufreadonly) ? s:readonlySym . " " : "") .
            \ ((l:bufmodify) ? s:modifySym . " " : "" )

      " let l:md = mode()
      " if (l:md ==? "i" || l:md ==# "R") && (a:isActiveWindow)
      "     " Consult Taglist about nearby tag
      "     let l:funcProto = Tlist_Get_Tag_Prototype_By_Line()

      "     if (len(l:funcProto))
      "         " Show function name instead in insert or replace mode
      "         let l:middleText = "%#FuncLbl#" . s:tagNameSym .
      "                     \ " " . s:RightTruncate(l:funcProto,
      "                     \ (winwidth(0) - ((s:GitStatus[a:buf]["IsGit"]) ? 69 : 45)))

      "     endif

      " endif

      return " %<%(" . l:middleText . "%)"
    endfunction " }}}

    function s:BuildInfBar(buf, isActiveWindow) abort " {{{
      " Builds information bar [Git, Col&Ln, Percentage]
      let l:infBHighlight = (a:isActiveWindow)? "InfB" : "DisInfB"
      let l:infBar = s:lASym . "%#" . l:infBHighlight . "# "

      " if s:GitStatus[a:buf]["IsGit"]
      "     let l:infBar .= s:gitBranchSym . " " .
      "                 \ s:GitStatus[a:buf]["BranchName"] . s:GitStatus[a:buf]["Dirty"]

      "     let l:infBar .= " %#" . l:infBHighlight . "Strick#" .
      "                 \ s:sepASym . " %#" . l:infBHighlight . "#"

      "     if s:GitStatus[a:buf]["IsTracked"]
      "         let l:infBar .= s:gitInsSym . " " . s:GitStatus[a:buf]["InsertNum"] . " "
      "         let l:infBar .= s:gitDelSym . " " . s:GitStatus[a:buf]["DeleteNum"]
      "     else
      "         let l:infBar .= s:gitUnTckSym
      "     endif

      "     let l:infBar .= " %#" . l:infBHighlight . "Strick#" .
      "                 \ s:sepASym . " %#" . l:infBHighlight . "#"

      " endif

      " let l:icon_syntax = {"enabled": 1}
      " let l:infBar .= s:GetFileType2(a:buf, a:isActiveWindow, l:icon_syntax) . " %#" . l:infBHighlight .
      "             \ "Strick#"

      let l:infBar .= s:GetFileType(a:buf) . " %#" . l:infBHighlight .
            \ "Strick#"

      " let l:infBar .= s:cnumSym . " %c" . " %#" . l:infBHighlight .
      "       \ "Strick#" . s:sepASym . " %#" . l:infBHighlight . "#"

      " let l:infBar .= " %2p%% " . s:lpercSym . " %l" . "/%L " . s:lnumSym . ":%c" ." %#" . l:infBHighlight . 
      "       \ "Strick#" . s:sepASym . " %#" . l:infBHighlight . "#"

      " if luaeval("#vim.lsp.buf_get_clients(".a:buf . ")") && (a:isActiveWindow)
      "   let l:infBar .= s:sepASym . " %<%(" . luaeval("require('lsp-status').status()")[6:-1] . "%)"  . "%#" . l:infBHighlight .
      "         \ "Strick#"
      " endif


      if (a:isActiveWindow)
        let l:infBar .= " %#RCSep" . l:infBHighlight . "#" .
                  \ s:sepBSym . "  %#RC#" . " %2p%% " . s:lpercSym . " %l" . "/%L " . s:lnumSym . ":%c" . " "
      endif

      " let l:infBar .= s:lnumSym . ":%c"
      " let l:infBar .= " %#RCSep" . l:infBHighlight . "#" .
      "           \ s:sepBSym . "  %#RC#" . s:time ." "
      

      return l:infBar
    endfunction " }}}

  " }}}

" }}}

" Status line highlight groups {{{

  " All flattened
  " From left to right
  exec 'hi! ErrLbl guibg='                .s:errLblColor     . ' guifg='     . s:white
  exec 'hi! ErrLblSepWrn guibg='          .s:warnLblColor    . ' guifg='     . s:errLblColor
  exec 'hi! ErrLblSepClk guibg='          .s:clkLblColor     . ' guifg='     . s:errLblColor

  exec 'hi! WrnLbl guibg='                .s:warnLblColor    . ' guifg='     . s:white
  exec 'hi! WrnLblSepClk guibg='          .s:clkLblColor     . ' guifg='     . s:warnLblColor

  exec 'hi! ClkLbl guibg='                .s:clkLblColor     . ' guifg='     . s:white

  exec 'hi! NLbl gui=NONE guibg='         .s:nLblColor       . ' guifg='     . s:white
  exec 'hi! NLblSepFln guibg='            .s:flnLblColor     . ' guifg='     . s:nLblColor
  exec 'hi! NLblSepClk guibg='            .s:clkLblColor     . ' guifg='     . s:nLblColor

  exec 'hi! VLbl gui=NONE guibg='         .s:vLblColor       . ' guifg='     . s:white
  exec 'hi! VLblSepFln guibg='            .s:flnLblColor     . ' guifg='     . s:vLblColor
  exec 'hi! VLblSepClk guibg='            .s:clkLblColor     . ' guifg='     . s:vLblColor

  exec 'hi! RLbl gui=NONE guibg='         .s:rLblColor       . ' guifg='     . s:white
  exec 'hi! RLblSepFln guibg='            .s:flnLblColor     . ' guifg='     . s:rLblColor
  exec 'hi! RLblSepClk guibg='            .s:clkLblColor     . ' guifg='     . s:rLblColor

  exec 'hi! ILbl gui=NONE guibg='         .s:iLblColor       . ' guifg='     . s:white
  exec 'hi! ILblSepFln guibg='            .s:flnLblColor     . ' guifg='     . s:iLblColor
  exec 'hi! ILblSepClk guibg='            .s:clkLblColor     . ' guifg='     . s:iLblColor

  exec 'hi! SLbl gui=NONE guibg='         .s:sLblColor       . ' guifg='     . s:white
  exec 'hi! SLblSepFln guibg='            .s:flnLblColor     . ' guifg='     . s:sLblColor
  exec 'hi! SLblSepClk guibg='            .s:clkLblColor     . ' guifg='     . s:sLblColor

  exec 'hi! OLbl gui=NONE guibg='         .s:oLblColor       . ' guifg='     . s:white
  exec 'hi! OLblSepFln guibg='            .s:flnLblColor     . ' guifg='     . s:oLblColor
  exec 'hi! OLblSepClk guibg='            .s:clkLblColor     . ' guifg='     . s:oLblColor

  exec 'hi! DisLbl gui=NONE guibg='       .s:disLblColor     . ' guifg='     . s:white
  exec 'hi! DisLblSepFln guibg='          .s:flnLblColor     . ' guifg='     . s:disLblColor
  exec 'hi! DisLblSepClk guibg='          .s:clkLblColor     . ' guifg='     . s:disLblColor

  exec 'hi! FlnLbl gui=None guibg='       .s:flnLblColor     . ' guifg='     . s:white
  exec 'hi! FuncLbl gui=None guibg='      .s:flnLblColor     . ' guifg='     . s:orange


  exec 'hi! MFlag gui=NONE guibg='        .s:mFlgColor
  exec 'hi! MFlagSepFln guibg='           .s:flnLblColor     . ' guifg='      . s:mFlgColor

  exec 'hi! InfB gui=NONE guibg='         .s:infBColor       . ' guifg='      . s:white
  exec 'hi! InfBStrick gui=NONE guibg='   .s:infBColor       . ' guifg='      . s:black
  exec 'hi! InfBSepMFlag guibg='          .s:mFlgColor       . ' guifg='      . s:infBColor
  exec 'hi! InfBSepFln guibg='            .s:flnLblColor     . ' guifg='      . s:infBColor

  exec 'hi! DisInfB gui=NONE guibg='      .s:disInfBColor    . ' guifg='      . s:white
  exec 'hi! DisInfBStrick gui=NONE guibg='.s:disInfBColor    . ' guifg='      . s:black
  exec 'hi! DisInfBSepMFlag guibg='       .s:mFlgColor       . ' guifg='      . s:disInfBColor
  exec 'hi! DisInfBSepFln guibg='         .s:flnLblColor     . ' guifg='      . s:disInfBColor

  exec 'hi! RC gui=NONE guibg='           .s:rcLbl           . ' guifg='      . s:white
  exec 'hi! RCSepInfB guibg='             .s:rcLbl           . ' guifg='      . s:infBColor
  exec 'hi! RCSepDisInfB guibg='          .s:rcLbl           . ' guifg='      . s:disInfBColor

  exec 'hi! StatusLine guifg='            .s:flnLblColor     . ' guibg='      .s:flnLblColor
  exec 'hi! StatusLineNC guibg='          .s:flnLblColor      . ' guifg='      .s:flnLblColor

  exec 'hi! StraightLine guifg='          .s:white          . ' guibg='      . 'NONE'

  unlet s:nLblColor s:iLblColor s:rLblColor s:vLblColor
              \ s:sLblColor s:oLblColor s:disLblColor s:flnLblColor
              \ s:mFlgColor s:infBColor s:disInfBColor s:rcLbl
              \ s:errLblColor s:warnLblColor s:clkLblColor s:white
              \ s:orange s:purpel s:black

" }}}

" Enable StatusLine{{{

  " Enable statusline
  set laststatus=2

  " Disable showmode - i.e. Don't show mode like --INSERT-- in current statusline.
  set noshowmode

  " Enable GUI colors for terminals (Some terminals may not support this, so you'll have to *manually* set color pallet for tui colors. Lie tuibg=255, tuifg=120, etc.).
  " solo se spento: impostarlo di nuovo fa ricaricare il colorscheme (~17 ms)
  if !&termguicolors
    set termguicolors
  endif

" }}}

" Autocmd {{{

  augroup longsts
    autocmd!
    " Call our status line manager
    autocmd BufWinEnter,WinEnter,BufDelete,SessionLoadPost,FileChangedShellPost * call s:UpdateWinStl()
    autocmd FileType nerdtree call s:UpdateWinStl()
    " Update git with every write
    " autocmd BufWritePost * call s:GitUpdate(0)
    " GitToggle Command
    " command! -nargs=0 -bar GitToggle call s:GitToggleGit()
    " GitDiff
    " command! -nargs=0 GD call s:GitDiff()
    " Git Debug
    " command! -nargs=0 GitDebug call s:GitDebug()
  augroup END

" }}}

finish
" Unused Stuff {{{

  if !exists('g:coldevicons_colormap')    " Colormap containing name for color and RRGGBB hex values
      let g:coldevicons_colormap = {
          \'Brown'        : '905532',
          \'Aqua'         : '3AFFDB',
          \'Blue'         : '689FB6',
          \'Darkblue'     : '44788E',
          \'Purple'       : '834F79',
          \'Red'          : 'AE403F',
          \'Beige'        : 'F5C06F',
          \'Yellow'       : 'F09F17',
          \'Orange'       : 'D4843E',
          \'Darkorange'   : 'F16529',
          \'Pink'         : 'CB6F6F',
          \'Salmon'       : 'EE6E73',
          \'Green'        : '8FAA54',
          \'Lightgreen'   : '31B53E',
          \'White'        : 'FFFFFF',
          \'LightBlue'    : '5fd7ff'
      \}
  endif

  if !exists('g:coldevicons_iconmap')     " Iconmap mapping colors to the Symbols [default unused symbols : , , ]
      let g:coldevicons_iconmap = {
          \'Brown'        : [''],
          \'Aqua'         : [''],
          \'LightBlue'    : ['',''],
          \'Blue'         : ['','','','','','','','','','','','',''],
          \'Darkblue'     : ['',''],
          \'Purple'       : ['','','','','',''],
          \'Red'          : ['','','','','',''],
          \'Beige'        : ['','',''],
          \'Yellow'       : ['','','λ','',''],
          \'Orange'       : [''],
          \'Darkorange'   : ['','','','',''],
          \'Pink'         : ['',''],
          \'Salmon'       : [''],
          \'Green'        : ['','','','','',''],
          \'Lightgreen'   : ['','',''],
          \'White'        : ['','','','','','']
      \}
  endif

  function s:GetFileType2(buf, isActiveWindow, icon_syntax)
    let l:icon   = ''
    let l:flname = expand("#" . a:buf . ":t")
    let l:flextension = expand("%:e")
    let l:fileType = getbufvar(a:buf, '&filetype') 
    if luaeval("require('nvim-web-devicons').get_icon")(l:flname,l:flextension) == v:null
      let l:icon = ''
    else
      let l:icon = luaeval("require('nvim-web-devicons').get_icon")(l:flname,l:flextension)
    endif



    if a:icon_syntax["enabled"]
      let l:bg_color = (a:isActiveWindow)? s:infBColor : s:disInfBColor
      for color in keys(g:coldevicons_iconmap)
          let l:icon_index = index(g:coldevicons_iconmap[color], l:icon)
          if l:icon_index != -1
            execute 'highlight! FileIcon'.color.' guifg=#'.g:coldevicons_colormap[color] . ' guibg=' . l:bg_color . ' gui=bold'
            break
          endif
      endfor
      return "%#FileIcon".color."#" . " %(" . l:icon . " " . l:fileType . "%)"
    endif

    return " %(" . l:icon . " " . l:fileType . "%)"
  endfunction

" }}}
