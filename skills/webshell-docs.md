---
name: WebShell Document Studio
description: Use when the webshell MCP server is connected and the task is creating, editing, or converting documents in its sandbox — Markdown, PDF, LaTeX, HTML, DOCX/ODT, CSV/spreadsheets. Covers authoring with the file tools, converting with pandoc/LaTeX/LibreOffice, researching source material via the web stack, and handing the finished file back.
---

You are using the **webshell** MCP server's sandbox as a document workshop. It's
a persistent Debian box; you author and transform files there through
`read_file`/`write_file`/`list_directory`, run converters via `execute_command`,
pull in source material with `web_search`/`fetch_url`, and deliver the result
with `download_file` (back to the local machine) or `fetch_file` (a local HTTP
URL on port 9712). Aim for a clean, reproducible pipeline: source text in →
defined transform → finished artifact out.

Cardinal constraint still applies: **each `execute_command` is its own shell.**
Keep a working dir and reuse it explicitly (`cd "$DOC" && pandoc …`).

## Author in plain text, generate the rest
- Treat **Markdown (or LaTeX) as the source of truth** and the PDF/DOCX/HTML as
  build outputs. Plain-text sources diff cleanly, edit precisely, and convert to
  anything. Write them with `write_file`; for targeted edits use `read_file`
  then `write_file`, or `sed -i.bak` for a small substitution.
- Keep structure semantic — real headings (`#`/`##`), lists, tables, fenced code
  — so converters can style it. Don't hand-format spacing that a template
  should own.
- For data-heavy docs, keep tabular data as **CSV** and render it into the
  document at build time, rather than hand-maintaining a Markdown table.

## Know your converters (probe first)
```bash
command -v pandoc libreoffice soffice wkhtmltopdf pdflatex xelatex weasyprint qpdf 2>/dev/null
```
Don't assume any of these exist — the sandbox may ship a minimal toolchain.
Probe, then pick from what's actually installed; if a converter is missing,
`apt-get`-install it only when the user wants persistent setup, otherwise route
around it with what's present (LibreOffice headless is the most commonly
available heavyweight converter and a dependable fallback).
- **pandoc** is the workhorse — Markdown ↔ HTML ↔ DOCX ↔ ODT, and Markdown → PDF
  (via a LaTeX engine). It's the first thing to reach for.
- **A LaTeX engine** (`xelatex`/`pdflatex`/`tectonic`) is what pandoc uses for
  PDF; `xelatex` handles Unicode/custom fonts best. No LaTeX? fall back to
  `weasyprint` (HTML/CSS → PDF) or `wkhtmltopdf`.
- **LibreOffice headless** converts to/from real Office formats and is the
  reliable path for `.docx`/`.pptx`/`.xlsx` fidelity:
  `soffice --headless --convert-to pdf --outdir out file.docx`.

## Common conversions
```bash
# Markdown → PDF (styled, Unicode-safe)
pandoc doc.md -o doc.pdf --pdf-engine=xelatex -V geometry:margin=1in

# Markdown → DOCX, reusing a house style template
pandoc doc.md -o doc.docx --reference-doc=template.docx

# Markdown → standalone HTML with a table of contents
pandoc doc.md -s --toc -o doc.html

# DOCX → Markdown (to ingest/edit an existing doc), pulling out embedded images
pandoc in.docx -t gfm --extract-media=media -o in.md

# HTML/CSS → PDF when there's no LaTeX
weasyprint doc.html doc.pdf

# Any Office format → PDF with LibreOffice
soffice --headless --convert-to pdf --outdir out report.docx
```
- After producing a PDF, sanity-check it: `pdfinfo doc.pdf` (pages/metadata),
  `pdftotext doc.pdf - | head` (did the text actually render?). Don't claim a
  document is done you haven't verified opened/rendered.

## Spreadsheets & tabular data
- Inspect quickly without a GUI: `column -t -s, file.csv | head`,
  `csvlook file.csv` (if `csvkit` is present), or `python3 -c 'import csv,sys; …'`.
- Convert: `soffice --headless --convert-to csv file.xlsx`, and back with
  pandas/openpyxl in `python3` when you need formulas or multiple sheets.
- For generated tables in a report, transform CSV → Markdown table in `python3`
  (or `csvkit`'s `csvjson`/templating) and splice it into the source.

## Diagrams, charts & images
- **Text → diagram** (version-controllable, regenerable): Mermaid
  (`mmdc -i d.mmd -o d.svg`), Graphviz (`dot -Tpng g.dot -o g.png`), or PlantUML.
  Render to SVG/PNG and embed in the source. Probe for the tool first.
- **Charts from data**: `python3` + matplotlib → PNG/SVG, then reference the
  image from the Markdown/LaTeX. Keep the generating script next to the doc so
  the figure can be rebuilt.
- **Image wrangling**: ImageMagick (`magick`/`convert`) to resize, convert
  format, or compose before embedding; `pdfimages` to extract from a PDF.

## Presentations & ebooks
- **Slides**: `pandoc -t pptx doc.md -o slides.pptx`, or Markdown → reveal.js
  (`pandoc -t revealjs -s -o slides.html`), or Marp (`marp deck.md -o deck.pdf`)
  if present. Slide breaks follow heading level / `---`.
- **EPUB**: `pandoc doc.md -o book.epub --toc --epub-cover-image=cover.png`.

## Manipulating existing PDFs
- Merge / split / rotate / stamp with `qpdf` or `pdftk`
  (`qpdf --empty --pages a.pdf b.pdf -- out.pdf` to concat).
- Compress a bloated PDF with Ghostscript:
  `gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -o small.pdf big.pdf`.
- Extract: `pdftotext` (text), `pdfimages` (images), `pdfinfo` (metadata/pages).
  Probe for whichever of these is installed.

## Research and assemble source material
- Pull facts and quotes with `web_search`/`news_search`, then `fetch_url` the
  page as `markdown` to capture clean, citable text — far better than
  copy-pasting rendered HTML.
- Keep a sources list as you go and cite inline; never invent a figure, date, or
  attribution. If a claim isn't in the fetched material, mark it as needing a
  source rather than filling it in.
- Bring in a local file to edit or convert with `upload_file`; that becomes your
  editable source in the sandbox.

## Deliver the artifact
- Hand the finished file back with **`download_file`** (default), or expose it
  via **`fetch_file`** (HTTP on 9712) when something needs a URL to fetch it.
- Name outputs predictably and keep source + build artifact side by side so the
  document can be regenerated. Mention where the file is and how it was built.

## How to respond
- State the pipeline you used (source format → tool/command → output) so the
  result is reproducible, not a black box.
- Verify before declaring done: page count, that text rendered, that the
  conversion didn't silently drop a section — and say you checked.
- Preserve every fact, name, and figure the user gave; flag anything you
  couldn't source rather than inventing it.
- Offer the obvious next format (e.g. "also want this as DOCX/HTML?") when it's
  cheap to produce from the same source.
