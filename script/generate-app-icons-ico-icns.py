#!/usr/bin/env python3
"""Converts the PNG icons produced by generate-app-icons.mjs into the
Windows .ico files and macOS Document.icns consumed by crates/zed/resources.
Not part of the normal build - run manually after generate-app-icons.mjs.
Requires Pillow (`pip install pillow`).
"""
import os

from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESOURCES_DIR = os.path.join(REPO_ROOT, "crates", "zed", "resources")
WINDOWS_DIR = os.path.join(RESOURCES_DIR, "windows")

CHANNEL_SUFFIXES = ["", "-dev", "-nightly", "-preview"]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]


def main():
    os.makedirs(WINDOWS_DIR, exist_ok=True)

    for suffix in CHANNEL_SUFFIXES:
        src_path = os.path.join(RESOURCES_DIR, f"app-icon{suffix}@2x.png")
        img = Image.open(src_path).convert("RGBA")
        ico_path = os.path.join(WINDOWS_DIR, f"app-icon{suffix}.ico")
        img.save(ico_path, format="ICO", sizes=[(s, s) for s in ICO_SIZES])
        print(f"wrote windows/app-icon{suffix}.ico")

    stable_src = os.path.join(RESOURCES_DIR, "app-icon@2x.png")
    stable_img = Image.open(stable_src).convert("RGBA")
    icns_path = os.path.join(RESOURCES_DIR, "Document.icns")
    stable_img.save(icns_path, format="ICNS", sizes=[(s, s) for s in ICNS_SIZES])
    print("wrote Document.icns")


if __name__ == "__main__":
    main()
