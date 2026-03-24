import {Composition} from "remotion";
import {Hello} from "./Hello";
import {OuttakesCaption} from "./OuttakesCaption";
import {OuttakeMotion} from "./OuttakeMotion";

export const Root = () => {
	return (
		<>
			<Composition
				id="Hello"
				component={Hello}
				durationInFrames={90}
				fps={30}
				width={1920}
				height={1080}
			/>
			<Composition
				id="SubtitleJobPreview"
				component={OuttakesCaption}
				durationInFrames={1800}
				fps={30}
				width={1920}
				height={1080}
				defaultProps={{
					jobId: "cleanshot-reel",
					videoSrc: "CleanShot_reel_15s.mp4",
					captionsSrc: "jobs/cleanshot-reel/aligned.json",
					durationInFrames: 1565,
				}}
				calculateMetadata={({props}) => {
					const dynamic = props as {
						durationInFrames?: number;
						fps?: number;
						width?: number;
						height?: number;
					};
					return {
						durationInFrames: dynamic.durationInFrames ?? 1800,
						fps: dynamic.fps ?? 30,
						width: dynamic.width ?? 1920,
						height: dynamic.height ?? 1080,
					};
				}}
			/>
			<Composition
				id="OuttakeMotion"
				component={OuttakeMotion}
				durationInFrames={1565}
				fps={120}
				width={3582}
				height={1860}
				defaultProps={{
					videoSrc: "CleanShot_reel_15s.mp4",
					captionsSrc: "jobs/cleanshot-reel/aligned.json",
					animationStart: 320,
					animationEnd: 645,
				}}
			/>
		</>
	);
};
