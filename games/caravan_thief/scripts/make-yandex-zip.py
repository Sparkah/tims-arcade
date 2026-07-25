import os
import zipfile

dist_dir = "dist"
output_zip = "yandex-game.zip"

with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, _dirs, files in os.walk(dist_dir):
        for file in files:
            abs_path = os.path.join(root, file)
            rel_path = os.path.relpath(abs_path, dist_dir).replace(os.sep, "/")
            zf.write(abs_path, rel_path)

print(f"Created {output_zip}")
