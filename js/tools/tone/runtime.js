// One Tone.js for the whole page. Tone has a single global context and Transport, and the fork
// lets a Transport follow only one tempo session, so every tab that uses Tone gets it here:
//
//   const rt = await getTone(hub);
//   rt.Tone, rt.context, rt.transport   the bundle, its native AudioContext, the shared Transport
//   rt.sync                             the Transport's TempoSessionSync, or null with no session
//   rt.resume()                         wake the context (call it from a tap)
//
// getTone() loads the bundle and sets the context once, however many tabs ask. It follows
// hub.onSession for them: each new session (a new quantum is a new session) replaces the old
// sync, and without a session the Transport stops. Its listener is registered before any tab's,
// so by the time a tab's own hub.onSession callback runs, rt.sync is already the new one.

let runtime = null;

export function getTone(hub) {
  runtime ??= create(hub);
  return runtime;
}

async function create(hub) {
  // The vendored build is Tone's UMD bundle: importing it defines globalThis.Tone.
  await import('./vendor/Tone.js');
  const Tone = globalThis.Tone;

  // A native AudioContext, so the session can give times in its currentTime: Tone's own
  // default is a standardized-audio-context wrapper, which captureState() won't take.
  const context = new AudioContext({ latencyHint: 'interactive' });
  Tone.setContext(context, true);
  const transport = Tone.getTransport();

  let sync = null;
  hub.onSession((session) => {
    sync?.dispose();
    sync = null;
    if (!session) {
      transport.stop();
      return;
    }
    const q = session.quantum;
    transport.timeSignature = q;
    sync = transport.syncTempoSession(session, { quantum: q });
  });

  return {
    Tone,
    context,
    transport,
    get sync() {
      return sync && !sync.disposed ? sync : null;
    },
    resume() {
      if (context.state !== 'running') {
        context.resume().catch(() => {});
      }
    },
  };
}
