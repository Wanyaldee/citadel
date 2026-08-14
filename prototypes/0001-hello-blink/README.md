# RFC 0001 Prototype: hello-blink

*[日本語](./README.ja.md)*

A minimal prototype that verifies one of the open items in [RFC 0001](../../docs/rfcs/0001-hybrid-architecture.md): whether the Rust/C hybrid architecture can actually build and link. Targets the ATmega328P (Arduino Uno/Nano/Pro Mini class boards).

## Layout

- `rust/` — the logic layer. A `#![no_std]` staticlib. `citadel_tick()` computes the LED-blink state (0/1). All branching and state live here.
- `cpp/io.cpp` — the I/O layer (stands in for a user sketch). `citadel_setup()`/`citadel_loop()` do nothing but straight-line register reads/writes — no `if`/`for`/`while`, no computed intermediate variables. It just writes `citadel_tick()`'s return value straight to the port.
- `cpp/runtime.cpp` — owns `main()` (in a real build, this role is played by the Arduino core's `wiring.c`). A runtime that calls `citadel_setup()` once and `citadel_loop()` forever. Control flow belongs here, not in the user sketch (`io.cpp`).
- `build.sh` — runs the whole pipeline: compile with `avr-g++` → build the Rust side with `cargo +nightly` → link → generate `.hex` with `avr-objcopy` → verify with `avr-size`/`avr-nm`.

## What this prototype proved (host-side build only)

Running `./build.sh` shows:
- An object compiled with `avr-g++` and `libcitadel_logic.a` compiled with `rustc` (LLVM) link into a single `.elf` (RFC 0001 §5: ABI/link interoperability)
- `avr-nm` resolves `citadel_setup`/`citadel_loop`/`citadel_tick` with zero undefined references (`U`)
- `avr-objcopy` produces a `.hex` (RFC 0001 §2)
- The build reproduces with a pinned nightly (see `rust-toolchain.toml`) (RFC 0001 §1)
- `avr-size` measurements (274 bytes of text, about 0.8% of the ATmega328P's 32KB) give a data point for RFC 0001 §3 — this prototype itself is a minimal program, so re-measuring with a "representative sketch" is a separate task

## Verified on real hardware

Verified on an ELEGOO UNO R3 (Arduino Uno-compatible board). This closes the "flash and verify on real hardware" item from RFC 0001 §5.

```sh
./build.sh
avrdude -c arduino -p atmega328p -P /dev/ttyACM0 -b 115200 -U flash:w:build/firmware.hex:i
```

- `avrdude` write + verify succeeded (274 bytes, no diff)
- Visually confirmed the onboard LED (pin 13, PB5) blinking

Adjust `-P` to match your serial port.

## What this prototype did not prove

- Using the real Arduino core (`Arduino.h`/`pinMode`/`digitalWrite`) is verified separately in [`prototypes/0002-arduino-core`](../0002-arduino-core). This prototype intentionally sticks to direct `avr/io.h` register access, to keep the ABI-boundary verification minimal and focused.
- Static-analysis logic rejection for C/C++ (RFC 0001 §4) is out of scope for this prototype.
