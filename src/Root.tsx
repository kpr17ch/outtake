import {Composition} from "remotion";
import {OuttakesCaption} from "./OuttakesCaption";
import {OuttakeMotion} from "./OuttakeMotion";

export const Root = () => {
	return (
		<>
			<Composition
				id="SubtitleJobPreview"
				component={OuttakesCaption}
				durationInFrames={1800}
				fps={30}
				width={1920}
				height={1080}
				defaultProps={{
					jobId: "demo-subtitles",
					videoSrc: "OuttakesQuelle1.mp4",
					captionsSrc: "jobs/demo-subtitles/aligned.json",
					durationInFrames: 1800,
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
				durationInFrames={327}
				fps={30}
				width={1920}
				height={1080}
				defaultProps={{
					videoSrc: "OuttakesQuelle1.mp4",
					captionsSrc: "jobs/outtake-motion/aligned.json",
					animationStart: 78,
					animationEnd: 170,
				}}
			/>
		</>
	);
};
