# MacArch debugger for VS Code

Write ARM assembler and debug it on MacArch's emulated Acorn Archimedes:
press F5 and it is assembled, loaded and run, with breakpoints in your
source (conditional ones, hit counts and log points too), stepping over,
into, out of and back, registers and flags you can edit, the banked
registers, memory, disassembly, watchpoints (data breakpoints) on any
address, and what the program prints in the debug console. It talks to
MacArch over the Debug Adapter Protocol on localhost port 3200 (Settings >
Debugging in MacArch).

**You need [MacArch](https://github.com/acorn-playground/macarch), the Acorn
Archimedes emulator for the Mac** ([download](https://github.com/acorn-playground/macarch/releases/latest);
macOS 26), and a RISC OS ROM of your own. The extension starts MacArch if
it isn't running. MacArch assembles ARM sources itself, so there's nothing
else to install.

## Install

From the Extensions view: search for "MacArch". Or build it yourself:

    git clone https://github.com/acorn-playground/vscode-macarch.git
    cd vscode-macarch
    npx @vscode/vsce package
    code --install-extension macarch-debug-0.1.0.vsix

Or, to try it, open this folder in VS Code and press F5 (Extension
Development Host).

## Use

Open a `.s` (or `.arm`) file and press F5: MacArch assembles it, goes to
the `*` prompt (F12 from the desktop), loads the code at its `ORG` (default
&8000), and starts it with `*Go`. Programs end with `SWI OS_Exit`. Or in
`.vscode/launch.json`:

    {
      "type": "macarch",
      "request": "launch",
      "name": "Assemble and run",
      "source": "${workspaceFolder}/game.s",
      "stopOnEntry": true
    }

`model` switches the machine first (`A3000`, `A5000`, `A440/1`...), `disc`
puts a floppy image in drive 0, and `program` (with `loadAddress` and
`execAddress`) runs a binary built some other way, with `symbols` for a
label file. `attach` debugs whatever is running.

Assembly errors appear in the debug console as `file:line: message`.

### Starting from a baseline

To start every run from the same machine, rather than whatever state the
last run left behind, use a baseline snapshot. Run **MacArch: Choose
Baseline Snapshot** from the Command Palette, or click the camera in the
status bar while an ARM or BASIC file is open, and pick **New baseline…**
and give it a name. Then set the machine up how you want it, for example
with a mode chosen or modules loaded, and press F5. Because the file
doesn't exist yet, MacArch saves the machine as it is then to
`.vscode/snapshots/<name>.macarchstate` (after switching to the configured
`model`, before putting `disc` in the drive). Every run after that restores
it before loading your program, and keeps your breakpoints.

You can keep as many baselines as you like (say, `clean-desktop` and
`mode-13`) and switch between them with the same command: it lists every
`.macarchstate` file in the workspace, plus **None** to stop using one. The
choice is the `macarch.snapshot` setting in `.vscode/settings.json`. To take
a baseline again, run **MacArch: Forget Baseline Snapshot** (or delete the
file), then press F5.

A launch configuration can name its own, which wins over the chosen one
(`"snapshot": ""` for none):

    {
      "type": "macarch",
      "request": "launch",
      "name": "Assemble and run (from baseline)",
      "source": "${workspaceFolder}/game.s",
      "snapshot": "${workspaceFolder}/.vscode/snapshots/clean-desktop.macarchstate"
    }

Baselines need MacArch 0.5.4 or later. Snapshots are binary and only restore with the ROM they were taken with, so you may want
`.vscode/snapshots/` in `.gitignore`.

A snapshot belongs to the ROM it was taken with. Floppies are recorded by
path and contents, so a disc that was in the drive when the baseline was
taken must still be unchanged (the `disc` setting's image is inserted
afterwards, so it can change). Hard discs are reattached as they are now,
not rolled back.

The assembler takes BBC BASIC V's assembler syntax as a file of its own,
so `.label`, `ADDEQS`, `LDMFD R13!, {R0-R3, PC}^`, `SWI "OS_Write0"`,
`EQUS`/`EQUB`/`EQUD` and `ALIGN` all work, along with `LDR R0, =value`,
`ADR`/`ADRL`, `INCLUDE`, `name EQU value` and comments after `;` or `\`.
See [Examples/hello-arm](https://github.com/acorn-playground/macarch/tree/main/Examples/hello-arm), and the Assembler section of
MacArch's [README](https://github.com/acorn-playground/macarch#readme).

For BBC BASIC, press F5 in a `.bas` file, or:

    {
      "type": "macarch",
      "request": "launch",
      "name": "Run BASIC on the Archimedes",
      "basic": "${workspaceFolder}/game.bas"
    }

The program can be text, with or without line numbers (lines without are
numbered on in tens), or tokenised as SAVE writes it (it's listed to a file
to show). MacArch goes to BASIC's prompt (F12 and `BASIC` from the desktop),
loads the program at PAGE and RUNs it. Breakpoints go on its lines, with
conditions in BASIC (`I%>10`); F10/F11/Shift-F11 step a statement at a time
over, into and out of PROCs, FNs and GOSUBs; the call stack is the PROC and
FN calls; the Variables view has BASIC's variables, LOCALs first; the debug
console and hovers evaluate BASIC expressions. Turn on the BASIC errors
exception breakpoint to stop where an error happens. `stopOnEntry` stops at
the first statement. See [Examples/hello-basic](https://github.com/acorn-playground/macarch/tree/main/Examples/hello-basic) in MacArch.

In the debug console, expressions use registers, flags, symbols and
memory: `R0`, `PC+4`, `[R1]` (a byte), `{R13}` (a word), `greeting`,
`hello.s:20` (the address of a line). Hovering over a label shows its
address and the memory there.

## Licence

GNU General Public License v3 (see [LICENSE](LICENSE)), like MacArch.
