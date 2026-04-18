import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
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
	/**
	 * バス停の選択状態が変化したときのコールバック。
	 *
	 * - 候補クリック / Enter 押下 / selectedStop prop からの初期化時は
	 *   `StopSearchResult` で呼び出す。
	 * - 選択済みの状態で入力値が `selectedStop.stop_name` と乖離した場合は
	 *   `null` で呼び出し、親側の選択状態を無効化することを依頼する。
	 *
	 * 親が form state と query state の乖離による誤登録（選択済みのまま
	 * 入力を書き換えて submit すると最初の選択が登録される問題）を防ぐため、
	 * 選択の有効/無効は常に本コールバックの契約で一元化する。
	 */
	onSelect: (stop: StopSearchResult | null) => void;
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
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// 検索結果は state ではなく派生値とする（gemini-code-assist #96 指摘）。
	// `db` / `query` / `reachabilityFilter` が唯一の入力であるという依存関係を
	// 型レベルで可視化し、useEffect による props → state 同期アンチパターンを排除する。
	// ドロップダウンの開閉は独立した UI 状態として `isOpen` で制御する。
	const results = useMemo<StopSearchResult[]>(() => {
		if (query.trim() === "") return [];
		return searchStops(db, query, undefined, reachabilityFilter);
	}, [db, query, reachabilityFilter]);

	// listbox の実在状態。`isOpen` は「ユーザーが明示的に閉じていない」を表し、
	// 実際に listbox を描画するか否かは候補の有無との AND で決まる。
	// aria-expanded と描画条件をこの派生値で一元化することで、候補 0 件時に
	// aria-expanded="true" のまま listbox が無いという WAI-ARIA 違反を防ぐ
	// （coderabbitai #96 指摘）。
	const isListboxOpen = isOpen && results.length > 0;

	// 外部から selectedStop が変更された場合に入力欄を同期する
	useEffect(() => {
		setQuery(selectedStop?.stop_name ?? "");
	}, [selectedStop]);

	const handleSearch = useCallback(
		(value: string) => {
			setQuery(value);
			setActiveIndex(-1);
			// 選択済み状態で入力値が選択 stop の名称と乖離したら、親側の
			// 選択状態を無効化する。これにより「選択後に入力だけ書き換えて
			// submit」された場合でも、親の form state が null に戻り、
			// 実在性・到達可能性の再検証（= submit ガード）が正しく走る。
			// `selectedStop` prop 経由の useEffect による setQuery（下記参照）
			// では `value === selectedStop.stop_name` になるため、ここでは
			// 呼ばれず、親 state を破壊するループにはならない。
			if (selectedStop && value !== selectedStop.stop_name) {
				onSelect(null);
			}
			if (value.trim() === "") {
				setIsOpen(false);
				return;
			}
			// results は派生値として自動再計算されるため、ここでは開閉のみ制御する。
			setIsOpen(true);
		},
		[selectedStop, onSelect],
	);

	const handleSelect = useCallback(
		(stop: StopSearchResult) => {
			setQuery(stop.stop_name);
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
				aria-expanded={isListboxOpen}
				aria-controls={`stop-search-listbox-${id}`}
				aria-activedescendant={
					activeIndex >= 0 ? `stop-option-${id}-${activeIndex}` : undefined
				}
				autoComplete="off"
			/>
			{isListboxOpen && (
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
