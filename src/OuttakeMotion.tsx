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
	startMs: number;
	endMs: number;
}

export type OuttakeMotionProps = {
	videoSrc?: string;
	captionsSrc?: string;
	animationStart?: number;
	animationEnd?: number;
};

const WAVE_TRANSITION_FRAMES = 20;
const BG_COLOR = "#1a56db";

const DRIP_POINTS = [
	{xFrac: 0.0, delay: 0.0},
	{xFrac: 0.11, delay: 0.2},
	{xFrac: 0.24, delay: 0.04},
	{xFrac: 0.38, delay: 0.3},
	{xFrac: 0.5, delay: 0.08},
	{xFrac: 0.63, delay: 0.26},
	{xFrac: 0.76, delay: 0.02},
	{xFrac: 0.88, delay: 0.18},
	{xFrac: 1.0, delay: 0.1},
];

function smoothstep(t: number): number {
	const c = Math.max(0, Math.min(1, t));
	return c * c * (3 - 2 * c);
}

function buildSmoothCurve(points: {x: number; y: number}[]): string {
	if (points.length < 2) return "";
	const parts: string[] = [];
	const tension = 0.35;

	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[Math.max(0, i - 1)];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[Math.min(points.length - 1, i + 2)];

		const cp1x = p1.x + (p2.x - p0.x) * tension;
		const cp1y = p1.y + (p2.y - p0.y) * tension;
		const cp2x = p2.x - (p3.x - p1.x) * tension;
		const cp2y = p2.y - (p3.y - p1.y) * tension;

		parts.push(
			`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
		);
	}

	return parts.join(" ");
}

const LiquidWave: React.FC<{progress: number; color: string; direction: "in" | "out"}> = ({
	progress,
	color,
	direction,
}) => {
	const w = 1920;
	const h = 1080;
	const overflow = 350;

	const edgePoints = DRIP_POINTS.map((dp) => {
		const localP = Math.max(0, (progress - dp.delay) / (1 - dp.delay));
		const eased = smoothstep(localP);

		const y =
			direction === "in"
				? interpolate(eased, [0, 1], [-overflow, h + overflow], {extrapolateRight: "clamp"})
				: interpolate(eased, [0, 1], [h + overflow, -overflow], {extrapolateRight: "clamp"});

		return {x: dp.xFrac * w, y};
	});

	const rightToLeft = [...edgePoints].reverse();
	const curveSegments = buildSmoothCurve(rightToLeft);

	const pad = 20;
	const d = [
		`M ${-pad} ${-pad}`,
		`L ${w + pad} ${-pad}`,
		`L ${rightToLeft[0].x + pad} ${rightToLeft[0].y.toFixed(1)}`,
		curveSegments,
		`L ${-pad} ${rightToLeft[rightToLeft.length - 1].y.toFixed(1)}`,
		`Z`,
	].join(" ");

	return (
		<AbsoluteFill>
			<svg
				viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: "100%",
					height: "100%",
					overflow: "visible",
				}}
				preserveAspectRatio="none"
			>
				<path d={d} fill={color} />
			</svg>
		</AbsoluteFill>
	);
};

const ClapperboardOverlay: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const enterProgress = spring({
		frame,
		fps,
		config: {damping: 20, stiffness: 140},
		durationInFrames: Math.round(0.3 * fps),
	});
	const enterOpacity = interpolate(enterProgress, [0, 1], [0, 1]);
	const enterScale = interpolate(enterProgress, [0, 1], [0.6, 1]);
	const enterX = interpolate(enterProgress, [0, 1], [-80, 0]);

	const clapDelay = 6;
	const clapRaw = spring({
		frame: frame - clapDelay,
		fps,
		config: {damping: 10, stiffness: 260, mass: 0.6},
		durationInFrames: Math.round(0.35 * fps),
	});
	const clapProgress = frame >= clapDelay ? clapRaw : 0;
	const clapAngle = interpolate(clapProgress, [0, 1], [-40, 0], {extrapolateRight: "clamp"});

	const impactBounce =
		clapProgress > 0.85
			? interpolate(clapProgress, [0.85, 0.92, 1], [1, 1.06, 1], {extrapolateRight: "clamp"})
			: 1;

	const w = 180;
	const bodyW = w - 16;
	const bodyH = 120;
	const clapH = 36;
	const bodyX = 8;
	const bodyY = w - bodyH - 4;
	const clapY = bodyY - clapH;
	const stripeCount = 5;
	const stripeSlant = 12;

	return (
		<AbsoluteFill
			style={{
				justifyContent: "center",
				alignItems: "center",
				pointerEvents: "none",
			}}
		>
			<div
				style={{
					position: "absolute",
					left: "50%",
					top: "22%",
					marginLeft: -90,
					transform: `translateX(${enterX}px) scale(${enterScale * impactBounce})`,
					opacity: enterOpacity,
					willChange: "transform, opacity",
				}}
			>
				<svg width={w} height={w} viewBox={`0 0 ${w} ${w}`} style={{overflow: "visible"}}>
					<defs>
						<clipPath id="clapArm">
							<rect x={bodyX} y={clapY} width={bodyW} height={clapH} rx={5} />
						</clipPath>
						<clipPath id="clapBody">
							<rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={6} />
						</clipPath>
					</defs>

					<rect x={bodyX + 4} y={bodyY + 4} width={bodyW} height={bodyH} rx={6} fill="rgba(0,0,0,0.3)" />

					<rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={6} fill="#1c1c1e" />
					<rect x={bodyX + 8} y={bodyY + 8} width={bodyW - 16} height={bodyH - 16} rx={4} fill="#2c2c2e" />

					{[0, 1, 2, 3].map((i) => (
						<rect
							key={i}
							x={bodyX + 16}
							y={bodyY + 18 + i * 22}
							width={bodyW - 32 - i * 20}
							height={4}
							rx={2}
							fill="#48484a"
						/>
					))}

					<g
						style={{
							transformOrigin: `${bodyX}px ${bodyY}px`,
							transform: `rotate(${clapAngle}deg)`,
						}}
					>
						<rect x={bodyX} y={clapY} width={bodyW} height={clapH} rx={5} fill="#1c1c1e" />

						<g clipPath="url(#clapArm)">
							{Array.from({length: stripeCount * 2 + 1}).map((_, i) => {
								const sw = bodyW / stripeCount;
								const x1 = bodyX + i * sw * 0.5 - stripeSlant;
								return (
									<polygon
										key={i}
										points={`${x1},${clapY + clapH} ${x1 + sw * 0.5},${clapY + clapH} ${x1 + sw * 0.5 + stripeSlant},${clapY} ${x1 + stripeSlant},${clapY}`}
										fill={i % 2 === 0 ? "#f5f5f7" : "#1c1c1e"}
									/>
								);
							})}
						</g>

						<rect
							x={bodyX}
							y={clapY}
							width={bodyW}
							height={clapH}
							rx={5}
							fill="none"
							stroke="#3a3a3c"
							strokeWidth={1.5}
						/>
					</g>

					<rect
						x={bodyX}
						y={bodyY}
						width={bodyW}
						height={bodyH}
						rx={6}
						fill="none"
						stroke="#3a3a3c"
						strokeWidth={1.5}
					/>
				</svg>
			</div>
		</AbsoluteFill>
	);
};

const MotionWord: React.FC<{word: string}> = ({word}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const cleanWord = word.replace(/[.,!?]/g, "").toLowerCase();
	const isNot = cleanWord === "not";

	const enterProgress = spring({
		frame,
		fps,
		config: {damping: 18, stiffness: 180},
		durationInFrames: Math.round(0.25 * fps),
	});

	const opacity = interpolate(enterProgress, [0, 1], [0, 1]);
	const scale = interpolate(enterProgress, [0, 1], [isNot ? 0.4 : 0.7, 1]);
	const translateY = interpolate(enterProgress, [0, 1], [isNot ? 60 : 40, 0]);

	const underlineProgress = spring({
		frame: frame - 3,
		fps,
		config: {damping: 14, stiffness: 100},
		durationInFrames: Math.round(0.4 * fps),
	});
	const underlineWidth = isNot ? interpolate(underlineProgress, [0, 1], [0, 100]) : 0;

	const fontSize = isNot ? 160 : 96;
	const color = isNot ? "#ff2233" : "#ffffff";

	return (
		<AbsoluteFill
			style={{
				justifyContent: "center",
				alignItems: "center",
				pointerEvents: "none",
			}}
		>
			<div
				style={{
					transform: `translateY(${translateY}px) scale(${scale})`,
					opacity,
					willChange: "transform, opacity",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
				}}
			>
				<span
					style={{
						fontFamily,
						fontWeight: 900,
						fontSize,
						color,
						textAlign: "center",
						textTransform: "uppercase",
						letterSpacing: isNot ? 8 : 4,
						lineHeight: 1.1,
					}}
				>
					{word}
				</span>
				{isNot && (
					<div
						style={{
							marginTop: 8,
							height: 8,
							borderRadius: 4,
							backgroundColor: "#ff2233",
							width: `${underlineWidth}%`,
							maxWidth: fontSize * 2.5,
							willChange: "width",
						}}
					/>
				)}
			</div>
		</AbsoluteFill>
	);
};

export const OuttakeMotion: React.FC<OuttakeMotionProps> = ({
	videoSrc = "OuttakesQuelle1.mp4",
	captionsSrc = "jobs/outtake-motion/aligned.json",
	animationStart = 78,
	animationEnd = 170,
}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const [words, setWords] = useState<AlignedWord[] | null>(null);

	const fetchWords = useCallback(async () => {
		if (!captionsSrc) {
			setWords([]);
			return;
		}
		try {
			const response = await fetch(staticFile(captionsSrc));
			if (!response.ok) {
				setWords([]);
				return;
			}
			const data: AlignedWord[] = await response.json();
			setWords(Array.isArray(data) ? data : []);
		} catch {
			setWords([]);
		}
	}, [captionsSrc]);

	useEffect(() => {
		fetchWords();
	}, [fetchWords]);

	const animStartMs = (animationStart / fps) * 1000;
	const animEndMs = (animationEnd / fps) * 1000;

	const animationWords = useMemo(() => {
		if (!words) return [];
		return words
			.filter((w) => w.onsetMs >= animStartMs && w.onsetMs < animEndMs)
			.map((word, i, arr) => {
				const startFrame = Math.round((word.onsetMs / 1000) * fps);
				const nextOnsetMs =
					i + 1 < arr.length ? arr[i + 1].onsetMs : word.onsetMs + 600;
				const endFrame = Math.round((nextOnsetMs / 1000) * fps);
				const duration = Math.max(endFrame - startFrame, 1);
				return {
					word: word.text,
					from: startFrame,
					durationInFrames: duration,
				};
			});
	}, [words, fps, animStartMs, animEndMs]);

	const waveInProgress = spring({
		frame: frame - animationStart,
		fps,
		config: {damping: 16, stiffness: 60},
		durationInFrames: WAVE_TRANSITION_FRAMES,
	});
	const waveIn = frame >= animationStart ? waveInProgress : 0;

	const waveOutProgress = spring({
		frame: frame - animationEnd,
		fps,
		config: {damping: 16, stiffness: 60},
		durationInFrames: WAVE_TRANSITION_FRAMES,
	});
	const waveOut = frame >= animationEnd ? waveOutProgress : 0;

	const showBlue = waveIn > 0.01 && waveOut < 0.99;
	const isInTransitionIn = waveIn > 0 && waveIn < 0.99;
	const isInTransitionOut = waveOut > 0.01 && waveOut < 0.99;
	const blueSolid = waveIn >= 0.99 && waveOut < 0.01;

	return (
		<AbsoluteFill style={{backgroundColor: "#000"}}>
			<AbsoluteFill>
				<OffthreadVideo
					src={staticFile(videoSrc)}
					style={{
						width: "100%",
						height: "100%",
						objectFit: "cover",
					}}
				/>
			</AbsoluteFill>

			{blueSolid && (
				<AbsoluteFill style={{backgroundColor: BG_COLOR}} />
			)}

			{isInTransitionIn && (
				<LiquidWave progress={waveIn} color={BG_COLOR} direction="in" />
			)}

			{isInTransitionOut && (
				<LiquidWave progress={waveOut} color={BG_COLOR} direction="out" />
			)}

			{showBlue && (() => {
				const shortFormWord = animationWords.find(
					(w) => w.word.replace(/[.,!?]/g, "").toLowerCase() === "short-form",
				);
				const clipWord = animationWords.find(
					(w) => w.word.replace(/[.,!?]/g, "").toLowerCase() === "clip",
				);
				if (!shortFormWord || !clipWord) return null;
				const clapStart = shortFormWord.from;
				const clapEnd = clipWord.from + clipWord.durationInFrames;
				return (
					<Sequence from={clapStart} durationInFrames={clapEnd - clapStart}>
						<ClapperboardOverlay />
					</Sequence>
				);
			})()}

			{showBlue &&
				animationWords.map((seq) => (
					<Sequence
						key={`${seq.word}-${seq.from}`}
						from={seq.from}
						durationInFrames={seq.durationInFrames}
					>
						<MotionWord word={seq.word} />
					</Sequence>
				))}
		</AbsoluteFill>
	);
};
