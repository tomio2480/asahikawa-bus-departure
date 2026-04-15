#!/bin/bash
set -euo pipefail

OSM_FILE="${1:-data/osm/hokkaido-latest.osm.pbf}"
GTFS_BASE="${2:-data/gtfs}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

OPERATORS=("asahikawa_denkikido" "dohoku_bus" "furano_bus")
PFAEDLE_IMAGE="ghcr.io/ad-freiburg/pfaedle:latest"

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

# --- pfaedle 実行方法の決定 ---
USE_DOCKER=false
if command -v pfaedle &> /dev/null; then
  echo "Using native pfaedle"
elif command -v docker &> /dev/null; then
  echo "pfaedle not found, using Docker image: ${PFAEDLE_IMAGE}"
  USE_DOCKER=true
else
  echo "Error: neither pfaedle nor docker is installed"
  echo "Install pfaedle (https://github.com/ad-freiburg/pfaedle) or Docker"
  exit 1
fi

# pfaedle を実行するラッパー関数
# 引数: 1: OSMファイルパス, 2: GTFSディレクトリパス
run_pfaedle() {
  local osm_file="$1"
  local gtfs_dir="$2"
  if [ "$USE_DOCKER" = true ]; then
    docker run --rm \
      --user "$(id -u):$(id -g)" \
      --workdir /gtfs \
      -v "$(realpath "$osm_file"):/osm/input.osm.pbf:ro" \
      -v "$(realpath "$gtfs_dir"):/gtfs" \
      "$PFAEDLE_IMAGE" \
      -x /osm/input.osm.pbf -o /gtfs /gtfs
  else
    pfaedle -x "$osm_file" -o "$gtfs_dir" "$gtfs_dir"
  fi
}

# --- 各事業者の shapes.txt 生成 ---
has_error=false
processed=0

for operator in "${OPERATORS[@]}"; do
  gtfs_dir="${GTFS_BASE}/${operator}"

  if [ ! -d "$gtfs_dir" ]; then
    echo "Error: required directory not found: ${gtfs_dir}"
    has_error=true
    continue
  fi

  echo "Generating shapes for ${operator}..."

  # pfaedle は -o で出力時に GTFS 全ファイルを上書きするため、
  # pfaedle が生成しないファイルを退避して復元する
  PRESERVE_FILES=(fare_attributes.txt fare_rules.txt feed_info.txt translations.txt)
  backup_dir=$(mktemp -d)
  for f in "${PRESERVE_FILES[@]}"; do
    if [ -f "${gtfs_dir}/${f}" ]; then
      cp "${gtfs_dir}/${f}" "${backup_dir}/${f}"
    fi
  done

  pfaedle_ok=true
  if ! run_pfaedle "$OSM_FILE" "$gtfs_dir"; then
    echo "Error: pfaedle failed for ${operator}"
    pfaedle_ok=false
    has_error=true
  fi

  # 成功・失敗に関わらず退避したファイルを復元
  for f in "${PRESERVE_FILES[@]}"; do
    if [ -f "${backup_dir}/${f}" ]; then
      cp "${backup_dir}/${f}" "${gtfs_dir}/${f}"
    fi
  done
  rm -rf "$backup_dir"

  if [ "$pfaedle_ok" = false ]; then
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
