import { EmitEvent } from '@tsuki-hono/event-emitter';
import { injectable } from 'tsyringe';

@injectable()
export class EventsService {
  @EmitEvent('ping')
  async ping(from: string): Promise<{ from: string; at: string }> {
    return { from, at: new Date().toISOString() };
  }
}
