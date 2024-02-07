import { createFanoutHandoff } from "fastly:fanout";
import { decodeWebSocketEvents, encodeWebSocketEvents } from './WebSocketEvent';
import { WebSocketContext } from './WebSocketContext'

function gripResponse(ctype, ghold, chan) {
  const headers = new Headers();
  headers.append('Content-Type', ctype);
  headers.append('Grip-Hold', ghold);
  headers.append('Grip-Channel', chan);
  return new Response('', { status: 200, headers });
}

async function handleFanoutWebSocket(req, chan) {

  if (req.headers.get('Content-Type') !== 'application/websocket-events') {
      return new Response('Not a WebSocket-over-HTTP request.\n', { status: 400 });
  }

     // Make sure we have a connection ID
     let cid = req.headers.get('connection-id');
     if (cid == null) {
       return new Response('connection-id required\n', { status: 401, headers: { 'Content-Type': 'text/plain', }, });
     }
     const inEventsEncoded = await req.text();
     const inEvents = decodeWebSocketEvents(inEventsEncoded);
     const wsContext = new WebSocketContext(cid, {}, inEvents);
     if (wsContext.isOpening()) {
       // Open the WebSocket and subscribe it to a channel:
       wsContext.accept();
       wsContext.subscribe(chan);

     } else if (wsContext.canRecv()) {
       const reqStr = wsContext.recv();
       wsContext.send(reqStr);
     } 

     const closeCode = wsContext.closeCode;
     if (closeCode) {
       wsContext.close(closeCode);
     }
     // The above commands made to the wsContext are buffered in the wsContext as "outgoing events".
     // Obtain them and write them to the response.
     const outEvents = wsContext.getOutgoingEvents();
     const responseString = encodeWebSocketEvents(outEvents);
     // Set the headers required by the GRIP proxy:
     const headers = wsContext.toHeaders();
     return new Response(responseString, {status: 200, headers,});
}

function handleFanout(req, chan) {
  const url = new URL(req.url);
  //console.log(url.pathname);
  switch (url.pathname) {
      case '/stream/long-poll':
          return gripResponse('text/plain', 'response', chan);
      case '/stream/plain':
          return gripResponse('text/plain', 'stream', chan);
      case '/stream/sse':
          return gripResponse('text/event-stream', 'stream', chan);
      case '/stream/websocket':
          return handleFanoutWebSocket(req, chan);
      default:
          return new Response('Invalid Fanout request\n', { status: 400 });
  }
}

async function handleRequest(event) {
  try {
    const url = new URL(event.request.url);
    const req = event.request;

    const headersIterator = req.headers.entries();
    for (const header of headersIterator) {
        //console.log(header[0] + ': ' + header[1]);
    }

    if (url.pathname.startsWith('/stream/')) {
      if (req.headers.get('Grip-Sig')) {
        // Request is from Fanout
        return await handleFanout(req, 'test');
      } else {
        // Not from fanout, hand it off to Fanout to manage
        return createFanoutHandoff(req, 'self');
      }
    } else {
      return new Response('oopsie, make a request to /stream for some fanout goodies', { status: 404 });
    }
  } catch (error) {
    //console.error({error});
    return new Response(error.message, {status:500})
  }
}

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));
