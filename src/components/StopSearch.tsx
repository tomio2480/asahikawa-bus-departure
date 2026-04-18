import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Database } from "sql.js";
import { getAgencyColor } from "../lib/agency-colors";
import {
	type ReachabilityFilter,
	type StopSearchResult,
	searchStops,
} from "../lib/stop-search";

type StopSearchProps = {
	/** sql.js データベースインスタンス */
	db: Database;
	/** 入力欄のラベル */
	label: string;
	/** バス停が選択されたときのコールバック */
	onSelect: (stop: StopSearchResult) => void;
	/** 選択済みのバス停（外部から制御する場合） */
	selectedStop?: StopSearchResult | null;
	/** placeholder テキスト */
	placeholder?: string;
	/**
	 * Issue #90: 候補を直通便で到達可能なバス停に絞り込むフィルタ。
	 * 乗車側では reachableToDestination、降車側では reachableFromOrigin を
	 * 親コンポーネントで構築して渡す。
	 */
	reachabilityFilter?: ReachabilityFilter;
};

/** バス停名のインクリメンタルサーチコンポーネント */
export function StopSearch({
	db,
	label,
	onSelect,
	selectedStop = null,
	placeholder = "バス停名を入力",
	reachabilityFilter,
}: StopSearchProps) {
	const id = useId();
	const [query, setQuery] = useState(selectedStop?.stop_name ?? "");
	const [results, setResults] = useState<StopSearchResult[]>([]);
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// 外部から selectedStop が変更された場合に入力欄を同期する
	useEffect(() => {
		setQuery(selectedStop?.stop_name ?? "");
	}, [selectedStop]);

	const handleSearch = useCallback(
		(value: string) => {
			setQuery(value);
			setActiveIndex(-1);
			if (value.trim() === "") {
				setResults([]);
				setIsOpen(false);
				return;
			}
			const found = searchStops(db, value, undefined, reachabilityFilter);
			setResults(found);
			setIsOpen(found.length > 0);
		},
		[db, reachabilityFilter],
	);

	// reachabilityFilter の変更時に現在の入力で再検索する。
	// 親が選択した相手側バス停が変わったときに即座に候補を絞り込み直すため、
	// ドロップダウンが開いている状態でもその中身だけを更新する（Escape で
	// 閉じた状態は維持する）。
	useEffect(() => {
		if (query.trim() === "") {
			setResults([]);
			return;
		}
		const found = searchStops(db, query, undefined, reachabilityFilter);
		setResults(found);
	}, [reachabilityFilter, db, query]);

	const handleSelect = useCallback(
		(stop: StopSearchResult) => {
			setQuery(stop.stop_name);
			setResults([]);
			setIsOpen(false);
			setActiveIndex(-1);
			onSelect(stop);
		},
		[onSelect],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (!isOpen || results.length === 0) return;

			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
					break;
				case "ArrowUp":
					e.preventDefault();
					setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
					break;
				case "Enter":
					e.preventDefault();
					if (activeIndex >= 0 && activeIndex < results.length) {
						handleSelect(results[activeIndex]);
					}
					break;
				case "Escape":
					setIsOpen(false);
					setActiveIndex(-1);
					break;
			}
		},
		[isOpen, results, activeIndex, handleSelect],
	);

	// ドロップダウン外クリックで閉じる
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
				setActiveIndex(-1);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div ref={containerRef} className="form-control w-full relative">
			<label className="label" htmlFor={`stop-search-${id}`}>
				<span className="label-text">{label}</span>
			</label>
			<input
				ref={inputRef}
				id={`stop-search-${id}`}
				type="text"
				className="input input-bordered w-full"
				placeholder={placeholder}
				value={query}
				onChange={(e) => handleSearch(e.target.value)}
				onKeyDown={handleKeyDown}
				onFocus={() => {
					if (results.length > 0) setIsOpen(true);
				}}
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={isOpen}
				aria-controls={`stop-search-listbox-${id}`}
				aria-activedescendant={
					activeIndex >= 0 ? `stop-option-${id}-${activeIndex}` : undefined
				}
				autoComplete="off"
			/>
			{isOpen && results.length > 0 && (
				<div
					id={`stop-search-listbox-${id}`}
					className="menu dropdown-content bg-base-100 rounded-box z-10 mt-1 max-h-60 w-full overflow-y-auto shadow-lg"
					// biome-ignore lint/a11y/useSemanticElements: WAI-ARIA combobox パターンでは div + role="listbox" が標準
					role="listbox"
					tabIndex={-1}
				>
					{results.map((stop, index) => (
						// biome-ignore lint/a11y/useKeyWithClickEvents: キーボード操作は入力欄の handleKeyDown で処理する
						<div
							key={stop.stop_id}
							id={`stop-option-${id}-${index}`}
							className={`cursor-pointer px-4 py-2 hover:bg-base-200 ${index === activeIndex ? "bg-base-300" : ""}`}
							// biome-ignore lint/a11y/useSemanticElements: WAI-ARIA combobox パターンでは div + role="option" が標準
							role="option"
							aria-selected={index === activeIndex}
							tabIndex={-1}
							onClick={() => handleSelect(stop)}
							onMouseEnter={() => setActiveIndex(index)}
						>
							<span className="inline-flex flex-wrap items-center gap-1">
								{stop.stop_name}
								{(() => {
									const ids = stop.clusterStopIds;
									const seen = new Set<string>();
									return ids.flatMap((id) => {
										const entry = getAgencyColor(id);
										if (!entry || seen.has(entry.agencyName)) return [];
										seen.add(entry.agencyName);
										return (
											<span
												key={entry.agencyName}
												className="inline-block w-3 h-3 rounded-full flex-shrink-0"
												style={{ backgroundColor: entry.color }}
												title={entry.agencyName}
												aria-label={entry.agencyName}
												role="img"
											/>
										);
									});
								})()}
							</span>
							{stop.disambiguationLabel && (
								<span className="text-xs text-base-content/60 ml-1">
									({stop.disambiguationLabel})
								</span>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
