import type { StateFamily } from 'claude-code'

// local: toolStyle folded. Se il risultato di una chiamata di tool è aperto (un valore per chiamata).
declare module 'claude-code' {
  interface PluginState {
    prismantis: {
      resultOpen: StateFamily<boolean>
    }
  }
}
