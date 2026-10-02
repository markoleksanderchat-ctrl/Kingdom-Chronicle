using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyTitle("Kingdom Chronicle")]
[assembly: System.Reflection.AssemblyDescription("Read-only MineColonies companion powered by Colony Bridge")]
[assembly: System.Reflection.AssemblyCompany("Marko")]
[assembly: System.Reflection.AssemblyProduct("Kingdom Chronicle")]
internal static class KingdomChronicleLauncher
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length == 4
                && args[0].Equals("--complete-update", StringComparison.OrdinalIgnoreCase))
            {
                return CompleteUpdate(args[1], args[2], args[3]);
            }

            string launcherDirectory = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            string baseDirectory = ResolveApplicationDirectory(launcherDirectory);
            string squirrelEvent = args.FirstOrDefault(value => value.StartsWith("--squirrel-", StringComparison.OrdinalIgnoreCase));

            EnsureRuntimeReadAccess(baseDirectory);
            EnsureUserDataWriteAccess(baseDirectory);

            if (squirrelEvent != null && HandleSquirrelEvent(baseDirectory, squirrelEvent))
            {
                return 0;
            }

            RepairDurableLauncher(baseDirectory);
            RepairInstalledRegistration(baseDirectory);
            RepairStartMenuShortcut(baseDirectory);

            // Electron identifies electron.exe as a development runtime, which
            // disables electron-updater even inside the installed bridge.
            string runtimePath = Path.Combine(baseDirectory, "KingdomChronicleRuntime.exe");
            string runtimePayload = Path.Combine(baseDirectory, "electron-runtime.bin");
            string iconPath = Path.Combine(baseDirectory, "kingdom-chronicle.ico");
            string iconPayload = Path.Combine(baseDirectory, "kingdom-chronicle-icon.bin");
            string appDirectory = Path.Combine(baseDirectory, "resources", "app");

            if (!File.Exists(runtimePath) && File.Exists(runtimePayload))
            {
                File.Copy(runtimePayload, runtimePath, true);
                EnsureRuntimeReadAccess(baseDirectory);
            }

            if (!File.Exists(iconPath) && File.Exists(iconPayload))
            {
                File.Copy(iconPayload, iconPath, true);
            }

            if (!File.Exists(runtimePath) || !Directory.Exists(appDirectory))
            {
                MessageBox.Show(
                    "Kingdom Chronicle is incomplete. Reinstall the app and try again.",
                    "Kingdom Chronicle",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 2;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = runtimePath,
                Arguments = ".",
                WorkingDirectory = appDirectory,
                UseShellExecute = false,
                CreateNoWindow = true
            });
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "Kingdom Chronicle could not start.\n\n" + error.Message,
                "Kingdom Chronicle",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    private static int CompleteUpdate(string parentProcessId, string installerPath, string installRoot)
    {
        int parentId;
        if (!int.TryParse(parentProcessId, out parentId)
            || !Path.IsPathRooted(installerPath)
            || !Path.IsPathRooted(installRoot)
            || !File.Exists(installerPath))
        {
            throw new InvalidOperationException("The verified update request was incomplete.");
        }

        try
        {
            using (Process parent = Process.GetProcessById(parentId))
            {
                parent.WaitForExit(30000);
            }
        }
        catch (ArgumentException)
        {
            // The desktop process already closed.
        }

        using (Process installer = Process.Start(new ProcessStartInfo
        {
            FileName = installerPath,
            Arguments = "--silent",
            WorkingDirectory = Path.GetDirectoryName(installerPath),
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        }))
        {
            if (installer == null || !installer.WaitForExit(600000) || installer.ExitCode != 0)
            {
                throw new InvalidOperationException("The verified installer did not complete successfully.");
            }
        }

        string applicationDirectory = ResolveApplicationDirectory(Path.GetFullPath(installRoot));
        string launcherPath = Path.Combine(applicationDirectory, "KingdomChronicle.exe");
        for (int attempt = 0; attempt < 40 && !File.Exists(launcherPath); attempt++)
        {
            System.Threading.Thread.Sleep(500);
            applicationDirectory = ResolveApplicationDirectory(Path.GetFullPath(installRoot));
            launcherPath = Path.Combine(applicationDirectory, "KingdomChronicle.exe");
        }
        if (!File.Exists(launcherPath))
        {
            throw new FileNotFoundException("The updated Kingdom Chronicle launcher was not found.", launcherPath);
        }

        System.Threading.Thread.Sleep(1000);
        RepairDurableLauncher(applicationDirectory);
        RepairInstalledRegistration(applicationDirectory);
        RepairStartMenuShortcut(applicationDirectory);
        launcherPath = Path.Combine(Path.GetFullPath(installRoot), "KingdomChronicle.exe");
        Process.Start(new ProcessStartInfo
        {
            FileName = launcherPath,
            WorkingDirectory = applicationDirectory,
            UseShellExecute = true
        });
        return 0;
    }

    private static string ResolveApplicationDirectory(string launcherDirectory)
    {
        if (Path.GetFileName(launcherDirectory).StartsWith("app-", StringComparison.OrdinalIgnoreCase))
        {
            return launcherDirectory;
        }

        return Directory.GetDirectories(launcherDirectory, "app-*")
            .Select(directory => new
            {
                Directory = directory,
                Version = ParseApplicationVersion(Path.GetFileName(directory))
            })
            .Where(candidate => candidate.Version != null
                && Directory.Exists(Path.Combine(candidate.Directory, "resources", "app")))
            .OrderByDescending(candidate => candidate.Version)
            .Select(candidate => candidate.Directory)
            .FirstOrDefault() ?? launcherDirectory;
    }

    private static Version ParseApplicationVersion(string directoryName)
    {
        Version version;
        return directoryName.StartsWith("app-", StringComparison.OrdinalIgnoreCase)
            && Version.TryParse(directoryName.Substring(4), out version)
            ? version
            : null;
    }

    private static void RepairInstalledRegistration(string baseDirectory)
    {
        string installRoot = Path.GetFullPath(Path.Combine(baseDirectory, ".."));
        string targetPath = Path.Combine(installRoot, "KingdomChronicle.exe");
        string displayVersion = Assembly.GetExecutingAssembly().GetName().Version.ToString(3);

        using (RegistryKey uninstall = Registry.CurrentUser.OpenSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\KingdomChronicle",
            true))
        {
            if (uninstall == null)
            {
                return;
            }

            uninstall.SetValue("DisplayVersion", displayVersion, RegistryValueKind.String);
            uninstall.SetValue("InstallLocation", installRoot, RegistryValueKind.String);
            uninstall.SetValue("DisplayIcon", targetPath + ",0", RegistryValueKind.String);
        }
    }

    private static void RepairDurableLauncher(string baseDirectory)
    {
        string installRoot = Path.GetFullPath(Path.Combine(baseDirectory, ".."));
        string sourcePath = Path.Combine(baseDirectory, "KingdomChronicle.exe");
        string targetPath = Path.Combine(installRoot, "KingdomChronicle.exe");
        if (!File.Exists(sourcePath)
            || sourcePath.Equals(targetPath, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        string pendingPath = targetPath + "." + Process.GetCurrentProcess().Id + ".new";
        Exception lastError = null;
        for (int attempt = 0; attempt < 12; attempt++)
        {
            try
            {
                if (File.Exists(pendingPath)) File.Delete(pendingPath);
                File.Copy(sourcePath, pendingPath, true);
                if (File.Exists(targetPath))
                {
                    File.Replace(pendingPath, targetPath, null, true);
                }
                else
                {
                    File.Move(pendingPath, targetPath);
                }

                string sourceVersion = FileVersionInfo.GetVersionInfo(sourcePath).FileVersion;
                string targetVersion = FileVersionInfo.GetVersionInfo(targetPath).FileVersion;
                if (!String.Equals(sourceVersion, targetVersion, StringComparison.OrdinalIgnoreCase))
                {
                    throw new IOException("The durable launcher version did not match the installed app.");
                }

                foreach (string stalePending in Directory.GetFiles(installRoot, "KingdomChronicle.exe.*.new"))
                {
                    try { File.Delete(stalePending); }
                    catch (IOException) { }
                    catch (UnauthorizedAccessException) { }
                }
                return;
            }
            catch (IOException error)
            {
                lastError = error;
            }
            catch (UnauthorizedAccessException error)
            {
                lastError = error;
            }
            System.Threading.Thread.Sleep(250);
        }

        try { if (File.Exists(pendingPath)) File.Delete(pendingPath); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        throw new IOException("The durable Kingdom Chronicle launcher could not be repaired.", lastError);
    }

    private static void RepairStartMenuShortcut(string baseDirectory)
    {
        string installRoot = Path.GetFullPath(Path.Combine(baseDirectory, ".."));
        DirectoryInfo localAppData = Directory.GetParent(installRoot);
        DirectoryInfo appData = localAppData == null ? null : localAppData.Parent;
        DirectoryInfo userProfile = appData == null ? null : appData.Parent;
        if (userProfile == null)
        {
            return;
        }

        string programsDirectory = Path.Combine(
            userProfile.FullName,
            "AppData",
            "Roaming",
            "Microsoft",
            "Windows",
            "Start Menu",
            "Programs");
        string targetPath = Path.Combine(installRoot, "KingdomChronicle.exe");

        if (!File.Exists(targetPath))
        {
            return;
        }

        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null)
        {
            return;
        }

        object shell = Activator.CreateInstance(shellType);
        try
        {
            string oneDriveDesktop = Path.Combine(userProfile.FullName, "OneDrive", "Desktop");
            string desktopDirectory = Directory.Exists(oneDriveDesktop)
                ? oneDriveDesktop
                : Path.Combine(userProfile.FullName, "Desktop");
            string[] shortcutPaths =
            {
                Path.Combine(programsDirectory, "Kingdom Chronicle.lnk"),
                Path.Combine(programsDirectory, "Marko", "Kingdom Chronicle.lnk"),
                Path.Combine(desktopDirectory, "Kingdom Chronicle.lnk")
            };

            foreach (string shortcutPath in shortcutPaths)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(shortcutPath));
                object shortcut = null;
                try
                {
                    shortcut = shellType.InvokeMember(
                        "CreateShortcut",
                        BindingFlags.InvokeMethod,
                        null,
                        shell,
                        new object[] { shortcutPath });
                    Type shortcutType = shortcut.GetType();
                    shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                    shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { installRoot });
                    shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath + ",0" });
                    shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { "Open Kingdom Chronicle" });
                    shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
                }
                finally
                {
                    if (shortcut != null && Marshal.IsComObject(shortcut)) Marshal.FinalReleaseComObject(shortcut);
                }
            }
        }
        finally
        {
            if (shell != null && Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell);
        }
    }

    private static void EnsureUserDataWriteAccess(string baseDirectory)
    {
        string installRoot = Path.GetFullPath(Path.Combine(baseDirectory, ".."));
        string userDataDirectory = Path.Combine(installRoot, "UserData");
        Directory.CreateDirectory(userDataDirectory);

        string icaclsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "icacls.exe");
        if (!File.Exists(icaclsPath))
        {
            return;
        }

        using (Process permissions = Process.Start(new ProcessStartInfo
        {
            FileName = icaclsPath,
            Arguments = "\"" + userDataDirectory + "\" /grant *S-1-15-2-1:(OI)(CI)M /T /C /Q",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        }))
        {
            if (permissions != null)
            {
                permissions.WaitForExit(15000);
            }
        }
    }

    private static void EnsureRuntimeReadAccess(string baseDirectory)
    {
        string icaclsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "icacls.exe");
        if (!File.Exists(icaclsPath))
        {
            return;
        }

        using (Process permissions = Process.Start(new ProcessStartInfo
        {
            FileName = icaclsPath,
            Arguments = "\"" + baseDirectory + "\" /grant *S-1-1-0:(OI)(CI)RX *S-1-15-2-1:(OI)(CI)RX /T /C /Q",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        }))
        {
            if (permissions != null)
            {
                permissions.WaitForExit(15000);
            }
        }
    }

    private static bool HandleSquirrelEvent(string baseDirectory, string squirrelEvent)
    {
        if (squirrelEvent.Equals("--squirrel-obsolete", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        string updatePath = Path.GetFullPath(Path.Combine(baseDirectory, "..", "Update.exe"));
        if (!File.Exists(updatePath))
        {
            return true;
        }

        string action = squirrelEvent.Equals("--squirrel-uninstall", StringComparison.OrdinalIgnoreCase)
            ? "--removeShortcut"
            : "--createShortcut";

        using (Process update = Process.Start(new ProcessStartInfo
        {
            FileName = updatePath,
            Arguments = action + " KingdomChronicle.exe",
            UseShellExecute = false,
            CreateNoWindow = true
        }))
        {
            if (update != null)
            {
                update.WaitForExit(15000);
            }
        }

        if (!squirrelEvent.Equals("--squirrel-uninstall", StringComparison.OrdinalIgnoreCase))
        {
            RepairDurableLauncher(baseDirectory);
            RepairInstalledRegistration(baseDirectory);
            RepairStartMenuShortcut(baseDirectory);
        }

        return !squirrelEvent.Equals("--squirrel-firstrun", StringComparison.OrdinalIgnoreCase);
    }
}
