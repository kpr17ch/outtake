import React from 'react';
import { Composition } from 'remotion';
import { OuttakeMotion } from './OuttakeMotion';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="OuttakeMotion"
      component={OuttakeMotion}
      durationInFrames={125}
      fps={25}
      width={1280}
      height={720}
      defaultProps={{
        videoSrc: "example_input.mp4",
        captionsSrc: "jobs/beispiel-motion/aligned.json",
        animationStart: 0,
        animationEnd: 125,
        showClapperboard: true,
        keywords: ["Motion", "Graphics", "Remotion", "Animationen", "Videos"],
        bgColor: "#1a1a2e"
      }}
    />
  );
};
