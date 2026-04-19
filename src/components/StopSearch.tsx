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
	 * Issue #99: 完全制御コンポーネントとしての query state。
	 * 親が保持する string をそのまま input の value として反映する。
	 * 内部 useState による二重管理と props→state 同期 useEffect を
	 * 排し、handleEdit / resetForm 等の親発の query 書き換えも
	 * 単純な setState で完結させる（React 公式「You Might Not Need
	 * an Effect」の推奨形）。
	 */
	query: string;
	/**
	 * query 文字列が変化したときのコールバック。
	 *
	 * ユーザーのキー入力・候補選択のいずれでも最新の query を
	 * 親に通知する。親は「選択が無効だがユーザーは文字を入力
	 * している」状態を検出し、エラー文言の分岐（「選択して
	 * ください」/「存在しません」/「乗り換えなしで到達できま
	 * せん」/「候補から選択してください」）に使う。
	 */
	onQueryChange: (query: string) => void;
	/**
	 * バス停の選択状態が変化したときのコールバック。
	 *
	 * - 候補クリック / Enter 押下時は `StopSearchResult` で呼び出す。
	 * - 選択済みの状態で入力値が `selectedStop.stop_name` と乖離した場合は
	 *   `null` で呼び出し、親側の選択状態を無効化することを依頼する。
	 *
	 * 親が form state と query state の乖離による誤登録（選択済みのまま
	 * 入力を書き換えて submit すると最初の選択が登録される問題）を防ぐため、
	 * 選択の有効/無効は常に本コールバックの契約で一元化する。
	 */
	onSelect: (stop: StopSearchResult | null) => void;
	/** 選択済みのバス停（「選択済み状態で入力値が乖離」検出に使う） */
	selectedStop?: StopSearchResult | null;
	/** placeholder テキスト */
	placeholder?: string;
	/**
	 * Issue #90: 候補を直通便で到達可能なバス停に絞り込むフィルタ。
	 * 乗車側では reachableToDestination、降車側では reachableFromOrigin を
	 * 親コンポーネントで構築して渡す。
	 */
	reachabilityFilter?: ReachabilityFilter;
	/**
	 * Issue #103: フォーム全体を一時的に操作禁止にしたいときに true を渡す。
	 * 典型的には送信処理中（`submitting`）や他の副作用処理中
	 * （`togglingRouteId !== null` など）のレースコンディション回避に使う。
	 *
	 * true のときの挙動：
	 * - `input` に HTML `disabled` 属性を付与し、キー入力・フォーカス獲得
	 *   経由のドロップダウン再オープンを防ぐ。
	 * - `handleSearch` / `handleSelect` / `handleKeyDown` / `onFocus` は
	 *   早期リターンして no-op になる。
	 * - listbox は「派生値 + useEffect」の二段構えで閉じる：
	 *   - 派生値 `isListboxOpen = !disabled && isOpen && results.length > 0`
	 *     により、false→true 遷移のレンダリング段階から listbox を非表示に
	 *     する（1 フレーム描画問題を回避）。
	 *   - `useEffect([disabled])` で disabled=true の間に内部 `isOpen` を
	 *     false に倒し、true→false 逆遷移時に listbox が自動再表示される
	 *     UX バグを防ぐ（disabled 解除後の再オープンはユーザーの明示操作
	 *     （focus/入力）を必要とする）。
	 *   WAI-ARIA 観点で「操作不能なのに listbox が見えている」状態を
	 *   作らないことと、ユーザーの意図しない listbox 復活を防ぐことが目的。
	 */
	disabled?: boolean;
};

/** バス停名のインクリメンタルサーチコンポーネント */
export function StopSearch({
	db,
	label,
	query,
	onQueryChange,
	onSelect,
	selectedStop = null,
	placeholder = "バス停名を入力",
	reachabilityFilter,
	disabled = false,
}: StopSearchProps) {
	const id = useId();
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
	// 実際に listbox を描画するか否かは候補の有無と disabled の否との AND で決まる。
	// aria-expanded と描画条件をこの派生値で一元化することで、候補 0 件時に
	// aria-expanded="true" のまま listbox が無いという WAI-ARIA 違反を防ぐ
	// （coderabbitai #96 指摘）。
	// Issue #103 / gemini-code-assist #104（コメント2）：描画条件に `!disabled` を
	// AND することで、disabled=false→true 遷移の 1 フレーム描画問題を防ぐ。
	// これと対になる「disabled=true→false 逆遷移で内部 isOpen が残り listbox
	// が自動再表示される問題」は下の useEffect で内部 state をリセットして
	// 対応する（PR #104 coderabbitai 指摘）。両者は異なる遷移方向に対応する
	// 二段構えで、相補的に「disabled 中は listbox が閉じ、解除後もユーザーの
	// 明示操作があるまで再表示されない」契約を保つ。
	const isListboxOpen = !disabled && isOpen && results.length > 0;

	const handleSearch = useCallback(
		(value: string) => {
			// Issue #103: disabled 中は親 state を書き換えない。
			// HTML disabled 属性で通常の入力経路は塞がれるが、プログラム的に
			// value が来るケースも想定して早期リターンで二重に防ぐ。
			if (disabled) return;
			onQueryChange(value);
			setActiveIndex(-1);
			// 選択済み状態で入力値が選択 stop の名称と乖離したら、親側の
			// 選択状態を無効化する。これにより「選択後に入力だけ書き換えて
			// submit」された場合でも、親の form state が null に戻り、
			// 実在性・到達可能性の再検証（= submit ガード）が正しく走る。
			// 完全制御化（Issue #99）で query が外部 state になったため、
			// 内部 state を書き戻す必要がなく suppress フラグは不要になった。
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
		[selectedStop, onSelect, onQueryChange, disabled],
	);

	const handleSelect = useCallback(
		(stop: StopSearchResult) => {
			// Issue #103: disabled 中は候補クリックも無効化する。
			// option 側の onClick 条件分岐と併せた二重ガード。
			if (disabled) return;
			onQueryChange(stop.stop_name);
			setIsOpen(false);
			setActiveIndex(-1);
			onSelect(stop);
		},
		[onSelect, onQueryChange, disabled],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (disabled) return;
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
		[isOpen, results, activeIndex, handleSelect, disabled],
	);

	// PR #104 coderabbitai 指摘対応：disabled=true 中に内部 `isOpen` を
	// false にリセットする。派生値 `isListboxOpen = !disabled && ...` だけ
	// では disabled=true→false の逆遷移時に内部 isOpen が保持され、
	// query が残っていれば listbox が自動再表示されてしまう（submit 失敗時・
	// toggleRoute 完了時に「触っていない listbox が勝手に復活」する UX バグ）。
	// 本 useEffect と派生値は異なる遷移方向に対応する二段構え：
	// - 派生値（`!disabled && ...`）：disabled=false→true 遷移のレンダリング
	//   フレーム段階から listbox を非表示にし、gemini-code-assist #104 の
	//   1 フレーム描画問題を防ぐ。
	// - 本 useEffect：disabled=true の間に内部 `isOpen` を false に倒し、
	//   disabled=false に戻ったときにユーザーの明示操作（focus/入力）なしで
	//   listbox が再表示される UX バグを防ぐ。
	// どちらも「props→state 同期」（双方向・常時追従）ではなく、`disabled`
	// が true のときに限って内部 state を一方向にクリアする片方向リセット。
	useEffect(() => {
		if (disabled) {
			setIsOpen(false);
			setActiveIndex(-1);
		}
	}, [disabled]);

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
					if (disabled) return;
					if (results.length > 0) setIsOpen(true);
				}}
				disabled={disabled}
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={isListboxOpen}
				aria-controls={`stop-search-listbox-${id}`}
				aria-activedescendant={
					activeIndex >= 0 ? `stop-option-${id}-${activeIndex}` : undefined
				}
				aria-describedby={`stop-search-hint-${id}`}
				autoComplete="off"
			/>
			{/*
			 * ユーザー指摘対応: 正確なバス停名を手入力しても、候補から
			 * クリック（または Enter 確定）しない限り選択は確定しない。
			 * 従来は submit 後のエラー表示でしか気付けなかったため、
			 * 入力中に選択必須であることが分かる永続ヒントを入力欄直下に
			 * 常時表示する。`<label>` の子として置くと accessible name
			 * に連結されて既存の `getByRole("combobox", { name })` を
			 * 破壊するため、label の外に出し aria-describedby で
			 * 支援技術にも適切な記述として結びつける。
			 * エラー文言側の 3 分岐（存在しない / 到達不能 / 候補から選択）と
			 * 合わせて、事前誘導と事後説明の両面でギャップを埋める。
			 */}
			<p
				id={`stop-search-hint-${id}`}
				className="text-xs text-base-content/60 mt-1"
			>
				候補から選択してください
			</p>
			{isListboxOpen && (
				<div
					id={`stop-search-listbox-${id}`}
					className="menu dropdown-content bg-base-100 rounded-box z-10 mt-1 max-h-60 w-full overflow-y-auto shadow-lg"
					// biome-ignore lint/a11y/useSemanticElements: WAI-ARIA combobox パターンでは div + role="listbox" が標準
					role="listbox"
					// WAI-ARIA 1.2: composite widget は accessible name を持つべき。
					// 親 input の label (`乗車バス停` / `降車バス停`) を文脈として
					// 「候補」と組み合わせ、NVDA/VoiceOver 等で listbox にフォーカス
					// が映ったときに用途が曖昧にならないようにする。
					aria-label={`${label}の候補`}
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
							onClick={() => {
								// Issue #103: disabled 中はクリックでも反応しない。
								// handleSelect の早期リターンと合わせた二重ガード。
								// 通常は disabled 化で listbox 自体が閉じるためここに
								// 到達しないが、CSS の pointer-events を使う代替は
								// DaisyUI 側のスタイルと衝突するためこちらを採る。
								if (disabled) return;
								handleSelect(stop);
							}}
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
