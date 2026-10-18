local wezterm = require('wezterm')
local platform = require('utils.platform')()
local act = wezterm.action
local launch = require('config.launch')
local open_file = require('utils.open-file')

local mod = {}

if platform.is_mac then
   mod.ALT = 'SUPER'
elseif platform.is_win or platform.is_linux then
   mod.ALT = 'ALT' -- to not conflict with Windows key shortcuts
end

-- durata di leader e key table, e quindi dei loro suggerimenti nella barra.
-- WezTerm non rinnova il timeout a ogni tasto: la key table si chiude TABLE_TIMEOUT ms dopo
-- l'apertura anche mentre la usi; Esc o q la chiudono prima
local LEADER_TIMEOUT = 2000
local TABLE_TIMEOUT = 6000

---Key table sticky: resta attiva dopo ogni tasto, si chiude dopo `timeout` ms dall'apertura
local function sticky_table(name, timeout)
   return act.ActivateKeyTable({
      name = name,
      one_shot = false,
      replace_current = false,
      timeout_milliseconds = timeout,
   })
end

local function build_launcher_choices()
  local choices = {}

  for i, item in ipairs(launch.launch_menu or {}) do
    table.insert(choices, {
      id = tostring(i),
      label = item.label or table.concat(item.args or {}, ' '),
    })
  end

  return choices
end

local function clone_spawn_command(item)
  local cmd = {}

  for k, v in pairs(item or {}) do
    if k ~= 'label' then
      cmd[k] = v
    end
  end

  if cmd.domain == nil then
    cmd.domain = 'CurrentPaneDomain'
  end

  return cmd
end

local function split_with_launcher(direction)
  return wezterm.action_callback(function(window, pane)
    window:perform_action(act.PopKeyTable, pane)

    window:perform_action(
      act.InputSelector({
        title = 'Split ' .. direction,
        choices = build_launcher_choices(),
        fuzzy = true,
        fuzzy_description = 'Choose launcher for ' .. direction .. ' split: ',

        action = wezterm.action_callback(function(win, p, id, label)
          if not id then
            return
          end

          local item = launch.launch_menu[tonumber(id)]

          if not item or not item.args then
            return
          end

          win:perform_action(
            act.SplitPane({
              direction = direction,
              size = { Percent = 50 },
              command = clone_spawn_command(item),
            }),
            p
          )
        end),
      }),
      pane
    )
  end)
end

local function spawn_tab_with_launcher()
  return wezterm.action_callback(function(window, pane)
    -- Chiude la key table "tabs", così il menu può usare i tasti normalmente
    window:perform_action(act.PopKeyTable, pane)

    window:perform_action(
      act.InputSelector({
        title = 'New tab - scegli shell',
        choices = build_launcher_choices(),
        fuzzy = true,
        fuzzy_description = 'Choose launcher for new tab: ',

        action = wezterm.action_callback(function(win, p, id, label)
          if not id then
            return
          end

          local item = launch.launch_menu[tonumber(id)]

          if not item or not item.args then
            return
          end

          win:perform_action(
            act.SpawnCommandInNewTab(clone_spawn_command(item)),
            p
          )
        end),
      }),
      pane
    )
  end)
end

-- scrollback in Neovim: salva il testo in un file e lo apre in una nuova tab
local function scrollback_in_editor(window, pane)
   -- righe logiche: le righe spezzate a capo tornano intere
   local text = pane:get_logical_lines_as_text(pane:get_dimensions().scrollback_rows)
   -- ponytail: un solo file, sovrascritto a ogni apertura
   local path = platform.is_win and (os.getenv('TEMP') .. '\\wezterm-scrollback.txt')
      or ((os.getenv('TMPDIR') or '/tmp') .. '/wezterm-scrollback.txt')
   local f = assert(io.open(path, 'w'))
   f:write(text)
   f:close()
   -- open_file.nvim: su Windows passa da nvim-win.sh come la funzione zsh `nvim`; domain local anche se la pane è SSH
   window:perform_action(act.SpawnCommandInNewTab({
      domain = { DomainName = 'local' },
      args = open_file.nvim('+', path),
   }), pane)
end

local copy_mode = wezterm.gui.default_key_tables().copy_mode

table.insert(copy_mode, {
   key = '9',
   mods = 'NONE',
   action = act.CopyMode 'MoveToEndOfLineContent',
})

local keys = {
    -- copy/paste
    { key="v", mods="CTRL|SHIFT", action=wezterm.action{PasteFrom="Clipboard"}},
    { key="v", mods="CTRL", action=wezterm.action{PasteFrom="Clipboard"}},
    {
       key = "c",
       mods = "CTRL|SHIFT",
       action = wezterm.action_callback(function(window, pane)
          local sel = window:get_selection_text_for_pane(pane)
          if sel and sel ~= '' then
             window:perform_action(act.CopyTo('ClipboardAndPrimarySelection'), pane)
             window:perform_action(act.ClearSelection, pane)
          else
             window:perform_action(act.SendKey({ key = 'c', mods = 'CTRL|SHIFT' }), pane)
          end
       end),
    },

    -- forza Ctrl+Space come sequenza CSI-u esplicita (ConPTY-safe) per il completamento Neovim
    { key="Space", mods="CTRL", action=act.SendString('\x1b[32;5u') },
    { key="Enter", mods="CTRL", action=act.SendString('\x1b[13;5u') },

    -- aree: LEADER (ALT+/) + lettera apre la key table, sticky come prima
    -- LEADER → p pane · t tabs · w workspace · z font
    { key = 'p', mods = 'LEADER', action = sticky_table('pane', TABLE_TIMEOUT) },
    { key = 't', mods = 'LEADER', action = sticky_table('tabs', TABLE_TIMEOUT) },
    { key = 'w', mods = 'LEADER', action = sticky_table('workspace', TABLE_TIMEOUT) },
    { key = 'z', mods = 'LEADER', action = sticky_table('resize_font', TABLE_TIMEOUT) },

    -- pane: LEADER + freccia sposta il focus e resta nella key table "pane" per le frecce successive
    { key = 'LeftArrow',  mods = 'LEADER', action = act.Multiple({ act.ActivatePaneDirection('Left'),  sticky_table('pane', TABLE_TIMEOUT) }) },
    { key = 'RightArrow', mods = 'LEADER', action = act.Multiple({ act.ActivatePaneDirection('Right'), sticky_table('pane', TABLE_TIMEOUT) }) },
    { key = 'UpArrow',    mods = 'LEADER', action = act.Multiple({ act.ActivatePaneDirection('Up'),    sticky_table('pane', TABLE_TIMEOUT) }) },
    { key = 'DownArrow',  mods = 'LEADER', action = act.Multiple({ act.ActivatePaneDirection('Down'),  sticky_table('pane', TABLE_TIMEOUT) }) },

    -- pane: CTRL+ALT+frecce sposta il focus (diretto, senza leader); ALT+SHIFT+frecce è usato dal sistema
    { key = 'LeftArrow',  mods = 'CTRL|ALT', action = act.ActivatePaneDirection('Left') },
    { key = 'RightArrow', mods = 'CTRL|ALT', action = act.ActivatePaneDirection('Right') },
    { key = 'UpArrow',    mods = 'CTRL|ALT', action = act.ActivatePaneDirection('Up') },
    { key = 'DownArrow',  mods = 'CTRL|ALT', action = act.ActivatePaneDirection('Down') },

    -- tab: CTRL+Tab / CTRL+SHIFT+Tab
    { key = 'Tab', mods = 'CTRL',       action = act.ActivateTabRelative(1) },
    { key = 'Tab', mods = 'CTRL|SHIFT', action = act.ActivateTabRelative(-1) },

    -- direct tab selection
    -- CTRL+ALT+1..9 -> tab 1..9
    { key = '1', mods = 'CTRL|ALT', action = act.ActivateTab(0) },
    { key = '2', mods = 'CTRL|ALT', action = act.ActivateTab(1) },
    { key = '3', mods = 'CTRL|ALT', action = act.ActivateTab(2) },
    { key = '4', mods = 'CTRL|ALT', action = act.ActivateTab(3) },
    { key = '5', mods = 'CTRL|ALT', action = act.ActivateTab(4) },
    { key = '6', mods = 'CTRL|ALT', action = act.ActivateTab(5) },
    { key = '7', mods = 'CTRL|ALT', action = act.ActivateTab(6) },
    { key = '8', mods = 'CTRL|ALT', action = act.ActivateTab(7) },
    { key = '9', mods = 'CTRL|ALT', action = act.ActivateTab(8) },

    -- scrollback: CTRL+ALT+PageUp/PageDown -> una pagina
    { key = 'PageUp',   mods = 'CTRL|ALT', action = act.ScrollByPage(-1) },
    { key = 'PageDown', mods = 'CTRL|ALT', action = act.ScrollByPage(1) },

   -- misc/useful
   { key = '.', mods = 'LEADER', action = act.ActivateCommandPalette },
   -- mostra/nasconde la tab bar (vale per la finestra corrente)
   { key = 'b', mods = 'LEADER', action = wezterm.action_callback(function(window)
      local overrides = window:get_config_overrides() or {}
      overrides.enable_tab_bar = overrides.enable_tab_bar == false
      window:set_config_overrides(overrides)
   end) },
   -- { key = 'F12', mods = 'NONE', action = act.ShowDebugOverlay }, -- disabilitato: apriva overlay per errore
   -- { key = 'F11', mods = 'NONE', action = act.ToggleFullScreen }, -- disabilitato
   {
   key = '/',
   mods = 'LEADER',
   action = wezterm.action_callback(function(window, pane)
      window:perform_action(
         act.Search({ CaseInSensitiveString = '' }),
         pane
      )

      window:perform_action(
         act.CopyMode 'ClearPattern',
         pane
      )
   end),
},
   { key = 'l', mods = "LEADER", action = act.ShowLauncherArgs({flags="FUZZY|LAUNCH_MENU_ITEMS"})},
   { key = 'k', mods = "LEADER", action = act.ShowLauncher },
   -- Hint: seleziona e copia testo
   { key = 'y', mods = 'LEADER', action = act.QuickSelect },
   -- scrollback in Neovim (h = history)
   { key = 'h', mods = 'LEADER', action = wezterm.action_callback(scrollback_in_editor) },
   -- Hint: seleziona e apre URL nel browser
   {key = 'o',
    mods = 'LEADER',
    action = act.QuickSelectArgs {
        label = 'open URL',
        patterns = {
            'https?://\\S+',
        },
        action = wezterm.action_callback(function(window, pane)
            local url = window:get_selection_text_for_pane(pane)
            if url and url ~= '' then
                wezterm.open_with(url)
            end
        end),
     },
    },
   -- Hint: seleziona un file (file:// o percorso:riga) e lo apre in Neovim
   { key = 'f', mods = 'LEADER', action = act.QuickSelectArgs({
      label = 'open file',
      patterns = {
         'file:///\\S+',
         '(?:[A-Za-z]:)?[^\\s:]{3,}:\\d{1,5}',
      },
      action = wezterm.action_callback(function(window, pane)
         open_file.open(window, pane, window:get_selection_text_for_pane(pane))
      end),
   }) },

    -- Copy Mode: selezione testo con tastiera
    { key = 'c', mods = 'LEADER', action = act.ActivateCopyMode },

}

local key_tables = {
    copy_mode = copy_mode,

    resize_font = {
        { key = 'UpArrow', action = act.IncreaseFontSize },
        { key = 'DownArrow', action = act.DecreaseFontSize },
        { key = 'r', action = act.ResetFontSize },
        { key = 'Escape', action = 'PopKeyTable' },
        { key = 'q', action = 'PopKeyTable' },
    },
    -- Window: Navigation
    pane = {
        -- Navigation: Left
        -- LEADER → p → ←/→/↑/↓
        {key="LeftArrow", action= act.ActivatePaneDirection("Left")},
        {key="RightArrow", action= act.ActivatePaneDirection("Right")},
        {key="UpArrow", action= act.ActivatePaneDirection("Up")},
        {key="DownArrow", action= act.ActivatePaneDirection("Down")},
        -- Maximize current window
        -- LEADER → p → m
        {key='m', action= act.TogglePaneZoomState},
        -- Close current window
        -- LEADER → p → c
        {key='c',  action= act.CloseCurrentPane { confirm = false } },
        {key="Escape", action="PopKeyTable"},
        {key='q', action = 'PopKeyTable' },
        -- key-tables: pane_split
        -- LEADER → p → n
        {key="n", action=wezterm.action{
            ActivateKeyTable={
                name="pane_split",
                timeout_milliseconds = TABLE_TIMEOUT,
                one_shot=false,
                replace_current=true,
            }
        }},
        -- key-tables: split scegliendo il launcher/shell
        -- LEADER → p → N (maiuscolo) → ←/→/↑/↓
        {key="n", mods="SHIFT", action=wezterm.action{
            ActivateKeyTable={
                name="split_launcher",
                timeout_milliseconds = TABLE_TIMEOUT,
                one_shot=false,
                replace_current=true,
            }
        }},
        -- key-tables: pane_resize
        -- LEADER → p → r
        {key="r", action=wezterm.action{
            ActivateKeyTable={
                name="pane_resize",
                timeout_milliseconds = TABLE_TIMEOUT,
                one_shot=false,
                replace_current=true,
            }
        }},
    },
    -- Window: Split
    pane_split = {
        -- LEADER → p → n → ←/→/↑/↓
        { key = "LeftArrow",  action = act.SplitPane { direction = 'Left',  size = { Percent = 50 }} },
        { key = "RightArrow",  action = act.SplitPane { direction = 'Right',  size = { Percent = 50 }} },
        { key = "UpArrow",  action = act.SplitPane { direction = 'Up',  size = { Percent = 50 }} },
        { key = "DownArrow",  action = act.SplitPane { direction = 'Down',  size = { Percent = 50 }}},
        -- LEADER → p → n → ALT ←/→/↑/↓
        { key = 'LeftArrow', mods = 'ALT', action = split_with_launcher('Left') },
        { key = 'RightArrow',  mods = 'ALT', action = split_with_launcher('Right') },
        { key = 'UpArrow', mods = 'ALT', action = split_with_launcher('Up') },
        { key = 'DownArrow',  mods = 'ALT', action = split_with_launcher('Down') },
        -- Cancel the mode by pressing escape
        {key="Escape", action="PopKeyTable"},
        {key='q', action = 'PopKeyTable' },
    },
    -- Window: Resize
    pane_resize = {
        -- LEADER → p → r → ←/→/↑/↓
        {key="LeftArrow", action= act.AdjustPaneSize({ "Left", 5})},
        {key="RightArrow", action= act.AdjustPaneSize({ "Right", 5})},
        {key="UpArrow", action= act.AdjustPaneSize({ "Up", 5})},
        {key="DownArrow", action= act.AdjustPaneSize({ "Down", 5})},
        -- Cancel the mode by pressing escape
        {key="Escape", action="PopKeyTable"},
        {key = 'q', action = 'PopKeyTable' },

    },
    -- Tabs
    tabs = {
        -- Tabs: Spawn
        -- LEADER → t → n
        {key="n", action= act.SpawnTab('DefaultDomain')},
        -- Move between tabs
        -- LEADER → t → ←/→
        { key = 'LeftArrow',  action = act.ActivateTabRelative(-1) },
        { key = 'RightArrow', action = act.ActivateTabRelative(1) },
        -- LEADER → t → N (maiuscolo)
        -- nuovo tab scegliendo il launcher/shell
        { key = 'n', mods = 'SHIFT', action = spawn_tab_with_launcher() },
        -- Move current tab
        -- LEADER → t → m → ←/→
        {key = 'm', action = act.ActivateKeyTable({
            name = 'tabs_move',
            timeout_milliseconds = TABLE_TIMEOUT,
            one_shot = false,
            replace_current = true,
        })},
        -- Tabs: close
        -- LEADER → t → c
        -- PopKeyTable prima: senza, la "n" della conferma aprirebbe una nuova tab
        {key = 'c', action = act.Multiple({ act.PopKeyTable, act.CloseCurrentTab({ confirm = true }) }) },


        -- rename tab bar
        -- LEADER → t → r
        -- PopKeyTable prima: la key table "tabs" è sticky e ruberebbe i tasti al prompt
        { key = 'r',
          action = act.Multiple({ act.PopKeyTable, act.PromptInputLine ({
            description = 'Enter new name for tab',
            action = wezterm.action_callback(function(window, pane, line)
                -- line will be `nil` if they hit escape without entering anything
                -- An empty string if they just hit enter
                -- Or the actual line of text they wrote
                if line then
                    window:active_tab():set_title(line)
                end
            end),
          }) }),
        },

        -- Tabs: navigator
        -- LEADER → t → t
        {key = 't',   action = act.Multiple({ act.PopKeyTable, act.ShowTabNavigator }) },
        -- Cancel the mode by pressing escape
        {key="Escape", action="PopKeyTable"},
        {key='q', action = 'PopKeyTable' },
    },
    -- Tabs: Move current tab
    tabs_move = {
        -- LEADER → t → m → ←/→
        { key = 'LeftArrow',  action = act.MoveTabRelative(-1) },
        { key = 'RightArrow', action = act.MoveTabRelative(1) },
        -- Cancel the mode by pressing escape
        { key = 'Escape', action = 'PopKeyTable' },
        { key = 'q', action = 'PopKeyTable' },
    },
    -- Workspace
    -- PopKeyTable prima di prompt e liste: la key table è sticky e ruberebbe i tasti
    workspace = {
        -- LEADER → w → n: nuovo workspace con nome
        { key = 'n', action = act.Multiple({ act.PopKeyTable, act.PromptInputLine({
            description = 'Nome del nuovo workspace',
            action = wezterm.action_callback(function(window, pane, line)
                if line and line ~= '' then
                    window:perform_action(act.SwitchToWorkspace({ name = line }), pane)
                end
            end),
          }) }) },
        -- LEADER → w → s: lista workspace con ricerca
        { key = 's', action = act.Multiple({ act.PopKeyTable, act.ShowLauncherArgs({ flags = 'FUZZY|WORKSPACES' }) }) },
        -- LEADER → w → r: rinomina il workspace corrente
        { key = 'r', action = act.Multiple({ act.PopKeyTable, act.PromptInputLine({
            description = 'Nuovo nome del workspace',
            action = wezterm.action_callback(function(window, pane, line)
                if line and line ~= '' then
                    wezterm.mux.rename_workspace(window:active_workspace(), line)
                end
            end),
          }) }) },
        -- LEADER → w → ←/→: workspace precedente/successivo
        { key = 'LeftArrow',  action = act.SwitchWorkspaceRelative(-1) },
        { key = 'RightArrow', action = act.SwitchWorkspaceRelative(1) },
        { key = 'Escape', action = 'PopKeyTable' },
        { key = 'q', action = 'PopKeyTable' },
    },
    -- Split: scegli il launcher/shell
    -- ALT+Shift+N → ←/→/↑/↓
    split_launcher = {
        { key = 'LeftArrow',  action = split_with_launcher('Left') },
        { key = 'RightArrow', action = split_with_launcher('Right') },
        { key = 'UpArrow',    action = split_with_launcher('Up') },
        { key = 'DownArrow',  action = split_with_launcher('Down') },
        { key = 'Escape', action = 'PopKeyTable' },
        { key = 'q', action = 'PopKeyTable' },
    },
}

local mouse_bindings = {
   -- Ctrl-click will open the link under the mouse cursor
   {
      event = { Up = { streak = 1, button = 'Left' } },
      mods = 'CTRL',
      action = act.OpenLinkAtMouseCursor,
   },
   -- Ctrl-click anche quando l'app cattura il mouse (Claude Code fullscreen, nvim, less):
   -- WezTerm apre il link (percorso:riga -> Neovim); la pressione non arriva all'app
   {
      event = { Down = { streak = 1, button = 'Left' } },
      mods = 'CTRL',
      mouse_reporting = true,
      action = act.Nop,
   },
   {
      event = { Up = { streak = 1, button = 'Left' } },
      mods = 'CTRL',
      mouse_reporting = true,
      action = act.OpenLinkAtMouseCursor,
   },
   -- Move mouse will only select text and not copy text to clipboard
   {
      event = { Down = { streak = 1, button = 'Left' } },
      mods = 'NONE',
      action = act.SelectTextAtMouseCursor 'Cell',
   },
   {
      event = { Up = { streak = 1, button = 'Left' } },
      mods = 'NONE',
      action = act.ExtendSelectionToMouseCursor 'Cell',
   },
   {
      event = { Drag = { streak = 1, button = 'Left' } },
      mods = 'NONE',
      action = act.ExtendSelectionToMouseCursor 'Cell',
   },
   -- Triple Left click will select a line
   {
      event = { Down = { streak = 3, button = 'Left' } },
      mods = 'NONE',
      action = act.SelectTextAtMouseCursor 'Line',
   },
   {
      event = { Up = { streak = 3, button = 'Left' } },
      mods = 'NONE',
      action = act.SelectTextAtMouseCursor 'Line',
   },
   -- Double Left click will select a word
   {
      event = { Down = { streak = 2, button = 'Left' } },
      mods = 'NONE',
      action = act.SelectTextAtMouseCursor 'Word',
   },
   {
      event = { Up = { streak = 2, button = 'Left' } },
      mods = 'NONE',
      action = act.SelectTextAtMouseCursor 'Word',
   },
   -- Turn on the mouse wheel to scroll the screen
   {
       event = { Down = { streak = 1, button = { WheelUp = 1 } } },
       mods = 'NONE',
       action = act.ScrollByLine(-6),
    },
    {
        event = { Down = { streak = 1, button = { WheelDown = 1 } } },
        mods = 'NONE',
        action = act.ScrollByLine(6),
    },
   -- {
   --    event = { Down = { streak = 1, button = { WheelUp = 1 } } },
   --    mods = 'NONE',
   --    action = act.ScrollByCurrentEventWheelDelta,
   -- },
   -- {
   --    event = { Down = { streak = 1, button = { WheelDown = 1 } } },
   --    mods = 'NONE',
   --    action = act.ScrollByCurrentEventWheelDelta,
   -- },
}

-- i suggerimenti delle key table li mostra la tabline nello status destro (testi in events/tabline/config.lua)

return {
   disable_default_key_bindings = true,
   disable_default_mouse_bindings = true,
   leader = { key = '/', mods = mod.ALT, timeout_milliseconds = LEADER_TIMEOUT },
   keys = keys,
   key_tables = key_tables,
   mouse_bindings = mouse_bindings,
}
