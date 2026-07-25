#!/usr/bin/env python3
"""Generate a real background music track via local ComfyUI (stable-audio-open).
Replaces the grating procedural square-wave bed. Saves to audio/bg_track.mp3
(bgMusic is mp3-first, so it picks this up automatically).
"""
import json, time, urllib.request, urllib.parse, sys, io, os, shutil

API = "http://127.0.0.1:8188"
HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, "..", "audio")
os.makedirs(AUDIO, exist_ok=True)

PROMPT = ("dark atmospheric sci-fi defense game soundtrack, steady driving industrial "
          "electronic beat, deep pulsing synth bassline, tense cinematic pads, subtle "
          "arpeggio, hypnotic and loopable, instrumental background game music, clean mix")
NEG = "vocals, singing, voice, lyrics, spoken word, harsh noise, white noise, distortion, clipping, applause"
SECONDS = 45.0


def workflow(seed):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "stable-audio-open-1.0.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": PROMPT, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentAudio", "inputs": {"seconds": SECONDS, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            "seed": seed, "steps": 80, "cfg": 6.5, "sampler_name": "dpmpp_3m_sde_gpu", "scheduler": "exponential", "denoise": 1.0}},
        "6": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveAudioMP3", "inputs": {"audio": ["6", 0], "filename_prefix": "holdfast_bg", "quality": "V0"}},
    }


def post(path, payload):
    req = urllib.request.Request(API + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(path):
    return urllib.request.urlopen(API + path, timeout=600).read()


if __name__ == "__main__":
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 4242
    pid = post("/prompt", {"prompt": workflow(seed)})["prompt_id"]
    print(f"music: queued {pid} ({SECONDS}s, seed {seed})", flush=True)
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(4)
        hist = json.loads(get(f"/history/{pid}"))
        if pid in hist and hist[pid].get("outputs"):
            outs = hist[pid]["outputs"].get("7", {})
            arr = outs.get("audio") or outs.get("audios") or []
            if not arr:
                print("music: no audio output:", json.dumps(outs)[:300], flush=True); sys.exit(1)
            a = arr[0]
            raw = get(f"/view?filename={urllib.parse.quote(a['filename'])}&subfolder={urllib.parse.quote(a.get('subfolder',''))}&type=output")
            out = os.path.join(AUDIO, "bg_track.mp3")
            with open(out, "wb") as f:
                f.write(raw)
            print(f"music: saved {out} ({len(raw)} bytes, {time.time()-t0:.0f}s)", flush=True)
            sys.exit(0)
    print("music: TIMEOUT", flush=True); sys.exit(1)
