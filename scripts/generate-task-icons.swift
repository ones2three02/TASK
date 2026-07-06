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

  let bgRect = style == .template
    ? NSRect(x: 180, y: 180, width: 664, height: 664)
    : NSRect(x: 80, y: 80, width: 864, height: 864)
  let bgRadius: CGFloat = style == .template ? 150 : 210
  let bgPath = NSBezierPath(roundedRect: bgRect, xRadius: bgRadius, yRadius: bgRadius)
  let gradient = style == .template
    ? NSGradient(colors: [.black, .black])!
    : NSGradient(colors: [color(0x242424), color(0x070707)])!
  gradient.draw(in: bgPath, angle: 90)

  if style != .template {
    strokeRoundedRect(bgRect.insetBy(dx: 8, dy: 8), radius: bgRadius - 8, color: color(0xffffff, 0.14), width: 10)
  }

  let shadow = NSShadow()
  shadow.shadowOffset = NSSize(width: 0, height: -10)
  shadow.shadowBlurRadius = style == .template ? 0 : 18
  shadow.shadowColor = color(0x000000, style == .template ? 0 : 0.28)
  shadow.set()
  drawClipboardGlyph(color: .white, originX: 300, originY: 236, scale: 1.0)
  NSShadow().set()

  NSGraphicsContext.restoreGraphicsState()
  return rep
}

func drawClipboardGlyph(color glyphColor: NSColor, originX: CGFloat, originY: CGFloat, scale: CGFloat) {
  func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> NSRect {
    NSRect(x: originX + x * scale, y: originY + y * scale, width: w * scale, height: h * scale)
  }

  strokeRoundedRect(rect(78, 74, 328, 428), radius: 48 * scale, color: glyphColor, width: 38 * scale)
  strokeRoundedRect(rect(158, 430, 168, 88), radius: 38 * scale, color: glyphColor, width: 38 * scale)

  let hole = NSBezierPath(roundedRect: rect(194, 454, 96, 28), xRadius: 12 * scale, yRadius: 12 * scale)
  NSColor.black.setFill()
  hole.fill()

  let check = NSBezierPath()
  check.move(to: NSPoint(x: originX + 172 * scale, y: originY + 300 * scale))
  check.line(to: NSPoint(x: originX + 226 * scale, y: originY + 244 * scale))
  check.line(to: NSPoint(x: originX + 326 * scale, y: originY + 358 * scale))
  glyphColor.setStroke()
  check.lineWidth = 42 * scale
  check.lineCapStyle = .round
  check.lineJoinStyle = .round
  check.stroke()

  let line = NSBezierPath(roundedRect: rect(166, 148, 154, 32), xRadius: 16 * scale, yRadius: 16 * scale)
  glyphColor.setFill()
  line.fill()
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
