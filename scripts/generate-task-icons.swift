import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let publicDir = root.appendingPathComponent("apps/desktop/public")
let tauriIconsDir = root.appendingPathComponent("src-tauri/icons")

enum IconStyle {
  case color
  case black
  case template
}

func color(_ hex: Int, _ alpha: CGFloat = 1) -> NSColor {
  NSColor(
    calibratedRed: CGFloat((hex >> 16) & 0xff) / 255,
    green: CGFloat((hex >> 8) & 0xff) / 255,
    blue: CGFloat(hex & 0xff) / 255,
    alpha: alpha
  )
}

func drawRoundedRect(_ rect: NSRect, radius: CGFloat, fill: NSColor) {
  let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
  fill.setFill()
  path.fill()
}

func strokeRoundedRect(_ rect: NSRect, radius: CGFloat, color strokeColor: NSColor, width: CGFloat) {
  let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
  strokeColor.setStroke()
  path.lineWidth = width
  path.stroke()
}

func drawTaskGlyph(style: IconStyle, size: CGFloat) -> NSBitmapImageRep {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: Int(size),
    pixelsHigh: Int(size),
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  )!

  let context = NSGraphicsContext(bitmapImageRep: rep)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.cgContext.setShouldAntialias(true)
  context.cgContext.setAllowsAntialiasing(true)

  let scale = size / 1024
  context.cgContext.scaleBy(x: scale, y: scale)

  if style != .template {
    let bgRect = NSRect(x: 72, y: 72, width: 880, height: 880)
    let bgPath = NSBezierPath(roundedRect: bgRect, xRadius: 220, yRadius: 220)
    let gradient = style == .black
      ? NSGradient(colors: [color(0x181716), color(0x050505)])!
      : NSGradient(colors: [color(0x706052), color(0x342A22)])!
    gradient.draw(in: bgPath, angle: 90)
    strokeRoundedRect(bgRect.insetBy(dx: 8, dy: 8), radius: 212, color: color(0xffffff, 0.24), width: 12)
  }

  if style == .template {
    let card = NSRect(x: 232, y: 190, width: 560, height: 644)
    drawRoundedRect(card, radius: 122, fill: .black)
    drawChecklistLines(baseColor: .white, accentColor: .white, checkColor: .white)
  } else {
    let shadow = NSShadow()
    shadow.shadowOffset = NSSize(width: 0, height: -18)
    shadow.shadowBlurRadius = 44
    shadow.shadowColor = color(0x000000, 0.26)
    shadow.set()
    drawRoundedRect(NSRect(x: 242, y: 198, width: 540, height: 628), radius: 118, fill: color(0xffffff))
    NSShadow().set()
    strokeRoundedRect(NSRect(x: 242, y: 198, width: 540, height: 628), radius: 118, color: color(0xffffff, 0.72), width: 10)
    drawChecklistLines(baseColor: color(0x1c2a39), accentColor: color(0x2563eb), checkColor: color(0x14b8a6))
  }

  NSGraphicsContext.restoreGraphicsState()
  return rep
}

func drawChecklistLines(baseColor: NSColor, accentColor: NSColor, checkColor: NSColor) {
  let rows: [(CGFloat, NSColor, CGFloat)] = [
    (610, accentColor, 188),
    (500, color(0x64748b), 244),
    (390, color(0x64748b), 206),
  ]

  for (index, row) in rows.enumerated() {
    let y = row.0
    let lineColor = index == 0 ? row.1 : (baseColor == .white ? .white : row.1)
    strokeRoundedRect(NSRect(x: 336, y: y - 28, width: 58, height: 58), radius: 18, color: lineColor, width: 18)
    let line = NSBezierPath(roundedRect: NSRect(x: 440, y: y - 15, width: row.2, height: 30), xRadius: 15, yRadius: 15)
    lineColor.setFill()
    line.fill()
  }

  let check = NSBezierPath()
  check.move(to: NSPoint(x: 350, y: 610))
  check.line(to: NSPoint(x: 372, y: 588))
  check.line(to: NSPoint(x: 416, y: 642))
  checkColor.setStroke()
  check.lineWidth = 22
  check.lineCapStyle = .round
  check.lineJoinStyle = .round
  check.stroke()
}

func writePNG(_ rep: NSBitmapImageRep, to url: URL) throws {
  let data = rep.representation(using: .png, properties: [:])!
  try data.write(to: url)
}

func render(_ style: IconStyle, size: CGFloat, to url: URL) throws {
  try writePNG(drawTaskGlyph(style: style, size: size), to: url)
}

try FileManager.default.createDirectory(at: publicDir, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: tauriIconsDir, withIntermediateDirectories: true)

try render(.color, size: 512, to: publicDir.appendingPathComponent("logo.png"))
try render(.black, size: 512, to: publicDir.appendingPathComponent("logo-black.png"))
try render(.color, size: 512, to: publicDir.appendingPathComponent("favicon.png"))
try render(.color, size: 1024, to: tauriIconsDir.appendingPathComponent("icon-master.png"))
try render(.black, size: 1024, to: tauriIconsDir.appendingPathComponent("icon-black.png"))
try render(.template, size: 512, to: tauriIconsDir.appendingPathComponent("tray-macos-template.png"))
