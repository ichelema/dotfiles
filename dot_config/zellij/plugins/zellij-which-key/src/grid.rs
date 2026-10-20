//! Griglia del riquadro: le voci riempiono le colonne dall'alto in basso, come which-key.
//! Niente tipi di Zellij qui, così i test girano con `rustc --test src/grid.rs`.

/// Spazi tra una colonna e la successiva.
pub const GAP: usize = 3;

/// Una voce da disegnare: tasto in (x, y), descrizione in (desc_x, y).
#[derive(Debug, PartialEq)]
pub struct Cell<'a> {
    pub x: usize,
    pub desc_x: usize,
    pub y: usize,
    pub key: &'a str,
    pub desc: &'a str,
}

/// Mette le voci nel numero più alto di colonne che sta in `max_width`.
/// Ogni colonna ha la sua larghezza. Restituisce celle, larghezza e righe della griglia.
pub fn layout(entries: &[(String, String)], max_width: usize) -> (Vec<Cell<'_>>, usize, usize) {
    if entries.is_empty() {
        return (Vec::new(), 0, 0);
    }
    for columns in (1..=entries.len()).rev() {
        let rows = entries.len().div_ceil(columns);
        let mut cells = Vec::with_capacity(entries.len());
        let mut x = 0;
        for (i, column) in entries.chunks(rows).enumerate() {
            if i > 0 {
                x += GAP;
            }
            let key_width = column.iter().map(|(k, _)| width(k)).max().unwrap_or(0);
            let desc_width = column.iter().map(|(_, d)| width(d)).max().unwrap_or(0);
            for (y, (key, desc)) in column.iter().enumerate() {
                cells.push(Cell { x, desc_x: x + key_width + 2, y, key, desc });
            }
            x += key_width + 2 + desc_width;
        }
        // con una colonna sola la griglia esce comunque: Zellij taglia il riquadro
        if x <= max_width || columns == 1 {
            return (cells, x, rows);
        }
    }
    unreachable!("il ciclo finisce sempre con una colonna")
}

fn width(text: &str) -> usize {
    text.chars().count()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entries(items: &[(&str, &str)]) -> Vec<(String, String)> {
        items.iter().map(|(k, d)| (k.to_string(), d.to_string())).collect()
    }

    #[test]
    fn vuota() {
        assert_eq!(layout(&[], 80), (Vec::new(), 0, 0));
    }

    #[test]
    fn una_riga_se_lo_spazio_basta() {
        let e = entries(&[("a", "uno"), ("b", "due")]);
        let (cells, width, rows) = layout(&e, 80);
        assert_eq!(rows, 1);
        // "a  uno" + GAP + "b  due"
        assert_eq!(width, 6 + GAP + 6);
        assert_eq!(cells[1], Cell { x: 6 + GAP, desc_x: 6 + GAP + 3, y: 0, key: "b", desc: "due" });
    }

    #[test]
    fn colonne_dall_alto_in_basso() {
        let e = entries(&[("a", "uno"), ("b", "due"), ("c", "tre"), ("d", "quattro")]);
        // 2 colonne: "a  uno" / "b  due" (6) + GAP + "c  tre" / "d  quattro" (10) = 19
        let (cells, width, rows) = layout(&e, 19);
        assert_eq!((width, rows), (19, 2));
        assert_eq!((cells[1].x, cells[1].y, cells[1].key), (0, 1, "b"));
        assert_eq!((cells[2].x, cells[2].y, cells[2].key), (6 + GAP, 0, "c"));
    }

    #[test]
    fn larghezza_per_colonna() {
        let e = entries(&[("Ctrl b", "pagina ↑"), ("x", "uno"), ("y", "due"), ("z", "tre")]);
        // la colonna 2 non eredita la larghezza del tasto "Ctrl b"
        let (cells, _, rows) = layout(&e, 30);
        assert_eq!(rows, 2);
        assert_eq!(cells[0].desc_x, 8);
        assert_eq!(cells[2].desc_x - cells[2].x, 3);
    }

    #[test]
    fn una_colonna_anche_se_non_entra() {
        let e = entries(&[("a", "descrizione lunga"), ("b", "due")]);
        let (_, width, rows) = layout(&e, 5);
        assert_eq!((width, rows), (20, 2));
    }
}
