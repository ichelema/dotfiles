/** Il comando sudo in attesa di password, o null quando non se ne aspetta. */
export type Ask = string | null

declare module 'claude-code' {
  interface PluginState {
    'sudo-popup': { ask: Ask }
  }
}
