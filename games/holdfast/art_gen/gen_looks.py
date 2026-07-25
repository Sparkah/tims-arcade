#!/usr/bin/env python3
"""Generate 'how it could look' SCENE references for Holdfast via local ComfyUI (SDXL).
Matrix = SETTINGS (theme/world) x LOOKS (2D flat vs 3D isometric). Full scenes
(central base + turrets + incoming swarm), NOT cut-out sprites, so Tim can pick a
world + rendering direction. Outputs to art_gen/looks/<setting>_<look>.png
"""
import json, time, urllib.request, urllib.parse, sys, io, os

API = "http://127.0.0.1:8188"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "looks")
os.makedirs(OUT, exist_ok=True)

NEG = ("text, words, letters, watermark, logo, signature, ui, hud, interface, "
       "frame, border, blurry, lowres, jpeg artifacts, photo, photograph, "
       "people, human, hands, deformed, oversaturated")

# a tower/base-defense scene: central base ringed by turrets, swarm closing in
TAIL = ("central defensive base ringed by a few defensive turrets, a large swarm of "
        "many small creatures pouring in from every side across the ground toward the "
        "base, a couple of glowing resource crystals, dynamic top-down game scene")

SETTINGS = {
    "1tech":     "futuristic teal-blue metal command base and gun turrets on cracked rust-red martian desert, swarm of small red mechanical beetle drones, orange energy accents",
    "2spore":    "a living bioluminescent hive-pod base and organic spore-launcher turrets on soft alien fungal ground, swarm of small glowing teal spore creatures drifting in, dreamy purple and cyan bio atmosphere",
    "3mushroom": "a cozy giant red-capped mushroom base and toadstool turrets in a lush whimsical glowing mushroom forest, swarm of small cute waddling mushroom critters, vibrant storybook colors",
    "4alien":    "a dark chitinous alien bio-fortress and barbed organic turrets on an eerie fungal alien planet, swarm of small menacing glowing acid-green alien insects, ominous moody atmosphere",
}
LOOKS = {
    "2d": "flat 2D top-down mobile game art, clean bold stylized cartoon vector illustration, flat cel shading, crisp readable shapes, bright",
    "3d": "isometric low-poly 3D render, polished AAA mobile game, three-quarter top-down camera, soft global illumination, faceted stylized geometry, depth and soft shadows",
}


def workflow(p, seed, w=1152, h=896):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": p, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            "seed": seed, "steps": 30, "cfg": 7.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "holdfast_look"}},
    }


def post(path, payload):
    req = urllib.request.Request(API + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(path):
    return urllib.request.urlopen(API + path, timeout=600).read()


def run(name, prompt, seed):
    pid = post("/prompt", {"prompt": workflow(prompt, seed)})["prompt_id"]
    print(f"{name}: queued {pid}", flush=True)
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(3)
        hist = json.loads(get(f"/history/{pid}"))
        if pid in hist and hist[pid].get("outputs"):
            img = hist[pid]["outputs"]["7"]["images"][0]
            raw = get(f"/view?filename={urllib.parse.quote(img['filename'])}&subfolder={urllib.parse.quote(img.get('subfolder',''))}&type=output")
            from PIL import Image
            Image.open(io.BytesIO(raw)).convert("RGB").save(os.path.join(OUT, name + ".png"), "PNG")
            print(f"{name}: saved ({time.time()-t0:.0f}s)", flush=True)
            return True
    print(f"{name}: TIMEOUT", flush=True)
    return False


if __name__ == "__main__":
    seed = 7000
    i = 0
    for sk, sv in SETTINGS.items():
        for lk, lv in LOOKS.items():
            name = sk + "_" + lk
            prompt = f"{sv}, {TAIL}, {lv}, single cohesive scene, high quality game concept art"
            run(name, prompt, seed + i * 137)
            i += 1
    print("LOOKS DONE", flush=True)
