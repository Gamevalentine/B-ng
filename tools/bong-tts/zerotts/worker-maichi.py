"""Local ZeroTTS worker for BÔNG. Model weights and venv are NOT committed.

This source mirrors the reviewed offline pipeline: normalized Vietnamese text,
Mai Chi, voice-guidance cfg_scale=1.5, WAV sent via local process stdout.
The Windows packaging/install path is NOT implemented yet.
"""
import base64
import io
import json
import sys
import time

import numpy as np
import soundfile as sf
from zerotts import ZeroTTS, normalize_vi_text
from zerotts.chunking import chunk_text, clean_segment_punctuation, normalize_punctuation

model = ZeroTTS.from_pretrained("zeroweight-ai/ZeroTTS")
print(json.dumps({"type": "ready", "voice": "maichi"}), flush=True)

for raw in sys.stdin:
    job_id = None
    try:
        job = json.loads(raw)
        job_id = int(job["id"])
        text = str(job["text"])
        if not text.strip() or len(text) > 900:
            raise ValueError("Unsupported speech length")
        t0 = time.monotonic()
        normalized = normalize_vi_text(text)
        segments = [
            clean_segment_punctuation(x)
            for x in chunk_text(normalize_punctuation(normalized), max_chunk_sec=12)
        ]
        parts = [
            model.synthesize(segment, voice="maichi", cfg_scale=1.5).reshape(-1)
            for segment in segments if segment
        ]
        if not parts:
            raise ValueError("No speakable Vietnamese text")
        audio = np.concatenate(parts)
        output = io.BytesIO()
        sf.write(output, audio, model.sample_rate, format="WAV")
        encoded = base64.b64encode(output.getvalue()).decode("ascii")
        print(json.dumps({
            "type": "result", "id": job_id, "ok": True,
            "elapsedMs": round((time.monotonic() - t0) * 1000),
            "audioBase64": encoded,
        }), flush=True)
    except Exception as exc:
        print(json.dumps({
            "type": "result", "id": job_id, "ok": False,
            "error": type(exc).__name__,
        }), flush=True)
