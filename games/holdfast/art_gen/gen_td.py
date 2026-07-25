#!/usr/bin/env python3
"""Top-down ROTATING turret sprites for Holdfast (barrel points up) via SDXL.
The shooters (core, gun, cannon) need a top-down view so the whole sprite can be
rotated toward the aim angle (bloodtread-style). Outputs cut/<unit>_td.png
"""
import json, time, urllib.request, urllib.parse, os, io

API = "http://127.0.0.1:8188"
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw"); CUT = os.path.join(HERE, "cut")
os.makedirs(RAW, exist_ok=True); os.makedirs(CUT, exist_ok=True)

NEG = ("side view, profile, three-quarter view, perspective, isometric, tilted, angled, "
       "multiple, group, text, words, watermark, logo, scene, landscape, background details, "
       "ground, cast shadow, people, blurry, lowres, jpeg artifacts, deformed")

UNITS = {
    "core":   "a futuristic round command base bunker with a central rotating gun turret pointing straight up, dark navy alloy hull, glowing cyan energy ring around the rim",
    "gun":    "a futuristic defense gun turret with twin barrels pointing straight up, dark alloy body on a hexagonal base, glowing cyan energy accents",
    "cannon": "a heavy futuristic mortar cannon with one thick short barrel pointing straight up, dark armored alloy on a round base, glowing cyan accents",
}
TMPL = ("top-down view of {S}, seen from directly straight above looking down, barrel pointing up, "
        "single isolated object, centered, plain flat dark grey background, polished neon sci-fi mobile "
        "game sprite, crisp, soft top lighting")


def workflow(p, seed, w=1024, h=1024):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": p, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            "seed": seed, "steps": 30, "cfg": 7.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "holdfast_td"}},
    }


def post(p, payload):
    req = urllib.request.Request(API + p, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return urllib.request.urlopen(API + p, timeout=600).read()


def run(tk, prompt, seed):
    pid = post("/prompt", {"prompt": workflow(prompt, seed)})["prompt_id"]
    print(f"td/{tk}: queued", flush=True)
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(3)
        hist = json.loads(get(f"/history/{pid}"))
        if pid in hist and hist[pid].get("outputs"):
            img = hist[pid]["outputs"]["7"]["images"][0]
            raw = get(f"/view?filename={urllib.parse.quote(img['filename'])}&subfolder={urllib.parse.quote(img.get('subfolder',''))}&type=output")
            from PIL import Image
            Image.open(io.BytesIO(raw)).convert("RGB").save(os.path.join(RAW, f"{tk}_td.png"), "PNG")
            print(f"td/{tk}: saved ({time.time()-t0:.0f}s)", flush=True)
            return True
    print(f"td/{tk}: TIMEOUT", flush=True); return False


if __name__ == "__main__":
    seed = 5300
    for i, (tk, sv) in enumerate(UNITS.items()):
        run(tk, TMPL.format(S=sv), seed + i * 137)
    from rembg import remove
    from PIL import Image
    for tk in UNITS:
        out = remove(Image.open(os.path.join(RAW, f"{tk}_td.png")).convert("RGBA"))
        bb = out.getbbox()
        if bb: out = out.crop(bb)
        out.save(os.path.join(CUT, f"{tk}_td.png"))
        print(f"cut {tk}_td: {out.size}", flush=True)
    print("TD DONE", flush=True)
