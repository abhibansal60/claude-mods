export type OnMe = {
  // What waits on the person, from the last answer's "Blocked on me" part
  items: string[]
  // What Claude does now; empty between turns
  doing: string
}

declare module 'claude-code' {
  interface PluginState {
    'on-me': { state: OnMe }
  }
}
