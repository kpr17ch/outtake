#!/usr/bin/env node

import path from "path";
import fs from "fs";
import {execSync} from "child_process";
import {ElevenLabsClient} from "@elevenlabs/elevenlabs-js";
import "dotenv/config";

const args = process.argv.slice(2);

function getArg(name) {
	const idx = args.indexOf(`--${name}`);
	return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function hasFlag(name) {
	return args.includes(`--${name}`);
}

function safeJobId(input) {
	return input.replace(/[^a-zA-Z0-9-_]/g, "-");
}

function parseFraction(value, fallback) {
	if (!value || typeof value !== "string") return fallback;
	const [n, d] = value.split("/").map(Number);
	if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return fallback;
	return n / d;
}

function runJson(command) {
	const out = execSync(command, {encoding: "utf8"});
	return JSON.parse(out);
}

function ensureDir(dir) {
	fs.mkdirSync(dir, {recursive: true});
}

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
	fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const mode = getArg("mode") || "full";
const videoArg = getArg("video");
const providedJobId = getArg("jobId");
const patchPath = getArg("patch");
const explicitLanguage = getArg("lang");
const skipRender = hasFlag("skipRender");
const publicDir = path.join(process.cwd(), "public");
const outDir = path.join(process.cwd(), "out");
const fpsOverride = Number(getArg("fps") || 30);

if (mode !== "full" && mode !== "patch") {
	console.error("Invalid --mode. Use --mode full or --mode patch.");
	process.exit(1);
}

if (mode === "full" && !videoArg) {
	console.error("Usage (full): node transcribe-pipeline.mjs --video VIDEO.mp4 [--jobId id] [--lang eng] [--fps 30]");
	process.exit(1);
}

if (mode === "patch" && (!providedJobId || !patchPath)) {
	console.error("Usage (patch): node transcribe-pipeline.mjs --mode patch --jobId JOB_ID --patch patch.json");
	process.exit(1);
}

const videoName = mode === "full" ? path.basename(videoArg, path.extname(videoArg)) : "";
const jobId = safeJobId(providedJobId || `${videoName}-${Date.now()}`);
const jobPublicDir = path.join(publicDir, "jobs", jobId);
const jobOutDir = path.join(outDir, "jobs", jobId);
ensureDir(jobPublicDir);
ensureDir(jobOutDir);

const sourceVideoPath = mode === "full"
	? (path.isAbsolute(videoArg) ? videoArg : path.join(publicDir, videoArg))
	: path.join(jobPublicDir, "source.mp4");
const sourceVideoCopyPath = path.join(jobPublicDir, "source.mp4");
const audioPath = path.join(jobPublicDir, "audio.mp3");
const alignedPath = path.join(jobPublicDir, "aligned.json");
const resultPath = path.join(jobPublicDir, "result.json");
const previewPath = path.join(jobOutDir, "preview.mp4");

if (mode === "full") {
	if (!fs.existsSync(sourceVideoPath)) {
		console.error(`Video not found: ${sourceVideoPath}`);
		process.exit(1);
	}
	fs.copyFileSync(sourceVideoPath, sourceVideoCopyPath);
}

if (mode === "patch" && !fs.existsSync(alignedPath)) {
	console.error(`No aligned words found for job: ${alignedPath}`);
	process.exit(1);
}

const previousResult = fs.existsSync(resultPath) ? readJson(resultPath) : null;

console.log("\n=== TRANSCRIPTION PIPELINE ===");
console.log(`Mode: ${mode}`);
console.log(`Job:  ${jobId}`);
console.log(`Data: ${jobPublicDir}`);
console.log(`Out:  ${previewPath}\n`);

const ffprobeJson = runJson(
	`npx remotion ffprobe -v error -show_streams -show_format -print_format json "${sourceVideoCopyPath}"`
);
const videoStream = (ffprobeJson.streams || []).find((s) => s.codec_type === "video");
if (!videoStream) {
	console.error("No video stream detected.");
	process.exit(1);
}

const width = Number(videoStream.width || 1920);
const height = Number(videoStream.height || 1080);
const sourceFps = parseFraction(videoStream.avg_frame_rate || videoStream.r_frame_rate, 30);
const durationSec = Number(ffprobeJson.format?.duration || 0);
const fps = Number.isFinite(fpsOverride) && fpsOverride > 0 ? fpsOverride : sourceFps;
const sourceDurationMs = Math.max(0, Math.round(durationSec * 1000));
let renderDurationInFrames = Math.max(1, Math.ceil(durationSec * fps));

let aligned = [];
let detectedLanguage = "auto";
let corrections = 0;
let averageDeltaMs = 0;
let maxDeltaMs = 0;
let suspiciousRegions = [];

function enforceMonotonic(words, gapMs) {
	let last = 0;
	for (let i = 0; i < words.length; i++) {
		if (words[i].onsetMs < last + gapMs) {
			words[i].onsetMs = last + gapMs;
		}
		last = words[i].onsetMs;
	}
}

const MIN_GAP_MS = 50;

if (mode === "full") {
	console.log("[1/4] Extracting audio (MP3)...");
	execSync(
		`npx remotion ffmpeg -i "${sourceVideoCopyPath}" -vn -ar 16000 -ac 1 -b:a 64k -y "${audioPath}"`,
		{stdio: "pipe"}
	);

	console.log("[2/4] Transcribing with ElevenLabs Scribe v2...");
	const elevenlabs = new ElevenLabsClient();
	const audioBuffer = fs.readFileSync(audioPath);
	const audioBlob = new Blob([audioBuffer], {type: "audio/mpeg"});

	const convertOptions = {
		file: audioBlob,
		modelId: "scribe_v2",
		tagAudioEvents: false,
		diarize: false,
		timestampsGranularity: "word",
	};
	if (explicitLanguage) {
		convertOptions.languageCode = explicitLanguage;
	}

	const transcription = await elevenlabs.speechToText.convert(convertOptions);
	detectedLanguage = transcription.languageCode || explicitLanguage || "unknown";

	const elWords = (transcription.words || []).filter((w) => w.type === "word");
	console.log(`   Found ${elWords.length} words (lang: ${detectedLanguage})`);

	console.log("[3/4] Building aligned captions...");
	let prevOnsetMs = 0;
	aligned = elWords.map((w) => {
		const startMs = Math.round(w.start * 1000);
		const endMs = Math.round(w.end * 1000);
		let onsetMs = startMs;
		onsetMs = Math.max(onsetMs, prevOnsetMs + MIN_GAP_MS);
		prevOnsetMs = onsetMs;
		return {
			text: w.text,
			onsetMs,
			startMs,
			endMs,
		};
	});

	const speechEndMs = aligned.length > 0 ? aligned[aligned.length - 1].endMs : 0;
	const alignedTailMs = aligned.length > 0 ? aligned[aligned.length - 1].onsetMs + 1000 : 0;
	const targetDurationMs = Math.max(sourceDurationMs, speechEndMs, alignedTailMs);
	renderDurationInFrames = Math.max(1, Math.ceil((targetDurationMs / 1000) * fps) + 2);
} else {
	console.log("[1/3] Loading existing aligned job...");
	aligned = readJson(alignedPath);
	detectedLanguage = previousResult?.diagnostics?.detectedLanguage || "auto";

	console.log("[2/3] Applying patch file...");
	const patch = readJson(path.isAbsolute(patchPath) ? patchPath : path.join(process.cwd(), patchPath));
	const locked = new Set(Array.isArray(patch.locks) ? patch.locks : []);
	const changes = [];

	if (Array.isArray(patch.wordShifts)) {
		for (const shift of patch.wordShifts) {
			let targetIndex = Number.isInteger(shift.index) ? shift.index : -1;
			if (targetIndex < 0 && typeof shift.match === "string") {
				const matches = aligned
					.map((w, idx) => ({idx, isMatch: w.text.toLowerCase() === shift.match.toLowerCase()}))
					.filter((m) => m.isMatch)
					.map((m) => m.idx);
				const occurrence = Math.max(1, Number(shift.occurrence || 1));
				targetIndex = matches[occurrence - 1] ?? -1;
			}
			if (targetIndex >= 0 && targetIndex < aligned.length && !locked.has(targetIndex)) {
				const before = aligned[targetIndex].onsetMs;
				aligned[targetIndex].onsetMs += Number(shift.shiftMs || 0);
				changes.push({
					type: "wordShift",
					index: targetIndex,
					word: aligned[targetIndex].text,
					beforeMs: before,
					afterMs: aligned[targetIndex].onsetMs,
				});
			}
		}
	}

	if (Array.isArray(patch.rangeShifts)) {
		for (const rangeShift of patch.rangeShifts) {
			const fromMs = Number(rangeShift.fromMs ?? ((rangeShift.fromFrame ?? 0) * 1000) / fps);
			const toMs = Number(rangeShift.toMs ?? ((rangeShift.toFrame ?? 0) * 1000) / fps);
			const delta = Number(rangeShift.shiftMs || 0);
			for (let i = 0; i < aligned.length; i++) {
				if (locked.has(i)) continue;
				if (aligned[i].onsetMs >= fromMs && aligned[i].onsetMs <= toMs) {
					const before = aligned[i].onsetMs;
					aligned[i].onsetMs += delta;
					changes.push({
						type: "rangeShift",
						index: i,
						word: aligned[i].text,
						beforeMs: before,
						afterMs: aligned[i].onsetMs,
					});
				}
			}
		}
	}

	enforceMonotonic(aligned, 15);
	corrections = changes.length;
	averageDeltaMs = changes.length
		? Number(
				(
					changes.reduce((sum, c) => sum + Math.abs(c.afterMs - c.beforeMs), 0) /
					changes.length
				).toFixed(2)
		  )
		: 0;
	maxDeltaMs = changes.length
		? Math.max(...changes.map((c) => Math.abs(c.afterMs - c.beforeMs)))
		: 0;
	suspiciousRegions = [];
	renderDurationInFrames = previousResult?.media?.durationInFrames
		? Number(previousResult.media.durationInFrames)
		: Math.max(1, Math.ceil(durationSec * fps) + 2);
}

writeJson(alignedPath, aligned);

console.log(`[${mode === "full" ? "4/4" : "3/3"}] Rendering preview in Remotion...`);
if (!skipRender) {
	const props = {
		jobId,
		videoSrc: `jobs/${jobId}/source.mp4`,
		captionsSrc: `jobs/${jobId}/aligned.json`,
		durationInFrames: renderDurationInFrames,
		fps,
		width,
		height,
	};
	const escapedProps = JSON.stringify(props).replace(/"/g, '\\"');
	execSync(
		`npx remotion render src/index.ts SubtitleJobPreview "${previewPath}" --props "${escapedProps}" --concurrency=4`,
		{stdio: "pipe"}
	);
}

const result = {
	jobId,
	mode,
	input: {
		video: mode === "full" ? sourceVideoPath : sourceVideoCopyPath,
		languageInput: explicitLanguage || "auto",
		patchPath: mode === "patch" ? patchPath : null,
	},
	media: {
		fps,
		width,
		height,
		durationSec,
		sourceDurationMs,
		durationInFrames: renderDurationInFrames,
	},
	output: {
		alignedJson: alignedPath,
		previewMp4: skipRender ? null : previewPath,
	},
	diagnostics: {
		wordCount: aligned.length,
		correctedWordCount: corrections,
		averageDeltaMs,
		maxDeltaMs,
		suspiciousRegions,
		detectedLanguage,
	},
};

writeJson(resultPath, result);

console.log("\n=== JOB RESULT ===");
console.log(`alignedJson: ${result.output.alignedJson}`);
console.log(`previewMp4:  ${result.output.previewMp4 ?? "(skipped)"}`);
console.log(`wordCount:   ${result.diagnostics.wordCount}`);
console.log(`corrected:   ${result.diagnostics.correctedWordCount}`);
console.log(`avgDeltaMs:  ${result.diagnostics.averageDeltaMs}`);
console.log(`maxDeltaMs:  ${result.diagnostics.maxDeltaMs}`);
console.log(`language:    ${result.diagnostics.detectedLanguage}`);
console.log(`resultJson:  ${resultPath}`);
