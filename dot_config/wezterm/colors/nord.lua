local nord = {
   nord0  = "#142433",
   nord1  = "#3B4252",
   nord2  = "#434C5E",
   nord3  = "#4C566A",

   nord4  = "#D8DEE9",
   nord5  = "#E5E9F0",
   nord6  = "#ECEFF4",

   nord7  = "#8FBCBB",
   nord8  = "#88C0D0",
   nord9  = "#81A1C1",
   nord10 = "#5E81AC",

   nord11 = "#BF616A",
   nord12 = "#D08770",
   nord13 = "#EBCB8B",
   nord14 = "#A3BE8C",
   nord15 = "#B48EAD",
}

local colorscheme = {
   foreground = nord.nord4,
   background = nord.nord0,

   cursor_bg = nord.nord4,
   cursor_border = nord.nord4,
   cursor_fg = nord.nord0,

   selection_bg = nord.nord2,
   selection_fg = nord.nord6,

   ansi = {
      nord.nord1,  -- black
      nord.nord11, -- red
      nord.nord14, -- green
      nord.nord13, -- yellow
      nord.nord9,  -- blue
      nord.nord15, -- magenta
      nord.nord8,  -- cyan
      nord.nord5,  -- white
   },

   brights = {
      nord.nord3,  -- bright black / gray
      nord.nord11, -- bright red
      nord.nord14, -- bright green
      nord.nord13, -- bright yellow
      nord.nord10, -- bright blue
      nord.nord15, -- bright magenta
      nord.nord7,  -- bright cyan
      nord.nord6,  -- bright white
   },

   tab_bar = {
      background = nord.nord0,

      active_tab = {
         bg_color = nord.nord2,
         fg_color = nord.nord6,
      },

      inactive_tab = {
         bg_color = nord.nord1,
         fg_color = nord.nord4,
      },

      inactive_tab_hover = {
         bg_color = nord.nord2,
         fg_color = nord.nord6,
      },

      new_tab = {
         bg_color = nord.nord0,
         fg_color = nord.nord4,
      },

      new_tab_hover = {
         bg_color = nord.nord1,
         fg_color = nord.nord6,
         italic = true,
      },
   },

   visual_bell = nord.nord2,

   indexed = {
      [16] = nord.nord12,
      [17] = nord.nord7,
   },

   scrollbar_thumb = nord.nord3,
   split = nord.nord3,

   compose_cursor = nord.nord12,
}

return colorscheme
