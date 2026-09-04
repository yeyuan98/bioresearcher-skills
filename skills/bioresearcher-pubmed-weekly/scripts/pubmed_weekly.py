#!/usr/bin/env python3
"""PubMed weekly daily updates downloader and combiner.

Commands (stdlib only except openpyxl, pulled in via parse_updatefiles):

- ``calculate_week``: print the previous week's (Monday-Sunday) range as
  ``YYYYMMDD-YYYYMMDD``.
- ``fetch_files``: list all ``pubmedNNnNNNN.xml.gz`` updatefiles on the NCBI
  FTP server (``ftp://ftp.ncbi.nlm.nih.gov/pubmed/updatefiles/``).
- ``filter_files <week> <file_list>``: keep only files whose FTP modification
  time falls inside the week.
- ``download_file <week> <filename>`: download one file into
  ``.download/pubmed-daily/<week>/`` with retry (3 attempts, 2s delay) and
  resume (``.part`` files; completed files are skipped).
- ``combine <week>``: parse every ``.xml.gz`` in the week directory via the
  bundled ``parse_updatefiles.py`` streaming parser and write
  ``combined.xlsx`` plus ``summary.json`` in that directory.
"""

import argparse
import glob
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from typing import Any, Dict, List

FTP_BASE = "ftp://ftp.ncbi.nlm.nih.gov/pubmed/updatefiles/"

MONTH_MAP = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def calculate_week() -> str:
    """Calculate the past week's date range (Monday-Sunday).

    Returns:
        Week folder name in format 'YYYYMMDD-YYYYMMDD' for the PREVIOUS week
    """
    today = datetime.now()

    # Find the most recent Monday of the current week
    days_since_monday = today.weekday()  # Monday = 0, Sunday = 6
    current_monday = today - timedelta(days=days_since_monday)

    # Go back one week to get the previous week's Monday
    previous_week_monday = current_monday - timedelta(days=7)

    # Calculate the previous week's Sunday (6 days after Monday)
    previous_week_sunday = previous_week_monday + timedelta(days=6)

    week_start = previous_week_monday.strftime("%Y%m%d")
    week_end = previous_week_sunday.strftime("%Y%m%d")

    return f"{week_start}-{week_end}"


def infer_year(month: int, day: int, hour: int, minute: int) -> int:
    """Infer year for MMM DD HH:MM format.

    Uses current year if date is not in the future.
    Uses previous year if inferred date is in the future.

    Args:
        month: Month number (1-12)
        day: Day of month
        hour: Hour (0-23)
        minute: Minute (0-59)

    Returns:
        Inferred year as integer
    """
    now = datetime.now()
    date_this_year = datetime(now.year, month, day, hour, minute)

    if date_this_year > now:
        return now.year - 1
    return now.year


def parse_ftp_listing_to_dict(content: str) -> Dict[str, datetime]:
    """Parse FTP directory listing into {filename: datetime} dict.

    Supports multiple date formats with regex fallback chain:
    1. Unix ls format - MMM DD HH:MM (current year)
    2. Unix ls format - MMM DD  YYYY (older files)
    3. ISO 8601 format - YYYY-MM-DD HH:MM
    4. European format - DD-MMM-YYYY HH:MM

    Args:
        content: Raw FTP directory listing content

    Returns:
        Dictionary mapping filename to datetime object
    """
    file_dates = {}

    for line in content.split("\n"):
        line = line.strip()
        if not line or line.startswith("total"):
            continue

        filename = None
        file_date = None

        match = re.match(
            r"^\S+\s+\d+\s+\S+\s+\S+\s+\d+\s+(\w{3})\s+(\d{1,2})\s+(\d{2}:\d{2})\s+(.+)$",
            line,
        )
        if match:
            month_str, day_str, time_str, fn = match.groups()
            month = MONTH_MAP.get(month_str)
            if month:
                day = int(day_str)
                hour, minute = map(int, time_str.split(":"))
                year = infer_year(month, day, hour, minute)
                filename = fn
                file_date = datetime(year, month, day, hour, minute)

        if not file_date:
            match = re.match(
                r"^\S+\s+\d+\s+\S+\s+\S+\s+\d+\s+(\w{3})\s+(\d{1,2})\s+(\d{4})\s+(.+)$",
                line,
            )
            if match:
                month_str, day_str, year_str, fn = match.groups()
                month = MONTH_MAP.get(month_str)
                if month:
                    year = int(year_str)
                    day = int(day_str)
                    filename = fn
                    file_date = datetime(year, month, day)

        if not file_date:
            match = re.match(r"^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$", line)
            if match:
                date_str, time_str, fn = match.groups()
                datetime_str = f"{date_str} {time_str}"
                try:
                    file_date = datetime.strptime(datetime_str, "%Y-%m-%d %H:%M")
                    filename = fn
                except ValueError:
                    pass

        if not file_date:
            match = re.match(
                r"^(\d{1,2})-(\w{3})-(\d{4})\s+(\d{2}:\d{2})\s+(.+)$", line
            )
            if match:
                day_str, month_str, year_str, time_str, fn = match.groups()
                month = MONTH_MAP.get(month_str)
                if month:
                    day = int(day_str)
                    year = int(year_str)
                    hour, minute = map(int, time_str.split(":"))
                    try:
                        file_date = datetime(year, month, day, hour, minute)
                        filename = fn
                    except ValueError:
                        pass

        if filename and file_date and filename not in file_dates:
            file_dates[filename] = file_date

    return file_dates


def fetch_ftp_file_list() -> List[str]:
    """Fetch list of xml.gz files from NCBI FTP server.

    Returns:
        List of xml.gz filenames from the FTP server
    """
    url = FTP_BASE

    try:
        with urllib.request.urlopen(url) as response:
            html_content = response.read().decode("utf-8")

        # Parse HTML to extract filenames
        # FTP directory listing returns HTML with links
        filenames = []
        for line in html_content.split("\n"):
            match = re.search(r"pubmed\d+n\d+\.xml\.gz", line)
            if match:
                filename = match.group(0)
                if filename not in filenames:
                    filenames.append(filename)

        return sorted(filenames)

    except Exception as e:
        print(f"Error fetching FTP file list: {e}", file=sys.stderr)
        sys.exit(1)


def filter_files_by_date(week_name: str, file_list: List[str]) -> List[str]:
    """Filter files to include only those from the past week.

    PubMed updatefile names do not encode a date, so the FTP directory
    listing (with modification timestamps) is fetched and filtered by mtime.

    Args:
        week_name: Week folder name (YYYYMMDD-YYYYMMDD)
        file_list: List of all xml.gz filenames

    Returns:
        List of filenames that fall within the date range
    """
    # Parse week dates
    start_date_str, end_date_str = week_name.split("-")
    start_date = datetime.strptime(start_date_str, "%Y%m%d")
    end_date = datetime.strptime(end_date_str, "%Y%m%d").replace(
        hour=23, minute=59, second=59
    )

    # Fetch directory listing with timestamps
    url = FTP_BASE

    try:
        with urllib.request.urlopen(url) as response:
            content = response.read().decode("utf-8", errors="ignore")

        file_dates = parse_ftp_listing_to_dict(content)

        # Filter files within date range AND in provided file_list
        filtered_files = [
            f
            for f in file_list
            if f in file_dates and start_date <= file_dates[f] <= end_date
        ]

        return sorted(filtered_files)

    except Exception as e:
        print(f"Error filtering files by date: {e}", file=sys.stderr)
        sys.exit(1)


def _download_with_resume(url: str, part_path: str) -> None:
    """Stream ``url`` into ``part_path``, resuming an existing partial file.

    Skips as many bytes over the remote stream as already present locally,
    then appends the remainder. If the remote stream is not longer than the
    partial file, restarts from scratch.
    """
    existing = os.path.getsize(part_path) if os.path.exists(part_path) else 0

    with urllib.request.urlopen(url) as response:
        to_skip = existing
        exhausted = False
        while to_skip > 0:
            chunk = response.read(min(65536, to_skip))
            if not chunk:
                exhausted = True
                break
            to_skip -= len(chunk)

        mode = "wb" if exhausted else "ab"
        with open(part_path, mode) as out:
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                out.write(chunk)

    if os.path.getsize(part_path) == 0:
        raise Exception("Downloaded file is empty")


def download_file(week_name: str, filename: str, max_retries: int = 3) -> int:
    """Download a single file from NCBI FTP server with retry and resume.

    Completed files (existing, non-empty) are skipped so re-running the
    workflow resumes where it left off. In-progress downloads use a
    ``.part`` file renamed into place on success.

    Args:
        week_name: Week folder name
        filename: XML.gz filename to download
        max_retries: Maximum number of retry attempts

    Returns:
        0 on success, 1 on failure (after all retries)
    """
    url = f"{FTP_BASE}{filename}"

    # Create download directory in current working directory
    base_dir = os.getcwd()
    download_dir = os.path.join(base_dir, ".download", "pubmed-daily", week_name)
    os.makedirs(download_dir, exist_ok=True)

    filepath = os.path.join(download_dir, filename)
    part_path = filepath + ".part"

    if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
        print(f"Already downloaded: {filename} (skipped)")
        return 0

    for attempt in range(max_retries):
        try:
            print(f"Downloading {filename} (attempt {attempt + 1}/{max_retries})...")

            _download_with_resume(url, part_path)

            os.replace(part_path, filepath)
            print(f"Successfully downloaded {filename}")
            return 0

        except Exception as e:
            print(f"Error downloading {filename}: {e}", file=sys.stderr)

            if attempt < max_retries - 1:
                print("Retrying in 2 seconds...")
                time.sleep(2)
            else:
                print(f"Failed to download {filename} after {max_retries} attempts")
                return 1

    return 1


def _run_parser(
    file_paths: List[str], output: str, summary_json: str
) -> Dict[str, Any]:
    """Parse xml.gz files via the bundled parse_updatefiles module.

    Imports ``parse_files`` from the sibling script when possible and falls
    back to running it as a subprocess with the current interpreter.
    """
    if SCRIPT_DIR not in sys.path:
        sys.path.insert(0, SCRIPT_DIR)
    try:
        from parse_updatefiles import parse_files
    except ImportError:
        import subprocess

        command = [
            sys.executable,
            os.path.join(SCRIPT_DIR, "parse_updatefiles.py"),
            *file_paths,
            "-o",
            output,
            "--summary-json",
            summary_json,
        ]
        subprocess.run(command, check=True)
        with open(summary_json, "r", encoding="utf-8") as handle:
            return json.load(handle)

    return parse_files(file_paths, output, summary_json)


def combine(week_name: str) -> Dict[str, Any]:
    """Parse and combine all xml.gz files in the week folder.

    Delegates parsing/combination to ``parse_updatefiles.py`` (streaming,
    memory-bounded) and writes ``combined.xlsx`` plus ``summary.json`` into
    the week directory.

    Args:
        week_name: Week folder name (e.g., '20250217-20250223')

    Returns:
        Dict with success, article_count, deleted_pmid_count, source_files,
        output_file, summary_json
    """
    week_dir = os.path.join(os.getcwd(), ".download", "pubmed-daily", week_name)

    if not os.path.isdir(week_dir):
        return {
            "success": False,
            "error": f"Directory not found: {week_dir}",
            "article_count": 0,
            "source_files": [],
            "output_file": None,
        }

    xml_files = sorted(glob.glob(os.path.join(week_dir, "*.xml.gz")))

    if not xml_files:
        return {
            "success": False,
            "error": "No .xml.gz updatefiles found to combine",
            "article_count": 0,
            "source_files": [],
            "output_file": None,
        }

    output_path = os.path.join(week_dir, "combined.xlsx")
    summary_path = os.path.join(week_dir, "summary.json")

    try:
        parser_summary = _run_parser(xml_files, output_path, summary_path)
    except Exception as e:  # noqa: BLE001 - report failure as JSON
        return {
            "success": False,
            "error": f"Parsing failed: {e}",
            "article_count": 0,
            "source_files": [os.path.basename(f) for f in xml_files],
            "output_file": None,
        }

    return {
        "success": True,
        "article_count": parser_summary.get("article_count", 0),
        "deleted_pmid_count": len(parser_summary.get("deleted_pmids", [])),
        "source_files": [os.path.basename(f) for f in xml_files],
        "output_file": os.path.basename(output_path),
        "summary_json": os.path.basename(summary_path),
    }


def main():
    """Main entry point for command-line usage."""
    parser = argparse.ArgumentParser(
        description="PubMed Weekly Daily Updates Downloader and Combiner"
    )
    parser.add_argument("command", type=str, help="Command to execute")
    parser.add_argument("args", nargs="*", help="Command arguments")

    parsed = parser.parse_args()

    command = parsed.command
    args = parsed.args

    if command == "calculate_week":
        week = calculate_week()
        print(week)

    elif command == "fetch_files":
        files = fetch_ftp_file_list()
        print(" ".join(files))

    elif command == "filter_files":
        if len(args) < 2:
            print(
                "Usage: python pubmed_weekly.py filter_files <week_name> <file_list>"
            )
            sys.exit(1)

        week_name = args[0]
        file_list = args[1].split()
        filtered = filter_files_by_date(week_name, file_list)
        print(" ".join(filtered))

    elif command == "download_file":
        if len(args) < 2:
            print(
                "Usage: python pubmed_weekly.py download_file <week_name> <filename>"
            )
            sys.exit(1)

        week_name = args[0]
        filename = args[1]
        sys.exit(download_file(week_name, filename))

    elif command == "combine":
        if len(args) < 1:
            print("Usage: python pubmed_weekly.py combine <week_name>")
            sys.exit(1)

        week_name = args[0]
        result = combine(week_name)
        print(json.dumps(result, indent=2))

        if not result.get("success"):
            sys.exit(1)

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
