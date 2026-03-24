import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring, Audio } from 'remotion';

export const OuttakeMotion: React.FC<{
  videoSrc: string;
  captionsSrc: string;
  animationStart: number;
  animationEnd: number;
  showClapperboard: boolean;
  keywords: string[];
  bgColor: string;
}> = ({ videoSrc, captionsSrc, animationStart, animationEnd, showClapperboard, keywords, bgColor }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Beispiel-Transkriptdaten
  const words = [
    { word: "Motion", start: 0, end: 0.5 },
    { word: "Graphics", start: 0.5, end: 1 },
    { word: "mit", start: 1, end: 1.3 },
    { word: "Remotion", start: 1.3, end: 2 },
    { word: "Professionelle", start: 2.2, end: 3 },
    { word: "Animationen", start: 3, end: 3.8 },
    { word: "für", start: 3.8, end: 4 },
    { word: "deine", start: 4, end: 4.3 },
    { word: "Videos!", start: 4.3, end: 5 }
  ];

  const animationProgress = interpolate(
    frame,
    [animationStart, animationEnd],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  // Liquid Wave Animation
  const waveProgress = interpolate(frame, [0, 60], [0, 1]);
  const waveY = Math.sin(frame * 0.1) * 20;

  // Kinetic Typography für jedes Wort
  const renderWord = (word: { word: string; start: number; end: number }, index: number) => {
    const wordStart = Math.floor(word.start * fps);
    const wordEnd = Math.floor(word.end * fps);
    
    const springAnimation = spring({
      frame: frame - wordStart,
      fps,
      config: {
        damping: 12,
        stiffness: 100,
        mass: 0.5,
      },
    });

    const isKeyword = keywords.includes(word.word);
    const scale = isKeyword ? 1.2 : 1;
    const color = isKeyword ? '#ff6b6b' : '#ffffff';

    const wordStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${100 + index * 120}px`,
      top: `${300 + Math.sin(index) * 50}px`,
      fontSize: isKeyword ? '42px' : '36px',
      color,
      fontWeight: isKeyword ? 'bold' : 'normal',
      transform: `scale(${springAnimation * scale}) translateY(${-springAnimation * 20}px)`,
      opacity: springAnimation,
      textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
      fontFamily: 'Arial, sans-serif',
    };

    if (frame >= wordStart && frame <= wordEnd) {
      return (
        <div key={index} style={wordStyle}>
          {word.word}
        </div>
      );
    }
    return null;
  };

  // Clapperboard Animation
  const clapperScale = showClapperboard ? 
    interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' }) : 0;

  return (
    <div style={{ width, height, backgroundColor: bgColor, position: 'relative' }}>
      {/* Video-Layer */}
      <div style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <Audio src={videoSrc} />
        <div style={{ 
          position: 'absolute', 
          width: '100%', 
          height: '100%',
          background: `linear-gradient(45deg, ${bgColor}, #16213e)`,
          opacity: 0.8 
        }} />
      </div>

      {/* Liquid Wave Overlay */}
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <defs>
          <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#667eea" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#764ba2" stopOpacity="0.4" />
          </linearGradient>
        </defs>
        <path
          d={`M0,${height/2 + waveY} Q${width/4},${height/3 + waveY} ${width/2},${height/2 + waveY} T${width},${height/2 + waveY} L${width},${height} L0,${height} Z`}
          fill="url(#waveGradient)"
          style={{ 
            transform: `translateX(${(1 - waveProgress) * -width}px)`,
            opacity: waveProgress * 0.7
          }}
        />
      </svg>

      {/* Kinetic Typography */}
      <div style={{ position: 'absolute', width: '100%', height: '100%' }}>
        {words.map((word, index) => renderWord(word, index))}
      </div>

      {/* Clapperboard */}
      {showClapperboard && (
        <div style={{
          position: 'absolute',
          top: '50px',
          right: '50px',
          transform: `scale(${clapperScale}) rotate(${clapperScale * 15}deg)`,
          opacity: clapperScale
        }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none">
            <path d="M18.5 12.5L20 11l-2.5-2.5M16 14l-3.5-3.5M3 18h18v2H3z" stroke="#ffffff" strokeWidth="2"/>
            <rect x="3" y="3" width="18" height="3" fill="#ffffff"/>
            <rect x="3" y="6" width="3" height="3" fill="#ffffff"/>
            <rect x="6" y="6" width="3" height="3" fill="#333333"/>
            <rect x="9" y="6" width="3" height="3" fill="#ffffff"/>
            <rect x="12" y="6" width="3" height="3" fill="#333333"/>
            <rect x="15" y="6" width="3" height="3" fill="#ffffff"/>
            <rect x="3" y="9" width="3" height="3" fill="#333333"/>
            <rect x="6" y="9" width="3" height="3" fill="#ffffff"/>
            <rect x="9" y="9" width="3" height="3" fill="#333333"/>
            <rect x="12" y="9" width="3" height="3" fill="#ffffff"/>
            <rect x="15" y="9" width="3" height="3" fill="#333333"/>
          </svg>
        </div>
      )}

      {/* Titel */}
      <div style={{
        position: 'absolute',
        bottom: '50px',
        left: '50px',
        fontSize: '48px',
        color: '#ffffff',
        fontWeight: 'bold',
        textShadow: '3px 3px 6px rgba(0,0,0,0.7)',
        opacity: animationProgress,
        transform: `translateY(${(1 - animationProgress) * 50}px)`
      }}>
        Motion Graphics Demo
      </div>
    </div>
  );
};
