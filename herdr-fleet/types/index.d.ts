export type Agent = {
  pane: string
  tab: string
  name: string
  status: 'idle' | 'working' | 'blocked' | 'done' | 'unknown'
  cwd: string
  title: string
  isMe: boolean
  // The last text the agent's Claude wrote, when its session log is found
  said: string
  seq: number
}

declare module 'claude-code' {
  interface PluginState {
    'herdr-fleet': { agents: Agent[] }
  }
}
