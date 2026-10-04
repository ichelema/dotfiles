export type Step = { file: string; kind: 'Edit' | 'Write'; before: string; after: string }

declare module 'claude-code' {
  interface PluginState {
    replay: { steps: Step[]; at: number; isHidden: boolean }
  }
}
