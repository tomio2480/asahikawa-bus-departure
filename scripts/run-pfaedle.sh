#!/bin/bash
set -euo pipefail

OSM_FILE="${1:-data/osm/hokkaido-latest.osm.pbf}"
GTFS_BASE="${2:-data/gtfs}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

OPERATORS=("asahikawa_denkikido" "dohoku_bus" "furano_bus")

# --- OSM ファイル取得 ---
if [ ! -f "$OSM_FILE" ]; then
  echo "OSM file not found: ${OSM_FILE}"
  echo "Downloading hokkaido-latest.osm.pbf from Geofabrik..."
  mkdir -p "$(dirname "$OSM_FILE")"
  curl -fSL \
    --retry 3 --retry-delay 5 \
    --connect-timeout 30 --max-time 600 \
    -o "${OSM_FILE}.tmp" \
    "https://download.geofabrik.de/asia/japan/hokkaido-latest.osm.pbf"
  mv "${OSM_FILE}.tmp" "$OSM_FILE"
  echo "Download complete."
fi

# --- 前提条件チェック ---
if ! command -v pfaedle &> /dev/null; then
  echo "Error: pfaedle is not installed"
  echo "See https://github.com/ad-freiburg/pfaedle for installation instructions"
  exit 1
fi

# --- 各事業者の shapes.txt 生成 ---
has_error=false
processed=0

for operator in "${OPERATORS[@]}"; do
  gtfs_dir="${GTFS_BASE}/${operator}"

  if [ ! -d "$gtfs_dir" ]; then
    echo "Warning: Skipping ${operator}: directory ${gtfs_dir} not found"
    continue
  fi

  echo "Generating shapes for ${operator}..."
  if ! pfaedle -D -x --osm-file "$OSM_FILE" "$gtfs_dir"; then
    echo "Error: pfaedle failed for ${operator}"
    has_error=true
    continue
  fi

  shapes_file="${gtfs_dir}/shapes.txt"
  if [ ! -f "$shapes_file" ]; then
    echo "Error: shapes.txt was not generated for ${operator}"
    has_error=true
    continue
  fi

  # shapes.txt の GTFS 形式バリデーション
  echo "Validating shapes.txt for ${operator}..."
  if npx tsx "${SCRIPT_DIR}/validate-shapes.ts" "$shapes_file"; then
    line_count=$(wc -l < "$shapes_file")
    echo "  OK: ${line_count} lines in shapes.txt"
    processed=$((processed + 1))
  else
    echo "Error: shapes.txt validation failed for ${operator}"
    has_error=true
  fi
done

echo ""
echo "Processed: ${processed}/${#OPERATORS[@]} operators"

if [ "$has_error" = true ]; then
  echo "Some operators had errors."
  exit 1
fi

echo "Done."
