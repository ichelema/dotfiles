//! Riquadro in stile which-key: mostra i tasti del modo attivo con una descrizione.
//!
//! Lo stesso .wasm gira in due esemplari, come il tooltip della compact-bar:
//! - guardiano: caricato da `load_plugins`, in background; quando premi il leader apre il riquadro;
//! - riquadro: floating, con pin e senza focus; segue modo e tab, si chiude quando torni alla base.
//!
//! Come timeoutlen di which-key, il guardiano apre il riquadro solo se resti in un modo
//! per `timeoutlen` ms (configurazione del plugin, default 300; 0 = subito).
//!
//! Durante la ricerca il guardiano accende le cornici dei pannelli: Zellij scrive il testo
//! cercato solo nella cornice, e con `pane_frames false` non si vedrebbe.

mod grid;

use std::collections::{BTreeMap, HashMap};
use std::str::FromStr;

use zellij_tile::prelude::actions::{Action, SearchDirection, SearchOption};
use zellij_tile::prelude::*;

/// Chiave di configurazione che distingue il riquadro dal guardiano.
const POPUP: &str = "popup";
/// Descrizione dei tasti che tornano alla base: finiscono nel titolo, non nella griglia.
const EXIT: &str = "esci";
/// Ritardo del riquadro se la configurazione non ha `timeoutlen`.
const DEFAULT_TIMEOUTLEN_MS: u64 = 300;

#[derive(Default)]
struct WhichKey {
    config: BTreeMap<String, String>,
    overrides: HashMap<(InputMode, KeyWithModifier), String>,
    is_popup: bool,
    own_id: u32,
    // None finché non arriva il primo ModeUpdate: il guardiano può non ricevere il modo iniziale
    last_mode: Option<InputMode>,
    mode_info: ModeInfo,
    // da InitialKeybinds: in ModeUpdate un tasto non convertibile fa sparire tutto il suo modo
    keybinds: KeybindsVec,
    active_tab: Option<usize>,
    viewport_cols: usize,
    // secondi prima del riquadro; 0 = subito
    delay: f64,
    // timer in volo: Zellij non dà un id al timer, quindi conta solo l'ultimo
    pending_timers: usize,
    // l'ultimo cambio di modo vuole il riquadro
    armed: bool,
    // stile delle cornici prima della ricerca; Some = cornici accese dal guardiano
    frames_before_search: Option<PaneFrameStyle>,
}

register_plugin!(WhichKey);

impl ZellijPlugin for WhichKey {
    fn load(&mut self, config: BTreeMap<String, String>) {
        self.is_popup = config.contains_key(POPUP);
        self.overrides = parse_overrides(&config);
        let timeoutlen_ms = config.get("timeoutlen").and_then(|ms| ms.parse().ok());
        self.delay = timeoutlen_ms.unwrap_or(DEFAULT_TIMEOUTLEN_MS) as f64 / 1000.0;
        self.config = config;
        self.own_id = get_plugin_ids().plugin_id;
        request_permission(&[
            PermissionType::ReadApplicationState,
            PermissionType::ChangeApplicationState,
            PermissionType::MessageAndLaunchOtherPlugins,
        ]);
        subscribe(&[
            EventType::ModeUpdate,
            EventType::TabUpdate,
            EventType::InitialKeybinds,
            EventType::PermissionRequestResult,
            EventType::Timer,
        ]);
    }

    fn update(&mut self, event: Event) -> bool {
        match event {
            // non selezionabile solo dopo i permessi: prima devi poter rispondere alla richiesta
            Event::PermissionRequestResult(PermissionStatus::Granted) => {
                set_selectable(false);
                false
            },
            Event::TabUpdate(tabs) => {
                self.tab_update(tabs);
                false
            },
            // arriva alla sottoscrizione e dopo ogni ricarica di config.kdl
            Event::InitialKeybinds(keybinds) => {
                self.keybinds = keybinds;
                if self.is_popup {
                    self.place();
                }
                self.is_popup
            },
            Event::ModeUpdate(info) => self.mode_update(info),
            // vale solo l'ultimo timer: è scaduto timeoutlen senza altri cambi di modo
            Event::Timer(_) => {
                self.pending_timers = self.pending_timers.saturating_sub(1);
                if self.pending_timers == 0 && self.armed {
                    self.launch_popup();
                }
                false
            },
            _ => false,
        }
    }

    fn render(&mut self, _rows: usize, cols: usize) {
        if !self.is_popup {
            return;
        }
        let (entries, _) = self.menu();
        // 1 colonna di margine per lato
        let (cells, _, _) = grid::layout(&entries, cols.saturating_sub(2));
        for cell in cells {
            print_text_with_coordinates(Text::new(cell.key).color_all(3), cell.x + 1, cell.y, None, None);
            let desc = Text::new(cell.desc);
            let desc = if cell.desc.starts_with('+') { desc.color_all(2) } else { desc };
            print_text_with_coordinates(desc, cell.desc_x + 1, cell.y, None, None);
        }
    }
}

impl WhichKey {
    fn base(&self) -> InputMode {
        self.mode_info.base_mode.unwrap_or(InputMode::Normal)
    }

    fn mode_update(&mut self, info: ModeInfo) -> bool {
        let old = self.last_mode.replace(info.mode);
        self.mode_info = info;
        let mode = self.mode_info.mode;
        let base = self.base();
        let changed = old != Some(mode);
        let hidden = mode == base || is_hidden(mode);
        if self.is_popup {
            if hidden {
                close_self();
                return false;
            }
            if changed {
                self.place();
            }
            return true;
        }
        if !changed {
            return false;
        }
        // cornici solo durante la ricerca: Zellij scrive il testo cercato nella cornice.
        // Il guardiano è in background e riceve pane_frame_style None (Zellij lo compila
        // solo per i plugin delle tab): None vale "spente", come pane_frames false.
        let searching = matches!(mode, InputMode::EnterSearch | InputMode::Search);
        if searching && self.frames_before_search.is_none() {
            let style = self.mode_info.pane_frame_style.unwrap_or(PaneFrameStyle::None);
            self.frames_before_search = Some(style);
            if style != PaneFrameStyle::Full {
                set_pane_frame_style(PaneFrameStyle::Full);
            }
        } else if !searching {
            if let Some(style) = self.frames_before_search.take() {
                set_pane_frame_style(style);
            }
        }
        // dalla base parte solo il leader: Alt+PgUp entra in scroll senza riquadro
        let after_leader = old.unwrap_or(base) != base || mode == InputMode::Normal;
        self.armed = !hidden && after_leader;
        if self.armed {
            if self.delay > 0.0 {
                self.pending_timers += 1;
                set_timeout(self.delay);
            } else {
                self.launch_popup();
            }
        }
        false
    }

    fn tab_update(&mut self, tabs: Vec<TabInfo>) {
        let Some(tab) = tabs.iter().find(|t| t.active) else {
            return;
        };
        let resized = self.viewport_cols != tab.viewport_columns;
        self.viewport_cols = tab.viewport_columns;
        if self.is_popup {
            if self.active_tab.is_some_and(|t| t != tab.position) {
                // il riquadro segue la tab attiva senza spostare il focus
                break_panes_to_tab_with_index(&[PaneId::Plugin(self.own_id)], tab.position, false);
            }
            if resized {
                self.place();
            }
        }
        self.active_tab = Some(tab.position);
    }

    fn launch_popup(&self) {
        let mut config = self.config.clone();
        config.insert(POPUP.to_owned(), "true".to_owned());
        // se il riquadro esiste già (o sta caricando), Zellij gli passa il messaggio e non ne apre un altro
        pipe_message_to_plugin(
            MessageToPlugin::new("which-key")
                .with_plugin_url("zellij:OWN_URL")
                .with_plugin_config(config)
                .with_floating_pane_coordinates(self.coordinates())
                .new_plugin_instance_should_have_pane_title(self.title()),
        );
    }

    fn place(&self) {
        change_floating_panes_coordinates(vec![(PaneId::Plugin(self.own_id), self.coordinates())]);
        rename_plugin_pane(self.own_id, self.title());
    }

    fn coordinates(&self) -> FloatingPaneCoordinates {
        let (entries, _) = self.menu();
        // bordo (2) + margine (2)
        let (_, width, rows) = grid::layout(&entries, self.viewport_cols.saturating_sub(4));
        FloatingPaneCoordinates::new(
            None, // x assente: Zellij centra il riquadro
            Some("9999".to_owned()), // y oltre il fondo: Zellij lo appoggia in basso (adjust_coordinates)
            Some((width + 4).to_string()),
            Some((rows + 2).to_string()),
            Some(true), // pin: resta visibile anche con i floating nascosti
            Some(false),
        )
        .unwrap_or_default()
    }

    fn title(&self) -> String {
        let (_, exits) = self.menu();
        let name = mode_name(self.mode_info.mode);
        if exits.is_empty() {
            name.to_owned()
        } else {
            format!("{name} · {exits} {EXIT}")
        }
    }

    /// Voci del modo attivo, con i tasti uniti per descrizione: prima i gruppi (+), poi in ordine di tasto.
    /// Restituisce anche i tasti che tornano alla base.
    fn menu(&self) -> (Vec<(String, String)>, String) {
        let mode = self.mode_info.mode;
        let base = self.base();
        let binds = |m: InputMode| {
            self.keybinds
                .iter()
                .find(|(bind_mode, _)| *bind_mode == m)
                .map(|(_, binds)| binds.as_slice())
                .unwrap_or_default()
        };
        let base_binds = binds(base);
        let mut binds: Vec<_> = binds(mode)
            .iter()
            // i tasti diretti fanno lo stesso anche nella base: non sono il passo dopo il leader
            .filter(|bind| !base_binds.contains(bind))
            .collect();
        binds.sort_by(|a, b| a.0.cmp(&b.0));

        let mut entries: Vec<(String, String)> = Vec::new();
        let mut exits = Vec::new();
        for (key, actions) in binds {
            let desc = match self.overrides.get(&(mode, key.clone())) {
                Some(desc) => desc.clone(),
                None => describe(actions, base),
            };
            if desc == EXIT {
                exits.push(key.to_string());
            } else if let Some((keys, _)) = entries.iter_mut().find(|(_, d)| *d == desc) {
                keys.push(' ');
                keys.push_str(&key.to_string());
            } else {
                entries.push((key.to_string(), desc));
            }
        }
        entries.sort_by_key(|(_, desc)| !desc.starts_with('+'));
        (entries, exits.join(" "))
    }
}

/// Modi senza riquadro: locked e i modi in cui scrivi.
fn is_hidden(mode: InputMode) -> bool {
    matches!(
        mode,
        InputMode::Locked
            | InputMode::EnterSearch
            | InputMode::RenameTab
            | InputMode::RenamePane
            | InputMode::Prompt
    )
}

/// Override delle descrizioni: `"<modo> <tasto>" "<testo>"`, con il tasto scritto come in `bind`.
fn parse_overrides(config: &BTreeMap<String, String>) -> HashMap<(InputMode, KeyWithModifier), String> {
    config
        .iter()
        .filter_map(|(name, desc)| {
            let (mode, key) = name.split_once(' ')?;
            match (InputMode::from_str(mode), KeyWithModifier::from_str(key)) {
                (Ok(mode), Ok(key)) => Some(((mode, key), desc.clone())),
                _ => {
                    eprintln!("zellij-which-key: override ignorato, chiave non valida: {name:?}");
                    None
                },
            }
        })
        .collect()
}

/// Descrizione automatica: "+Modo" se il tasto apre solo un altro modo, "esci" se torna alla base.
fn describe(actions: &[Action], base: InputMode) -> String {
    let mut target = None;
    let mut labels = Vec::new();
    for action in actions {
        match action {
            Action::SwitchToMode { input_mode } => target = Some(*input_mode),
            // l'input iniziale della ricerca o del nome della tab non è un'azione da mostrare
            Action::SearchInput { .. } | Action::TabNameInput { .. } => {},
            other => labels.push(label(other)),
        }
    }
    let text = labels.join(", ");
    match target {
        Some(m) if m == base && labels.is_empty() => EXIT.to_owned(),
        Some(m) if m == base => text,
        Some(m) if is_hidden(m) && labels.is_empty() => mode_name(m).to_owned(),
        Some(m) if labels.is_empty() => format!("+{}", mode_name(m)),
        Some(m) => format!("{text} +{}", mode_name(m)),
        None => text,
    }
}

fn mode_name(mode: InputMode) -> &'static str {
    match mode {
        InputMode::Normal => "Leader",
        InputMode::Locked => "Locked",
        InputMode::Pane => "Pannelli",
        InputMode::Tab => "Tab",
        InputMode::Resize => "Resize",
        InputMode::Move => "Sposta",
        InputMode::Scroll => "Scroll",
        InputMode::Search => "Ricerca",
        InputMode::EnterSearch => "cerca",
        InputMode::RenameTab => "rinomina tab",
        InputMode::RenamePane => "rinomina pannello",
        InputMode::Session => "Sessioni",
        InputMode::Prompt => "Prompt",
        InputMode::Tmux => "Tmux",
    }
}

fn arrow(direction: &Direction) -> &'static str {
    match direction {
        Direction::Left => "←",
        Direction::Right => "→",
        Direction::Up => "↑",
        Direction::Down => "↓",
    }
}

fn label(action: &Action) -> String {
    let text = match action {
        Action::MoveFocus { direction } => return format!("focus {}", arrow(direction)),
        Action::MoveFocusOrTab { direction } => return format!("focus o tab {}", arrow(direction)),
        Action::MoveTab { direction } => return format!("sposta tab {}", arrow(direction)),
        Action::NewPane { direction: Some(d), .. } => return format!("nuovo pannello {}", arrow(d)),
        Action::Run { command, .. } => match &command.direction {
            Some(d) => return format!("nuovo pannello {}", arrow(d)),
            None => "nuovo pannello",
        },
        Action::Resize { resize, direction } => {
            let verb = match resize {
                Resize::Increase => "allarga",
                Resize::Decrease => "restringi",
            };
            return match direction {
                Some(d) => format!("{verb} {}", arrow(d)),
                None => verb.to_owned(),
            };
        },
        Action::GoToTab { index } => return format!("tab {index}"),
        Action::LaunchOrFocusPlugin { plugin, .. } => {
            return plugin.location_string().trim_start_matches("zellij:").to_owned()
        },
        Action::NewPane { .. } => "nuovo pannello",
        Action::NewStackedPane { .. } => "pannello impilato",
        Action::EditScrollback { .. } => "scrollback nell'editor",
        Action::ToggleFocusFullscreen => "zoom",
        Action::CloseFocus => "chiudi pannello",
        Action::TogglePaneEmbedOrFloating => "floating ↔ fisso",
        Action::ToggleFloatingPanes => "mostra/nascondi floating",
        Action::TogglePanePinned => "pin: sempre in primo piano",
        Action::TogglePaneFrames => "bordi dei pannelli",
        Action::SwitchFocus => "pannello successivo",
        Action::GoToPreviousTab => "tab precedente",
        Action::GoToNextTab => "tab successiva",
        Action::ToggleTab => "ultima tab",
        Action::NewTab { .. } => "nuova tab",
        Action::CloseTab => "chiudi tab",
        Action::BreakPane => "pannello in una tab nuova",
        Action::BreakPaneLeft => "pannello nella tab a sinistra",
        Action::BreakPaneRight => "pannello nella tab a destra",
        Action::ToggleActiveSyncTab => "scrivi in tutti i pannelli",
        Action::Detach => "detach",
        Action::Quit => "chiudi la sessione",
        Action::UndoRenameTab => "annulla",
        Action::ScrollUp => "riga ↑",
        Action::ScrollDown => "riga ↓",
        Action::PageScrollUp => "pagina ↑",
        Action::PageScrollDown => "pagina ↓",
        Action::HalfPageScrollUp => "½ pagina ↑",
        Action::HalfPageScrollDown => "½ pagina ↓",
        Action::ScrollToBottom => "in fondo",
        Action::Search { direction: SearchDirection::Up } => "risultato ↑",
        Action::Search { direction: SearchDirection::Down } => "risultato ↓",
        Action::SearchToggleOption { option: SearchOption::CaseSensitivity } => "maiuscole/minuscole",
        Action::SearchToggleOption { option: SearchOption::WholeWord } => "parola intera",
        Action::SearchToggleOption { option: SearchOption::Wrap } => "ricerca circolare",
        // azione senza testo: il suo nome, senza parametri (es. "SwitchFocus")
        other => {
            let name = format!("{other:?}");
            return name.split(|c: char| !c.is_alphanumeric()).next().unwrap_or_default().to_owned();
        },
    };
    text.to_owned()
}
