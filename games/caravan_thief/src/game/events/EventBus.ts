import Phaser from 'phaser';
import type { GameEvent, GameEventPayloads } from '../config/gameEvents';

type GameEventHandler<TEvent extends GameEvent> = (payload: GameEventPayloads[TEvent]) => void;

class TypedEventBus {
  private readonly emitter = new Phaser.Events.EventEmitter();

  on<TEvent extends GameEvent>(event: TEvent, handler: GameEventHandler<TEvent>, context?: unknown): this {
    this.emitter.on(event, handler, context);
    return this;
  }

  once<TEvent extends GameEvent>(event: TEvent, handler: GameEventHandler<TEvent>, context?: unknown): this {
    this.emitter.once(event, handler, context);
    return this;
  }

  off<TEvent extends GameEvent>(event: TEvent, handler?: GameEventHandler<TEvent>, context?: unknown): this {
    this.emitter.off(event, handler, context);
    return this;
  }

  emit<TEvent extends GameEvent>(event: TEvent, payload: GameEventPayloads[TEvent]): boolean {
    return this.emitter.emit(event, payload);
  }

  removeAllListeners(event?: GameEvent): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}

export const eventBus = new TypedEventBus();
