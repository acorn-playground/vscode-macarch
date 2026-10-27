# Changelog

## 0.1.0

The first release.

- Debug ARM programs on MacArch's Acorn Archimedes: press F5 in a `.s` or `.arm` file and MacArch assembles it (BBC BASIC V's assembler syntax), loads it and runs it.
- Breakpoints in your source (with conditions, hit counts and log points), stepping over, into, out of and back, reverse continue, registers and flags to edit, the banked registers, memory, disassembly with source lines, and data breakpoints (watchpoints). What the program prints appears in the debug console.
- Binaries built some other way, with a label file for symbols, and attaching to whatever's running.
- BBC BASIC programs (.bas): breakpoints on lines with conditions in BASIC, stepping a statement at a time, PROC and FN calls, variables and arrays, and stopping on errors.
- Any of MacArch's machines, from the A305 to the A5000 and A4000, and a floppy image in drive 0.
- Syntax highlighting for ARM assembler and BBC BASIC.
