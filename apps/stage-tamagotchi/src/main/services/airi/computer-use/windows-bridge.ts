import type { ComputerUseResult } from '../../../../shared/eventa/computer-use'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Windows observation is read-only. State-changing commands require a fresh
// one-time confirmation in the Electron main process before reaching this bridge.
const commands = new Set([
  'window.list',
  'window.findText',
  'display.list',
  'display.capture',
  'screen.captureRegion',
  'app.probePermissions',
  'input.clickPoint',
  'input.typeText',
  'input.key',
])
const approvedCommands = new Set(['input.clickPoint', 'input.typeText', 'input.key'])

// The Windows Yes/No confirmation is human-paced; twenty seconds is too short.
// Never retry a timed-out desktop action without a fresh user approval.
export function windowsComputerUseTimeoutMs(argv: readonly string[]): number {
  return argv[0] === 'invoke' && approvedCommands.has(argv[1] ?? '') ? 120_000 : 20_000
}

export function windowsActionRequiresApproval(argv: string[]) {
  return argv[0] === 'invoke' && approvedCommands.has(argv[1] ?? '')
}

export function supportsWindowsComputerUse(argv: string[]): boolean {
  return argv[0] === 'invoke' && commands.has(argv[1] ?? '')
}

export interface WindowsComputerUseOptions {
  storeRoot: string
  execPowerShell?: (encodedCommand: string) => Promise<{ stdout: string, stderr: string }>
  /** Internal main-process authorization; never supplied by renderer IPC. */
  approved?: boolean
}

function parseInteger(value: string | undefined, label: string, minimum: number, maximum: number) {
  if (!value || !/^-?\d+$/.test(value))
    throw new Error(`Invalid Windows computer-use ${label}`)
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum)
    throw new Error(`Out-of-range Windows computer-use ${label}`)
  return number
}

function buildRequest(argv: string[], storeRoot: string, approved: boolean) {
  const command = argv[1]
  const args = argv.slice(2).filter(arg => arg !== '--json')
  if (!command || !commands.has(command))
    throw new Error('Unsupported Windows computer-use command')
  if (approvedCommands.has(command) && !approved)
    throw new Error('Windows desktop changes require an approved companion action')

  if (command === 'input.clickPoint') {
    if (args.length !== 4 || !args[3]?.trim() || args[3].length > 200)
      throw new Error('input.clickPoint requires x, y, window handle and exact window title')
    return {
      action: command,
      x: parseInteger(args[0], 'x', -32000, 32000),
      y: parseInteger(args[1], 'y', -32000, 32000),
      hwnd: parseInteger(args[2], 'window handle', 1, Number.MAX_SAFE_INTEGER),
      expectedTitle: args[3],
    }
  }
  if (command === 'input.typeText') {
    // Never type into whichever application happened to gain focus after the
    // native confirmation dialog. Require a window discovered via window.list.
    if (args.length !== 3 || !args[0] || args[0].length > 500
      || !args[2]?.trim() || args[2].length > 200) {
      throw new Error('input.typeText requires text, window handle and exact window title')
    }
    return {
      action: command,
      text: args[0],
      hwnd: parseInteger(args[1], 'window handle', 1, Number.MAX_SAFE_INTEGER),
      expectedTitle: args[2],
    }
  }
  if (command === 'input.key') {
    const supportedKeys = new Set(['enter', 'tab', 'esc', 'escape', 'ctrl+a', 'ctrl+c', 'ctrl+v', 'ctrl+s'])
    if (args.length !== 1 || !supportedKeys.has(args[0]?.toLowerCase() ?? ''))
      throw new Error('Unsupported Windows shortcut')
    return { action: command, key: args[0].toLowerCase() }
  }
  if (command === 'window.list' || command === 'display.list' || command === 'app.probePermissions') {
    if (args.length)
      throw new Error(`${command} does not accept arguments on Windows`)
    return { action: command }
  }
  if (command === 'window.findText') {
    if (args.length !== 1 || !args[0]?.trim() || args[0].length > 200)
      throw new Error('window.findText requires a search term (window titles only)')
    return { action: command, term: args[0] }
  }
  if (command === 'display.capture') {
    if (args.length)
      throw new Error('display.capture does not accept arguments on Windows')
    return { action: command, path: join(storeRoot, `screen-${randomUUID()}.png`) }
  }
  if (command === 'screen.captureRegion') {
    if (args.length !== 4)
      throw new Error('screen.captureRegion requires x y width height')
    const [x, y, width, height] = [
      parseInteger(args[0], 'x', -32000, 32000),
      parseInteger(args[1], 'y', -32000, 32000),
      parseInteger(args[2], 'width', 1, 3840),
      parseInteger(args[3], 'height', 1, 2160),
    ]
    if (width * height > 8_294_400)
      throw new Error('Region exceeds the maximum capture size')
    return { action: command, x, y, width, height, path: join(storeRoot, `region-${randomUUID()}.png`) }
  }
  throw new Error('Unknown Windows computer-use command')
}

/** Validate the exact desktop command and describe it for the main-process confirmation. */
export function describeWindowsComputerUseAction(argv: string[]): string {
  const request = buildRequest(argv, '', true)
  if (request.action === 'input.clickPoint')
    return `Nhấp chuột tại X=${request.x}, Y=${request.y} trong cửa sổ ${JSON.stringify(request.expectedTitle)} (HWND ${request.hwnd})`
  if (request.action === 'input.typeText' && typeof request.text === 'string')
    return `Nhập ${request.text.length} ký tự vào cửa sổ ${JSON.stringify(request.expectedTitle)} (HWND ${request.hwnd}): ${JSON.stringify(request.text)}`
  if (request.action === 'input.key')
    return `Nhấn phím: ${request.key}`
  throw new Error('Only state-changing Windows commands may request authorization.')
}

const windowsScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$Request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($BongPayload)) | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$Win32 = @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class BongWindowInfo {
  public delegate bool EnumWindowsDelegate(IntPtr window, IntPtr unused);
  [StructLayout(LayoutKind.Sequential)]
  public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsDelegate callback, IntPtr unused);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder title, int capacity);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr window);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X, Y; }
  public static void VerifyClickTarget(long handle, int x, int y) {
    var hwnd = new IntPtr(handle);
    Rect area;
    if (!GetWindowRect(hwnd, out area) || x < area.Left || x >= area.Right || y < area.Top || y >= area.Bottom)
      throw new InvalidOperationException("Click coordinates are outside the approved target window");
    var visibleAtPoint = WindowFromPoint(new POINT { X=x, Y=y });
    if (visibleAtPoint == IntPtr.Zero || GetAncestor(visibleAtPoint, 2) != hwnd)
      throw new InvalidOperationException("Another window covers the approved click location");
  }
  public static void VerifyAndFocusWindow(long handle, string expectedTitle) {
    var hwnd = new IntPtr(handle);
    if (!IsWindowVisible(hwnd)) throw new InvalidOperationException("Target window is not visible");
    var title = new StringBuilder(Math.Max(2, GetWindowTextLength(hwnd) + 1));
    GetWindowText(hwnd, title, title.Capacity);
    if (!String.Equals(title.ToString(), expectedTitle, StringComparison.Ordinal))
      throw new InvalidOperationException("Target window identity changed");
    SetForegroundWindow(hwnd);
    System.Threading.Thread.Sleep(200);
    if (GetForegroundWindow() != hwnd)
      throw new InvalidOperationException("Target window could not be focused; no text was typed");
  }
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public InputUnion u; }
  [StructLayout(LayoutKind.Explicit, Size = 32)]
  public struct InputUnion { [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }
  public static void Click(int x, int y) {
    if (!SetCursorPos(x, y)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
  }
  public static void TypeUnicode(string text) {
    foreach (char ch in text) {
      var down = new INPUT { type=1, u=new InputUnion {ki=new KEYBDINPUT { scan=ch, flags=0x0004 } } };
      var up = new INPUT { type=1, u=new InputUnion {ki=new KEYBDINPUT { scan=ch, flags=0x0004 | 0x0002 } } };
      var inputs = new INPUT[] {down, up};
      if (SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT))) != 2)
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
  }
  public static List<object> List() {
    var result = new List<object>();
    EnumWindows((handle, ignored) => {
      if (!IsWindowVisible(handle)) return true;
      int size = GetWindowTextLength(handle);
      if (size <= 0 || size > 1024) return true;
      var text = new StringBuilder(size + 1);
      GetWindowText(handle, text, text.Capacity);
      var title = text.ToString();
      if (String.IsNullOrWhiteSpace(title)) return true;
      uint pid;
      GetWindowThreadProcessId(handle, out pid);
      Rect rect;
      if (!GetWindowRect(handle, out rect)) return true;
      result.Add(new {
        title = title,
        pid = pid,
        hwnd = handle.ToInt64().ToString(),
        x = rect.Left,
        y = rect.Top,
        width = Math.Max(0, rect.Right - rect.Left),
        height = Math.Max(0, rect.Bottom - rect.Top)
      });
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
'@
try {
  Add-Type -TypeDefinition $Win32 -ErrorAction Stop
  $Result = $null
  # Approval was already verified for this exact action by Electron main.
  switch ([string]$Request.action) {
    'input.clickPoint' {
      [BongWindowInfo]::VerifyAndFocusWindow([long]$Request.hwnd, [string]$Request.expectedTitle)
      [BongWindowInfo]::VerifyClickTarget([long]$Request.hwnd, [int]$Request.x, [int]$Request.y)
      [BongWindowInfo]::Click([int]$Request.x, [int]$Request.y)
      $Result = @{ performed = $true; command = 'input.clickPoint'; x = [int]$Request.x; y = [int]$Request.y }
    }
    'input.typeText' {
      [BongWindowInfo]::VerifyAndFocusWindow([long]$Request.hwnd, [string]$Request.expectedTitle)
      [BongWindowInfo]::TypeUnicode([string]$Request.text)
      $Result = @{ performed = $true; command = 'input.typeText'; characterCount = ([string]$Request.text).Length }
    }
    'input.key' {
      $Sequence = switch ([string]$Request.key) {
        'enter' { '{ENTER}' }
        'tab' { '{TAB}' }
        'esc' { '{ESC}' }
        'escape' { '{ESC}' }
        'ctrl+a' { '^a' }
        'ctrl+c' { '^c' }
        'ctrl+v' { '^v' }
        'ctrl+s' { '^s' }
        default { throw 'Unsupported shortcut' }
      }
      [System.Windows.Forms.SendKeys]::SendWait([string]$Sequence)
      $Result = @{ performed = $true; command = 'input.key'; key = [string]$Request.key }
    }
    'window.list' { $Result = @([BongWindowInfo]::List()) }
    'window.findText' {
      $Term = [string]$Request.term
      $Result = @([BongWindowInfo]::List() | Where-Object { $_.title.IndexOf($Term, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
    }
    'display.list' {
      $Result = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
        @{ name = $_.DeviceName; primary = $_.Primary; x = $_.Bounds.Left; y = $_.Bounds.Top; width = $_.Bounds.Width; height = $_.Bounds.Height }
      })
    }
    'app.probePermissions' {
      $Result = @{ platform = 'windows'; screens = [System.Windows.Forms.Screen]::AllScreens.Length; readOnly = $true; stateChanging = 'approved-only'; approvalRequired = $true }
    }
    { $_ -eq 'display.capture' -or $_ -eq 'screen.captureRegion' } {
      if ($Request.action -eq 'display.capture') {
        $Bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      } else {
        $Bounds = New-Object System.Drawing.Rectangle ([int]$Request.x), ([int]$Request.y), ([int]$Request.width), ([int]$Request.height)
        if (-not [System.Windows.Forms.SystemInformation]::VirtualScreen.IntersectsWith($Bounds)) {
          throw 'Capture bounds are outside desktop'
        }
      }
      if ($Bounds.Width -le 0 -or $Bounds.Height -le 0 -or [long]$Bounds.Width * [long]$Bounds.Height -gt 8294400) {
        throw 'Desktop image exceeds 8.3 million pixels'
      }
      $Bitmap = New-Object System.Drawing.Bitmap ($Bounds.Width), ($Bounds.Height)
      $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
      try {
        $Graphics.CopyFromScreen($Bounds.Left, $Bounds.Top, 0, 0, $Bitmap.Size)
        $Bitmap.Save([string]$Request.path, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $Graphics.Dispose()
        $Bitmap.Dispose()
      }
      $Result = @{ path = [string]$Request.path; width = $Bounds.Width; height = $Bounds.Height; format = 'png' }
    }
    default { throw 'Unsupported Windows action' }
  }
  @{ status = 'completed'; result = $Result } | ConvertTo-Json -Depth 8 -Compress
} catch {
  @{ status = 'failed'; failure = @{ code = 'windows_backend_error'; message = $_.Exception.Message } } | ConvertTo-Json -Depth 5 -Compress
  exit 1
}
`

async function defaultPowerShell(encodedCommand: string, timeoutMs: number) {
  const { stdout, stderr } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    encodedCommand,
  ], { encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer: 2_000_000 })
  return { stdout, stderr }
}

export async function runWindowsComputerUse(
  argv: string[],
  options: WindowsComputerUseOptions,
): Promise<ComputerUseResult> {
  const request = buildRequest(argv, options.storeRoot, options.approved === true)
  if ('path' in request)
    await mkdir(options.storeRoot, { recursive: true })

  const encodedPayload = Buffer.from(JSON.stringify(request), 'utf8').toString('base64')
  const command = `$BongPayload = ` + `'${encodedPayload}'` + `\n${windowsScript}`
  const encodedCommand = Buffer.from(command, 'utf16le').toString('base64')
  const run = options.execPowerShell ?? ((encoded: string) => defaultPowerShell(encoded, windowsComputerUseTimeoutMs(argv)))
  let stdout = ''
  let stderr = ''
  let exitCode = 0
  try {
    ({ stdout, stderr } = await run(encodedCommand))
  }
  catch (error) {
    const failure = error as Error & { stdout?: string, stderr?: string, code?: number | string, killed?: boolean }
    if (failure.killed || failure.code === 'ETIMEDOUT') {
      return {
        argv,
        exitCode: 1,
        output: {
          status: 'failed',
          failure: {
            code: 'windows_command_timeout',
            message: 'Timed out waiting for Windows. The desktop result is unverified and must not be retried automatically.',
          },
        },
        stderr: '',
      }
    }
    stdout = failure.stdout ?? ''
    stderr = failure.stderr ?? ''
    exitCode = typeof failure.code === 'number' ? failure.code : 1
  }
  let output: unknown
  try {
    output = JSON.parse(stdout.trim())
  }
  catch {
    output = { status: 'failed', failure: { code: 'bridge_parse_failed', message: stderr.slice(0, 300) } }
    exitCode = 1
  }
  return { argv, exitCode, output, stderr }
}
