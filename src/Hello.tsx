import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {loadFont} from "@remotion/google-fonts/Inter";

const {fontFamily} = loadFont("normal", {
	weights: ["700"],
	subsets: ["latin"],
});

export const Hello = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const scale = spring({
		frame,
		fps,
		config: {damping: 12, stiffness: 200},
	});
	const opacity = Math.min(1, frame / 18);

	return (
		<AbsoluteFill
			style={{
				backgroundColor: "#0f172a",
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			<h1
				style={{
					fontFamily,
					fontSize: 120,
					color: "#f8fafc",
					margin: 0,
					transform: `scale(${0.85 + scale * 0.15})`,
					opacity,
				}}
			>
				Hello
			</h1>
		</AbsoluteFill>
	);
};
