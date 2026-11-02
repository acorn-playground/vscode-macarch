// Connects VS Code's debugger to MacArch, which serves the Debug Adapter
// Protocol on a localhost port (Settings > Debugging). Starts MacArch if
// it isn't running.

const vscode = require("vscode");
const net = require("net");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const bundleID = "com.accidentalfish.macarch";
const defaultPort = 3200;

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForMacArch(port) {
  if (await canConnect(port)) return;
  await new Promise((resolve) => execFile("open", ["-g", "-b", bundleID], () => resolve()));
  for (let i = 0; i < 100; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (await canConnect(port)) return;
  }
  throw new Error(`MacArch isn't listening on port ${port}. Is it installed, with a ROM chosen and debugging on in Settings > Debugging?`);
}

// MARK: Baseline snapshots
//
// A baseline is a .macarchstate file MacArch restores at the start of each
// run (and saves on the first, when it doesn't exist yet). The one in use
// is the launch configuration's `snapshot`, or else the `macarch.snapshot`
// setting, which the Choose Baseline Snapshot command sets.

const snapshotFolder = ".vscode/snapshots";

// The workspace folder commands act on: the active editor's, or the first.
function currentFolder() {
  const editor = vscode.window.activeTextEditor;
  const folder = editor && vscode.workspace.getWorkspaceFolder(editor.document.uri);
  return folder || (vscode.workspace.workspaceFolders || [])[0];
}

// A path as written in a setting or launch.json, made absolute.
function resolvePath(p, folder) {
  if (folder) {
    p = p
      .replace(/\$\{workspaceFolder\}/g, folder.uri.fsPath)
      .replace(/\$\{workspaceFolderBasename\}/g, path.basename(folder.uri.fsPath));
  }
  if (p.startsWith("~/")) p = path.join(os.homedir(), p.slice(2));
  if (path.isAbsolute(p) || !folder) return p;
  return path.join(folder.uri.fsPath, p);
}

// The baseline chosen with the command (the setting), absolute, or null.
function chosenBaseline(folder) {
  const value = vscode.workspace.getConfiguration("macarch", folder && folder.uri).get("snapshot");
  return value ? resolvePath(value, folder) : null;
}

// Every baseline in use: the setting's and launch configurations' own.
function baselinesInUse() {
  const found = new Set();
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const chosen = chosenBaseline(folder);
    if (chosen) found.add(chosen);
    const configs = vscode.workspace.getConfiguration("launch", folder.uri).get("configurations") || [];
    for (const c of configs) {
      if (c.type === "macarch" && typeof c.snapshot === "string" && c.snapshot) found.add(resolvePath(c.snapshot, folder));
    }
  }
  return [...found];
}

async function setChosenBaseline(folder, value) {
  const multiRoot = (vscode.workspace.workspaceFolders || []).length > 1;
  await vscode.workspace
    .getConfiguration("macarch", folder.uri)
    .update("snapshot", value, multiRoot ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Workspace);
}

// Picks the baseline: one already in the workspace, a new one (taken on
// the next run), or none.
async function chooseBaseline() {
  const folder = currentFolder();
  if (!folder) {
    vscode.window.showWarningMessage("Open a folder first: baseline snapshots are kept in it.");
    return;
  }
  const current = chosenBaseline(folder);
  const files = (await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*.macarchstate"), "**/node_modules/**"))
    .map((u) => u.fsPath)
    .sort();
  if (current && !files.includes(current)) files.unshift(current); // chosen, not taken yet
  const items = files.map((file) => ({
    label: `${file === current ? "$(check)" : "$(device-camera)"} ${path.basename(file, ".macarchstate")}`,
    description: path.relative(folder.uri.fsPath, file),
    detail: fs.existsSync(file) ? undefined : "Not taken yet: the next run saves the machine as it is then",
    file,
  }));
  items.push(
    { label: "$(add) New baseline…", description: "Saved on the next run", action: "new" },
    { label: `${current ? "$(circle-slash)" : "$(check)"} None`, description: "Run from whatever state the machine is in", action: "none" }
  );
  const picked = await vscode.window.showQuickPick(items, { placeHolder: "Baseline snapshot for MacArch runs", matchOnDescription: true });
  if (!picked) return;
  if (picked.action === "none") {
    await setChosenBaseline(folder, undefined);
  } else if (picked.action === "new") {
    const name = await vscode.window.showInputBox({
      prompt: "Name the baseline. Set the machine up as you want it, then press F5 to take it.",
      placeHolder: "clean-desktop",
      validateInput: (v) => (/^[^/\\:]+$/.test(v.trim()) ? null : "A name, without slashes"),
    });
    if (!name) return;
    const file = path.join(folder.uri.fsPath, snapshotFolder, `${name.trim()}.macarchstate`);
    await setChosenBaseline(folder, path.relative(folder.uri.fsPath, file));
    if (fs.existsSync(file)) {
      vscode.window.showInformationMessage(`${path.basename(file)} already exists, so runs will start from it.`);
    }
  } else {
    await setChosenBaseline(folder, path.relative(folder.uri.fsPath, picked.file));
  }
  warnIfOverridden(folder);
}

// launch.json's own `snapshot` wins over the setting: say so.
function warnIfOverridden(folder) {
  const configs = vscode.workspace.getConfiguration("launch", folder.uri).get("configurations") || [];
  const own = configs.filter((c) => c.type === "macarch" && c.request === "launch" && typeof c.snapshot === "string").map((c) => c.name);
  if (own.length > 0) {
    vscode.window.showInformationMessage(`${own.map((n) => `"${n}"`).join(", ")} in launch.json name${own.length === 1 ? "s its" : " their"} own snapshot, which wins over this choice.`);
  }
}

// Deletes a baseline, so the next run saves the machine as it is then.
async function forgetBaseline() {
  const existing = baselinesInUse().filter((p) => fs.existsSync(p));
  if (existing.length === 0) {
    vscode.window.showInformationMessage("There's no baseline snapshot to forget: none has been taken yet.");
    return;
  }
  const chosen =
    existing.length === 1
      ? existing[0]
      : await vscode.window.showQuickPick(existing, { placeHolder: "Which baseline snapshot should be taken again?" });
  if (!chosen) return;
  fs.unlinkSync(chosen);
  vscode.window.showInformationMessage(`Forgot ${path.basename(chosen)}: the next run saves the machine as it is then as the new baseline.`);
}

// The status bar shows the chosen baseline while an ARM or BASIC file is
// open; clicking it chooses another.
function baselineStatus(context) {
  const item = vscode.window.createStatusBarItem("macarch.baseline", vscode.StatusBarAlignment.Left, 50);
  item.name = "MacArch Baseline Snapshot";
  item.command = "macarch.chooseBaseline";
  const update = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !["arm-macarch", "bbcbasic"].includes(editor.document.languageId)) {
      item.hide();
      return;
    }
    const file = chosenBaseline(currentFolder());
    if (!file) {
      item.text = "$(device-camera) No baseline";
      item.tooltip = "MacArch runs start from whatever state the machine is in. Click to choose a baseline snapshot.";
    } else if (fs.existsSync(file)) {
      item.text = `$(device-camera) ${path.basename(file, ".macarchstate")}`;
      item.tooltip = `MacArch runs start from ${file}. Click to choose another.`;
    } else {
      item.text = `$(device-camera) ${path.basename(file, ".macarchstate")} (not taken)`;
      item.tooltip = `The next MacArch run saves the machine as it is then to ${file}. Click to choose another.`;
    }
    item.show();
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.macarchstate");
  context.subscriptions.push(
    item,
    watcher,
    watcher.onDidCreate(update),
    watcher.onDidDelete(update),
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("macarch.snapshot") && update())
  );
  update();
}

function activate(context) {
  baselineStatus(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("macarch.chooseBaseline", chooseBaseline),
    vscode.commands.registerCommand("macarch.forgetBaseline", forgetBaseline),
    vscode.debug.registerDebugAdapterDescriptorFactory("macarch", {
      async createDebugAdapterDescriptor(session) {
        const port = session.configuration.port || defaultPort;
        await waitForMacArch(port);
        return new vscode.DebugAdapterServer(port, "127.0.0.1");
      },
    }),
    vscode.debug.registerDebugConfigurationProvider("macarch", {
      resolveDebugConfiguration(folder, config) {
        // F5 with no launch.json: assemble and run the ARM source in the
        // editor, or run the BASIC program.
        if (!config.type && !config.request) {
          const editor = vscode.window.activeTextEditor;
          if (editor && editor.document.languageId === "arm-macarch") {
            config.type = "macarch";
            config.request = "launch";
            config.name = "Assemble and run";
            config.source = editor.document.fileName;
          } else if (editor && editor.document.languageId === "bbcbasic") {
            config.type = "macarch";
            config.request = "launch";
            config.name = "Run BASIC on the Archimedes";
            config.basic = editor.document.fileName;
          }
        }
        // The chosen baseline, unless launch.json names its own ("" for none).
        if (config.request === "launch") {
          if (config.snapshot === undefined) {
            const chosen = chosenBaseline(folder || currentFolder());
            if (chosen) config.snapshot = chosen;
          } else if (config.snapshot === "") {
            delete config.snapshot;
          }
        }
        // Save before assembling (or loading BASIC).
        if (config.source || config.basic) {
          return vscode.workspace.saveAll(false).then(() => config);
        }
        return config;
      },
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
