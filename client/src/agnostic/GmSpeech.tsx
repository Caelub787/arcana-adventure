// What the GM just typed, across the top of the table.
//
// A GM speaks as the table rather than as anyone standing on it, and a GM who
// has taken a player's character to run a scene shouldn't make that character
// talk. So their line sits under the Soundscape button where everyone can read
// it, and never over a token.
import React from "react";
import { gmSpeech, onSpeech, speechOpacity, SPEECH_FADE_MS } from "./speech";

export function GmSpeechBubble() {
  const [, bump] = React.useState(0);
  React.useEffect(() => onSpeech(() => bump((n) => n + 1)), []);
  const said = gmSpeech();
  // Fading is a second of animation: redraw while there is something to fade.
  React.useEffect(() => {
    if (!said) return;
    const t = setInterval(() => bump((n) => n + 1), 120);
    return () => clearInterval(t);
  }, [said?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!said) return null;
  const opacity = speechOpacity(said.at);
  if (opacity <= 0) return null;
  return (
    <div
      className="fixed top-[58px] left-1/2 -translate-x-1/2 z-40 pointer-events-none px-2 w-[min(620px,92vw)]"
      style={{ opacity, transition: `opacity ${SPEECH_FADE_MS}ms linear` }}
      data-testid="gm-speech"
    >
      <div className="mx-auto w-fit max-w-full rounded-xl bg-stone-900/95 border border-amber-600/70 px-3 py-1.5 shadow-lg backdrop-blur-sm text-center">
        {said.sender && <div className="text-[10px] uppercase tracking-wide text-amber-400/90 leading-none mb-0.5">{said.sender}</div>}
        <div className="text-sm text-stone-100 leading-snug break-words">{said.text}</div>
      </div>
    </div>
  );
}
