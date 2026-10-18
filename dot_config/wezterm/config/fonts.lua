local wezterm = require('wezterm')
local platform = require('utils.platform')

-- local font = "MesloLGM NF"
-- local font = "DejaVuSansM Nerd Font"
-- local font = "Liga SFMono Nerd Font"
local font = "FiraCode Nerd Font"
-- local font = "MonaspiceNE Nerd Font"

local font_size = platform().is_mac and 12 or 10

return {
   font = wezterm.font({
        -- family="MesloLGM NF",
        family=font,
        harfbuzz_features={"zero" , "ss01", "cv05", "calt=0", "clig=0", "liga=1"}
   }),
    font_rules= {
    {
      italic = true,
      intensity = "Normal",
      font = wezterm.font(font, {italic=true}),
    },
    {
      intensity = "Bold",
      font = wezterm.font(font, {bold=true}),
    },
    {
      italic = true,
      intensity = "Bold",
      font = wezterm.font(font, {bold=true, italic=true}),
    },
  },
   font_size = font_size,
   line_height = 1.2,
   font_shaper = "Harfbuzz",

   --ref: https://wezfurlong.org/wezterm/config/lua/config/freetype_pcf_long_family_names.html#why-doesnt-wezterm-use-the-distro-freetype-or-match-its-configuration
   freetype_load_target = 'Normal', ---@type 'Normal'|'Light'|'Mono'|'HorizontalLcd'
   freetype_render_target = 'Normal', ---@type 'Normal'|'Light'|'Mono'|'HorizontalLcd'
}
