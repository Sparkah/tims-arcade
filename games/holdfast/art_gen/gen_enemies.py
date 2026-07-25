#!/usr/bin/env python3
"""Generate top-down enemy sprites for Holdfast (tech theme) via local ComfyUI (SDXL).
Top-down (seen from directly above) so they can be rotated toward movement in the swarm.
Outputs raw 1024 PNGs to art_gen/raw/enemy_<type>.png ; cut to art_gen/cut/enemy_<type>.png
"""
import json, time, urllib.request, urllib.parse, sys, io, os

API = "http://127.0.0.1:8188"
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw"); os.makedirs(RAW, exist_ok=True)

NEG = ("side view, profile, three-quarter view, perspective, isometric, tilted, "
       "multiple, group, swarm, text, words, watermark, logo, scene, background "
       "details, ground, cast shadow, people, blurry, lowres, jpeg artifacts, deformed")

UNITS = {
    "grunt":  "a small red mechanical beetle drone robot, dark red armor plates with orange glowing accents and antennae",
    "runner": "a small sleek fast red insect drone robot, elongated aerodynamic body, two thin legs, bright orange glow",
    "brute":  "a large heavily armored dark red mechanical beetle tank robot, thick chitinous metal armor plates, a glowing orange core, mandibles",
}
TMPL = ("top-down view of {S}, seen from directly straight above looking down, head pointing up, "
        "single isolated object, centered, plain flat light grey background, clean polished mobile game sprite, "
        "crisp, soft top lighting, vibrant")


def workflow(p, seed, w=1024, h=1024):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": p, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            "seed": seed, "steps": 30, "cfg": 7.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "holdfast_enemy"}},
    }


def post(path, payload):
    req = urllib.request.Request(API + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(path):
    return urllib.request.urlopen(API + path, timeout=600).read()


def run(tk, prompt, seed):
    pid = post("/prompt", {"prompt": workflow(prompt, seed)})["prompt_id"]
    print(f"enemy/{tk}: queued {pid}", flush=True)
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(3)
        hist = json.loads(get(f"/history/{pid}"))
        if pid in hist and hist[pid].get("outputs"):
            img = hist[pid]["outputs"]["7"]["images"][0]
            raw = get(f"/view?filename={urllib.parse.quote(img['filename'])}&subfolder={urllib.parse.quote(img.get('subfolder',''))}&type=output")
            from PIL import Image
            Image.open(io.BytesIO(raw)).convert("RGB").save(os.path.join(RAW, f"enemy_{tk}.png"), "PNG")
            print(f"enemy/{tk}: saved ({time.time()-t0:.0f}s)", flush=True)
            return True
    print(f"enemy/{tk}: TIMEOUT", flush=True); return False


if __name__ == "__main__":
    seed = 9100
    for i, (tk, sv) in enumerate(UNITS.items()):
        run(tk, TMPL.format(S=sv), seed + i * 211)
    # cut out
    from rembg import remove
    from PIL import Image
    os.makedirs(os.path.join(HERE, "cut"), exist_ok=True)
    for tk in UNITS:
        p = os.path.join(RAW, f"enemy_{tk}.png")
        out = remove(Image.open(p).convert("RGBA"))
        bb = out.getbbox()
        if bb: out = out.crop(bb)
        out.save(os.path.join(HERE, "cut", f"enemy_{tk}.png"))
        print(f"cut enemy_{tk}: {out.size}", flush=True)
    print("ENEMIES DONE", flush=True)
