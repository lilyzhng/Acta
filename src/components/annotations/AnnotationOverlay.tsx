'use client';

import { useMemo } from 'react';
import type { Annotation, ArrowDirection } from '@/types';

interface AnnotationOverlayProps {
  annotations: Annotation[];
  currentTime: number;
  containerWidth: number;
  containerHeight: number;
}

// Size mappings for different annotation sizes
const SIZE_CONFIG = {
  small: { arrow: 30, circle: 20, box: 40, text: 14, spotlight: 40 },
  medium: { arrow: 50, circle: 35, box: 60, text: 18, spotlight: 60 },
  large: { arrow: 70, circle: 50, box: 80, text: 24, spotlight: 80 },
};

// Sanitize SVG content to prevent XSS
// Allow only safe SVG elements and attributes
function sanitizeSvgContent(content: string): string {
  // Remove any script tags or event handlers
  let sanitized = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, 'data-removed=')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, 'data-uri-removed:');
  
  // Ensure it doesn't contain full SVG wrapper (we provide that)
  sanitized = sanitized.replace(/<\/?svg[^>]*>/gi, '');
  
  return sanitized;
}

// Arrow path generator
function getArrowPath(direction: ArrowDirection, size: number): string {
  const half = size / 2;
  const arrowHead = size * 0.3;
  
  // Arrow points in the specified direction
  const paths: Record<ArrowDirection, string> = {
    up: `M 0 ${half} L 0 ${-half} M ${-arrowHead} ${-half + arrowHead} L 0 ${-half} L ${arrowHead} ${-half + arrowHead}`,
    down: `M 0 ${-half} L 0 ${half} M ${-arrowHead} ${half - arrowHead} L 0 ${half} L ${arrowHead} ${half - arrowHead}`,
    left: `M ${half} 0 L ${-half} 0 M ${-half + arrowHead} ${-arrowHead} L ${-half} 0 L ${-half + arrowHead} ${arrowHead}`,
    right: `M ${-half} 0 L ${half} 0 M ${half - arrowHead} ${-arrowHead} L ${half} 0 L ${half - arrowHead} ${arrowHead}`,
    'up-left': `M ${half * 0.7} ${half * 0.7} L ${-half * 0.7} ${-half * 0.7} M ${-half * 0.7 + arrowHead} ${-half * 0.7} L ${-half * 0.7} ${-half * 0.7} L ${-half * 0.7} ${-half * 0.7 + arrowHead}`,
    'up-right': `M ${-half * 0.7} ${half * 0.7} L ${half * 0.7} ${-half * 0.7} M ${half * 0.7 - arrowHead} ${-half * 0.7} L ${half * 0.7} ${-half * 0.7} L ${half * 0.7} ${-half * 0.7 + arrowHead}`,
    'down-left': `M ${half * 0.7} ${-half * 0.7} L ${-half * 0.7} ${half * 0.7} M ${-half * 0.7 + arrowHead} ${half * 0.7} L ${-half * 0.7} ${half * 0.7} L ${-half * 0.7} ${half * 0.7 - arrowHead}`,
    'down-right': `M ${-half * 0.7} ${-half * 0.7} L ${half * 0.7} ${half * 0.7} M ${half * 0.7 - arrowHead} ${half * 0.7} L ${half * 0.7} ${half * 0.7} L ${half * 0.7} ${half * 0.7 - arrowHead}`,
  };
  
  return paths[direction] || paths.right;
}

// Get CSS animation class
function getAnimationClass(animation: string | undefined): string {
  switch (animation) {
    case 'pulse':
      return 'animate-annotation-pulse';
    case 'bounce':
      return 'animate-annotation-bounce';
    case 'fade-in':
      return 'animate-annotation-fade-in';
    default:
      return '';
  }
}

export function AnnotationOverlay({
  annotations,
  currentTime,
  containerWidth,
  containerHeight,
}: AnnotationOverlayProps) {
  // Filter annotations visible at current time
  const visibleAnnotations = useMemo(() => {
    return annotations.filter(a => {
      const afterStart = a.startTime === undefined || currentTime >= a.startTime;
      const beforeEnd = a.endTime === undefined || currentTime <= a.endTime;
      return afterStart && beforeEnd;
    });
  }, [annotations, currentTime]);

  if (visibleAnnotations.length === 0) {
    return null;
  }

  return (
    <>
      {/* CSS animations */}
      <style jsx global>{`
        @keyframes annotation-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.15); }
        }
        @keyframes annotation-bounce {
          0%, 100% { transform: translate(-50%, -50%) translateY(0); }
          50% { transform: translate(-50%, -50%) translateY(-8px); }
        }
        @keyframes annotation-fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-annotation-pulse {
          animation: annotation-pulse 1s ease-in-out infinite;
        }
        .animate-annotation-bounce {
          animation: annotation-bounce 0.6s ease-in-out infinite;
        }
        .animate-annotation-fade-in {
          animation: annotation-fade-in 0.5s ease-out forwards;
        }
      `}</style>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {visibleAnnotations.map(annotation => {
          const x = (annotation.position.x / 100) * containerWidth;
          const y = (annotation.position.y / 100) * containerHeight;
          const sizeConfig = SIZE_CONFIG[annotation.style.size || 'medium'];
          const color = annotation.style.color || 'yellow';
          const animClass = getAnimationClass(annotation.style.animation);

          return (
            <div
              key={annotation.id}
              className={`absolute ${animClass}`}
              style={{
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {annotation.type === 'arrow' && (
                <svg
                  width={sizeConfig.arrow * 1.5}
                  height={sizeConfig.arrow * 1.5}
                  viewBox={`${-sizeConfig.arrow} ${-sizeConfig.arrow} ${sizeConfig.arrow * 2} ${sizeConfig.arrow * 2}`}
                  className="drop-shadow-lg"
                >
                  <path
                    d={getArrowPath(annotation.arrowDirection || 'right', sizeConfig.arrow)}
                    stroke={color}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              )}

              {annotation.type === 'circle' && (
                <svg
                  width={sizeConfig.circle * 2 + 8}
                  height={sizeConfig.circle * 2 + 8}
                  className="drop-shadow-lg"
                >
                  <circle
                    cx={sizeConfig.circle + 4}
                    cy={sizeConfig.circle + 4}
                    r={sizeConfig.circle}
                    stroke={color}
                    strokeWidth={3}
                    fill="none"
                  />
                </svg>
              )}

              {annotation.type === 'box' && (
                <svg
                  width={sizeConfig.box + 8}
                  height={sizeConfig.box + 8}
                  className="drop-shadow-lg"
                >
                  <rect
                    x={4}
                    y={4}
                    width={sizeConfig.box}
                    height={sizeConfig.box}
                    stroke={color}
                    strokeWidth={3}
                    fill="none"
                    rx={4}
                  />
                </svg>
              )}

              {annotation.type === 'text' && (
                <div
                  className="px-3 py-1.5 rounded-md drop-shadow-lg whitespace-nowrap"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    color: color,
                    fontSize: sizeConfig.text,
                    fontWeight: 600,
                  }}
                >
                  {annotation.text || annotation.target}
                </div>
              )}

              {annotation.type === 'spotlight' && (
                <>
                  {/* Dark overlay with cutout - rendered at container level */}
                  <svg
                    className="absolute"
                    style={{
                      left: -x,
                      top: -y,
                      width: containerWidth,
                      height: containerHeight,
                    }}
                  >
                    <defs>
                      <mask id={`spotlight-mask-${annotation.id}`}>
                        <rect width="100%" height="100%" fill="white" />
                        <circle
                          cx={x}
                          cy={y}
                          r={sizeConfig.spotlight}
                          fill="black"
                        />
                      </mask>
                    </defs>
                    <rect
                      width="100%"
                      height="100%"
                      fill="rgba(0, 0, 0, 0.6)"
                      mask={`url(#spotlight-mask-${annotation.id})`}
                    />
                    {/* Spotlight ring */}
                    <circle
                      cx={x}
                      cy={y}
                      r={sizeConfig.spotlight}
                      stroke={color}
                      strokeWidth={3}
                      fill="none"
                    />
                  </svg>
                </>
              )}

              {annotation.type === 'custom_svg' && annotation.svgContent && (
                <svg
                  width={annotation.svgWidth || 200}
                  height={annotation.svgHeight || 200}
                  viewBox={annotation.svgViewBox || '0 0 100 100'}
                  className="drop-shadow-lg"
                  style={{ overflow: 'visible' }}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeSvgContent(annotation.svgContent),
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
