import { isString } from './string';
import { IWebSocketEvent } from './IWebSocketEvent';
import { Buffer } from 'buffer';

// The WebSocketEvent class represents WebSocket event information that is
// used with the GRIP WebSocket-over-HTTP protocol. It includes information
// about the type of event as well as an optional content field.
export class WebSocketEvent implements IWebSocketEvent {
    type: string;
    content: Buffer | number[] | string | null;

    constructor(type: string, content: Buffer | number[] | string | null = null) {
        // Initialize with a specified event type and optional content information.
        this.type = type;
        this.content = content;
    }

    // Get the event type.
    getType() {
        return this.type;
    }

    // Get the event content.
    getContent() {
        return this.content;
    }
}

// Encode the specified array of WebSocketEvent instances. The returned string
// value should then be passed to a GRIP proxy in the body of an HTTP response
// when using the WebSocket-over-HTTP protocol.
export function encodeWebSocketEvents(events: IWebSocketEvent[]) {
    let out = Buffer.alloc(0);
    const bufferNewLine = Buffer.from('\r\n');
    for (const e of events) {
        let content = e.getContent();
        if (content != null) {
            if (isString(content)) {
                content = Buffer.from(content);
            } else {
                if (!Buffer.isBuffer(content)) {
                    content = Buffer.from(content);
                }
            }
            out = Buffer.concat([
                out,
                Buffer.from(e.getType()),
                Buffer.from(' '),
                Buffer.from(content.length.toString(16)),
                bufferNewLine,
                content,
                bufferNewLine,
            ]);
        } else {
            out = Buffer.concat([out, Buffer.from(e.getType()), bufferNewLine]);
        }
    }
    return out;
}

// Decode the specified HTTP request body into an array of WebSocketEvent
// instances when using the WebSocket-over-HTTP protocol. A RuntimeError
// is raised if the format is invalid.
export function decodeWebSocketEvents(body: Buffer | string): IWebSocketEvent[] {
    const out:WebSocketEvent[] = [];
    let start = 0;
    let makeContentString = false;
    if (isString(body)) {
        body = Buffer.from(body);
        makeContentString = true;
    }
    while (start < body.length) {
        let at = body.indexOf('\r\n', start);
        if (at === -1) {
            throw new Error('bad format');
        }
        const typeline = body.slice(start, at);
        start = at + 2;
        at = typeline.indexOf(' ');
        let e = new WebSocketEvent(typeline.toString());
        if (at !== -1) {
            const etype = typeline.slice(0, at);
            const clen = parseInt(typeline.slice(at + 1).toString(), 16);
            const content = body.slice(start, start + clen);
            start = start + clen + 2;
            if (makeContentString) {
                e = new WebSocketEvent(etype.toString(), content.toString());
            } else {
                e = new WebSocketEvent(etype.toString(), content);
            }
        } else {
            e = new WebSocketEvent(typeline.toString());
        }
        out.push(e);
    }
    return out;
}

// Generate a WebSocket control message with the specified type and optional
// arguments. WebSocket control messages are passed to GRIP proxies and
// example usage includes subscribing/unsubscribing a WebSocket connection
// to/from a channel.
export function createWebSocketControlMessage(type: string, args: object | null = null) {
    const out = Object.assign({}, args, { type });
    return JSON.stringify(out);
}
