using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;

// A small, independent Win32 host. EOF from Electron always restores the session.
internal static class Program
{
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024 };
    static readonly object OutputLock = new object();
    static Control dispatcher;
    static IntPtr hook;
    static Native.HookProc hookProc = MouseHook;
    static bool originalDesktopVisible;
    static bool desiredDesktopVisible;
    static bool desktopChanged;
    static bool middleClick;
    static bool taskbarSupported = true;
    static bool quitting;
    static string style = "system";
    static string color = "#303044";
    static int opacity = 65;
    sealed class TaskbarSnapshot { public Native.AccentPolicy Accent; public bool Captured; public int Backdrop; }
    static readonly Dictionary<IntPtr, TaskbarSnapshot> taskbars = new Dictionary<IntPtr, TaskbarSnapshot>();
    static readonly List<Form> corners = new List<Form>();
    static System.Windows.Forms.Timer refresh;
    static bool cornersEnabled;
    static int cornerSize;
    static string displaySignature = "";
    static bool detectUsb;
    static string usbSignature = "\0";

    [STAThread]
    static void Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        if (args.Length > 1 && args[0].StartsWith("--firewall-")) { Environment.Exit(Firewall(args)); return; }
        try { Native.SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { Native.SetProcessDPIAware(); }
        Application.EnableVisualStyles();
        dispatcher = new Control();
        dispatcher.CreateControl();
        IntPtr handle = dispatcher.Handle;
        originalDesktopVisible = DesktopVisible();
        desiredDesktopVisible = originalDesktopVisible;
        refresh = new System.Windows.Forms.Timer();
        refresh.Interval = 2500;
        refresh.Tick += delegate {
            if (style != "system") ApplyTaskbars();
            if (desktopChanged && DesktopVisible() != desiredDesktopVisible) SetDesktop(desiredDesktopVisible, false);
            string signature = ScreenSignature();
            if (cornersEnabled && signature != displaySignature) SetCorners(true, cornerSize);
            if (cornersEnabled) foreach (Form corner in corners) Native.SetWindowPos(corner.Handle, new IntPtr(-1), 0, 0, 0, 0, 0x0013);
            if (detectUsb) PublishDrives();
        };
        refresh.Start();
        Thread input = new Thread(ReadInput);
        input.IsBackground = true;
        input.Start();
        Application.ApplicationExit += delegate { Restore(); };
        Write(new { ready = true, available = true, desktopHidden = !originalDesktopVisible, taskbarSupported = true });
        Application.Run();
    }

    static void ReadInput()
    {
        try {
            string line;
            while ((line = Console.ReadLine()) != null) {
                if (line.Length > 65536) continue;
                string command = line;
                dispatcher.BeginInvoke(new Action(delegate { Process(command); }));
            }
        } catch { }
        try { dispatcher.BeginInvoke(new Action(delegate { Restore(); Application.Exit(); })); } catch { }
    }

    static void Process(string text)
    {
        object id = null;
        try {
            var message = Json.Deserialize<Dictionary<string, object>>(text);
            id = message.ContainsKey("id") ? message["id"] : null;
            string command = Convert.ToString(message["command"]);
            if (command == "apply") {
                var settings = (Dictionary<string, object>)message["settings"];
                SetDesktop(!GetBool(settings, "hideDesktopIcons"), false);
                SetHook(GetBool(settings, "middleClickDesktop"));
                string nextStyle = Convert.ToString(settings["taskbarStyle"]);
                if (nextStyle == "system" && style != "system") RestoreTaskbars();
                style = nextStyle;
                color = Convert.ToString(settings["taskbarColor"]);
                opacity = Convert.ToInt32(settings["taskbarOpacity"]);
                if (style != "system") ApplyTaskbars();
                SetCorners(GetBool(settings, "screenCorners"), Convert.ToInt32(settings["cornerRadius"]));
                detectUsb = GetBool(settings, "detectUsb");
                if (detectUsb) PublishDrives(); else usbSignature = "\0";
            } else if (command == "toggleDesktop") SetDesktop(!DesktopVisible(), true);
            else if (command == "launch") {
                string target = Convert.ToString(message["target"]);
                if (String.IsNullOrWhiteSpace(target) || target.IndexOf('\0') >= 0) throw new Exception("启动路径无效。");
                var start = new ProcessStartInfo(target);
                start.UseShellExecute = true;
                if (message.ContainsKey("arguments")) start.Arguments = Convert.ToString(message["arguments"]);
                if (message.ContainsKey("workingDirectory")) start.WorkingDirectory = Convert.ToString(message["workingDirectory"]);
                // ShellExecute opens .lnk, URLs, AppsFolder entries and console windows through Windows.
                System.Diagnostics.Process.Start(start);
            } else if (command == "apps") {
                var requestId = id;
                Thread worker = new Thread(delegate() { try { Write(new { id = requestId, ok = true, apps = DiscoverApps() }); } catch (Exception error) { Write(new { id = requestId, ok = false, error = error.Message }); } });
                worker.IsBackground = true; worker.SetApartmentState(ApartmentState.STA); worker.Start(); return;
            }
            else if (command == "restore") Restore();
            else if (command != "status") throw new Exception("Unknown command");
            Write(new { id = id, ok = true, desktopHidden = !DesktopVisible(), taskbarSupported = taskbarSupported });
        } catch (Exception e) { Write(new { id = id, ok = false, error = e.Message }); }
    }

    static bool GetBool(Dictionary<string, object> settings, string key) { return settings.ContainsKey(key) && Convert.ToBoolean(settings[key]); }
    static void Write(object data) { lock (OutputLock) { try { Console.WriteLine(Json.Serialize(data)); Console.Out.Flush(); } catch { } } }

    static void PublishDrives()
    {
        var drives = new List<object>(); string signature = "";
        foreach (DriveInfo drive in DriveInfo.GetDrives()) {
            try { if (drive.DriveType != DriveType.Removable) continue;
                bool ready = drive.IsReady; string label = ready ? drive.VolumeLabel : "";
                signature += drive.Name + label + ready;
                drives.Add(new { path = drive.Name, name = String.IsNullOrEmpty(label) ? "可移动磁盘 " + drive.Name : label + " (" + drive.Name + ")", ready = ready });
            } catch { }
        }
        if (signature == usbSignature) return; usbSignature = signature;
        Write(new { eventName = "usbDrives", drives = drives });
    }

    static object Member(object instance, string name, BindingFlags flags, params object[] values) { return instance.GetType().InvokeMember(name, flags, null, instance, values); }
    static List<object> DiscoverApps()
    {
        var apps = new List<object>(); object shell = null, folder = null, items = null;
        try {
            shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application"));
            folder = Member(shell, "NameSpace", BindingFlags.InvokeMethod, "shell:AppsFolder");
            items = Member(folder, "Items", BindingFlags.InvokeMethod);
            int count = Math.Min(600, Convert.ToInt32(Member(items, "Count", BindingFlags.GetProperty)));
            for (int i = 0; i < count; i++) {
                object item = null;
                try { item = Member(items, "Item", BindingFlags.InvokeMethod, i);
                    string name = Convert.ToString(Member(item, "Name", BindingFlags.GetProperty));
                    string target = Convert.ToString(Member(item, "Path", BindingFlags.GetProperty));
                    if (String.IsNullOrEmpty(name) || String.IsNullOrEmpty(target)) continue;
                    if (!Path.IsPathRooted(target)) target = "shell:AppsFolder\\" + target;
                    apps.Add(new { name = name, target = target, icon = Native.ShellIcon(target) });
                } catch { } finally { if (item != null && Marshal.IsComObject(item)) Marshal.ReleaseComObject(item); }
            }
        } finally {
            foreach (object value in new object[] { items, folder, shell }) if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value);
        }
        return apps;
    }

    static int Firewall(string[] args)
    {
        bool enable = args[0] == "--firewall-enable";
        if (!enable && args[0] != "--firewall-disable") return 2;
        var added = new List<string>();
        try {
            for (int i = 1; i < args.Length; i++) {
                string file = Path.GetFullPath(args[i]);
                if (!Path.IsPathRooted(args[i]) || (enable && !File.Exists(file)) || Path.GetExtension(file).ToLowerInvariant() != ".exe" || file.IndexOf('"') >= 0) throw new Exception("Invalid executable");
                string hash; using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(file.ToLowerInvariant()))).Replace("-", "").Substring(0, 16);
                foreach (string direction in new string[] { "in", "out" }) {
                    string rule = "dock_box offline " + hash + " " + direction;
                    if (!enable) {
                        if (RunNetsh("advfirewall firewall show rule name=\"" + rule + "\"") == 0 && RunNetsh("advfirewall firewall delete rule name=\"" + rule + "\"") != 0) throw new Exception("Firewall removal failed");
                        continue;
                    }
                    if (RunNetsh("advfirewall firewall show rule name=\"" + rule + "\"") == 0) continue;
                    // Rule names are scoped to the actual executable, so installed and portable copies can coexist.
                    if (RunNetsh("advfirewall firewall add rule name=\"" + rule + "\" dir=" + direction + " action=block program=\"" + file + "\" enable=yes profile=any") != 0) throw new Exception("Firewall update failed");
                    added.Add(rule);
                }
            }
            return 0;
        } catch { foreach (string rule in added) RunNetsh("advfirewall firewall delete rule name=\"" + rule + "\""); return 1; }
    }
    static int RunNetsh(string arguments)
    {
        using (var process = System.Diagnostics.Process.Start(new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "netsh.exe"), arguments) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true })) {
            process.OutputDataReceived += delegate { }; process.ErrorDataReceived += delegate { };
            process.BeginOutputReadLine(); process.BeginErrorReadLine();
            if (!process.WaitForExit(15000)) { process.Kill(); return 1; } return process.ExitCode;
        }
    }

    static IntPtr DesktopList()
    {
        IntPtr result = IntPtr.Zero;
        Native.EnumWindows(delegate(IntPtr top, IntPtr p) {
            IntPtr view = Native.FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (view != IntPtr.Zero) { result = Native.FindWindowEx(view, IntPtr.Zero, "SysListView32", "FolderView"); if (result == IntPtr.Zero) result = Native.FindWindowEx(view, IntPtr.Zero, "SysListView32", null); }
            return result == IntPtr.Zero;
        }, IntPtr.Zero);
        return result;
    }
    static bool DesktopVisible() { IntPtr list = DesktopList(); return list == IntPtr.Zero || Native.IsWindowVisible(list); }
    static void SetDesktop(bool visible, bool notify)
    {
        desiredDesktopVisible = visible;
        IntPtr list = DesktopList();
        if (list == IntPtr.Zero) return;
        if (Native.IsWindowVisible(list) != visible) Native.ShowWindow(list, visible ? 5 : 0);
        desktopChanged = visible != originalDesktopVisible;
        if (notify) Write(new { eventName = "desktopVisibility", hidden = !visible });
    }
    static void SetHook(bool enabled)
    {
        if (enabled == middleClick) return;
        if (enabled) {
            hook = Native.SetWindowsHookEx(14, hookProc, Native.GetModuleHandle(null), 0);
            if (hook == IntPtr.Zero) throw new Exception("无法注册鼠标中键监听。");
        } else if (hook != IntPtr.Zero) { Native.UnhookWindowsHookEx(hook); hook = IntPtr.Zero; }
        middleClick = enabled;
    }
    static IntPtr MouseHook(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0 && wParam.ToInt64() == 0x207) {
            var info = (Native.MouseData)Marshal.PtrToStructure(lParam, typeof(Native.MouseData));
            IntPtr window = Native.WindowFromPoint(info.pt);
            var name = new System.Text.StringBuilder(128);
            Native.GetClassName(window, name, name.Capacity);
            string cls = name.ToString();
            bool desktop = cls == "SysListView32" && Native.GetParent(window) == Native.GetParent(DesktopList());
            desktop = desktop || cls == "Progman" || cls == "WorkerW" || cls == "SHELLDLL_DefView";
            if (desktop) { dispatcher.BeginInvoke(new Action(delegate { SetDesktop(!DesktopVisible(), true); })); return new IntPtr(1); }
        }
        return Native.CallNextHookEx(hook, code, wParam, lParam);
    }

    static void ApplyTaskbars()
    {
        bool supported = true; int found = 0;
        Native.EnumWindows(delegate(IntPtr window, IntPtr p) {
            var name = new System.Text.StringBuilder(128);
            Native.GetClassName(window, name, name.Capacity);
            if (name.ToString() != "Shell_TrayWnd" && name.ToString() != "Shell_SecondaryTrayWnd") return true;
            found++;
            if (!taskbars.ContainsKey(window)) {
                Native.AccentPolicy previous;
                bool captured = Native.GetAccent(window, out previous);
                taskbars[window] = new TaskbarSnapshot { Accent = previous, Captured = captured, Backdrop = Native.GetBackdrop(window) };
            }
            Color tint;
            try { tint = ColorTranslator.FromHtml(color); } catch { tint = Color.FromArgb(48, 48, 68); }
            int alpha = Math.Max(0, Math.Min(255, opacity * 255 / 100));
            var accent = new Native.AccentPolicy();
            accent.State = style == "blur" ? 3 : 2;
            accent.Flags = style == "blur" ? 2 : 0;
            accent.GradientColor = style == "transparent" ? 0 : unchecked((int)(((uint)alpha << 24) | ((uint)tint.B << 16) | ((uint)tint.G << 8) | tint.R));
            Native.SetBackdrop(window, 1); // Disable Windows 11's opaque system backdrop before applying accent.
            supported = Native.SetAccent(window, accent) && supported;
            return true;
        }, IntPtr.Zero);
        taskbarSupported = supported && found > 0;
    }
    static void RestoreTaskbars()
    {
        foreach (var entry in taskbars) { if (Native.IsWindow(entry.Key)) {
            Native.SetAccent(entry.Key, entry.Value.Captured ? entry.Value.Accent : new Native.AccentPolicy());
            Native.SetBackdrop(entry.Key, entry.Value.Backdrop);
            if (!entry.Value.Captured) Native.PostMessage(entry.Key, 0x031A, IntPtr.Zero, IntPtr.Zero);
        } }
        taskbars.Clear();
        taskbarSupported = true;
    }
    static string ScreenSignature() { string signature = ""; foreach (Screen s in Screen.AllScreens) signature += s.Bounds.ToString(); return signature; }
    static void SetCorners(bool enabled, int radius)
    {
        radius = Math.Max(6, Math.Min(60, radius));
        string signature = ScreenSignature();
        if (enabled == cornersEnabled && radius == cornerSize && signature == displaySignature) return;
        foreach (Form form in corners) form.Close();
        corners.Clear();
        cornersEnabled = enabled; cornerSize = radius; displaySignature = signature;
        if (!enabled) return;
        foreach (Screen s in Screen.AllScreens) {
            for (int i = 0; i < 4; i++) {
                bool right = i % 2 == 1, bottom = i >= 2;
                var form = new CornerForm();
                form.Bounds = new Rectangle(right ? s.Bounds.Right - radius : s.Bounds.Left, bottom ? s.Bounds.Bottom - radius : s.Bounds.Top, radius, radius);
                var region = new Region(new Rectangle(0, 0, radius, radius));
                using (var curve = new GraphicsPath()) { curve.AddEllipse(right ? -radius : 0, bottom ? -radius : 0, radius * 2, radius * 2); region.Exclude(curve); }
                form.Region = region;
                form.Show();
                corners.Add(form);
            }
        }
    }
    static void Restore()
    {
        if (quitting) return;
        quitting = true;
        refresh.Stop();
        SetHook(false);
        if (desktopChanged) SetDesktop(originalDesktopVisible, false);
        RestoreTaskbars();
        foreach (Form form in corners) form.Close();
        corners.Clear();
    }
    sealed class CornerForm : Form
    {
        public CornerForm() { AutoScaleMode = AutoScaleMode.None; FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true; BackColor = Color.Black; StartPosition = FormStartPosition.Manual; }
        protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); Native.SetLayeredWindowAttributes(Handle, 0, 255, 2); }
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000020 | 0x00080000 | 0x00000080; return cp; } }
        protected override void WndProc(ref Message m) { if (m.Msg == 0x84) { m.Result = new IntPtr(-1); return; } base.WndProc(ref m); }
    }
}

internal static class Native
{
    [StructLayout(LayoutKind.Sequential)] public struct Size { public int Width, Height; }
    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemImageFactory { [PreserveSig] int GetImage(Size size, uint flags, out IntPtr bitmap); }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)] static extern int SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IShellItemImageFactory item);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr handle);
    public static string ShellIcon(string target)
    {
        IShellItemImageFactory factory = null; IntPtr bitmap = IntPtr.Zero;
        try {
            Guid iid = typeof(IShellItemImageFactory).GUID;
            if (SHCreateItemFromParsingName(target, IntPtr.Zero, ref iid, out factory) != 0) return null;
            if (factory.GetImage(new Size { Width = 48, Height = 48 }, 0x4, out bitmap) != 0) return null;
            using (var image = Image.FromHbitmap(bitmap)) using (var buffer = new MemoryStream()) { image.Save(buffer, System.Drawing.Imaging.ImageFormat.Png); return "data:image/png;base64," + Convert.ToBase64String(buffer.ToArray()); }
        } catch { return null; } finally { if (bitmap != IntPtr.Zero) DeleteObject(bitmap); if (factory != null) Marshal.ReleaseComObject(factory); }
    }
    public delegate bool EnumProc(IntPtr window, IntPtr param);
    public delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int x; public int y; }
    [StructLayout(LayoutKind.Sequential)] public struct MouseData { public Point pt; public uint mouseData, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] public struct AccentPolicy { public int State, Flags, GradientColor, AnimationId; }
    [StructLayout(LayoutKind.Sequential)] struct CompositionData { public int Attribute; public IntPtr Data; public int Size; }
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr window, uint key, byte alpha, uint flags);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
    public static int GetBackdrop(IntPtr window) { int value; try { return DwmGetWindowAttribute(window, 38, out value, 4) == 0 ? value : 0; } catch { return 0; } }
    public static void SetBackdrop(IntPtr window, int value) { try { DwmSetWindowAttribute(window, 38, ref value, 4); } catch { } }
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr window, System.Text.StringBuilder cls, int max);
    [DllImport("user32.dll")] public static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
    [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr GetModuleHandle(string module);
    [DllImport("user32.dll")] static extern int SetWindowCompositionAttribute(IntPtr window, ref CompositionData data);
    [DllImport("user32.dll")] static extern int GetWindowCompositionAttribute(IntPtr window, ref CompositionData data);
    public static bool GetAccent(IntPtr window, out AccentPolicy accent)
    {
        accent = new AccentPolicy();
        IntPtr ptr = Marshal.AllocHGlobal(Marshal.SizeOf(accent));
        try { var data = new CompositionData { Attribute = 19, Data = ptr, Size = Marshal.SizeOf(accent) }; if (GetWindowCompositionAttribute(window, ref data) == 0) return false; accent = (AccentPolicy)Marshal.PtrToStructure(ptr, typeof(AccentPolicy)); return true; }
        catch { return false; } finally { Marshal.FreeHGlobal(ptr); }
    }
    public static bool SetAccent(IntPtr window, AccentPolicy accent)
    {
        IntPtr ptr = Marshal.AllocHGlobal(Marshal.SizeOf(accent));
        try { Marshal.StructureToPtr(accent, ptr, false); var data = new CompositionData { Attribute = 19, Data = ptr, Size = Marshal.SizeOf(accent) }; return SetWindowCompositionAttribute(window, ref data) != 0; }
        catch { return false; } finally { Marshal.FreeHGlobal(ptr); }
    }
}
