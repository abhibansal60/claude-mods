export type Account = {
  n: number
  email: string
  isActive: boolean
  five: number
  // time until the 5h window resets, like "3h"
  fiveReset: string | null
  week: number
}

export type Meter = {
  accounts: Account[]
}

declare module 'claude-code' {
  interface PluginState {
    'twin-meter': { meter: Meter | null }
  }
}
