# Voices one line with Microsoft's online neural voices and keeps when each word is spoken, for the word clock.
# Run by voice.mjs with the kit's own Python: edge_voice.py <voice> <rate> <pitch> <text> <audio.mp3> <words.json>
import asyncio
import json
import sys

import edge_tts


async def main(voice, rate, pitch, text, audio, words):
    speech = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary='WordBoundary')
    spoken = []
    with open(audio, 'wb') as f:
        async for chunk in speech.stream():
            if chunk['type'] == 'audio':
                f.write(chunk['data'])
            elif chunk['type'] == 'WordBoundary':
                # offsets come in 100 ns ticks
                at, dur = chunk['offset'] / 10000, chunk['duration'] / 10000
                spoken.append({'w': chunk['text'], 'at': round(at), 'end': round(at + dur)})
    with open(words, 'w') as f:
        json.dump(spoken, f)


asyncio.run(main(*sys.argv[1:7]))
