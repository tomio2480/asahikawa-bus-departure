import { useCallback, useEffect, useRef, useState } from "react";
import type { Database } from "sql.js";
import { type StopSearchResult, searchStops } from "../lib/stop-search";

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
};

/** バス停名のインクリメンタルサーチコンポーネント */
export function StopSearch({
	db,
	label,
	onSelect,
	selectedStop = null,
	placeholder = "バス停名を入力",
}: StopSearchProps) {
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
			const found = searchStops(db, value);
			setResults(found);
			setIsOpen(found.length > 0);
		},
		[db],
	);

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
		<div ref={containerRef} className="form-control w-full">
			<label className="label" htmlFor={`stop-search-${label}`}>
				<span className="label-text">{label}</span>
			</label>
			<input
				ref={inputRef}
				id={`stop-search-${label}`}
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
				aria-expanded={isOpen}
				aria-controls={`stop-search-listbox-${label}`}
				aria-activedescendant={
					activeIndex >= 0 ? `stop-option-${label}-${activeIndex}` : undefined
				}
				autoComplete="off"
			/>
			{isOpen && results.length > 0 && (
				<div
					id={`stop-search-listbox-${label}`}
					className="menu dropdown-content bg-base-100 rounded-box z-10 mt-1 max-h-60 w-full overflow-y-auto shadow-lg"
					// biome-ignore lint/a11y/useSemanticElements: WAI-ARIA combobox パターンでは div + role="listbox" が標準
					role="listbox"
					tabIndex={-1}
				>
					{results.map((stop, index) => (
						<div
							key={stop.stop_id}
							id={`stop-option-${label}-${index}`}
							className={`cursor-pointer px-4 py-2 hover:bg-base-200 ${index === activeIndex ? "bg-base-300" : ""}`}
							// biome-ignore lint/a11y/useSemanticElements: WAI-ARIA combobox パターンでは div + role="option" が標準
							role="option"
							aria-selected={index === activeIndex}
							tabIndex={-1}
							onClick={() => handleSelect(stop)}
							onMouseEnter={() => setActiveIndex(index)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleSelect(stop);
							}}
						>
							{stop.stop_name}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
