#!/bin/bash
set -euo pipefail

# 各事業者の calendar.txt の start_date 集合を比較し、
# 期間が変わった事業者があるかを判定する。
#
# 引数: 1: 最新 GTFS ディレクトリ, 2: 前回 GTFS ディレクトリ
# 出力: changed=true/false を $GITHUB_OUTPUT に書き出し

CURRENT_DIR="${1:?Usage: compare-calendar.sh <current-dir> <prev-dir>}"
PREV_DIR="${2:?Usage: compare-calendar.sh <current-dir> <prev-dir>}"

OPERATORS=("asahikawa_denkikido" "dohoku_bus" "furano_bus")

changed=false

for op in "${OPERATORS[@]}"; do
  current_cal="${CURRENT_DIR}/${op}/calendar.txt"
  prev_cal="${PREV_DIR}/${op}/calendar.txt"

  if [ ! -f "$current_cal" ]; then
    echo "Warning: ${current_cal} not found, skipping ${op}"
    continue
  fi

  if [ ! -f "$prev_cal" ]; then
    echo "No previous data for ${op}, marking as changed"
    changed=true
    continue
  fi

  # start_date 列を抽出してソート比較
  current_dates=$(awk -F',' 'NR==1 { for(i=1;i<=NF;i++) if($i=="start_date") col=i } NR>1 && col { print $col }' "$current_cal" | sort -u)
  prev_dates=$(awk -F',' 'NR==1 { for(i=1;i<=NF;i++) if($i=="start_date") col=i } NR>1 && col { print $col }' "$prev_cal" | sort -u)

  if [ "$current_dates" != "$prev_dates" ]; then
    echo "Calendar period changed for ${op}: ${prev_dates} -> ${current_dates}"
    changed=true
  else
    echo "Calendar period unchanged for ${op}"
  fi
done

echo "changed=${changed}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "changed=${changed}" >> "$GITHUB_OUTPUT"
fi
