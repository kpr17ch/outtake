import {useCallback, useEffect, useMemo, useState} from "react";
import {
	AbsoluteFill,
	OffthreadVideo,
	Sequence,
	interpolate,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import {loadFont} from "@remotion/google-fonts/Inter";

const {fontFamily} = loadFont("normal", {
	weights: ["700", "900"],
	subsets: ["latin"],
});

interface AlignedWord {
	text: string;
	onsetMs: number;
}

export type SubtitleJobPreviewProps = {
	jobId?: string;
	videoSrc?: string;
	captionsSrc?: string;
};

const normalizeStaticPath = (input: string): string => {
	const value = (input || "").trim().replace(/\\/g, "/");
	if (!value) return "";

	const publicMarker = "/public/";
	const idx = value.indexOf(publicMarker);
	if (idx !== -1) {
		return value.slice(idx + publicMarker.length);
	}

	const withoutOrigin = value.replace(/^https?:\/\/[^/]+\//, "");

	return withoutOrigin.replace(/^\/+/, "");
};

const SingleWord: React.FC<{word: string}> = ({word}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const enterProgress = spring({
		frame,
		fps,
		config: {damping: 22, stiffness: 220},
		durationInFrames: Math.round(0.2 * fps),
	});

	const opacity = interpolate(enterProgress, [0, 1], [0, 1]);
	const scale = interpolate(enterProgress, [0, 1], [0.88, 1]);
	const translateY = interpolate(enterProgress, [0, 1], [8, 0]);

	return (
		<AbsoluteFill
			style={{
				justifyContent: "flex-end",
				alignItems: "center",
				paddingBottom: "12%",
				pointerEvents: "none",
			}}
		>
			<div
				style={{
					transform: `translateY(${translateY}px) scale(${scale})`,
					opacity,
					willChange: "transform, opacity",
				}}
			>
				<span
					style={{
						fontFamily,
						fontWeight: 900,
						fontSize: 72,
						color: "#ffffff",
						textAlign: "center",
						textShadow:
							"0 2px 16px rgba(0,0,0,0.85), 0 4px 40px rgba(0,0,0,0.5)",
						lineHeight: 1.2,
					}}
				>
					{word}
				</span>
			</div>
		</AbsoluteFill>
	);
};

export const OuttakesCaption: React.FC<SubtitleJobPreviewProps> = ({
	videoSrc = "OuttakesQuelle1.mp4",
	captionsSrc = "jobs/demo/aligned.json",
}) => {
	const {fps} = useVideoConfig();
	const [words, setWords] = useState<AlignedWord[] | null>(null);
	const normalizedCaptionsSrc = normalizeStaticPath(captionsSrc);
	const normalizedVideoSrc = normalizeStaticPath(videoSrc) || "OuttakesQuelle1.mp4";

	const fetchWords = useCallback(async () => {
		if (!normalizedCaptionsSrc) {
			setWords([]);
			return;
		}
		try {
			const response = await fetch(staticFile(normalizedCaptionsSrc));
			if (!response.ok) {
				console.error(
					`Failed to load captions JSON: ${normalizedCaptionsSrc} (${response.status})`,
				);
				setWords([]);
				return;
			}
			const data: AlignedWord[] = await response.json();
			setWords(Array.isArray(data) ? data : []);
		} catch (err) {
			console.error(`Error loading captions JSON from ${normalizedCaptionsSrc}`, err);
			setWords([]);
		}
	}, [normalizedCaptionsSrc]);

	useEffect(() => {
		fetchWords();
	}, [fetchWords]);

	const wordSequences = useMemo(() => {
		if (!words) return [];
		return words.map((word, i) => {
			const startFrame = Math.round((word.onsetMs / 1000) * fps);
			const nextOnsetMs =
				i + 1 < words.length ? words[i + 1].onsetMs : word.onsetMs + 600;
			const endFrame = Math.round((nextOnsetMs / 1000) * fps);
			const duration = Math.max(endFrame - startFrame, 1);
			return {word: word.text, from: startFrame, durationInFrames: duration};
		});
	}, [words, fps]);

	return (
		<AbsoluteFill style={{backgroundColor: "#000"}}>
			<OffthreadVideo
				src={staticFile(normalizedVideoSrc)}
				style={{width: "100%", height: "100%", objectFit: "cover"}}
			/>

			{wordSequences.map((seq, i) => (
				<Sequence
					key={`${seq.word}-${seq.from}`}
					from={seq.from}
					durationInFrames={seq.durationInFrames}
				>
					<SingleWord word={seq.word} />
				</Sequence>
			))}
		</AbsoluteFill>
	);
};
