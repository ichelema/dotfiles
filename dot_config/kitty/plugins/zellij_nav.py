# Kitten per alt+frecce: se nella finestra gira zellij in primo piano, manda il tasto a zellij
# (sposta il focus tra i suoi pannelli); altrimenti sposta il focus tra le finestre di kitty.
# Uso in kitty.conf: map alt+left kitten plugins/zellij_nav.py left
import os

from kittens.tui.handler import result_handler


def main(args):
    pass


def runs_zellij(window):
    return any(p['cmdline'] and os.path.basename(p['cmdline'][0]) == 'zellij' for p in window.child.foreground_processes)


@result_handler(no_ui=True)
def handle_result(args, answer, target_window_id, boss):
    direction = args[1]
    window = boss.window_id_map.get(target_window_id)
    if window is None:
        return
    boss.combine(f'send_key alt+{direction}' if runs_zellij(window) else f'neighboring_window {direction}')
