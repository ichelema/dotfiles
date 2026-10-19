local platform = require('utils.platform')()

local cmd_cmder = {
   'Cmd', '/k ',
   '%CMDER_ROOT%\\config\\init.bat',
}

-- env.exe e non cmd.exe: HOME va in forma POSIX, perché env.exe non converte i percorsi Windows
local zsh_ucrt64 = {
   'D:\\msys64\\usr\\bin\\env.exe', '-C', '/d/AI/Claude/Trinity',
   'USERPROFILE=D:\\msys64\\home\\Sphynx',
   'MSYS2_ROOT=D:\\msys64',
   'MSYSTEM=UCRT64',
   'CHERE_INVOKING=1',
   'MSYS2_PATH_TYPE=strict',
   'HOME=/d/msys64/home/Sphynx',
   'D:\\msys64\\usr\\bin\\zsh.exe', '--login', '-i',
}

local bash_msys = {
   'D:\\msys64\\usr\\bin\\env.exe', '-C', '/d/AI/Claude/Trinity',
   'MSYSTEM=MSYS',
   'CHERE_INVOKING=1',
   'MSYS2_PATH_TYPE=inherit',
   'D:\\msys64\\usr\\bin\\bash.exe', '--login', '-i',
}

local zsh_msys = {
   'D:\\msys64\\usr\\bin\\env.exe', '-C', '/d/AI/Claude/Trinity',
   'MSYSTEM=MSYS',
   'CHERE_INVOKING=1',
   'MSYS2_PATH_TYPE=inherit',
   'HOME=/d/msys64/home/Sphynx',
   'D:\\msys64\\usr\\bin\\zsh.exe', '--login', '-i',
}

local infomaniak_zsh = {
   'zsh', '-l',
}

local infomaniak_herdr = {
   'sh', '-c',
   'exec $SHELL -lic herdr',
}

local infomaniak_zellij = {
   'sh', '-c',
   'exec $SHELL -lic "zellij attach --create main"',
}

local function infomaniak(label, args)
   return { label = label, domain = { DomainName = 'infomaniak' }, args = args }
end

local options = {
   default_prog = {},
   launch_menu = {},
}

if platform.is_win then
   options.default_prog = zsh_ucrt64
   options.launch_menu = {
      { label = ' Cmd', args = cmd_cmder },
      { label = ' MSYS ZSH (UCRT64)', args = zsh_ucrt64 },
      { label = ' MSYS ZSH', args = zsh_msys },
	  { label = ' MSYS BASH', args = bash_msys },
      { label = ' PowerShell v7', args = { 'C:\\Appl\\PowerShell\\pwsh.exe' } },
      { label = ' Nushell', args = { 'nu' } },
      -- zellij nativo; il layout di default (zsh.kdl) apre la zsh UCRT64
      { label = 'Zellij', args = { 'D:/msys64/home/Sphynx/.local/bin/zellij.exe' },
        set_environment_variables = { ZELLIJ_CONFIG_DIR = 'C:/Users/en27553/AppData/Roaming/Zellij/config' } },
      infomaniak('󰣀 SSH Infomaniak', infomaniak_zsh),
      infomaniak(' VPS Infomaniak + herdr', infomaniak_herdr),
      infomaniak(' VPS Infomaniak + zellij', infomaniak_zellij),
   }
elseif platform.is_mac then
   options.default_prog = { '/opt/homebrew/bin/fish' }
   options.launch_menu = {
    { label = " Bash", args = { "bash", "--login" } },
    { label = " Fish", args = { "/opt/homebrew/bin/fish", "--login" } },
    { label = " Nushell", args = { "/opt/homebrew/bin/nu", "--login" } },
    { label = " Zsh", args = { "zsh", "--login" } },
   }
elseif platform.is_linux then
  options.default_prog = { "zsh", "--login" }
  options.launch_menu = {
    { label = " Bash", args = { "bash", "--login" } },
    { label = " Fish", args = { "fish", "--login" } },
    { label = " Nushell", args = { "nu", "--login" } },
    { label = " Zsh", args = { "zsh", "--login" } },
  }
end

return options
