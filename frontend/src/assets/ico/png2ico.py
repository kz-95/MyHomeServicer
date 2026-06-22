import subprocess
import sys
import shutil
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

IMAGEMAGICK_URL = "https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-44-Q16-HDRI-x64-dll.exe"


def find_magick():
    """Locate magick.exe on the system."""
    path = shutil.which("magick")
    if path:
        return path
    guess = Path("C:/Program Files/ImageMagick-7.1.1-Q16-HDRI/magick.exe")
    if guess.exists():
        return str(guess)
    return None


def install_magick():
    """Download and install ImageMagick silently."""
    print("ImageMagick not found. Downloading installer...")
    installer = Path(os.environ["TEMP"]) / "ImageMagick-installer.exe"

    try:
        import urllib.request
        urllib.request.urlretrieve(IMAGEMAGICK_URL, str(installer))
    except Exception as e:
        print(f"Download failed: {e}")
        print("Install ImageMagick manually: https://imagemagick.org/script/download.php#windows")
        sys.exit(1)

    print("Installing ImageMagick (this may take a minute)...")
    result = subprocess.run(
        [str(installer), "/VERYSILENT", "/SP-", "/NORESTART"],
        capture_output=True,
        text=True,
    )
    installer.unlink(missing_ok=True)

    if result.returncode != 0:
        print("Silent install failed. Trying with admin prompt...")
        subprocess.run(
            [str(installer), "/SILENT"],
            capture_output=True,
            text=True,
        )
        installer.unlink(missing_ok=True)

    magick = find_magick()
    if not magick:
        print("Installation may have succeeded but magick.exe not found on PATH.")
        print("Please restart your terminal or add ImageMagick to PATH manually.")
        sys.exit(1)

    print("ImageMagick installed successfully.")
    return magick


def get_target_size():
    """Ask user for desired icon size."""
    presets = {"1": 16, "2": 32, "3": 48, "4": 64, "5": 128, "6": 256}
    print("\nSelect output icon size:")
    for k, v in presets.items():
        print(f"  {k}. {v}x{v}")
    print("  C. Custom size")

    while True:
        choice = input("Choice (default 2): ").strip() or "2"
        if choice.lower() == "c":
            try:
                size = int(input("Enter custom size (px): ").strip())
                if size < 1 or size > 1024:
                    print("Size must be 1-1024.")
                    continue
                return size
            except ValueError:
                print("Enter a valid number.")
        elif choice in presets:
            return presets[choice]
        else:
            print("Invalid choice.")


def select_files():
    """Let user pick PNG files from the script directory."""
    png_files = sorted(SCRIPT_DIR.glob("*.png"))
    if not png_files:
        print("No PNG files found in this directory.")
        return []

    print("\nPNG files found:")
    for i, png in enumerate(png_files, 1):
        size_kb = png.stat().st_size / 1024
        print(f"  {i}. {png.name} ({size_kb:.1f} KB)")
    print("  A. All files")

    while True:
        choice = input("\nSelect file number(s) (comma-separated, e.g. 1,3) or A for all: ").strip()
        if not choice:
            continue
        if choice.lower() == "a":
            return png_files

        try:
            indices = [int(x.strip()) for x in choice.split(",")]
            selected = []
            for idx in indices:
                if 1 <= idx <= len(png_files):
                    selected.append(png_files[idx - 1])
                else:
                    print(f"  Invalid index: {idx}")
                    break
            else:
                return selected
        except ValueError:
            print("  Invalid input.")


def main():
    magick = find_magick()
    if not magick:
        magick = install_magick()

    selected = select_files()
    if not selected:
        return

    size = get_target_size()
    print(f"\nConverting to {size}x{size} ICO...\n")

    for png in selected:
        ico = png.with_suffix(".ico")
        result = subprocess.run(
            [magick, str(png), "-resize", f"{size}x{size}", str(ico)],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            size_kb = ico.stat().st_size / 1024
            print(f"  OK  {png.name} -> {ico.name} ({size_kb:.1f} KB)")
        else:
            print(f"  FAIL  {png.name}: {result.stderr.strip()}")

    print("\nDone.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled.")
