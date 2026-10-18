local wezterm = require('wezterm')
local colors = require('colors.nord')
-- local fonts = require('config.fonts')

return {
    term = "xterm-256color",
    enable_kitty_graphics = true,
    animation_fps = 60,
    max_fps = 60,
    front_end = 'OpenGL',
    webgpu_power_preference = 'HighPerformance',
    window_background_opacity = 1,
    text_background_opacity = 1,
    win32_system_backdrop = "Disable",

    -- color_scheme = "Gruvbox Dark (Gogh)",
    colors = colors,
    -- ravviva la palette desaturata di Nord (moltiplicatori HSB)
    foreground_text_hsb = {
        hue = 1,
        saturation = 1.1,
        brightness = 1,
    },
    audible_bell = "Disabled",
    debug_key_events = false,

    -- scrollbar
    enable_scroll_bar = true,
    min_scroll_bar_height = "3cell",
    -- colors = {
    --     scrollbar_thumb = '#454545',
    --     -- sfondo Nord (#2E3440) leggermente piu scuro
    --     background = '#272C36',
    -- },

    -- tab bar
    enable_tab_bar = true,
    tab_bar_at_bottom = false,
    hide_tab_bar_if_only_one_tab = false,
    use_fancy_tab_bar = false,
    tab_max_width = 35,
    show_tab_index_in_tab_bar = true,
    switch_to_last_active_tab_when_closing_tab = true,

    -- cursor
    default_cursor_style = "BlinkingBlock",
    cursor_blink_ease_in = "Constant",
    cursor_blink_ease_out = "Constant",
    cursor_blink_rate = 700,

    -- window
    window_decorations = "INTEGRATED_BUTTONS|RESIZE",
    integrated_title_button_style = "Windows",
    integrated_title_button_color = "auto",
    integrated_title_button_alignment = "Right",
    adjust_window_size_when_changing_font_size = false,
    initial_cols = 240,
    initial_rows = 42,


    window_padding = {
        left = 1,
        right = 1,
        top = 0,
        bottom = 1,
    },
    window_close_confirmation = 'NeverPrompt',
    skip_close_confirmation_for_processes_named = { "bash", "sh", "zsh", "fish", "tmux", "cmd", "zellij" },
    window_frame = {
        active_titlebar_bg = '#090909',
        -- font = fonts.font,
        -- font_size = fonts.font_size,
    },
    inactive_pane_hsb = { saturation = 0.8, brightness = 0.8 },
    unzoom_on_switch_pane = true,

}
