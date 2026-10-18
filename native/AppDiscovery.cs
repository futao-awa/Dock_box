using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Win32;

// Runs on an STA worker. Never starts the applications being inspected.
internal static class AppDiscovery
{
    static object Get(object obj, string name, params object[] args) { return obj.GetType().InvokeMember(name, BindingFlags.GetProperty | BindingFlags.InvokeMethod, null, obj, args); }
    static void Release(object obj) { if (obj != null && Marshal.IsComObject(obj)) Marshal.ReleaseComObject(obj); }
    static string Property(object item, string key) { try { return Convert.ToString(Get(item, "ExtendedProperty", key)); } catch { return ""; } }
    static string Product(string file) { try { string name = System.Diagnostics.FileVersionInfo.GetVersionInfo(file).ProductName; if (!String.IsNullOrWhiteSpace(name)) return name; } catch { } return Path.GetFileNameWithoutExtension(file); }
    public static List<object> Inspect(string[] files)
    {
        var result = new List<object>(); object wsh = null, shell = null;
        try {
            wsh = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
            shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application"));
            foreach (string file in files) {
                if (result.Count >= 1600) break;
                var entry = InspectFile(file, wsh, shell); if (entry != null) result.Add(entry);
            }
        } finally { Release(shell); Release(wsh); }
        return result;
    }
    static Dictionary<string, string> InspectFile(string file, object wsh, object shell)
    {
        if (!File.Exists(file)) return null;
        string target = file, args = "", cwd = "", icon = "", aumid = "", name = Path.GetFileNameWithoutExtension(file);
        string extension = Path.GetExtension(file).ToLowerInvariant();
        if (extension == ".lnk") {
            object link = null, folder = null, item = null;
            try {
                link = Get(wsh, "CreateShortcut", file);
                target = Environment.ExpandEnvironmentVariables(Convert.ToString(Get(link, "TargetPath")));
                args = Convert.ToString(Get(link, "Arguments")); cwd = Convert.ToString(Get(link, "WorkingDirectory"));
                icon = Convert.ToString(Get(link, "IconLocation"));
                folder = Get(shell, "NameSpace", Path.GetDirectoryName(file)); item = Get(folder, "ParseName", Path.GetFileName(file));
                aumid = Property(item, "System.AppUserModel.ID");
                string display = Convert.ToString(Get(item, "Name")); if (!String.IsNullOrWhiteSpace(display)) name = display;
                if (name.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)) name = name.Substring(0, name.Length - 4);
            } catch { } finally { Release(item); Release(folder); Release(link); }
        } else if (extension == ".url") {
            foreach (string line in File.ReadAllLines(file)) {
                if (line.StartsWith("URL=", StringComparison.OrdinalIgnoreCase)) target = line.Substring(4).Trim();
                if (line.StartsWith("IconFile=", StringComparison.OrdinalIgnoreCase)) icon = line.Substring(9).Trim();
            }
        }
        bool packaged = aumid.Contains("!");
        if (packaged) target = "shell:AppsFolder\\" + aumid;
        bool exists = packaged || File.Exists(target) || Directory.Exists(target) || target.StartsWith("http", StringComparison.OrdinalIgnoreCase);
        // The shortcut remains the launch target, preserving shell verbs and arguments.
        return new Dictionary<string, string> {
            { "name", name }, { "target", file }, { "resolvedTarget", target }, { "resolvedArguments", args }, { "workingDirectory", cwd },
            { "appId", aumid }, { "icon", Icon(icon, target) ?? "" }, { "source", "shortcut" }, { "available", exists ? "true" : "false" }
        };
    }
    public static List<object> Discover(string[] files)
    {
        var result = Inspect(files); object shell = null, folder = null, items = null;
        try {
            shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")); folder = Get(shell, "NameSpace", "shell:AppsFolder"); items = Get(folder, "Items");
            int count = Math.Min(1600, Convert.ToInt32(Get(items, "Count")));
            for (int i = 0; i < count; i++) {
                object item = null;
                try {
                    item = Get(items, "Item", i); string name = Convert.ToString(Get(item, "Name")); string id = Convert.ToString(Get(item, "Path"));
                    // Win32 virtual entries lack reliable launch paths. Shortcuts / App Paths cover them.
                    if (String.IsNullOrWhiteSpace(name) || !id.Contains("!")) continue;
                    string target = "shell:AppsFolder\\" + id;
                    result.Add(new Dictionary<string, string> { { "name", name }, { "target", target }, { "resolvedTarget", target }, { "appId", id }, { "icon", ShellIcon(target) ?? "" }, { "source", "packaged" }, { "available", "true" } });
                } catch { } finally { Release(item); }
            }
        } catch { } finally { Release(items); Release(folder); Release(shell); }
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (RegistryHive hive in new RegistryHive[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine }) {
            foreach (RegistryView view in new RegistryView[] { RegistryView.Registry64, RegistryView.Registry32 }) {
                try { using (var root = RegistryKey.OpenBaseKey(hive, view)) {
                    using (var paths = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths")) {
                        if (paths != null) foreach (string key in paths.GetSubKeyNames()) using (var entry = paths.OpenSubKey(key)) {
                            AddRegistered(result, seen, Convert.ToString(entry.GetValue("")), null);
                        }
                    }
                    using (var installed = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")) {
                        if (installed != null) foreach (string key in installed.GetSubKeyNames()) using (var entry = installed.OpenSubKey(key)) {
                            if (Convert.ToString(entry.GetValue("SystemComponent")) == "1" || entry.GetValue("ParentKeyName") != null) continue;
                            string display = Convert.ToString(entry.GetValue("DisplayIcon")); int index;
                            AddRegistered(result, seen, IconPath(display, out index), Convert.ToString(entry.GetValue("DisplayName")));
                        }
                    }
                } } catch { }
            }
        }
        return result;
    }
    static void AddRegistered(List<object> result, HashSet<string> seen, string file, string name)
    {
        file = Environment.ExpandEnvironmentVariables((file ?? "").Trim().Trim('"'));
        if (!Path.IsPathRooted(file) || !File.Exists(file) || !file.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) return;
        string basename = Path.GetFileNameWithoutExtension(file).ToLowerInvariant();
        if (basename.Contains("unins") || basename.Contains("uninst") || basename == "setup" || basename == "installer" || basename == "update" || basename == "updater") return;
        if (!seen.Add(file)) return;
        result.Add(new Dictionary<string, string> { { "name", String.IsNullOrWhiteSpace(name) ? Product(file) : name }, { "target", file }, { "resolvedTarget", file }, { "icon", Icon(null, file) ?? "" }, { "source", "registry" }, { "available", "true" } });
    }
    static string IconPath(string reference, out int index)
    {
        index = 0; string file = (reference ?? "").Trim(); int comma = file.LastIndexOf(','); int parsed;
        if (comma >= 0 && Int32.TryParse(file.Substring(comma + 1), out parsed)) { index = parsed; file = file.Substring(0, comma); }
        return Environment.ExpandEnvironmentVariables(file.Trim().Trim('"'));
    }
    public static string Icon(string reference, string target)
    {
        int index; string file = IconPath(reference, out index);
        string icon = String.IsNullOrEmpty(file) ? null : index == 0 ? ShellIcon(file) ?? Extract(file, index) : Extract(file, index);
        if (icon != null) return icon;
        return ShellIcon(target) ?? Extract(target, 0);
    }
    static string Extract(string file, int index)
    {
        if (String.IsNullOrEmpty(file) || !File.Exists(file)) return null;
        IntPtr[] large = new IntPtr[1], small = new IntPtr[1];
        try {
            if (ExtractIconEx(file, index, large, small, 1) == 0 || large[0] == IntPtr.Zero) return null;
            using (var icon = System.Drawing.Icon.FromHandle(large[0])) using (var bitmap = icon.ToBitmap()) return Encode(bitmap);
        } catch { return null; } finally { if (large[0] != IntPtr.Zero) DestroyIcon(large[0]); if (small[0] != IntPtr.Zero) DestroyIcon(small[0]); }
    }
    static string Encode(Image image) { using (var stream = new MemoryStream()) { image.Save(stream, ImageFormat.Png); return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray()); } }
    public static string ShellIcon(string target)
    {
        IShellItemImageFactory factory = null; IntPtr handle = IntPtr.Zero, dc = IntPtr.Zero;
        try {
            Guid iid = typeof(IShellItemImageFactory).GUID;
            if (SHCreateItemFromParsingName(target, IntPtr.Zero, ref iid, out factory) != 0 || factory.GetImage(new Size { Width = 64, Height = 64 }, 0x5, out handle) != 0) return null;
            BitmapInfo info = new BitmapInfo(); info.Size = Marshal.SizeOf(info); dc = GetDC(IntPtr.Zero);
            GetDIBits(dc, handle, 0, 0, null, ref info, 0);
            int width = info.Width, height = Math.Abs(info.Height); if (width <= 0 || height <= 0 || width > 512 || height > 512) return null;
            info.BitCount = 32; info.Planes = 1; info.Compression = 0; info.Height = -height;
            byte[] pixels = new byte[width * height * 4]; if (GetDIBits(dc, handle, 0, (uint)height, pixels, ref info, 0) == 0) return null;
            bool alpha = false; for (int n = 3; n < pixels.Length; n += 4) if (pixels[n] != 0) { alpha = true; break; }
            if (!alpha) for (int n = 3; n < pixels.Length; n += 4) pixels[n] = 255;
            using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
                var data = bitmap.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                try { Marshal.Copy(pixels, 0, data.Scan0, pixels.Length); } finally { bitmap.UnlockBits(data); }
                return Encode(bitmap);
            }
        } catch { return null; } finally { if (dc != IntPtr.Zero) ReleaseDC(IntPtr.Zero, dc); if (handle != IntPtr.Zero) DeleteObject(handle); Release(factory); }
    }
    [StructLayout(LayoutKind.Sequential)] struct Size { public int Width, Height; }
    [StructLayout(LayoutKind.Sequential)] struct BitmapInfo { public int Size, Width, Height; public short Planes, BitCount; public int Compression, ImageSize, XPels, YPels, Used, Important; }
    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IShellItemImageFactory { [PreserveSig] int GetImage(Size size, uint flags, out IntPtr bitmap); }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IShellItemImageFactory item);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern uint ExtractIconEx(string file, int index, IntPtr[] large, IntPtr[] small, uint count);
    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window, IntPtr dc);
    [DllImport("gdi32.dll")] static extern int GetDIBits(IntPtr dc, IntPtr bitmap, uint start, uint lines, byte[] bits, ref BitmapInfo info, uint usage);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr handle);
}
