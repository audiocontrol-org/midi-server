/**
 * AudioControl Logo
 *
 * Pixel-art logo from audiocontrol.org
 */

interface AudioControlLogoProps {
  size?: number
  className?: string
}

export function AudioControlLogo({
  size = 24,
  className
}: AudioControlLogoProps): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
    >
      <style>
        {`.ac-c { fill: #00ffff; }
        .ac-m { fill: #ff00ff; }
        .ac-g { fill: #00ff88; }
        .ac-y { fill: #ffff00; }
        .ac-d { fill: #334455; }`}
      </style>
      {/* Row 2: ....GGGG........ */}
      <rect x="4" y="1" width="1" height="1" className="ac-g" />
      <rect x="5" y="1" width="1" height="1" className="ac-g" />
      <rect x="6" y="1" width="1" height="1" className="ac-g" />
      <rect x="7" y="1" width="1" height="1" className="ac-g" />
      {/* Row 3: ...G....G....... */}
      <rect x="3" y="2" width="1" height="1" className="ac-g" />
      <rect x="8" y="2" width="1" height="1" className="ac-g" />
      {/* Row 4: ...G.CC.G....... */}
      <rect x="3" y="3" width="1" height="1" className="ac-g" />
      <rect x="5" y="3" width="1" height="1" className="ac-c" />
      <rect x="6" y="3" width="1" height="1" className="ac-c" />
      <rect x="8" y="3" width="1" height="1" className="ac-g" />
      {/* Row 5: ...G.CC.G....... */}
      <rect x="3" y="4" width="1" height="1" className="ac-g" />
      <rect x="5" y="4" width="1" height="1" className="ac-c" />
      <rect x="6" y="4" width="1" height="1" className="ac-c" />
      <rect x="8" y="4" width="1" height="1" className="ac-g" />
      {/* Row 6: ....GGGG........ */}
      <rect x="4" y="5" width="1" height="1" className="ac-g" />
      <rect x="5" y="5" width="1" height="1" className="ac-g" />
      <rect x="6" y="5" width="1" height="1" className="ac-g" />
      <rect x="7" y="5" width="1" height="1" className="ac-g" />
      {/* Row 8: .D..C...C...C..D */}
      <rect x="1" y="7" width="1" height="1" className="ac-d" />
      <rect x="4" y="7" width="1" height="1" className="ac-c" />
      <rect x="8" y="7" width="1" height="1" className="ac-c" />
      <rect x="12" y="7" width="1" height="1" className="ac-c" />
      <rect x="15" y="7" width="1" height="1" className="ac-d" />
      {/* Row 9: .D.CC..CCC.CC..D */}
      <rect x="1" y="8" width="1" height="1" className="ac-d" />
      <rect x="3" y="8" width="1" height="1" className="ac-c" />
      <rect x="4" y="8" width="1" height="1" className="ac-c" />
      <rect x="7" y="8" width="1" height="1" className="ac-c" />
      <rect x="8" y="8" width="1" height="1" className="ac-c" />
      <rect x="9" y="8" width="1" height="1" className="ac-c" />
      <rect x="11" y="8" width="1" height="1" className="ac-c" />
      <rect x="12" y="8" width="1" height="1" className="ac-c" />
      <rect x="15" y="8" width="1" height="1" className="ac-d" />
      {/* Row 10: DDCCC.CCCCC.CCCDD */}
      <rect x="0" y="9" width="1" height="1" className="ac-d" />
      <rect x="1" y="9" width="1" height="1" className="ac-d" />
      <rect x="2" y="9" width="1" height="1" className="ac-c" />
      <rect x="3" y="9" width="1" height="1" className="ac-c" />
      <rect x="4" y="9" width="1" height="1" className="ac-c" />
      <rect x="6" y="9" width="1" height="1" className="ac-c" />
      <rect x="7" y="9" width="1" height="1" className="ac-c" />
      <rect x="8" y="9" width="1" height="1" className="ac-c" />
      <rect x="9" y="9" width="1" height="1" className="ac-c" />
      <rect x="10" y="9" width="1" height="1" className="ac-c" />
      <rect x="12" y="9" width="1" height="1" className="ac-c" />
      <rect x="13" y="9" width="1" height="1" className="ac-c" />
      <rect x="14" y="9" width="1" height="1" className="ac-c" />
      <rect x="15" y="9" width="1" height="1" className="ac-d" />
      {/* Row 11: MCCCCCCCCCCCCCCCM */}
      <rect x="0" y="10" width="1" height="1" className="ac-m" />
      <rect x="1" y="10" width="1" height="1" className="ac-c" />
      <rect x="2" y="10" width="1" height="1" className="ac-c" />
      <rect x="3" y="10" width="1" height="1" className="ac-c" />
      <rect x="4" y="10" width="1" height="1" className="ac-c" />
      <rect x="5" y="10" width="1" height="1" className="ac-c" />
      <rect x="6" y="10" width="1" height="1" className="ac-c" />
      <rect x="7" y="10" width="1" height="1" className="ac-c" />
      <rect x="8" y="10" width="1" height="1" className="ac-c" />
      <rect x="9" y="10" width="1" height="1" className="ac-c" />
      <rect x="10" y="10" width="1" height="1" className="ac-c" />
      <rect x="11" y="10" width="1" height="1" className="ac-c" />
      <rect x="12" y="10" width="1" height="1" className="ac-c" />
      <rect x="13" y="10" width="1" height="1" className="ac-c" />
      <rect x="14" y="10" width="1" height="1" className="ac-c" />
      <rect x="15" y="10" width="1" height="1" className="ac-m" />
      {/* Row 12: MM.CCC.CCC.CCC.MM */}
      <rect x="0" y="11" width="1" height="1" className="ac-m" />
      <rect x="1" y="11" width="1" height="1" className="ac-m" />
      <rect x="3" y="11" width="1" height="1" className="ac-c" />
      <rect x="4" y="11" width="1" height="1" className="ac-c" />
      <rect x="5" y="11" width="1" height="1" className="ac-c" />
      <rect x="7" y="11" width="1" height="1" className="ac-c" />
      <rect x="8" y="11" width="1" height="1" className="ac-c" />
      <rect x="9" y="11" width="1" height="1" className="ac-c" />
      <rect x="11" y="11" width="1" height="1" className="ac-c" />
      <rect x="12" y="11" width="1" height="1" className="ac-c" />
      <rect x="13" y="11" width="1" height="1" className="ac-c" />
      <rect x="14" y="11" width="1" height="1" className="ac-m" />
      <rect x="15" y="11" width="1" height="1" className="ac-m" />
      {/* Row 13: YY..C...C...C..YY */}
      <rect x="0" y="12" width="1" height="1" className="ac-y" />
      <rect x="1" y="12" width="1" height="1" className="ac-y" />
      <rect x="4" y="12" width="1" height="1" className="ac-c" />
      <rect x="8" y="12" width="1" height="1" className="ac-c" />
      <rect x="12" y="12" width="1" height="1" className="ac-c" />
      <rect x="14" y="12" width="1" height="1" className="ac-y" />
      <rect x="15" y="12" width="1" height="1" className="ac-y" />
      {/* Row 14: YY.............YY */}
      <rect x="0" y="13" width="1" height="1" className="ac-y" />
      <rect x="1" y="13" width="1" height="1" className="ac-y" />
      <rect x="14" y="13" width="1" height="1" className="ac-y" />
      <rect x="15" y="13" width="1" height="1" className="ac-y" />
      {/* Row 15: .YY...........YY. */}
      <rect x="1" y="14" width="1" height="1" className="ac-y" />
      <rect x="2" y="14" width="1" height="1" className="ac-y" />
      <rect x="13" y="14" width="1" height="1" className="ac-y" />
      <rect x="14" y="14" width="1" height="1" className="ac-y" />
      {/* Row 16: ..YYYYYYYYYYYYY.. */}
      <rect x="2" y="15" width="1" height="1" className="ac-y" />
      <rect x="3" y="15" width="1" height="1" className="ac-y" />
      <rect x="4" y="15" width="1" height="1" className="ac-y" />
      <rect x="5" y="15" width="1" height="1" className="ac-y" />
      <rect x="6" y="15" width="1" height="1" className="ac-y" />
      <rect x="7" y="15" width="1" height="1" className="ac-y" />
      <rect x="8" y="15" width="1" height="1" className="ac-y" />
      <rect x="9" y="15" width="1" height="1" className="ac-y" />
      <rect x="10" y="15" width="1" height="1" className="ac-y" />
      <rect x="11" y="15" width="1" height="1" className="ac-y" />
      <rect x="12" y="15" width="1" height="1" className="ac-y" />
      <rect x="13" y="15" width="1" height="1" className="ac-y" />
      <rect x="14" y="15" width="1" height="1" className="ac-y" />
    </svg>
  )
}
