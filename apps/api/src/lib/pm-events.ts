import { EventEmitter } from 'events'
import type { PMEvent } from '@vencore/automation'

export type { PMEvent }

class PMEventEmitter extends EventEmitter {
  emit(event: 'pm', data: PMEvent): boolean
  emit(event: string | symbol, ...args: unknown[]): boolean
  emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args)
  }

  on(event: 'pm', listener: (data: PMEvent) => void): this
  on(event: string | symbol, listener: (...args: any[]) => void): this
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }
}

export const pmEvents = new PMEventEmitter()
