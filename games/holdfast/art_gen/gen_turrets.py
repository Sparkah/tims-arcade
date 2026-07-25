#!/usr/bin/env python3
"""Generate Holdfast turret sprite STYLE OPTIONS via local ComfyUI (SDXL base).
Produces 4 distinct art-style renders of the GUN turret (the hero unit) so Tim
can pick a direction; once chosen we regenerate the full set in that style.

Usage:
  python3 gen_turrets.py [--unit gun] [--styles all|1,2] [--seed N]
Outputs raw 1024 PNGs to art_gen/raw/<unit>_<style>.png
"""
import json, time, urllib.request, urllib.parse, sys, io, os, random

API = "http://127.0.0.1:8188"
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
os.makedirs(RAW, exist_ok=True)

NEG = ("text, words, letters, watermark, logo, signature, caption, ui, hud, "
       "multiple objects, group, collection, scene, landscape, room, people, "
       "person, hands, soldiers, character, cluttered, busy background, "
       "cast shadow on ground, blurry, lowres, jpeg artifacts, deformed, "
       "duplicate, frame, border")

# the unit subject (swap --unit to render a different building)
UNITS = {
    "gun":     "a futuristic anti-swarm gun turret with a rotating barrel on an octagonal base",
    "core":    "a futuristic round command base bunker with a central dome and a gun on top",
    "cannon":  "a heavy futuristic mortar cannon turret with a thick short barrel on a round base",
    "wall":    "a futuristic armored defensive wall barrier block segment",
    "harvest": "a futuristic resource refinery crate building with a small storage tank",
}

# 4 art directions
STYLES = {
    "1_lowpoly": ("low poly 3D model of {S}, faceted polygonal geometry, flat shading, "
                  "teal blue and grey metal with orange accents, isometric top-down three-quarter view, "
                  "single isolated object, centered, plain light grey studio background, clean mobile game asset, "
                  "soft ambient occlusion, crisp"),
    "2_toon":    ("cute stylized cartoon {S}, bold clean dark outlines, glossy cel shading, "
                  "bright teal and orange, chunky friendly rounded proportions, isometric top-down view, "
                  "single isolated object, centered, plain light background, polished mobile game sprite, vibrant"),
    "3_scifi":   ("sleek high-tech {S}, glowing cyan energy core and coils, polished dark metal, "
                  "sci-fi, isometric top-down three-quarter view, single isolated object, centered, "
                  "plain dark studio background, AAA mobile game render, dramatic cyan rim light"),
    "4_metal":   ("rugged armored {S}, riveted weathered gunmetal plates, military, "
                  "orange hazard stripe markings, isometric top-down three-quarter view, single isolated object, "
                  "centered, plain neutral background, realistic stylized game asset render"),
}


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
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "holdfast_turret"}},
    }


def post(path, payload):
    req = urllib.request.Request(API + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(path):
    return urllib.request.urlopen(API + path, timeout=600).read()


def run(unit, style_key, prompt, seed):
    pid = post("/prompt", {"prompt": workflow(prompt, seed)})["prompt_id"]
    print(f"{unit}/{style_key}: queued {pid} seed={seed}", flush=True)
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(3)
        hist = json.loads(get(f"/history/{pid}"))
        if pid in hist and hist[pid].get("outputs"):
            img = hist[pid]["outputs"]["7"]["images"][0]
            raw = get(f"/view?filename={urllib.parse.quote(img['filename'])}&subfolder={urllib.parse.quote(img.get('subfolder',''))}&type=output")
            from PIL import Image
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            out = os.path.join(RAW, f"{unit}_{style_key}.png")
            im.save(out, "PNG")
            print(f"{unit}/{style_key}: saved {out} ({time.time()-t0:.0f}s)", flush=True)
            return True
    print(f"{unit}/{style_key}: TIMEOUT", flush=True)
    return False


if __name__ == "__main__":
    seed = 12345
    unit = "gun"
    which = "all"
    a = sys.argv[1:]
    for i, x in enumerate(a):
        if x == "--seed": seed = int(a[i + 1])
        elif x == "--unit": unit = a[i + 1]
        elif x == "--styles": which = a[i + 1]
    subj = UNITS[unit]
    keys = list(STYLES) if which == "all" else [k for k in STYLES if k.split("_")[0] in which.split(",")]
    ok = True
    for i, k in enumerate(keys):
        ok &= run(unit, k, STYLES[k].format(S=subj), seed + i * 101)
    sys.exit(0 if ok else 1)
