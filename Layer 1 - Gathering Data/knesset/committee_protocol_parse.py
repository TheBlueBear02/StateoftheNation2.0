"""
Self-parse Knesset committee protocol DOC/DOCX files into speaker parts.

Used when Hasadna's joined dump has no text/parts for a session, but a
protocol FilePath exists on fs.knesset.gov.il (via OData / dataservice docs).

Speaker splitting mirrors hasadna/knesset-data-python CommitteeMeetingProtocol
(header/body shape expected by load_knesset_committees.replace_transcript_parts).

Requires the `antiword` binary for legacy .doc files (apt install antiword).
.docx uses stdlib zip + XML text extraction.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests

log = logging.getLogger(__name__)

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
}

_NOT_HEADER_RE = re.compile(
    r"(^אני )|"
    r"((אלה|אלו|יבוא|מאלה|ייאמר|אומר|אומרת|נאמר|כך|הבאים|הבאות):$)|"
    r"(\(.\))|(\(\d+\))|(\d\.)",
    re.UNICODE,
)

class ProtocolParseError(RuntimeError):
    """Raised when a protocol file cannot be downloaded or converted."""


def download_protocol_bytes(url: str, *, timeout: int = 120) -> bytes:
    resp = requests.get(url, headers=HTTP_HEADERS, timeout=timeout)
    resp.raise_for_status()
    if not resp.content:
        raise ProtocolParseError(f"empty response from {url}")
    return resp.content


def _filename_from_url(url: str) -> str:
    path = unquote(urlparse(url).path or "")
    name = Path(path).name
    return name or "protocol.doc"


def _looks_like_docx(data: bytes, filename: str) -> bool:
    lower = filename.lower()
    if lower.endswith(".docx"):
        return True
    return data[:2] == b"PK"


def docx_bytes_to_text(data: bytes) -> str:
    """Extract plain text from a .docx (OOXML) archive."""
    try:
        with zipfile.ZipFile(BytesIO(data)) as zf:
            xml_bytes = zf.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile) as exc:
        raise ProtocolParseError(f"invalid docx archive: {exc}") from exc

    root = ET.fromstring(xml_bytes)
    paragraphs: list[str] = []
    for para in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
        texts = [
            node.text or ""
            for node in para.iter(
                "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"
            )
        ]
        line = "".join(texts).strip()
        if line:
            paragraphs.append(line)
    text = "\n".join(paragraphs).strip()
    if not text:
        raise ProtocolParseError("docx produced empty text")
    return text


def antiword_bytes_to_text(data: bytes, *, suffix: str = ".doc") -> str:
    """Convert a legacy .doc blob to text via the antiword CLI."""
    antiword = shutil.which("antiword")
    if not antiword:
        raise ProtocolParseError(
            "antiword is not installed (required to parse .doc protocols)"
        )

    fd, path = tempfile.mkstemp(suffix=suffix, prefix="knesset_protocol_")
    os.close(fd)
    try:
        Path(path).write_bytes(data)
        # -t = text; -w 0 = no line wrap
        result = subprocess.run(
            [antiword, "-t", "-w", "0", path],
            check=False,
            capture_output=True,
        )
        if result.returncode != 0:
            err = (result.stderr or b"").decode("utf-8", errors="replace").strip()
            raise ProtocolParseError(
                f"antiword failed (exit {result.returncode}): {err or 'unknown error'}"
            )
        # antiword often emits Latin-1 / cp1255 for Hebrew Knesset docs.
        raw = result.stdout
        for encoding in ("utf-8", "cp1255", "windows-1255", "latin-1"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            text = raw.decode("utf-8", errors="replace")

        # Same OMNITECH strip as Hasadna's CommitteeMeetingProtocol.text
        parts = text.split("OMNITECH")
        if len(parts) == 2 and len(parts[0]) < 40:
            text = parts[1]
        text = text.strip()
        if not text:
            raise ProtocolParseError("antiword produced empty text")
        return text
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def doc_bytes_to_text(data: bytes, filename: str) -> str:
    """Convert DOC/DOCX bytes to plain UTF-8 text."""
    name = filename or "protocol.doc"
    if _looks_like_docx(data, name):
        return docx_bytes_to_text(data)
    return antiword_bytes_to_text(data, suffix=Path(name).suffix or ".doc")


def _is_not_header(line: str) -> bool:
    return bool(_NOT_HEADER_RE.search(line))


def _parse_header(line: str):
    """Return header str, (header, rest) tuple, or False — Hasadna-compatible."""
    line = line.strip(">").strip("<")
    if re.match(r"^<.*>\W*$", line):
        line = re.sub("[>:]+$", "", re.sub("^[< ]+", "", line)).strip()
        if _is_not_header(line):
            return line
    splitline = line.split(":")
    if (
        len(splitline) > 1
        and 4 < len(splitline[0]) <= 35
        and len(splitline[0].split(" ")) < 6
        and not _is_not_header(splitline[0])
        and not re.search(r"\d+", splitline[0])
    ):
        return splitline[0].strip(), ":".join(splitline[1:]).strip()
    if len(line) <= 50 and line.strip().endswith(":"):
        if not _is_not_header(line):
            return line.strip()[:-1].strip()
    return False


def _section_text(section_lines: list[str]) -> str:
    section_text = "\n".join(section_lines).strip()
    section_text = section_text.replace("\n\n–\n\n", " - ")
    section_text = section_text.replace("\n\t–\n\t", " - ")
    section_text = section_text.replace("\n\n\t", "\n\n")
    return section_text


def split_protocol_parts(text: str) -> list[dict]:
    """
    Split full protocol text into [{"header": ..., "body": ...}, ...].
    Port of hasadna CommitteeMeetingProtocol.parts.
    """
    if not (text or "").strip():
        return []

    protocol_lines: list[str] = []
    for line in re.sub("[ ]+", " ", text).split("\n"):
        if line.startswith(":") and protocol_lines:
            protocol_lines[-1] += ":"
            protocol_lines.append(line[1:])
        else:
            protocol_lines.append(line)

    parts: list[dict] = []
    i = 1
    section: list[str] = []
    header = ""

    def add_part(_header: str, _section: list[str]) -> None:
        clean = _header.strip().strip("<>")
        parts.append({"header": clean, "body": _section_text(_section)})

    for line in protocol_lines:
        line = re.sub(r"(<<\W[^>]*\W>>)", "", line)
        parsed = _parse_header(line)
        if parsed:
            if isinstance(parsed, tuple):
                line = parsed[1]
                parsed = parsed[0]
            else:
                line = None
            if i > 1 or section:
                add_part(header, section)
                i += 1
            header = parsed
            section = []
            if line is not None:
                section.append(line)
        else:
            section.append(line)

    add_part(header, section)

    # Merge empty-body parts into the next body (Hasadna behavior).
    merged: list[dict] = []
    last: dict | None = None
    for part in parts:
        if last is not None and not str(last.get("body") or "").strip():
            last["body"] = f"{part['header']}: {part['body']}"
            last = part
            continue
        merged.append(part)
        last = part

    return merged


def parse_protocol_url(url: str, *, timeout: int = 120) -> tuple[str, list[dict]]:
    """
    Download a protocol DOC/DOCX URL and return (full_text, parts).
    Parts use header/body keys for replace_transcript_parts.
    """
    filename = _filename_from_url(url)
    data = download_protocol_bytes(url, timeout=timeout)
    full_text = doc_bytes_to_text(data, filename)
    parts = split_protocol_parts(full_text)
    if not parts:
        raise ProtocolParseError("no speaker parts extracted from protocol text")
    return full_text, parts
