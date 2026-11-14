import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Plus, c as Download, i as Shrink, l as Crop, n as Type, o as LoaderCircle, s as LayoutGrid, t as X } from "../_libs/lucide-react.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as gifsicle } from "../_libs/gifsicle-wasm-browser.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-BJGU7deo.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/** Hard ceiling: 14.9 MB decimal, safely under a 15 MB upload limit. */
var MAX_GIF_BYTES = 149e5;
function formatMb(bytes) {
	return (bytes / 1e6).toFixed(2);
}
/** Pad a GIF out to exactly `cap` bytes with a comment block. Does not change pixels. */
function exactBytes(bytes, cap) {
	if (bytes.byteLength > cap) throw new Error("Export came out over 14.9 MB.");
	if (bytes.byteLength === cap) {
		const same = new Uint8Array(bytes.byteLength);
		same.set(bytes);
		return same;
	}
	const out = new Uint8Array(cap);
	const hasTrailer = bytes.length > 0 && bytes[bytes.length - 1] === 59;
	const bodyLen = hasTrailer ? bytes.length - 1 : bytes.length;
	const room = cap - bodyLen;
	if (!hasTrailer || room < 6) {
		out.set(bytes, 0);
		return out;
	}
	out.set(bytes.subarray(0, bodyLen), 0);
	let pos = bodyLen;
	out[pos++] = 33;
	out[pos++] = 254;
	const termAt = cap - 2;
	while (termAt - pos > 256) {
		const chunk = termAt - pos - 256 === 1 ? 254 : 255;
		out[pos++] = chunk;
		pos += chunk;
	}
	const rest = termAt - pos;
	if (rest >= 2) {
		out[pos++] = rest - 1;
		pos += rest - 1;
	}
	out[termAt] = 0;
	out[cap - 1] = 59;
	return out;
}
/** EZGIF order: lossless optimize, then lossy LZW, then fewer colors. Never scales. */
var STEPS = [
	{ optimize: 2 },
	{
		optimize: 2,
		lossy: 20
	},
	{
		optimize: 2,
		lossy: 35
	},
	{
		optimize: 2,
		lossy: 50
	},
	{
		optimize: 2,
		lossy: 70
	},
	{
		optimize: 2,
		lossy: 90
	},
	{
		optimize: 2,
		lossy: 120
	},
	{
		optimize: 2,
		lossy: 160
	},
	{
		optimize: 2,
		lossy: 80,
		colors: 128
	},
	{
		optimize: 2,
		lossy: 110,
		colors: 96
	},
	{
		optimize: 2,
		lossy: 140,
		colors: 64
	},
	{
		optimize: 1,
		lossy: 180,
		colors: 48
	}
];
function gifSize(bytes) {
	if (bytes.byteLength < 10) return null;
	const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
	if (sig !== "GIF87a" && sig !== "GIF89a") return null;
	return {
		width: bytes[6] | bytes[7] << 8,
		height: bytes[8] | bytes[9] << 8
	};
}
function stepLabel(step) {
	if (!step.lossy && !step.colors) return "Optimizing frames, same size";
	if (step.colors) return `Lossy ${step.lossy}, ${step.colors} colors, same size`;
	return `Lossy ${step.lossy}, same size`;
}
async function runStep(input, step) {
	const flags = [`-O${step.optimize}`];
	if (step.lossy) flags.push(`--lossy=${step.lossy}`);
	if (step.colors) flags.push(`--colors ${step.colors}`);
	flags.push("in.gif -o /out/out.gif");
	const copy = new Uint8Array(input.byteLength);
	copy.set(input);
	const file = new File([copy], "in.gif", { type: "image/gif" });
	const outFile = (await gifsicle.run({
		input: [{
			file,
			name: "in.gif"
		}],
		command: [flags.join(" ")]
	}))?.[0];
	if (!outFile) throw new Error("Optimizer failed.");
	const raw = new Uint8Array(await outFile.arrayBuffer());
	const packed = new Uint8Array(raw.byteLength);
	packed.set(raw);
	return packed;
}
/** Shrink the file the way EZGIF does, without changing width or height. */
async function squeezeToCap(input, cap, onProgress) {
	if (input.byteLength <= cap) {
		const same = new Uint8Array(input.byteLength);
		same.set(input);
		return same;
	}
	const before = gifSize(input);
	let best = new Uint8Array(input.byteLength);
	best.set(input);
	for (let i = 0; i < STEPS.length; i++) {
		const step = STEPS[i];
		onProgress({
			ratio: .52 + i / STEPS.length * .42,
			label: stepLabel(step)
		});
		const out = await runStep(input, step);
		const after = gifSize(out);
		if (before && after && (after.width !== before.width || after.height !== before.height)) throw new Error("Optimizer changed the picture size. Stopped.");
		if (out.byteLength < best.byteLength) best = out;
		if (out.byteLength <= cap) return out;
	}
	if (best.byteLength <= cap) return best;
	throw new Error("Couldn't fit this GIF under 14.9 MB without shrinking it.");
}
var activeReject = null;
var activeWorker = null;
function exportCollage(job) {
	return runWorker(job.onProgress, async (worker, settled) => {
		const buffers = await Promise.all(job.files.map((file) => file.arrayBuffer()));
		if (settled()) return;
		worker.postMessage({
			buffers,
			mimes: job.files.map((file) => file.type),
			cols: job.cols,
			rows: job.rows,
			aspect: job.aspect,
			fit: job.fit,
			mat: job.mat,
			gutterRatio: job.gutterRatio,
			cells: job.cells,
			maxBytes: MAX_GIF_BYTES
		}, buffers);
	});
}
function exportSingle(job) {
	return runWorker(job.onProgress, async (worker, settled) => {
		const buffer = await job.file.arrayBuffer();
		if (settled()) return;
		const transfer = [buffer];
		if (job.overlay) transfer.push(job.overlay);
		worker.postMessage({
			op: job.op,
			buffer,
			mime: job.file.type,
			maxBytes: MAX_GIF_BYTES,
			overlay: job.overlay,
			crop: job.crop
		}, transfer);
	});
}
function runWorker(onProgress, send) {
	activeWorker?.terminate();
	activeReject?.(/* @__PURE__ */ new Error("cancelled"));
	activeWorker = null;
	activeReject = null;
	const worker = new Worker(new URL("./collage.worker.ts", import.meta.url), { type: "module" });
	activeWorker = worker;
	return new Promise((resolve, reject) => {
		activeReject = reject;
		let settled = false;
		const isSettled = () => settled;
		const finish = () => {
			if (settled) return;
			settled = true;
			if (activeWorker === worker) {
				activeWorker = null;
				activeReject = null;
			}
			worker.onmessage = null;
			worker.onerror = null;
			worker.terminate();
		};
		worker.onmessage = (event) => {
			const data = event.data;
			if (data.type === "progress") {
				onProgress({
					ratio: data.ratio,
					label: data.label
				});
				return;
			}
			if (data.type === "error") {
				finish();
				reject(new Error(data.message));
				return;
			}
			if (data.type === "done") {
				(async () => {
					try {
						let bytes = new Uint8Array(data.buffer);
						if (bytes.byteLength > 149e5) bytes = await squeezeToCap(bytes, MAX_GIF_BYTES, onProgress);
						if (bytes.byteLength < 149e5) bytes = exactBytes(bytes, MAX_GIF_BYTES);
						if (bytes.byteLength > 149e5) throw new Error("Export came out over 14.9 MB.");
						const copy = new Uint8Array(bytes.byteLength);
						copy.set(bytes);
						finish();
						resolve({
							...data,
							buffer: copy.buffer,
							bytes: copy.byteLength
						});
					} catch (error) {
						finish();
						reject(error instanceof Error ? error : /* @__PURE__ */ new Error("Export failed."));
					}
				})();
				return;
			}
		};
		worker.onerror = () => {
			finish();
			reject(/* @__PURE__ */ new Error("Export failed. Try a shorter GIF."));
		};
		send(worker, isSettled).catch(() => {
			finish();
			reject(/* @__PURE__ */ new Error("Couldn't read that file."));
		});
	});
}
function uniform(cols, rows) {
	const cells = [];
	for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({
		c,
		r,
		w: 1,
		h: 1
	});
	return cells;
}
var LAYOUTS = [
	{
		id: "wide",
		label: "Wide",
		count: 2,
		cols: 2,
		rows: 1,
		cells: uniform(2, 1)
	},
	{
		id: "tall",
		label: "Tall",
		count: 2,
		cols: 1,
		rows: 2,
		cells: uniform(1, 2)
	},
	{
		id: "grid",
		label: "Grid",
		count: 4,
		cols: 2,
		rows: 2,
		cells: uniform(2, 2)
	},
	{
		id: "row",
		label: "Row",
		count: 4,
		cols: 4,
		rows: 1,
		cells: uniform(4, 1)
	},
	{
		id: "hero",
		label: "Hero",
		count: 4,
		cols: 3,
		rows: 2,
		cells: [
			{
				c: 0,
				r: 0,
				w: 3,
				h: 1
			},
			{
				c: 0,
				r: 1,
				w: 1,
				h: 1
			},
			{
				c: 1,
				r: 1,
				w: 1,
				h: 1
			},
			{
				c: 2,
				r: 1,
				w: 1,
				h: 1
			}
		]
	},
	{
		id: "rail",
		label: "Rail",
		count: 4,
		cols: 2,
		rows: 3,
		cells: [
			{
				c: 0,
				r: 0,
				w: 1,
				h: 3
			},
			{
				c: 1,
				r: 0,
				w: 1,
				h: 1
			},
			{
				c: 1,
				r: 1,
				w: 1,
				h: 1
			},
			{
				c: 1,
				r: 2,
				w: 1,
				h: 1
			}
		]
	},
	{
		id: "grid",
		label: "Grid",
		count: 6,
		cols: 3,
		rows: 2,
		cells: uniform(3, 2)
	},
	{
		id: "stack",
		label: "Stack",
		count: 6,
		cols: 2,
		rows: 3,
		cells: uniform(2, 3)
	},
	{
		id: "hero",
		label: "Hero",
		count: 6,
		cols: 3,
		rows: 3,
		cells: [
			{
				c: 0,
				r: 0,
				w: 2,
				h: 2
			},
			{
				c: 2,
				r: 0,
				w: 1,
				h: 1
			},
			{
				c: 2,
				r: 1,
				w: 1,
				h: 1
			},
			{
				c: 0,
				r: 2,
				w: 1,
				h: 1
			},
			{
				c: 1,
				r: 2,
				w: 1,
				h: 1
			},
			{
				c: 2,
				r: 2,
				w: 1,
				h: 1
			}
		]
	},
	{
		id: "band",
		label: "Band",
		count: 6,
		cols: 4,
		rows: 2,
		cells: [
			{
				c: 0,
				r: 0,
				w: 2,
				h: 1
			},
			{
				c: 2,
				r: 0,
				w: 2,
				h: 1
			},
			{
				c: 0,
				r: 1,
				w: 1,
				h: 1
			},
			{
				c: 1,
				r: 1,
				w: 1,
				h: 1
			},
			{
				c: 2,
				r: 1,
				w: 1,
				h: 1
			},
			{
				c: 3,
				r: 1,
				w: 1,
				h: 1
			}
		]
	},
	{
		id: "grid",
		label: "Grid",
		count: 8,
		cols: 4,
		rows: 2,
		cells: uniform(4, 2)
	},
	{
		id: "stack",
		label: "Stack",
		count: 8,
		cols: 2,
		rows: 4,
		cells: uniform(2, 4)
	},
	{
		id: "hero",
		label: "Hero",
		count: 8,
		cols: 4,
		rows: 3,
		cells: [
			{
				c: 0,
				r: 0,
				w: 2,
				h: 2
			},
			{
				c: 2,
				r: 0,
				w: 1,
				h: 1
			},
			{
				c: 3,
				r: 0,
				w: 1,
				h: 1
			},
			{
				c: 2,
				r: 1,
				w: 1,
				h: 1
			},
			{
				c: 3,
				r: 1,
				w: 1,
				h: 1
			},
			{
				c: 0,
				r: 2,
				w: 1,
				h: 1
			},
			{
				c: 1,
				r: 2,
				w: 1,
				h: 1
			},
			{
				c: 2,
				r: 2,
				w: 2,
				h: 1
			}
		]
	},
	{
		id: "pairs",
		label: "Pairs",
		count: 8,
		cols: 4,
		rows: 3,
		cells: [
			{
				c: 0,
				r: 0,
				w: 2,
				h: 1
			},
			{
				c: 2,
				r: 0,
				w: 2,
				h: 1
			},
			{
				c: 0,
				r: 1,
				w: 2,
				h: 1
			},
			{
				c: 2,
				r: 1,
				w: 2,
				h: 1
			},
			{
				c: 0,
				r: 2,
				w: 1,
				h: 1
			},
			{
				c: 1,
				r: 2,
				w: 1,
				h: 1
			},
			{
				c: 2,
				r: 2,
				w: 1,
				h: 1
			},
			{
				c: 3,
				r: 2,
				w: 1,
				h: 1
			}
		]
	}
];
function layoutsFor(count) {
	return LAYOUTS.filter((layout) => layout.count === count);
}
function layoutById(count, id) {
	const list = layoutsFor(count);
	return list.find((layout) => layout.id === id) ?? list[0];
}
var COUNTS = [
	2,
	4,
	6,
	8
];
var ASPECTS = {
	square: {
		label: "Square",
		value: 1
	},
	four: {
		label: "4:3",
		value: 4 / 3
	},
	wide: {
		label: "16:9",
		value: 16 / 9
	}
};
var MATS = {
	black: {
		label: "Black",
		rgb: [
			0,
			0,
			0
		],
		className: "bg-mat-black"
	},
	paper: {
		label: "Paper",
		rgb: [
			232,
			238,
			248
		],
		className: "bg-mat-paper"
	}
};
var GAPS = {
	off: {
		label: "None",
		ratio: 0,
		className: "gap-0"
	},
	line: {
		label: "Hairline",
		ratio: .015,
		className: "gap-1"
	},
	open: {
		label: "Open",
		ratio: .04,
		className: "gap-2"
	}
};
var ACCEPT$1 = "image/gif,image/png,image/jpeg,image/webp,image/avif,.gif";
function acceptable(file) {
	if (file.type.startsWith("image/")) return true;
	return /\.(gif|png|jpe?g|webp|avif)$/i.test(file.name);
}
function slotFromFile(file) {
	if (!acceptable(file)) return null;
	return {
		url: URL.createObjectURL(file),
		name: file.name,
		file,
		bytes: file.size
	};
}
function CollageTool() {
	const [count, setCount] = (0, import_react.useState)(4);
	const [layoutId, setLayoutId] = (0, import_react.useState)("grid");
	const [aspectKey, setAspectKey] = (0, import_react.useState)("four");
	const [fit, setFit] = (0, import_react.useState)("contain");
	const [mat, setMat] = (0, import_react.useState)("black");
	const [gap, setGap] = (0, import_react.useState)("line");
	const [slots, setSlots] = (0, import_react.useState)([
		null,
		null,
		null,
		null
	]);
	const [selected, setSelected] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [progress, setProgress] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [result, setResult] = (0, import_react.useState)(null);
	const dragFrom = (0, import_react.useRef)(null);
	const jobRef = (0, import_react.useRef)(0);
	const resultUrl = (0, import_react.useRef)(null);
	const bulkId = "add-gifs";
	const layout = layoutById(count, layoutId);
	const { cols, rows } = layout;
	const cellAspect = ASPECTS[aspectKey].value;
	const gutter = GAPS[gap].ratio;
	const boardAspect = cellAspect * (cols + Math.max(0, cols - 1) * gutter) / (rows + Math.max(0, rows - 1) * gutter);
	const filled = slots.filter((slot) => slot !== null).length;
	const ready = filled === count && !busy;
	const sourceBytes = slots.reduce((sum, slot) => sum + (slot?.bytes ?? 0), 0);
	(0, import_react.useEffect)(() => {
		const prevent = (event) => event.preventDefault();
		window.addEventListener("dragover", prevent);
		window.addEventListener("drop", prevent);
		return () => {
			window.removeEventListener("dragover", prevent);
			window.removeEventListener("drop", prevent);
		};
	}, []);
	(0, import_react.useEffect)(() => {
		return () => {
			if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
		};
	}, []);
	function rememberResult(next) {
		if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
		resultUrl.current = next?.url ?? null;
		setResult(next);
	}
	function resizeTo(nextCount) {
		setCount(nextCount);
		setLayoutId((current) => layoutById(nextCount, current).id);
		setSelected(null);
		setSlots((prev) => {
			const next = prev.slice(0, nextCount);
			prev.slice(nextCount).forEach((slot) => slot && URL.revokeObjectURL(slot.url));
			while (next.length < nextCount) next.push(null);
			return next;
		});
		rememberResult(null);
	}
	function putSlot(index, file) {
		const slot = slotFromFile(file);
		if (!slot) {
			setError("That file isn't a GIF or image.");
			return;
		}
		setError(null);
		setSlots((prev) => {
			const next = prev.slice();
			const old = next[index];
			if (old) URL.revokeObjectURL(old.url);
			next[index] = slot;
			return next;
		});
		rememberResult(null);
	}
	function fillFiles(files) {
		const usable = files.filter(acceptable);
		if (usable.length === 0) {
			setError("Drop GIFs or still images.");
			return;
		}
		setError(null);
		setSlots((prev) => {
			const next = prev.slice();
			let cursor = 0;
			for (const file of usable) {
				let index = next.findIndex((slot, i) => slot === null && i >= cursor);
				if (index === -1) index = next.findIndex((slot) => slot === null);
				if (index === -1) break;
				cursor = index + 1;
				const slot = slotFromFile(file);
				if (!slot) continue;
				const old = next[index];
				if (old) URL.revokeObjectURL(old.url);
				next[index] = slot;
			}
			return next;
		});
		rememberResult(null);
	}
	function clearSlot(index) {
		setSlots((prev) => {
			const next = prev.slice();
			const old = next[index];
			if (old) URL.revokeObjectURL(old.url);
			next[index] = null;
			return next;
		});
		if (selected === index) setSelected(null);
		rememberResult(null);
	}
	function swap(a, b) {
		if (a === b) return;
		setSlots((prev) => {
			const next = prev.slice();
			const hold = next[a];
			next[a] = next[b] ?? null;
			next[b] = hold ?? null;
			return next;
		});
		rememberResult(null);
	}
	function onCellActivate(index) {
		if (selected === null) {
			if (slots[index]) setSelected(index);
			return;
		}
		if (selected === index) {
			setSelected(null);
			return;
		}
		swap(selected, index);
		setSelected(null);
	}
	async function onExport() {
		if (!ready) return;
		const job = ++jobRef.current;
		setBusy(true);
		setError(null);
		setProgress({
			ratio: .01,
			label: "Starting"
		});
		try {
			const exported = await exportCollage({
				files: slots.map((slot) => slot?.file).filter((file) => !!file),
				cols,
				rows,
				aspect: ASPECTS[aspectKey].value,
				fit,
				mat: MATS[mat].rgb,
				gutterRatio: GAPS[gap].ratio,
				cells: layout.cells,
				onProgress: (next) => {
					if (jobRef.current === job) setProgress(next);
				}
			});
			if (jobRef.current !== job) return;
			if (exported.bytes > 149e5) throw new Error("Export came out over 14.9 MB.");
			const blob = new Blob([exported.buffer], { type: "image/gif" });
			if (blob.size > 149e5) throw new Error("Export came out over 14.9 MB.");
			rememberResult({
				url: URL.createObjectURL(blob),
				bytes: blob.size,
				width: exported.width,
				height: exported.height,
				frames: exported.frames,
				fps: exported.fps,
				colors: exported.colors
			});
		} catch (cause) {
			if (jobRef.current !== job) return;
			const message = cause instanceof Error ? cause.message : "Export failed.";
			if (message !== "cancelled") setError(message);
		} finally {
			if (jobRef.current === job) {
				setBusy(false);
				setProgress(null);
			}
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-4 pb-40",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "rounded-lg border border-line bg-surface p-3 sm:p-4",
				"aria-label": "Collage settings",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-end justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Group, {
							label: "Cells",
							children: COUNTS.map((n) => {
								const shape = layoutsFor(n)[0];
								const active = count === n;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									"aria-pressed": active,
									onClick: () => resizeTo(n),
									className: clsx("inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors", active ? "border-amber bg-amber text-amber-ink" : "border-line bg-canvas text-ink hover:bg-surface-2"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Glyph, {
										layout: shape,
										active
									}), n]
								}, n);
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							htmlFor: bulkId,
							className: "inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-canvas px-3 text-sm font-medium text-ink hover:bg-surface-2",
							children: ["Add GIFs", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								id: bulkId,
								type: "file",
								accept: ACCEPT$1,
								multiple: true,
								className: "sr-only",
								onChange: (event) => {
									const list = event.target.files;
									if (list) fillFiles(Array.from(list));
									event.target.value = "";
								}
							})]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-2 gap-3 lg:grid-cols-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Group, {
								label: "Design",
								className: "col-span-2 lg:col-span-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "flex flex-wrap gap-1.5",
									children: layoutsFor(count).map((item) => {
										const active = item.id === layout.id;
										return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											type: "button",
											"aria-pressed": active,
											onClick: () => {
												setLayoutId(item.id);
												rememberResult(null);
											},
											className: clsx("inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium", active ? "border-amber bg-amber text-amber-ink" : "border-line bg-canvas text-ink hover:bg-surface-2"),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Glyph, {
												layout: item,
												active
											}), item.label]
										}, item.id);
									})
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Group, {
								label: "Shape",
								className: "col-span-2 lg:col-span-1",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Segment, {
									value: aspectKey,
									onChange: (value) => {
										setAspectKey(value);
										rememberResult(null);
									},
									options: Object.keys(ASPECTS).map((key) => ({
										value: key,
										label: ASPECTS[key].label
									}))
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Group, {
								label: "Fit",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Segment, {
									value: fit,
									onChange: (value) => {
										setFit(value);
										rememberResult(null);
									},
									options: [{
										value: "contain",
										label: "Contain"
									}, {
										value: "cover",
										label: "Cover"
									}]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Group, {
								label: "Mat",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Segment, {
									value: mat,
									onChange: (value) => {
										setMat(value);
										rememberResult(null);
									},
									options: [{
										value: "black",
										label: "Black"
									}, {
										value: "paper",
										label: "Paper"
									}]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Group, {
								label: "Gap",
								className: "col-span-2 lg:col-span-1",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Segment, {
									value: gap,
									onChange: (value) => {
										setGap(value);
										rememberResult(null);
									},
									options: Object.keys(GAPS).map((key) => ({
										value: key,
										label: GAPS[key].label
									}))
								})
							})
						]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				"aria-label": "Collage board",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-2 flex items-baseline justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-xl font-semibold",
						children: "Board"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: selected !== null ? "Tap another cell to swap." : `${filled} of ${count} filled`
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "board-fit mx-auto",
					style: { "--board-aspect": String(boardAspect) },
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: clsx("board-grid grid rounded-lg p-1", GAPS[gap].className, MATS[mat].className),
						style: {
							gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
							gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
						},
						onDragOver: (event) => event.preventDefault(),
						onDrop: (event) => {
							if (dragFrom.current !== null) return;
							const files = Array.from(event.dataTransfer.files ?? []);
							if (files.length) fillFiles(files);
						},
						children: slots.map((slot, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
							index,
							span: layout.cells[index],
							slot,
							matClass: MATS[mat].className,
							fit,
							selected: selected === index,
							onActivate: () => onCellActivate(index),
							onFile: (file) => putSlot(index, file),
							onClear: () => clearSlot(index),
							onDragStart: () => {
								dragFrom.current = index;
							},
							onDragEnd: () => {
								dragFrom.current = null;
							},
							onDropSlot: () => {
								const from = dragFrom.current;
								dragFrom.current = null;
								if (from !== null) swap(from, index);
							}
						}, index))
					})
				})]
			}),
			result ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-lg border border-line bg-surface p-4",
				"aria-label": "Export result",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-3 flex flex-wrap items-end justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl font-semibold",
							children: "Ready"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-sm text-muted",
							children: [
								result.width,
								"×",
								result.height,
								" · ",
								result.frames,
								" frames · ",
								result.fps,
								" fps · ",
								result.colors,
								" ",
								"colors"
							]
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "font-display text-2xl font-semibold",
							children: [formatMb(result.bytes), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-base font-medium text-muted",
								children: " / 14.9 MB"
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mb-4 h-2 overflow-hidden rounded-full bg-canvas",
						"aria-hidden": true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-full bg-amber",
							style: { width: `${Math.min(100, result.bytes / MAX_GIF_BYTES * 100)}%` }
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: result.url,
						alt: "Exported GIF collage",
						className: "mx-auto max-h-[42dvh] w-auto max-w-full rounded-md bg-mat-black object-contain"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 flex flex-wrap items-center justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-sm text-muted",
							children: [
								"Sources ",
								formatMb(sourceBytes),
								" MB → collage ",
								formatMb(result.bytes),
								" MB"
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
							href: result.url,
							download: `splice-${cols}x${rows}.gif`,
							className: "inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, {
								className: "size-4",
								"aria-hidden": true
							}), "Download GIF"]
						})]
					})
				]
			}) : null,
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-amber",
				children: error
			}) : null
		]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-x-0 bottom-0 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur-sm sm:px-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "min-w-0 flex-1",
				children: busy && progress ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "truncate text-sm text-ink",
					children: progress.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 h-1.5 overflow-hidden rounded-full bg-surface",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "h-full bg-amber transition-[width] duration-200",
						style: { width: `${Math.round(progress.ratio * 100)}%` }
					})
				})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: filled === count ? result ? `${formatMb(result.bytes)} MB · highest resolution that still fits.` : "Every collage is built to 14.9 MB." : `Fill ${count - filled} more ${count - filled === 1 ? "cell" : "cells"} to export.`
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [result && !busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: result.url,
					download: `splice-${cols}x${rows}.gif`,
					className: "inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, {
						className: "size-4",
						"aria-hidden": true
					}), "Download"]
				}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => void onExport(),
					disabled: !ready,
					className: "inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink disabled:bg-surface-2 disabled:text-muted",
					children: [busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
						className: "size-4 animate-spin",
						"aria-hidden": true
					}) : null, busy ? "Splicing" : "Export collage"]
				})]
			})]
		})
	})] });
}
function Group({ label, className, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: clsx("flex min-w-0 flex-col gap-1.5", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xs font-medium tracking-wide text-muted uppercase",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex flex-wrap gap-1.5",
			children
		})]
	});
}
function Segment({ value, onChange, options }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-w-0 flex-1 gap-1.5",
		children: options.map((option) => {
			const active = value === option.value;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				"aria-pressed": active,
				disabled: option.disabled,
				onClick: () => onChange(option.value),
				className: clsx("inline-flex h-11 flex-1 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors disabled:opacity-40", active ? "border-amber bg-amber text-amber-ink" : "border-line bg-canvas text-ink hover:bg-surface-2"),
				children: option.label
			}, option.value);
		})
	});
}
function Glyph({ layout, active }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "grid h-6 w-6 shrink-0 gap-px",
		style: {
			gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
			gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`
		},
		"aria-hidden": true,
		children: layout.cells.map((cell, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: active ? "bg-amber-ink" : "bg-current",
			style: {
				gridColumn: `${cell.c + 1} / span ${cell.w}`,
				gridRow: `${cell.r + 1} / span ${cell.h}`
			}
		}, index))
	});
}
function Cell({ index, span, slot, matClass, fit, selected, onActivate, onFile, onClear, onDragStart, onDragEnd, onDropSlot }) {
	const inputId = `cell-${index}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: clsx("relative h-full min-h-0 min-w-0 overflow-hidden rounded-md", selected && "ring-2 ring-amber ring-inset"),
		style: span ? {
			gridColumn: `${span.c + 1} / span ${span.w}`,
			gridRow: `${span.r + 1} / span ${span.h}`
		} : void 0,
		onDragOver: (event) => event.preventDefault(),
		onDrop: (event) => {
			event.preventDefault();
			event.stopPropagation();
			const file = event.dataTransfer.files?.[0];
			if (file) onFile(file);
			else onDropSlot();
		},
		children: [slot ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			draggable: true,
			onDragStart: (event) => {
				event.dataTransfer.setData("text/plain", String(index));
				event.dataTransfer.effectAllowed = "move";
				onDragStart();
			},
			onDragEnd,
			onClick: onActivate,
			className: "absolute inset-0 block",
			"aria-label": `Cell ${index + 1}, ${slot.name}. Activate to swap.`,
			"aria-pressed": selected,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: slot.url,
				alt: "",
				draggable: false,
				className: clsx("h-full w-full", matClass, fit === "contain" ? "object-contain" : "object-cover")
			})
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
			htmlFor: inputId,
			className: "absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 bg-surface text-muted hover:bg-surface-2 hover:text-ink",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
					className: "size-5",
					"aria-hidden": true
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs font-medium",
					children: "Add"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					id: inputId,
					type: "file",
					accept: ACCEPT$1,
					className: "sr-only",
					onChange: (event) => {
						const file = event.target.files?.[0];
						if (file) onFile(file);
						event.target.value = "";
					}
				})
			]
		}), slot ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: onClear,
			className: "absolute top-0.5 right-0.5 z-10 inline-flex size-11 items-center justify-center rounded-md bg-canvas/80 text-ink",
			"aria-label": `Remove ${slot.name}`,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
				className: "size-4",
				"aria-hidden": true
			})
		}) : null]
	});
}
var ACCEPT = "image/gif,image/png,image/jpeg,image/webp,image/avif,.gif";
function useToolResult() {
	const [result, setResult] = (0, import_react.useState)(null);
	const urlRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		return () => {
			if (urlRef.current) URL.revokeObjectURL(urlRef.current);
		};
	}, []);
	function remember(next) {
		if (urlRef.current) URL.revokeObjectURL(urlRef.current);
		urlRef.current = next?.url ?? null;
		setResult(next);
	}
	return {
		result,
		remember
	};
}
function Choice({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-w-0 flex-col gap-1.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xs font-medium tracking-wide text-muted uppercase",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex flex-wrap gap-1.5",
			children
		})]
	});
}
function Chip({ active, children, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		"aria-pressed": active,
		onClick,
		className: clsx("inline-flex h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors", active ? "border-amber bg-amber text-amber-ink" : "border-line bg-canvas text-ink hover:bg-surface-2"),
		children
	});
}
function ExportBar({ busy, progress, hint, ready, action, downloadName, result, onRun }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur-sm sm:px-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "min-w-0 flex-1",
				children: busy && progress ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "truncate text-sm text-ink",
					children: progress.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 h-1.5 overflow-hidden rounded-full bg-surface",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "h-full bg-amber transition-[width] duration-200",
						style: { width: `${Math.round(progress.ratio * 100)}%` }
					})
				})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: hint
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [result && !busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: result.url,
					download: downloadName,
					className: "inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, {
						className: "size-4",
						"aria-hidden": true
					}), "Download"]
				}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: onRun,
					disabled: !ready,
					className: "inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink disabled:bg-surface-2 disabled:text-muted",
					children: [busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
						className: "size-4 animate-spin",
						"aria-hidden": true
					}) : null, busy ? "Working" : action]
				})]
			})]
		})
	});
}
function ResultCard({ result, before, downloadName, note }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-lg border border-line bg-surface p-4",
		"aria-label": "Export result",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-3 flex flex-wrap items-end justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl font-semibold",
					children: "Ready"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted",
					children: result.frames > 0 ? `${result.width}×${result.height} · ${result.frames} frames · ${result.fps} fps · ${result.colors} colors` : result.width > 0 ? `${result.width}×${result.height} · filled to 14.9 MB` : "Original file"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "font-display text-2xl font-semibold",
					children: [formatMb(result.bytes), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-base font-medium text-muted",
						children: " MB"
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: result.url,
				alt: "Exported GIF",
				className: "mx-auto max-h-[42dvh] w-auto max-w-full rounded-md bg-mat-black object-contain"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex flex-wrap items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-sm text-muted",
					children: [before !== void 0 ? `${formatMb(before)} MB → ${formatMb(result.bytes)} MB. ` : null, note]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: result.url,
					download: downloadName,
					className: "inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, {
						className: "size-4",
						"aria-hidden": true
					}), "Download GIF"]
				})]
			})
		]
	});
}
function CompressTool() {
	const [file, setFile] = (0, import_react.useState)(null);
	const [url, setUrl] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [progress, setProgress] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const { result, remember } = useToolResult();
	const jobRef = (0, import_react.useRef)(0);
	const over = !!file && file.size > 149e5;
	function take(next) {
		setUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return next ? URL.createObjectURL(next) : null;
		});
		setFile(next);
		remember(null);
		setError(null);
	}
	async function onExport() {
		if (!file || busy) return;
		const job = ++jobRef.current;
		setBusy(true);
		setError(null);
		setProgress({
			ratio: .04,
			label: "Locking 14.9 MB"
		});
		try {
			const exported = await exportSingle({
				op: "compress",
				file,
				onProgress: (next) => {
					if (jobRef.current === job) setProgress(next);
				}
			});
			if (jobRef.current !== job) return;
			if (exported.bytes > 149e5) throw new Error("Export came out over 14.9 MB.");
			const type = exported.frames === 0 ? file.type || "image/gif" : "image/gif";
			const blob = new Blob([exported.buffer], { type });
			remember({
				url: URL.createObjectURL(blob),
				bytes: blob.size,
				width: exported.width,
				height: exported.height,
				frames: exported.frames,
				fps: exported.fps,
				colors: exported.colors
			});
		} catch (cause) {
			if (jobRef.current !== job) return;
			const message = cause instanceof Error ? cause.message : "Export failed.";
			if (message !== "cancelled") setError(message);
		} finally {
			if (jobRef.current === job) {
				setBusy(false);
				setProgress(null);
			}
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-4 pb-40",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-lg border border-line bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-xl font-semibold",
						children: "Same size, smaller file"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 max-w-2xl text-sm text-muted",
						children: "The picture is not resized. A GIF over 14.9 MB is optimized the way EZGIF does it: frame optimize, then lossy compression, then fewer colors only if it still will not fit. The export still locks at 14.9 MB."
					}),
					file ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-sm text-ink",
						children: [
							file.name,
							" · ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: over ? "text-amber" : "text-ink",
								children: [formatMb(file.size), " MB"]
							}),
							over ? " · starts over 14.9 MB" : " · starts under 14.9 MB"
						]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				"aria-label": "Compress preview",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-2 flex items-baseline justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-xl font-semibold",
						children: "GIF"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2",
						children: [file ? "Replace GIF" : "Add GIF", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							id: "compress-gif",
							type: "file",
							accept: ACCEPT,
							className: "sr-only",
							onChange: (event) => {
								take(event.target.files?.[0] ?? null);
								event.target.value = "";
							}
						})]
					})]
				}), url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: url,
					alt: "",
					className: "mx-auto max-h-[48dvh] w-auto max-w-full rounded-lg bg-mat-black object-contain"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface text-muted hover:text-ink",
					children: ["Drop a GIF to lock at 14.9 MB", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						id: "compress-drop",
						type: "file",
						accept: ACCEPT,
						className: "sr-only",
						onChange: (event) => {
							take(event.target.files?.[0] ?? null);
							event.target.value = "";
						}
					})]
				})]
			}),
			result ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResultCard, {
				result,
				before: file?.size,
				downloadName: "splice-149.gif",
				note: "Locked at 14.9 MB. Nothing from this app exports smaller."
			}) : null,
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-amber",
				children: error
			}) : null
		]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExportBar, {
		busy,
		progress,
		hint: file ? "Keeps the pixel size. Lossy-optimizes only if the file is over 14.9 MB." : "Add a GIF. The picture will not be resized.",
		ready: !!file && !busy,
		action: "Lock 14.9",
		downloadName: "splice-149.gif",
		result,
		onRun: () => void onExport()
	})] });
}
var RATIOS = [
	{
		id: "free",
		label: "Free",
		value: 0
	},
	{
		id: "square",
		label: "Square",
		value: 1
	},
	{
		id: "four",
		label: "4:3",
		value: 4 / 3
	},
	{
		id: "wide",
		label: "16:9",
		value: 16 / 9
	},
	{
		id: "story",
		label: "9:16",
		value: 9 / 16
	}
];
var START = {
	x: .08,
	y: .08,
	w: .84,
	h: .84
};
function CropTool() {
	const [file, setFile] = (0, import_react.useState)(null);
	const [url, setUrl] = (0, import_react.useState)(null);
	const [dims, setDims] = (0, import_react.useState)({
		w: 1,
		h: 1
	});
	const [ratio, setRatio] = (0, import_react.useState)("free");
	const [crop, setCrop] = (0, import_react.useState)(START);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [progress, setProgress] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const { result, remember } = useToolResult();
	const frameRef = (0, import_react.useRef)(null);
	const jobRef = (0, import_react.useRef)(0);
	function take(next) {
		setUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return next ? URL.createObjectURL(next) : null;
		});
		setFile(next);
		setCrop(START);
		setRatio("free");
		remember(null);
		setError(null);
	}
	function setLocked(next) {
		setRatio(next);
		const spec = RATIOS.find((item) => item.id === next);
		if (!spec || spec.value === 0) return;
		setCrop((current) => fitRatio(current, spec.value, dims.w / dims.h));
		remember(null);
	}
	function beginDrag(event, handle) {
		const box = frameRef.current?.getBoundingClientRect();
		if (!box) return;
		event.preventDefault();
		event.stopPropagation();
		const start = {
			...crop,
			px: event.clientX,
			py: event.clientY,
			box
		};
		const aspect = RATIOS.find((item) => item.id === ratio)?.value ?? 0;
		const imageAspect = dims.w / dims.h;
		const move = (ev) => {
			const dx = (ev.clientX - start.px) / start.box.width;
			const dy = (ev.clientY - start.py) / start.box.height;
			if (handle === "move") {
				setCrop({
					x: clamp$1(start.x + dx, 0, 1 - start.w),
					y: clamp$1(start.y + dy, 0, 1 - start.h),
					w: start.w,
					h: start.h
				});
				return;
			}
			setCrop(resizeCrop(start, dx, dy, handle, aspect, imageAspect));
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			remember(null);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up, { once: true });
	}
	async function onExport() {
		if (!file || busy) return;
		const job = ++jobRef.current;
		setBusy(true);
		setError(null);
		setProgress({
			ratio: .04,
			label: "Cropping"
		});
		try {
			const exported = await exportSingle({
				op: "crop",
				file,
				crop,
				onProgress: (next) => {
					if (jobRef.current === job) setProgress(next);
				}
			});
			if (jobRef.current !== job) return;
			if (exported.bytes > 149e5) throw new Error("Export came out over 14.9 MB.");
			const blob = new Blob([exported.buffer], { type: "image/gif" });
			remember({
				url: URL.createObjectURL(blob),
				bytes: blob.size,
				width: exported.width,
				height: exported.height,
				frames: exported.frames,
				fps: exported.fps,
				colors: exported.colors
			});
		} catch (cause) {
			if (jobRef.current !== job) return;
			const message = cause instanceof Error ? cause.message : "Export failed.";
			if (message !== "cancelled") setError(message);
		} finally {
			if (jobRef.current === job) {
				setBusy(false);
				setProgress(null);
			}
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-4 pb-40",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "rounded-lg border border-line bg-surface p-3 sm:p-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
					label: "Crop shape",
					children: RATIOS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
						active: ratio === item.id,
						onClick: () => setLocked(item.id),
						children: item.label
					}, item.id))
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				"aria-label": "Crop preview",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-2 flex items-baseline justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl font-semibold",
							children: "Frame"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2",
							children: [file ? "Replace GIF" : "Add GIF", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								id: "crop-gif",
								type: "file",
								accept: ACCEPT,
								className: "sr-only",
								onChange: (event) => {
									take(event.target.files?.[0] ?? null);
									event.target.value = "";
								}
							})]
						})]
					}),
					url ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						ref: frameRef,
						className: "relative mx-auto w-fit max-w-full touch-none",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: url,
								alt: "",
								draggable: false,
								onLoad: (event) => {
									const img = event.currentTarget;
									setDims({
										w: img.naturalWidth || 1,
										h: img.naturalHeight || 1
									});
								},
								className: "max-h-[52dvh] w-auto max-w-full rounded-lg object-contain"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "pointer-events-none absolute inset-0",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "absolute inset-x-0 top-0 bg-canvas/70",
										style: { height: `${crop.y * 100}%` }
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "absolute inset-x-0 bottom-0 bg-canvas/70",
										style: { height: `${(1 - crop.y - crop.h) * 100}%` }
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "absolute left-0 bg-canvas/70",
										style: {
											top: `${crop.y * 100}%`,
											height: `${crop.h * 100}%`,
											width: `${crop.x * 100}%`
										}
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "absolute right-0 bg-canvas/70",
										style: {
											top: `${crop.y * 100}%`,
											height: `${crop.h * 100}%`,
											width: `${(1 - crop.x - crop.w) * 100}%`
										}
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "absolute cursor-move border-2 border-amber",
								style: {
									left: `${crop.x * 100}%`,
									top: `${crop.y * 100}%`,
									width: `${crop.w * 100}%`,
									height: `${crop.h * 100}%`
								},
								onPointerDown: (event) => beginDrag(event, "move"),
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "pointer-events-none absolute inset-0",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-y-0 left-1/3 w-px bg-ink/30" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-y-0 left-2/3 w-px bg-ink/30" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-x-0 top-1/3 h-px bg-ink/30" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-x-0 top-2/3 h-px bg-ink/30" })
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HandleCorner, {
										place: "nw",
										onPointerDown: (event) => beginDrag(event, "nw")
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HandleCorner, {
										place: "ne",
										onPointerDown: (event) => beginDrag(event, "ne")
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HandleCorner, {
										place: "sw",
										onPointerDown: (event) => beginDrag(event, "sw")
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HandleCorner, {
										place: "se",
										onPointerDown: (event) => beginDrag(event, "se")
									})
								]
							})
						]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface text-muted hover:text-ink",
						children: ["Drop a GIF to crop", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							id: "crop-drop",
							type: "file",
							accept: ACCEPT,
							className: "sr-only",
							onChange: (event) => {
								take(event.target.files?.[0] ?? null);
								event.target.value = "";
							}
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted",
						children: "Drag the box to move it. Drag a corner to resize. The GIF keeps its timing."
					})
				]
			}),
			result ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResultCard, {
				result,
				before: file?.size,
				downloadName: "splice-crop.gif",
				note: "Cropped with the collage export and filled to 14.9 MB."
			}) : null,
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-amber",
				children: error
			}) : null
		]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExportBar, {
		busy,
		progress,
		hint: file ? "Set the frame, then export the crop." : "Add a GIF to crop it.",
		ready: !!file && !busy,
		action: "Export crop",
		downloadName: "splice-crop.gif",
		result,
		onRun: () => void onExport()
	})] });
}
function HandleCorner({ place, onPointerDown }) {
	const pos = {
		nw: "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
		ne: "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
		sw: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
		se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize"
	}[place];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		"aria-label": `Resize from ${place}`,
		onPointerDown,
		className: `absolute z-10 flex size-11 items-center justify-center ${pos}`,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-3.5 rounded-sm border-2 border-amber-ink bg-amber" })
	});
}
function fitRatio(crop, ratio, imageAspect) {
	const cx = crop.x + crop.w / 2;
	const cy = crop.y + crop.h / 2;
	let w = crop.w;
	let h = w * imageAspect / ratio;
	if (h > 1) {
		h = 1;
		w = h * ratio / imageAspect;
	}
	if (w > 1) {
		w = 1;
		h = w * imageAspect / ratio;
	}
	return {
		x: clamp$1(cx - w / 2, 0, 1 - w),
		y: clamp$1(cy - h / 2, 0, 1 - h),
		w,
		h
	};
}
function resizeCrop(start, dx, dy, handle, ratio, imageAspect) {
	let x = start.x;
	let y = start.y;
	let w = start.w;
	let h = start.h;
	if (handle === "se") {
		w = start.w + dx;
		h = start.h + dy;
	} else if (handle === "sw") {
		w = start.w - dx;
		h = start.h + dy;
		x = start.x + dx;
	} else if (handle === "ne") {
		w = start.w + dx;
		h = start.h - dy;
		y = start.y + dy;
	} else {
		w = start.w - dx;
		h = start.h - dy;
		x = start.x + dx;
		y = start.y + dy;
	}
	w = Math.max(.12, w);
	h = Math.max(.12, h);
	if (ratio > 0 && imageAspect > 0) {
		h = w * imageAspect / ratio;
		if (handle === "nw" || handle === "ne") y = start.y + start.h - h;
		if (handle === "nw" || handle === "sw") x = start.x + start.w - w;
	}
	if (x < 0) {
		w += x;
		x = 0;
	}
	if (y < 0) {
		h += y;
		y = 0;
	}
	if (x + w > 1) w = 1 - x;
	if (y + h > 1) h = 1 - y;
	w = Math.max(.12, Math.min(1, w));
	h = Math.max(.12, Math.min(1, h));
	if (x + w > 1) x = 1 - w;
	if (y + h > 1) y = 1 - h;
	return {
		x: clamp$1(x, 0, 1),
		y: clamp$1(y, 0, 1),
		w,
		h
	};
}
function clamp$1(n, min, max) {
	return Math.min(max, Math.max(min, n));
}
var APPLE = "https://cdn.jsdelivr.net/gh/iamcal/emoji-data@15.1.2/img-apple-";
var bitmapCache = /* @__PURE__ */ new Map();
var EMOJI_GROUPS = [
	{
		id: "recent",
		label: "Often",
		icon: "🕐",
		glyphs: "😂❤️🔥✨😭😍👍🙌💀👀🎬📺💯🤣🙏👑🎉⭐"
	},
	{
		id: "faces",
		label: "Faces",
		icon: "😀",
		glyphs: "😀😃😄😁😆😅😂🤣🙂😉😊😇🥰😍🤩😘😗😚😙🥲😋😛😜🤪😝🤑🤗🤭🫢🫣🤫🤔🫡🤐🤨😐😑😶🫥😏😒🙄😬😮‍💨🤥😌😔😪🤤😴😷🤒🤕🤢🤮🥵🥶🥴😵🤯🤠🥳🥸😎🤓🧐😕🫤😟🙁☹️😮😯😲😳🥺🥹😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖"
	},
	{
		id: "hands",
		label: "Hands",
		icon: "👋",
		glyphs: "👋🤚🖐️✋🖖👌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆👇☝️👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏💪👀👁️👅👄💋💅"
	},
	{
		id: "hearts",
		label: "Hearts",
		icon: "❤️",
		glyphs: "❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟♥️😻❤️‍🔥❤️‍🩹💯💢💥💫⭐🌟✨⚡🔥"
	},
	{
		id: "nature",
		label: "Nature",
		icon: "🐶",
		glyphs: "🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🌸🌹🌺🌻🌼🌷🌱🍀🍁"
	},
	{
		id: "food",
		label: "Food",
		icon: "🍔",
		glyphs: "🍎🍊🍋🍉🍇🍓🍒🍑🍍🥭🍌🥝🍅🥑🌽🥕🍞🧀🍔🍟🍕🌭🥪🌮🍿🍩🍪🎂🍰☕🍺🍷🥤🧋"
	},
	{
		id: "fun",
		label: "Fun",
		icon: "🎬",
		glyphs: "⚽🏀🏈⚾🎾🏐🎱🏓🎬🎤🎧🎹🥁🎷🎺🎸🎮🕹️🎲🎯🏆🥇🎪🎭🎨🎤📺📻📷📸📹🎥🎞️🎭"
	},
	{
		id: "marks",
		label: "Marks",
		icon: "💯",
		glyphs: "✅❌❓❗‼️💯🔴🟠🟡🟢🔵🟣⚫⚪🟤💬🗯️💭🔔🔕💤🎵🎶➕➖✳️❇️🔴⚠️🚫🔞🆒🆕🆓🆗🆙"
	}
];
function splitGlyphs(glyphs) {
	if (typeof Intl !== "undefined" && "Segmenter" in Intl) return [...new Intl.Segmenter(void 0, { granularity: "grapheme" }).segment(glyphs)].map((part) => part.segment);
	return Array.from(glyphs);
}
function isEmojiGrapheme(glyph) {
	return /\p{Extended_Pictographic}/u.test(glyph);
}
/** Apple image names keep the variation selector (2764-fe0f), so try that before stripping it. */
function appleCodes(glyph) {
	const cps = [];
	for (const ch of glyph) {
		const cp = ch.codePointAt(0);
		if (cp === void 0 || cp === 65038) continue;
		cps.push(cp.toString(16));
	}
	const full = cps.join("-");
	const stripped = cps.filter((cp) => cp !== "fe0f").join("-");
	if (!full) return [];
	return full === stripped ? [full] : [full, stripped];
}
function appleEmojiCandidates(glyph, size = 64) {
	return appleCodes(glyph).map((code) => `${APPLE}${size}/${code}.png`);
}
function loadAppleEmoji(glyph) {
	const existing = bitmapCache.get(glyph);
	if (existing) return existing;
	const pending = (async () => {
		for (const url of appleEmojiCandidates(glyph, 160)) {
			const res = await fetch(url);
			if (!res.ok) continue;
			return createImageBitmap(await res.blob());
		}
		throw new Error("Couldn't load that iOS emoji.");
	})();
	bitmapCache.set(glyph, pending);
	pending.catch(() => bitmapCache.delete(glyph));
	return pending;
}
var TEXT_SIZES = {
	s: .046,
	m: .07,
	l: .1
};
var TEXT_COLORS = {
	white: "#e7eef8",
	black: "#05070d",
	blue: "#5b8cff"
};
var FAMILY = "Outfit, ui-sans-serif, sans-serif";
async function renderTextOverlay(width, height, text, options, stickers = []) {
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(2, width);
	canvas.height = Math.max(2, height);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Couldn't draw the caption.");
	const fontPx = Math.max(18, Math.round(width * TEXT_SIZES[options.size]));
	const weight = options.bold ? 700 : 500;
	await document.fonts.load(`${weight} ${fontPx}px Outfit`);
	await document.fonts.ready;
	ctx.font = `${weight} ${fontPx}px ${FAMILY}`;
	ctx.textBaseline = "middle";
	const needed = /* @__PURE__ */ new Set();
	for (const glyph of splitGlyphs(text)) if (isEmojiGrapheme(glyph)) needed.add(glyph);
	for (const sticker of stickers) needed.add(sticker.glyph);
	const images = /* @__PURE__ */ new Map();
	await Promise.all([...needed].map(async (glyph) => {
		images.set(glyph, await loadAppleEmoji(glyph));
	}));
	const emojiW = fontPx * 1.08;
	const measure = (glyph) => isEmojiGrapheme(glyph) && images.has(glyph) ? emojiW : ctx.measureText(glyph).width;
	const lines = wrapGraphemes(splitGlyphs(text.trim()), width * .86, measure).slice(0, 5);
	const lineH = fontPx * 1.28;
	const widths = lines.map((line) => line.reduce((sum, glyph) => sum + measure(glyph), 0));
	const blockW = Math.max(fontPx, ...widths, 0);
	const blockH = Math.max(1, lines.length) * lineH;
	const x = width * options.nx;
	const y = height * options.ny;
	const hasText = lines.some((line) => line.length > 0);
	if (hasText && options.plate !== "none") {
		const padX = fontPx * .55;
		const padY = fontPx * .36;
		ctx.fillStyle = options.plate === "dark" ? "rgba(5,7,13,0.84)" : "rgba(231,238,248,0.94)";
		roundRect(ctx, x - blockW / 2 - padX, y - blockH / 2 - padY, blockW + padX * 2, blockH + padY * 2, fontPx * .38);
		ctx.fill();
	}
	ctx.fillStyle = options.plate === "light" && options.tone === "white" ? TEXT_COLORS.black : TEXT_COLORS[options.tone];
	if (hasText && options.plate === "none") {
		ctx.shadowColor = options.tone === "black" ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.88)";
		ctx.shadowBlur = fontPx * .18;
		ctx.shadowOffsetY = Math.max(1, fontPx * .04);
	}
	if (hasText) lines.forEach((line, index) => {
		const ly = y - blockH / 2 + lineH * index + lineH / 2;
		let cursor = x - (widths[index] ?? 0) / 2;
		for (const glyph of line) {
			const w = measure(glyph);
			const image = images.get(glyph);
			if (isEmojiGrapheme(glyph) && image) ctx.drawImage(image, cursor, ly - emojiW / 2, emojiW, emojiW);
			else {
				ctx.textAlign = "left";
				ctx.fillText(glyph, cursor, ly);
			}
			cursor += w;
		}
	});
	ctx.shadowColor = "rgba(0,0,0,0.45)";
	ctx.shadowBlur = Math.max(6, fontPx * .12);
	ctx.shadowOffsetY = Math.max(2, fontPx * .04);
	for (const sticker of stickers) {
		const image = images.get(sticker.glyph);
		if (!image) continue;
		const size = Math.max(24, width * sticker.scale);
		ctx.drawImage(image, width * sticker.nx - size / 2, height * sticker.ny - size / 2, size, size);
	}
	return createImageBitmap(canvas);
}
function wrapGraphemes(parts, maxWidth, measure) {
	const lines = [];
	let line = [];
	let width = 0;
	const flush = () => {
		while (line[0] === " ") line.shift();
		while (line[line.length - 1] === " ") line.pop();
		if (line.length > 0) lines.push(line);
		line = [];
		width = 0;
	};
	for (const part of parts) {
		if (part === "\n") {
			flush();
			continue;
		}
		const w = measure(part);
		if (width + w > maxWidth && line.length > 0) {
			flush();
			if (part === " ") continue;
		}
		if (part === " " && line.length === 0) continue;
		line.push(part);
		width += w;
	}
	flush();
	return lines;
}
function roundRect(ctx, x, y, w, h, radius) {
	const r = Math.min(radius, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}
var SIZES = [
	{
		id: "s",
		label: "Small"
	},
	{
		id: "m",
		label: "Medium"
	},
	{
		id: "l",
		label: "Large"
	}
];
var EMOJI_SCALES = {
	s: .1,
	m: .16,
	l: .24
};
var TONES = [
	{
		id: "white",
		label: "White"
	},
	{
		id: "black",
		label: "Black"
	},
	{
		id: "blue",
		label: "Blue"
	}
];
var PLATES = [
	{
		id: "none",
		label: "Shadow"
	},
	{
		id: "dark",
		label: "Dark plate"
	},
	{
		id: "light",
		label: "Light plate"
	}
];
function TextTool() {
	const [file, setFile] = (0, import_react.useState)(null);
	const [url, setUrl] = (0, import_react.useState)(null);
	const [text, setText] = (0, import_react.useState)("");
	const [size, setSize] = (0, import_react.useState)("m");
	const [emojiSize, setEmojiSize] = (0, import_react.useState)("m");
	const [tone, setTone] = (0, import_react.useState)("white");
	const [plate, setPlate] = (0, import_react.useState)("dark");
	const [bold, setBold] = (0, import_react.useState)(true);
	const [pos, setPos] = (0, import_react.useState)({
		x: .5,
		y: .78
	});
	const [stickers, setStickers] = (0, import_react.useState)([]);
	const [selected, setSelected] = (0, import_react.useState)(null);
	const [group, setGroup] = (0, import_react.useState)(EMOJI_GROUPS[0]?.id ?? "faces");
	const [ghost, setGhost] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [progress, setProgress] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const { result, remember } = useToolResult();
	const frameRef = (0, import_react.useRef)(null);
	const jobRef = (0, import_react.useRef)(0);
	const nextId = (0, import_react.useRef)(1);
	function take(next) {
		setUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return next ? URL.createObjectURL(next) : null;
		});
		setFile(next);
		remember(null);
		setError(null);
	}
	function placeEmoji(glyph, at) {
		const id = nextId.current++;
		const scale = EMOJI_SCALES[emojiSize];
		setStickers((list) => {
			const n = list.length;
			const x = at ? clamp(at.x) : clamp(.5 + (n % 3 - 1) * .14);
			const y = at ? clamp(at.y) : clamp(.46 + (Math.floor(n / 3) % 3 - 1) * .12);
			return [...list, {
				id,
				glyph,
				x,
				y,
				scale
			}];
		});
		setSelected(id);
		remember(null);
	}
	function onCaption(value) {
		const parts = splitGlyphs(value);
		let plain = "";
		const dropped = [];
		for (const part of parts) if (isEmojiGrapheme(part)) dropped.push(part);
		else plain += part;
		setText(plain);
		remember(null);
		if (!file && dropped.length > 0) {
			setError("Add a GIF first, then drag emoji onto it.");
			return;
		}
		for (const glyph of dropped) placeEmoji(glyph);
	}
	function onEmojiPointerDown(event, glyph) {
		if (!file) {
			setError("Add a GIF first, then drag emoji onto it.");
			return;
		}
		const startX = event.clientX;
		const startY = event.clientY;
		let moved = false;
		const move = (ev) => {
			if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
				moved = true;
				setGhost({
					glyph,
					x: ev.clientX,
					y: ev.clientY
				});
			}
		};
		const up = (ev) => {
			window.removeEventListener("pointermove", move);
			setGhost(null);
			const box = frameRef.current?.getBoundingClientRect();
			if (!!box && ev.clientX >= box.left && ev.clientX <= box.right && ev.clientY >= box.top && ev.clientY <= box.bottom && box && box.width > 0 && box.height > 0) {
				placeEmoji(glyph, {
					x: (ev.clientX - box.left) / box.width,
					y: (ev.clientY - box.top) / box.height
				});
				return;
			}
			if (!moved) placeEmoji(glyph);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up, { once: true });
	}
	function dragPlaced(event, current, apply) {
		const box = frameRef.current?.getBoundingClientRect();
		if (!box) return;
		event.preventDefault();
		event.stopPropagation();
		remember(null);
		const node = event.currentTarget;
		node.setPointerCapture(event.pointerId);
		const dx = event.clientX - (box.left + current.x * box.width);
		const dy = event.clientY - (box.top + current.y * box.height);
		const move = (ev) => {
			const b = frameRef.current?.getBoundingClientRect();
			if (!b || b.width === 0 || b.height === 0) return;
			apply(clamp((ev.clientX - dx - b.left) / b.width), clamp((ev.clientY - dy - b.top) / b.height));
		};
		const end = () => node.removeEventListener("pointermove", move);
		node.addEventListener("pointermove", move);
		node.addEventListener("pointerup", end, { once: true });
		node.addEventListener("pointercancel", end, { once: true });
	}
	function setStickerScale(next) {
		setEmojiSize(next);
		if (typeof selected === "number") {
			const scale = EMOJI_SCALES[next];
			setStickers((list) => list.map((item) => item.id === selected ? {
				...item,
				scale
			} : item));
		}
		remember(null);
	}
	async function onExport() {
		if (!file || busy) return;
		if (!text.trim() && stickers.length === 0) return;
		const job = ++jobRef.current;
		setBusy(true);
		setError(null);
		setProgress({
			ratio: .04,
			label: "Drawing caption"
		});
		try {
			const probe = await createImageBitmap(file);
			const width = probe.width % 2 === 0 ? probe.width : probe.width - 1;
			const height = probe.height % 2 === 0 ? probe.height : probe.height - 1;
			probe.close();
			const overlay = await renderTextOverlay(Math.max(2, width), Math.max(2, height), text, {
				nx: pos.x,
				ny: pos.y,
				size,
				tone,
				plate,
				bold
			}, stickers.map((item) => ({
				glyph: item.glyph,
				nx: item.x,
				ny: item.y,
				scale: item.scale
			})));
			if (jobRef.current !== job) {
				overlay.close();
				return;
			}
			const exported = await exportSingle({
				op: "text",
				file,
				overlay,
				onProgress: (next) => {
					if (jobRef.current === job) setProgress(next);
				}
			});
			if (jobRef.current !== job) return;
			if (exported.bytes > 149e5) throw new Error("Export came out over 14.9 MB.");
			const blob = new Blob([exported.buffer], { type: "image/gif" });
			remember({
				url: URL.createObjectURL(blob),
				bytes: blob.size,
				width: exported.width,
				height: exported.height,
				frames: exported.frames,
				fps: exported.fps,
				colors: exported.colors
			});
		} catch (cause) {
			if (jobRef.current !== job) return;
			const message = cause instanceof Error ? cause.message : "Export failed.";
			if (message !== "cancelled") setError(message);
		} finally {
			if (jobRef.current === job) {
				setBusy(false);
				setProgress(null);
			}
		}
	}
	const active = EMOJI_GROUPS.find((item) => item.id === group) ?? EMOJI_GROUPS[0];
	const glyphs = active ? splitGlyphs(active.glyphs) : [];
	const ready = !!file && (text.trim().length > 0 || stickers.length > 0) && !busy;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-4 pb-40",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "rounded-lg border border-line bg-surface p-3 sm:p-4",
					"aria-label": "Caption",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex flex-col gap-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs font-medium tracking-wide text-muted uppercase",
									children: "Caption"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
									value: text,
									rows: 2,
									maxLength: 180,
									placeholder: "Type a caption, then drag it on the GIF",
									onChange: (event) => onCaption(event.target.value),
									className: "min-h-20 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-base text-ink outline-none focus:border-amber"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-lg border border-line bg-canvas",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center justify-between gap-3 px-2 pt-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-xs font-medium tracking-wide text-muted uppercase",
											children: "iOS emoji"
										}), typeof selected === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "text-sm font-medium text-amber",
											onClick: () => {
												setStickers((list) => list.filter((item) => item.id !== selected));
												setSelected(null);
												remember(null);
											},
											children: "Remove selected"
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-sm text-muted",
											children: "Drag onto the GIF"
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "flex gap-1 overflow-x-auto p-1",
										"aria-label": "Emoji categories",
										children: EMOJI_GROUPS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											type: "button",
											"aria-pressed": item.id === group,
											onClick: () => setGroup(item.id),
											className: clsx("inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm", item.id === group ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface"),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmojiImg, {
												glyph: item.icon,
												size: 64,
												className: "size-5"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "hidden sm:inline",
												children: item.label
											})]
										}, item.id))
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto px-1 pb-1",
										children: glyphs.map((glyph, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											"aria-label": `Place ${glyph}`,
											onPointerDown: (event) => onEmojiPointerDown(event, glyph),
											className: "inline-flex h-11 items-center justify-center rounded-md hover:bg-surface-2",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmojiImg, {
												glyph,
												size: 64,
												className: "size-7"
											})
										}, `${group}-${index}`))
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-2 gap-3 lg:grid-cols-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
										label: "Text size",
										children: SIZES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
											active: size === item.id,
											onClick: () => {
												setSize(item.id);
												remember(null);
											},
											children: item.label
										}, item.id))
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
										label: "Emoji size",
										children: SIZES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
											active: emojiSize === item.id,
											onClick: () => setStickerScale(item.id),
											children: item.label
										}, item.id))
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
										label: "Color",
										children: TONES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
											active: tone === item.id,
											onClick: () => {
												setTone(item.id);
												remember(null);
											},
											children: item.label
										}, item.id))
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
										label: "Backing",
										children: PLATES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
											active: plate === item.id,
											onClick: () => {
												setPlate(item.id);
												remember(null);
											},
											children: item.label
										}, item.id))
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Choice, {
										label: "Weight",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
											active: !bold,
											onClick: () => {
												setBold(false);
												remember(null);
											},
											children: "Regular"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
											active: bold,
											onClick: () => {
												setBold(true);
												remember(null);
											},
											children: "Bold"
										})]
									})
								]
							})
						]
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					"aria-label": "Text preview",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-2 flex items-baseline justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-xl font-semibold",
								children: "Preview"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2",
								children: [file ? "Replace GIF" : "Add GIF", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									id: "text-gif",
									type: "file",
									accept: ACCEPT,
									className: "sr-only",
									onChange: (event) => {
										take(event.target.files?.[0] ?? null);
										event.target.value = "";
									}
								})]
							})]
						}),
						url ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							ref: frameRef,
							className: "relative mx-auto w-fit max-w-full overflow-hidden rounded-lg bg-mat-black",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: url,
								alt: "",
								draggable: false,
								className: "mx-auto block max-h-[48dvh] w-auto max-w-full"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "absolute inset-0",
								style: { containerType: "inline-size" },
								onPointerDown: (event) => {
									if (event.target === event.currentTarget) setSelected(null);
								},
								children: [
									text.trim() ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										role: "button",
										tabIndex: 0,
										"aria-label": "Drag caption",
										className: clsx("absolute z-10 max-w-[88%] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none text-center leading-tight select-none active:cursor-grabbing", plate === "dark" && "rounded-md bg-canvas/80 px-[0.6em] py-[0.3em]", plate === "light" && "rounded-md bg-mat-paper px-[0.6em] py-[0.3em]", selected === "text" && "ring-2 ring-amber"),
										style: {
											left: `${pos.x * 100}%`,
											top: `${pos.y * 100}%`,
											fontSize: `${TEXT_SIZES[size] * 100}cqi`,
											fontWeight: bold ? 700 : 500,
											color: plate === "light" && tone === "white" ? TEXT_COLORS.black : TEXT_COLORS[tone],
											textShadow: plate === "none" ? tone === "black" ? "0 1px 2px rgba(255,255,255,0.9)" : "0 2px 10px rgba(0,0,0,0.85)" : void 0
										},
										onPointerDown: (event) => {
											setSelected("text");
											dragPlaced(event, pos, (x, y) => setPos({
												x,
												y
											}));
										},
										children: text
									}) : null,
									stickers.map((sticker) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										role: "button",
										tabIndex: 0,
										"aria-label": `Drag emoji ${sticker.glyph}`,
										className: clsx("absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none active:cursor-grabbing", selected === sticker.id && "z-30 rounded-md ring-2 ring-amber"),
										style: {
											left: `${sticker.x * 100}%`,
											top: `${sticker.y * 100}%`,
											width: `${sticker.scale * 100}cqi`
										},
										onPointerDown: (event) => {
											setSelected(sticker.id);
											dragPlaced(event, sticker, (x, y) => {
												setStickers((list) => list.map((item) => item.id === sticker.id ? {
													...item,
													x,
													y
												} : item));
											});
										},
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmojiImg, {
											glyph: sticker.glyph,
											size: 160,
											className: "pointer-events-none h-auto w-full"
										}), selected === sticker.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											"aria-label": "Remove emoji",
											className: "absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full border border-line bg-canvas text-sm text-ink",
											onPointerDown: (event) => {
												event.stopPropagation();
												event.preventDefault();
												setStickers((list) => list.filter((item) => item.id !== sticker.id));
												setSelected(null);
												remember(null);
											},
											children: "×"
										}) : null]
									}, sticker.id)),
									!text.trim() && stickers.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-muted",
										children: "Drag a caption or an emoji onto the GIF."
									}) : null
								]
							})]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface text-muted hover:text-ink",
							children: ["Drop a GIF here", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								id: "text-drop",
								type: "file",
								accept: ACCEPT,
								className: "sr-only",
								onChange: (event) => {
									take(event.target.files?.[0] ?? null);
									event.target.value = "";
								}
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-sm text-muted",
							children: "Emoji are Apple's iOS pictures, not your phone's font. Drag the caption and each emoji to the spot you want."
						})
					]
				}),
				result ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResultCard, {
					result,
					before: file?.size,
					downloadName: "splice-caption.gif",
					note: "Burned in with the same 14.9 MB collage export."
				}) : null,
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					role: "alert",
					className: "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-amber",
					children: error
				}) : null
			]
		}),
		ghost ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "pointer-events-none fixed z-50 w-16 -translate-x-1/2 -translate-y-1/2",
			style: {
				left: ghost.x,
				top: ghost.y
			},
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmojiImg, {
				glyph: ghost.glyph,
				size: 160,
				className: "h-auto w-full"
			})
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExportBar, {
			busy,
			progress,
			hint: file ? "Drag the caption and emoji into place, then burn them in." : "Add a GIF to caption it.",
			ready,
			action: "Burn onto GIF",
			downloadName: "splice-caption.gif",
			result,
			onRun: () => void onExport()
		})
	] });
}
function EmojiImg({ glyph, size, className }) {
	const candidates = appleEmojiCandidates(glyph, size);
	const [index, setIndex] = (0, import_react.useState)(0);
	const src = candidates[index];
	if (!src) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src,
		alt: "",
		draggable: false,
		className,
		onError: () => {
			if (index < candidates.length - 1) setIndex(index + 1);
		}
	});
}
function clamp(n) {
	return Math.min(.96, Math.max(.04, n));
}
var TOOLS = [
	{
		id: "collage",
		label: "Collage",
		blurb: "Grids and mosaics, locked at 14.9 MB.",
		icon: LayoutGrid
	},
	{
		id: "text",
		label: "Text",
		blurb: "Drag captions and iOS emoji. Export locks at 14.9 MB.",
		icon: Type
	},
	{
		id: "crop",
		label: "Crop",
		blurb: "Trim the frame. Export locks at 14.9 MB.",
		icon: Crop
	},
	{
		id: "compress",
		label: "Compress",
		blurb: "EZGIF-style optimize. The picture is not resized.",
		icon: Shrink
	}
];
function SpliceApp() {
	const [tool, setTool] = (0, import_react.useState)("collage");
	const current = TOOLS.find((item) => item.id === tool) ?? TOOLS[0];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "min-h-screen text-ink",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "flex items-end justify-between gap-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[11px] font-medium tracking-[0.22em] text-amber uppercase",
								children: "GIF bench"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "font-display text-4xl leading-none font-semibold tracking-tight sm:text-5xl",
								children: "Splice"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 max-w-xl text-sm text-muted",
								children: current.blurb
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "shrink-0 text-right",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "block font-display text-3xl leading-none font-semibold text-amber",
							children: "14.9"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[11px] font-medium tracking-[0.18em] text-muted uppercase",
							children: "MB lock"
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
					className: "grid grid-cols-4 border-b border-line",
					"aria-label": "Tools",
					children: TOOLS.map((item) => {
						const Icon = item.icon;
						const active = item.id === tool;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							"aria-pressed": active,
							onClick: () => setTool(item.id),
							className: clsx("inline-flex h-12 items-center justify-center gap-1.5 border-b-2 px-1 text-sm font-medium", active ? "border-amber text-ink" : "border-transparent text-muted hover:text-ink"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
								className: "size-4 shrink-0",
								"aria-hidden": true
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate",
								children: item.label
							})]
						}, item.id);
					})
				}),
				tool === "collage" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CollageTool, {}) : null,
				tool === "text" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextTool, {}) : null,
				tool === "crop" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CropTool, {}) : null,
				tool === "compress" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompressTool, {}) : null
			]
		})
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SpliceApp, {});
}
//#endregion
export { Home as component };
