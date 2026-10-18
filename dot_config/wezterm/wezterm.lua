local Config = require('config')

require('events.tabline').setup()
require('events.new-tab-button').setup()
require('events.start-position').setup()
-- CTRL+clic su un link file:// lo apre in Neovim
require('wezterm').on('open-uri', require('utils.open-file').on_open_uri)

-- domains.lua è cifrato in chezmoi: dove manca la chiave age non c'è, e WezTerm parte senza connessioni SSH
local ok, domains = pcall(require, 'config.domains')
if not ok then
   require('wezterm').log_warn('config/domains.lua non caricato, niente connessioni SSH: ' .. tostring(domains))
   domains = {}
end

return Config:init()
    :append(require('config.appearance'))
    :append(require('config.bindings'))
    :append(domains)
    :append(require('config.fonts'))
    :append(require('config.general'))
    :append(require('config.launch'))
.options

-- https://github.com/QianSong1/wezterm-config
