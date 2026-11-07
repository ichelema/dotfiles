# {custom} nei tab_title_template di userprefs.conf: nel tab di Claude Code mostra il nome del repo di origin
# (o della cartella) al posto del titolo scritto da Claude Code; lo stato arriva da OSC 7501 ({tab.program_status}).
import os
import subprocess
from functools import lru_cache


@lru_cache(maxsize=64)
def repo_name(wd: str) -> str:
    # ponytail: cache mai svuotata, un cambio di origin si vede dopo il riavvio di kitty
    try:
        url = subprocess.run(['git', '-C', wd, 'remote', 'get-url', 'origin'],
                             capture_output=True, text=True, timeout=1).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        url = ''
    url = url.rstrip('/').removesuffix('.git')
    return url.replace(':', '/').split('/')[-1] or os.path.basename(wd)


def draw_title(data):
    tab = data['tab']
    # oldest: Claude Code è il processo più vecchio in primo piano, i suoi comandi Bash no
    if tab.active_oldest_exe == 'claude':
        return repo_name(tab.active_oldest_wd)
    return data['title'].split('/')[-1]
