using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Kingdom Chronicle compatibility bridge")]
[assembly: AssemblyProduct("Kingdom Chronicle")]
[assembly: AssemblyCompany("Marko")]
internal static class LegacyBridgeInstaller
{
    [STAThread]
    private static int Main(string[] args)
    {
        string log = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Kingdom Chronicle", "updates", "bridge-installer.log");
        try
        {
            string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KingdomChronicle");
            RequirePlainDirectory(root);
            string current;
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\KingdomChronicle"))
            {
                if (key == null || (string)key.GetValue("DisplayName") != "Kingdom Chronicle"
                    || !String.Equals((string)key.GetValue("InstallLocation"), root, StringComparison.OrdinalIgnoreCase)
                    || !String.Equals((string)key.GetValue("UninstallString"), "\"" + Path.Combine(root, "Update.exe") + "\" --uninstall", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("This compatibility bridge requires an existing Kingdom Chronicle installation. Use the current full installer for a new installation.");
                current = (string)key.GetValue("DisplayVersion");
            }
            Version installed;
            if (!Version.TryParse(current, out installed) || installed > new Version(BridgePayload.Version))
                throw new InvalidOperationException("The installed version is newer than this compatibility bridge.");
            VerifyPackage(Path.Combine(root, "app-" + current), current);
            string destination = Path.Combine(root, "app-" + BridgePayload.Version);
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("BridgePackage"))
            {
                if (resource == null || Sha256(resource) != BridgePayload.Sha256) throw new InvalidDataException("The bridge payload failed verification.");
                resource.Position = 0;
                using (ZipArchive archive = new ZipArchive(resource, ZipArchiveMode.Read))
                {
                    if (Directory.Exists(destination)) VerifyExistingPayload(archive, destination);
                    else
                    {
                        // Add only one version folder. Setup.exe's clean-install path
                        // deletes the entire old root, including UserData and pins.
                        // Never run it for the migration compatibility hop.
                        string stage = Path.Combine(root, ".bridge-stage-" + Guid.NewGuid().ToString("N"));
                        Directory.CreateDirectory(stage);
                        foreach (ZipArchiveEntry entry in archive.Entries.Where(IsApplicationEntry))
                        {
                            string file = SafePayloadPath(stage, entry);
                            if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(file); continue; }
                            Directory.CreateDirectory(Path.GetDirectoryName(file));
                            using (Stream source = entry.Open())
                            using (Stream output = new FileStream(file, FileMode.CreateNew, FileAccess.Write)) source.CopyTo(output);
                        }
                        VerifyPackage(stage, BridgePayload.Version);
                        VerifyExistingPayload(archive, stage);
                        Directory.Move(stage, destination);
                    }
                }
            }
            Directory.CreateDirectory(Path.GetDirectoryName(log));
            File.AppendAllText(log, DateTime.UtcNow.ToString("o") + " Added bridge " + BridgePayload.Version + "; existing install root, UserData and shortcuts retained.\r\n");
            if (!args.Any(value => value.Equals("--silent", StringComparison.OrdinalIgnoreCase)))
                Process.Start(new ProcessStartInfo { FileName = Path.Combine(destination, "KingdomChronicle.exe"), WorkingDirectory = destination, UseShellExecute = true });
            // The existing updater repairs its durable launcher and launches this
            // version after --silent returns. The bridge migrates data at startup.
            return 0;
        }
        catch (Exception error)
        {
            try { Directory.CreateDirectory(Path.GetDirectoryName(log)); File.AppendAllText(log, DateTime.UtcNow.ToString("o") + " Bridge failed: " + error + "\r\n"); } catch { }
            if (!args.Any(value => value.Equals("--silent", StringComparison.OrdinalIgnoreCase)))
                MessageBox.Show("Kingdom Chronicle could not install the compatibility bridge. Your existing installation was retained.\n\n" + error.Message, "Kingdom Chronicle", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
    private static bool IsApplicationEntry(ZipArchiveEntry entry) { return entry.FullName.StartsWith("lib/net45/", StringComparison.Ordinal); }
    private static string SafePayloadPath(string root, ZipArchiveEntry entry)
    {
        string relative = entry.FullName.Substring("lib/net45/".Length).Replace('/', Path.DirectorySeparatorChar);
        string full = Path.GetFullPath(Path.Combine(root, relative));
        string prefix = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar);
        if (!String.Equals(full.TrimEnd(Path.DirectorySeparatorChar), prefix, StringComparison.OrdinalIgnoreCase)
            && !full.StartsWith(prefix + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Unsafe bridge archive path.");
        return full;
    }
    private static void RequirePlainDirectory(string directory)
    {
        if (!Directory.Exists(directory) || (File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidDataException("The installation directory is missing or linked; migration was deferred.");
    }
    private static void VerifyPackage(string directory, string version)
    {
        RequirePlainDirectory(directory);
        string metadata = Path.Combine(directory, "resources", "app", "package.json");
        if (!File.Exists(metadata) || new FileInfo(metadata).Length > 64000 || !File.Exists(Path.Combine(directory, "electron-runtime.bin")))
            throw new InvalidDataException("The legacy application package is incomplete.");
        var package = new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string, object>>(File.ReadAllText(metadata));
        if ((string)package["name"] != "kingdom-chronicle-desktop" || (string)package["version"] != version)
            throw new InvalidDataException("The legacy application identity does not match.");
    }
    private static void VerifyExistingPayload(ZipArchive archive, string root)
    {
        RequirePlainDirectory(root);
        foreach (ZipArchiveEntry entry in archive.Entries.Where(IsApplicationEntry))
        {
            string file = SafePayloadPath(root, entry);
            if (entry.FullName.EndsWith("/")) { RequirePlainDirectory(file); continue; }
            if (!File.Exists(file) || (File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0 || new FileInfo(file).Length != entry.Length)
                throw new InvalidDataException("The bridge version folder is incomplete or conflicting.");
            using (Stream expected = entry.Open())
            using (Stream actual = File.OpenRead(file)) if (Sha256(expected) != Sha256(actual)) throw new InvalidDataException("The bridge version folder failed verification.");
        }
    }
    private static string Sha256(Stream input)
    {
        using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(input)).Replace("-", "").ToLowerInvariant();
    }
}
