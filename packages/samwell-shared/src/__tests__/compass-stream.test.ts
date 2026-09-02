import { describe, expect, it } from 'vitest';

import {
  decodeCompassEvents,
  encodeCompassEvent,
  type CompassStreamEvent,
} from '../compass-stream';

describe('compass stream framing', () => {
  it('round-trips an event', () => {
    const event: CompassStreamEvent = { type: 'reply', delta: 'Hello' };
    const { events, rest } = decodeCompassEvents(encodeCompassEvent(event));
    expect(events).toEqual([event]);
    expect(rest).toBe('');
  });

  it('holds back a line that has not finished arriving', () => {
    const first = decodeCompassEvents('{"type":"reply","delta":"Hel');
    expect(first.events).toEqual([]);
    expect(first.rest).toBe('{"type":"reply","delta":"Hel');

    const second = decodeCompassEvents(`${first.rest}lo"}\n`);
    expect(second.events).toEqual([{ type: 'reply', delta: 'Hello' }]);
    expect(second.rest).toBe('');
  });

  it('reassembles a stream cut at every possible byte', () => {
    const sent: CompassStreamEvent[] = [
      { type: 'reply', delta: 'One. ' },
      { type: 'reply', delta: 'Two.\nStill two.' },
      { type: 'restart' },
      { type: 'reply', delta: 'Fresh start' },
      { type: 'done', turn: { reply: 'Fresh start', draft: null } },
    ];
    const wire = sent.map(encodeCompassEvent).join('');

    // Every split point, since a chunk boundary lands mid-line often enough
    // that assuming otherwise silently drops the event being written.
    for (let cut = 0; cut <= wire.length; cut += 1) {
      const received: CompassStreamEvent[] = [];
      let rest = '';
      for (const chunk of [wire.slice(0, cut), wire.slice(cut)]) {
        const decoded = decodeCompassEvents(rest + chunk);
        rest = decoded.rest;
        received.push(...decoded.events);
      }
      expect(received).toEqual(sent);
      expect(rest).toBe('');
    }
  });

  it('drops a malformed line without losing the ones around it', () => {
    const { events } = decodeCompassEvents(
      '{"type":"reply","delta":"a"}\nnot json\n{"type":"reply","delta":"b"}\n',
    );
    expect(events).toEqual([
      { type: 'reply', delta: 'a' },
      { type: 'reply', delta: 'b' },
    ]);
  });

  it('survives a delta containing a newline, which is not a frame boundary', () => {
    const event: CompassStreamEvent = { type: 'reply', delta: 'line one\nline two' };
    const { events } = decodeCompassEvents(encodeCompassEvent(event));
    expect(events).toEqual([event]);
  });
});
