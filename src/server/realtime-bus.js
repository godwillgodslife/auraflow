const workspaceStreams = new Map();

function getStreamSet(workspaceId) {
  const key = String(workspaceId || '').trim();
  if (!key) return null;
  if (!workspaceStreams.has(key)) {
    workspaceStreams.set(key, new Set());
  }
  return workspaceStreams.get(key);
}

export function attachWorkspaceStream(req, res, workspaceId) {
  const streams = getStreamSet(workspaceId);
  if (!streams) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'workspaceId is required' }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ workspaceId })}\n\n`);

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(`event: ping\ndata: ${JSON.stringify({ workspaceId, ts: Date.now() })}\n\n`);
    }
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    streams.delete(res);
    if (!streams.size) {
      workspaceStreams.delete(String(workspaceId || '').trim());
    }
  };

  streams.add(res);
  req.on('close', cleanup);
  res.on('close', cleanup);
}

export function publishWorkspaceEvent(workspaceId, event = {}) {
  const streams = workspaceStreams.get(String(workspaceId || '').trim());
  if (!streams || !streams.size) return;
  const payload = `event: ${event.type || 'workspace.updated'}\ndata: ${JSON.stringify({
    workspaceId,
    ...event,
    ts: Date.now()
  })}\n\n`;
  for (const stream of streams) {
    if (!stream.writableEnded) {
      stream.write(payload);
    }
  }
}
