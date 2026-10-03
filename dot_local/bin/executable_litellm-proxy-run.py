#!/usr/bin/env python
"""Launcher programmatico per il proxy LiteLLM (Windows).

Problema risolto: su Windows un processo figlio (subprocess Node lanciato dal
provider ChatGPT/codex o da prisma, con console condivisa ``creationflags=0``)
emette un ``GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0)`` che colpisce l'intero
console group; uvicorn lo cattura (``capture_signals`` -> ``handle_exit``) e va
in shutdown ~0.5 s dopo "Application startup complete".

Due contromisure:
  1. Si avvia il proxy direttamente via ``uvicorn.run`` (niente CLI ``litellm``
     -> niente subprocess Node ``prisma`` di prep allo startup).
  2. Si installa un console-ctrl guard che CONSUMA CTRL_C / CTRL_BREAK, così i
     CTRL_C spuri dei subprocess figli non fanno uscire uvicorn.

Conseguenza di (2): un singolo Ctrl+C e' consumato dal guard (per neutralizzare
lo spurio). Per fermare il server a mano premi Ctrl+C DUE volte entro 2 secondi
(il secondo passa e fa uscire uvicorn), oppure taskkill //F //PID <pid>.

Conseguenza di (1): le migrazioni DB NON sono applicate automaticamente. Dopo un
upgrade di litellm vanno eseguite a mano (una tantum), es. un singolo avvio con
``litellm --config ...`` oppure ``prisma migrate deploy`` con DATABASE_URL.

Env letto: CONFIG_FILE_PATH, LITELLM_HOST/LITELLM_PORT (default 127.0.0.1:4000),
LITELLM_LAUNCHER_DEBUG=1 per loggare i subprocess avviati (diagnostica).
"""
import os
import sys
import time

# La config YAML viene caricata dall'app via questa env (proxy_server.py:784).
# Home derivata dalla posizione di questo file (~/.local/bin/x.py -> ~/): niente
# lettera di drive fissa, e niente expanduser("~") che qui seguirebbe USERPROFILE.
_HOME = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
os.environ.setdefault(
    "CONFIG_FILE_PATH",
    os.path.join(_HOME, ".litellm", "litellm_config.yaml"),
)

# La cartella del config deve stare in sys.path per importare il modulo
# `callbacks` referenziato in litellm_settings.callbacks.
_cfg_dir = os.path.dirname(os.environ["CONFIG_FILE_PATH"])
if _cfg_dir and _cfg_dir not in sys.path:
    sys.path.insert(0, _cfg_dir)

# --- Guard: consuma i CTRL_C/CTRL_BREAK spuri dei subprocess figli ----------
_CTRL_GUARD_REF = None  # keep alive


def _install_ctrl_c_guard():
    global _CTRL_GUARD_REF
    try:
        import ctypes
        from ctypes import wintypes
    except Exception as e:  # noqa
        print(f"[launcher] guard CTRL_C non installato: {e}")
        return
    HANDLER = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)
    last_ctrl_c = [0.0]  # timestamp dell'ultimo CTRL_C, per il doppio-tap

    def _handler(ctrl_type):
        # 0=CTRL_C_EVENT: un subprocess Node figlio lo emette (singolo) sul
        # console group e farebbe uscire uvicorn -> lo consumiamo (return True).
        # Per fermare il server a mano: DUE Ctrl+C entro 2s -> il secondo passa
        # (return False) -> uvicorn esce. Un CTRL_C spurio isolato resta innocuo.
        # 1/2/5/6 (BREAK/CLOSE/LOGOFF/SHUTDOWN) -> lascia terminare (return False).
        if ctrl_type == 0:
            now = time.time()
            if now - last_ctrl_c[0] < 2.0:
                return False  # doppio Ctrl+C -> stop richiesto dall'utente
            last_ctrl_c[0] = now
            return True       # singolo -> consuma (neutralizza lo spurio)
        return False

    _CTRL_GUARD_REF = HANDLER(_handler)
    ok = ctypes.windll.kernel32.SetConsoleCtrlHandler(_CTRL_GUARD_REF, True)
    print(f"[launcher] guard CTRL_C installato (ok={ok})")


def _patch_subprocess_new_group():
    """Spawna OGNI subprocess figlio (in particolare il query-engine Prisma)
    con CREATE_NEW_PROCESS_GROUP: Windows disabilita la gestione del Ctrl+C per
    il nuovo gruppo, quindi i figli IGNORANO il CTRL_C_EVENT spurio che un altro
    processo emette sul console group condiviso e NON muoiono.
    Con LITELLM_LAUNCHER_DEBUG=1 logga anche i comandi avviati.
    """
    import subprocess
    debug = bool(os.environ.get("LITELLM_LAUNCHER_DEBUG"))
    new_group = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
    _real_init = subprocess.Popen.__init__

    def _patched(self, args, *a, **kw):
        kw["creationflags"] = kw.get("creationflags", 0) | new_group
        if debug:
            try:
                shown = args if isinstance(args, str) else " ".join(map(str, args))
            except Exception:  # noqa
                shown = repr(args)
            print(f"[launcher] subprocess.Popen: [{str(shown)[:140]}] "
                  f"creationflags={kw['creationflags']:#x}", flush=True)
        return _real_init(self, args, *a, **kw)

    subprocess.Popen.__init__ = _patched
    print(f"[launcher] subprocess.Popen: CREATE_NEW_PROCESS_GROUP attivo"
          + (" (+log)" if debug else ""))


_install_ctrl_c_guard()
_patch_subprocess_new_group()

import uvicorn

if __name__ == "__main__":
    host = os.environ.get("LITELLM_HOST", "127.0.0.1")
    port = int(os.environ.get("LITELLM_PORT", "4000"))
    # Ponte /v1/responses per TypingMind (aggregazione SSE + immagini).
    # Perimetro e motivazioni nel modulo; se fallisce, si prosegue senza.
    # L'app si passa come oggetto e non come stringa: con la stringa uvicorn
    # reimporterebbe il modulo e le aggiunte del ponte andrebbero perse.
    from litellm.proxy.proxy_server import app
    import responses_bridge
    responses_bridge.install(app)

    print(f"LiteLLM proxy (launcher uvicorn diretto) su http://{host}:{port}")
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
    )
