local wezterm = require('wezterm')

-- Regole hyperlink native + repository GitHub + percorso:riga
local hyperlink_rules = wezterm.default_hyperlink_rules()

-- GitHub solo tra virgolette ('folke/lazy.nvim'): senza, ogni percorso a/b diventava un link al browser
table.insert(hyperlink_rules, {
   regex = [=[["']([\w-]+)/([\w.-]+)["']]=],
   format = 'https://github.com/$1/$2',
})
-- percorso:riga con estensione (utils/open-file.lua:12) -> Neovim, gestito da utils/open-file.lua
table.insert(hyperlink_rules, {
   regex = [[(?:[A-Za-z]:)?[\w./\\-]+\.\w+:\d+]],
   format = 'nvim-open:$0',
})

return {
   -- behaviours
   automatically_reload_config = true,
   check_for_updates = false,
   -- exit_behavior = 'CloseOnCleanExit', -- if the shell program exited with a successful status
   status_update_interval = 1000,

   -- keyboard: protocollo Kitty, fa arrivare <C-Space> reale a Neovim/app
   -- enable_kitty_keyboard = true,

   -- scrollbar
   scrollback_lines = 5000,
   alternate_buffer_wheel_scroll_speed = 5,

   -- paste behaviours
   -- canonicalize_pasted_newlines = 'CarriageReturn',
   
   -- Hyperlinks: regole native + GitHub
   hyperlink_rules = hyperlink_rules,

   -- WezTerm supporta OSC 8, ma su Windows Claude Code non lo riconosce e scrive "testo URL":
   -- forzati, i link vscode://file/ di prismantis restano nascosti sotto il testo
   set_environment_variables = { FORCE_HYPERLINK = '1' },
}
