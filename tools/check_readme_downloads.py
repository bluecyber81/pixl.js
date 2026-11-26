"""Keep the first published LCD app, review ZIP and web release identical in both READMEs."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASES = "https://github.com/bluecyber81/pixl.js/releases/"
ROUTES = {
    "LCD app": r"download/[^/]+/Allmiibo_LCD_[^/]+_NUR_APP\.zip",
    "LCD review package": r"download/[^/]+/Allmiibo_LCD_[^/]+_Pruefpaket\.zip",
    "web portable ZIP": r"download/web[0-9]+\.[0-9]+\.[0-9]+/Allmiibo_Dateimanager_[0-9_]+_Portable\.zip",
}


def published_downloads(readme):
    # Local candidate artifacts and untranslated archive links can appear in either README.
    links = re.findall(r"\]\(([^)\s]+)\)", readme.read_text(encoding="utf-8"))
    downloads = {}
    for name, route in ROUTES.items():
        match = next((url for url in links if re.fullmatch(re.escape(RELEASES) + route, url)), None)
        if match is None:
            raise SystemExit(f"{readme.name}: missing published {name}")
        downloads[name] = match
    return downloads


def main():
    en = published_downloads(ROOT / "README.md")
    de = published_downloads(ROOT / "README.de.md")
    expected = json.loads((ROOT / "RELEASE_INFO.json").read_bytes())["web_downloads"]["portable"]
    if en["web portable ZIP"] != expected:
        raise SystemExit("README.md does not link to the current portable download")
    for kind in ROUTES:
        if en[kind] != de[kind]:
            raise SystemExit(f"Published {kind} differs between README.md ({en[kind]}) and README.de.md ({de[kind]})")
    print("German and English published LCD app, review ZIP and web release match.")


if __name__ == "__main__":
    main()
