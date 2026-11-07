# Watcher globale di kitty: quando una keyboard mode è attiva, mostra i suoi tasti
# (letti da kitty.conf) in una barra tab-dock in fondo alla tab; chiude la barra
# quando la modalità finisce. Attivazione in kitty.conf: watcher whichkey_dock.py
# Nota: kitty mette in cache questo modulo; il watcher rilegge il file a ogni cambio
# di modalità, quindi solo le modifiche a on_tab_bar_dirty richiedono un riavvio.
import math
import re
import runpy

from kitty.fast_data_types import get_options
from kitty.launch import launch, parse_launch_args
from kitty.types import human_repr_of_single_key

state = {'mode': '', 'dock': None}
MAX_LABEL = 32

# etichette italiane: azione kitty -> testo nella barra; le azioni assenti restano in inglese
LABELS = {
    'neighboring_window left': 'vai a sinistra',
    'neighboring_window right': 'vai a destra',
    'neighboring_window down': 'vai sotto',
    'neighboring_window up': 'vai sopra',
    'toggle_layout stack': 'zoom',
    'close_window': 'chiudi finestra',
    'launch --location=vsplit': 'nuova a destra',
    'launch --location=hsplit': 'nuova sotto',
    'resize_window narrower 2': 'più stretta',
    'resize_window wider 2': 'più larga',
    'resize_window shorter 2': 'più bassa',
    'resize_window taller 2': 'più alta',
    'new_tab': 'nuova tab',
    'previous_tab': 'tab precedente',
    'next_tab': 'tab successiva',
    'detach_tab ask': 'stacca tab',
    'close_tab': 'chiudi tab',
    'set_tab_title': 'rinomina tab',
    'move_tab_backward': 'sposta a sinistra',
    'move_tab_forward': 'sposta a destra',
    'load_config_file': 'ricarica config',
    'debug_config': 'mostra config',
    'launch --location=hsplit --allow-remote-control kitty +kitten plugins/search.py @active-kitty-window-id': 'cerca nel testo',
    'change_font_size all +1.0': 'più grande',
    'change_font_size all -1.0': 'più piccolo',
    'change_font_size all 0': 'dimensione iniziale',
    'scroll_line_up smooth': 'sali di una riga, fluido',
    'scroll_line_down smooth': 'scendi di una riga, fluido',
    'scroll_line_up': 'sali di una riga',
    'scroll_line_down': 'scendi di una riga',
    'show_scrollback': 'apri in less',
    'kitty_scrollback_nvim': 'apri in neovim',
    'new_os_window_with_cwd': 'nuova finestra OS',
    'open_url_with_hints': 'apri link',
    'kitten hints --type word --program @': 'copia parola',
    'kitten hints --type path': 'apri percorso',
    'kitten hints --type word --program -': 'inserisci parola',
    'kitten hints --type line --program -': 'inserisci riga',
    'kitten hints --type hash --program -': 'inserisci hash',
    'kitten hints --type linenum': 'apri file alla riga',
}
MODES = {'window': 'finestre', 'window_new': 'nuova finestra', 'resize': 'ridimensiona', 'tab_move': 'sposta tab', 'leader': 'comandi', 'config': 'impostazioni'}
KEYS = {'left': '←', 'right': '→', 'up': '↑', 'down': '↓', 'escape': 'esc', 'enter': 'invio', 'page_up': 'PgUp', 'page_down': 'PgDn'}


def actions(definition):
    # "combine : a : b" -> ["a", "b"]
    if not definition.startswith('combine '):
        return [definition]
    sep, rest = definition[len('combine '):].split(maxsplit=1)
    return [a.strip() for a in re.split(rf'\s+{re.escape(sep)}\s+', ' ' + rest) if a.strip()]


def label(definition):
    parts = []
    for a in actions(definition):
        if a.startswith('push_keyboard_mode '):
            mode = a.split()[1]
            parts.append('+' + MODES.get(mode, mode))
        elif a != 'pop_keyboard_mode':
            parts.append(LABELS.get(a) or re.sub(r'^goto_tab (\d+)$', r'vai alla tab \1', a))
    text = ' : '.join(parts) or 'esci'
    return text if len(text) <= MAX_LABEL else text[:MAX_LABEL - 1] + '…'


def bar(keymap, mode, columns):
    # celle "tasti etichetta" di larghezza fissa, tante per riga quante ne stanno
    groups = {}
    for k, defs in keymap.items():
        key = human_repr_of_single_key(k, get_options().kitty_mod)
        key = re.sub(r'^shift\+([a-z])$', lambda m: m[1].upper(), key)  # shift+s -> S
        groups.setdefault(label(defs[-1].definition), []).append('+'.join(KEYS.get(p, p) for p in key.split('+')))
    title = MODES.get(mode, mode)
    cells = [(f'\x1b[1;34m{title}\x1b[m', len(title))]
    ordered = sorted(groups.items(), key=lambda g: g[0] == 'esci')  # esci sempre in fondo, il resto nell'ordine di kitty.conf
    cells += [(f'\x1b[33m{"/".join(keys)}\x1b[m {lab}', len('/'.join(keys)) + 1 + len(lab)) for lab, keys in ordered]
    width = max(n for _, n in cells) + 3
    per_row = max(1, columns // width)
    lines = [''.join(text + ' ' * (width - n) for text, n in cells[i:i + per_row]) for i in range(0, len(cells), per_row)]
    return '\n'.join(lines), math.ceil(len(cells) / per_row)


def fresh_bar():
    # rilegge questo file: LABELS, MODES, KEYS e bar() nuovi senza riavviare kitty
    try:
        return runpy.run_path(__file__)['bar']
    except Exception:
        return bar  # file con errori durante una modifica: usa la versione in cache


def on_tab_bar_dirty(boss, window, data):
    mode = boss.mappings.current_keyboard_mode_name
    if mode == state['mode']:
        return
    state['mode'] = mode  # prima di launch: launch richiama questo watcher
    dock, state['dock'] = state['dock'], None
    if dock is not None and dock.id in boss.window_id_map:
        boss.mark_window_for_close(dock)
    if not mode:
        return
    tm = data['tab_manager']
    text, rows = fresh_bar()(boss.mappings.keyboard_modes[mode].keymap, mode, max(tm.tab_bar.screen.columns, window.screen.columns))
    # niente newline finale: con rows righe esatte farebbe scorrere via la prima
    spec = parse_launch_args([
        '--type=tab-dock', '--dock-edge=bottom', f'--dock-size={rows}', '--dock-skip-focus',
        'sh', '-c', 'printf "\\033[?25l%s" "$1"; exec sleep infinity', 'whichkey', text,
    ])
    state['dock'] = launch(boss, spec.opts, spec.args, target_tab=tm.active_tab)
