# Prototype extension: hello-blink with the real Arduino core

*[日本語](./README.ja.md)*

[`prototypes/0001-hello-blink`](../0001-hello-blink) verified the Rust/C ABI boundary using direct `avr/io.h` register access (RFC 0001 §5, resolved). This prototype is an independent verification task: does the same boundary rule still hold when using the real `ArduinoCore-avr` (`Arduino.h`/`pinMode`/`digitalWrite`)?

## Layout

- `vendor/ArduinoCore-avr/` — [arduino/ArduinoCore-avr](https://github.com/arduino/ArduinoCore-avr) pinned as a git submodule at tag `1.8.8`. Uses `cores/arduino/` (the core itself) and `variants/standard/` (pin mapping for the Uno/Nano/Pro Mini family).
- `cpp/sketch.cpp` — stands in for a user sketch. `setup()`/`loop()` do nothing but straight-line calls to `pinMode`/`digitalWrite`/`delay` — no `if`/`for`/`while`, no computed intermediate variables.
- `rust/` — the logic layer. A `#![no_std]` staticlib. `citadel_tick()` toggles the LED state (0/1). Unlike 0001, blink timing is driven by `sketch.cpp`'s `delay(500)`, not a counter on the Rust side.
- `build.sh` — runs the whole pipeline: compile everything under `cores/arduino/` (the same way `arduino-builder` does) → compile the sketch → build the Rust side with `cargo` (nightly pinned via `rust-toolchain.toml`) → link (pruning unused core symbols with `-Wl,--gc-sections`) → generate `.hex`.
- The boundary rule (splitting work between Rust and C) applies to code Citadel generates and code the user writes (here, `cpp/sketch.cpp`) — it does not apply to the internals of the vendored `ArduinoCore-avr` itself (`digitalWrite`/`delay`, etc.), the same way the rule doesn't reach into libc's internals.

## Verified on real hardware

Verified on an ELEGOO UNO R3 (Arduino Uno-compatible board).

```sh
git submodule update --init vendor/ArduinoCore-avr
./build.sh
avrdude -c arduino -p atmega328p -P /dev/ttyACM0 -b 115200 -U flash:w:build/firmware.hex:i
```

- `avrdude` write + verify succeeded
- Visually confirmed the onboard LED (pin 13) blinking
- `avr-size` measurement: text=1056 bytes (the difference from 0001's text=274 bytes is the cost of the Arduino core. Earlier, when core objects were linked in directly, `--gc-sections` couldn't prune unused code — e.g. the ISR/global constructors in `HardwareSerial0.cpp` — leaving text=2376 bytes. Switching to archiving into `core.a` before linking got it down to this value.)

Adjust `-P` to match your serial port.

## A note on licensing

`ArduinoCore-avr` is LGPL-2.1. Per Arduino's official FAQ, an artifact that links a sketch with the core is not subject to LGPL's redistribution obligations. This is a separate note from Citadel's own GPL/Apache licensing (see the [top-level README](../../README.md#licensing)).
