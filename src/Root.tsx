import {Composition} from "remotion";
import {OuttakeMotion} from "./OuttakeMotion";

export const Root = () => {
	return (
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
	);
};
