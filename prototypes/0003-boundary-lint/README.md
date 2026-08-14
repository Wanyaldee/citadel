# Prototype: Rust/C boundary logic detection (boundary-lint)

*[日本語](./README.ja.md)*

A feasibility prototype for RFC 0001 §4, "reject logic in C/C++ user sketches." A standalone, native Rust CLI that parses C++ sketch files with tree-sitter-cpp and detects/rejects logic constructs that violate Citadel's boundary rule (see `CLAUDE.md` and the top-level README). Makes no changes to the IDE itself (anything under `crates/`).

## The 7 rejected constructs

| # | Construct | Detection |
|---|---|---|
| 1 | `if` | `if_statement` node |
| 2 | `for` | `for_statement` node |
| 3 | `while` / `do-while` | `while_statement` / `do_statement` node |
| 4 | `switch` | `switch_statement` node |
| 5 | ternary operator | `conditional_expression` node |
| 6 | computed intermediate variables | a variable declaration (`init_declarator`) whose initializer contains a `binary_expression` (except when the declaration is `const`-qualified — see below) |
| 7 | user-defined function-like macros | `preproc_function_def` node (`#define NAME(...) ...`) |

Every violation message states both why it's rejected and where the logic should move: "implement the logic in a Rust `no_std` crate and call it via `extern \"C\"`."

### Also checking inside object-like macro bodies

Function-like macros (`#define NAME(...)`) are unconditionally banned as `preproc_function_def`, but object-like macros (`#define NAME value`) are allowed, since they're used for legitimate constant declarations like `#define LED_PIN 13`. However, tree-sitter doesn't expand macro bodies — it treats them as an opaque `preproc_arg` token — so a naive implementation would let logic hide behind something like `#define BLINK_IF_HOT if (...) { ... }`.

To handle this, every time a `preproc_def` (object-like macro) is found, its body text is re-parsed standalone as `void __macro_check() { <body> }`, and the same `walk()` logic is applied recursively. A constant-value body like `#define LED_PIN 13` doesn't close as a valid statement (no trailing `;`), so this re-parse produces a syntax error and nothing is flagged — which conveniently doubles as proof that it isn't hiding logic. A body that does parse as a valid statement, like `#define BLINK_IF_HOT if (...) { ... };`, re-parses correctly and any hidden `if` etc. inside it gets flagged (the reported location is the `#define` line itself, not the actual line inside the body).

### Distinguishing runtime boilerplate from user sketches

`main()` in `prototypes/0001-hello-blink/cpp/runtime.cpp` is boilerplate that just calls `citadel_setup()` once and then `citadel_loop()` forever (in 0002, the vendored Arduino core's own `main.cpp` plays the same role — which isn't a problem since the tool doesn't analyze it). Rather than having a concept of "this file is the runtime side" at the file level, there's exactly one structural exception carved out of the `for` rule: an infinite `for(;;)` with empty init/condition/update clauses, whose body consists solely of call-expression statements, is exempt. If the body contains even one non-call statement — an `if`, a declaration, whatever — it gets flagged as usual (the `for` exception passing through doesn't mean an `if` inside it does too). Since this is judged purely by structure, not by filename or comments, you can't just rename a file to slip logic through.

## Out of scope (still open items from RFC 0001 §4)

- Whether to exempt `for` inside `setup()` (a separate question from the infinite-dispatch-loop exception above)
- `.ino` file support (only `.cpp` is parsed)
- Computed expressions outside of variable-declaration initializers (e.g. inline computation inside function-call arguments)
- IDE integration (red squiggles in the editor, wiring into `crates/languages`). Investigation found that Citadel's diagnostics pipeline assumes an LSP, and there's currently no pattern for feeding diagnostics from a non-LSP source. That's a separate, large undertaking and out of scope for this prototype.

Build-time-constant initializers like `const uint8_t MASK = (1 << PB5);` are fixed as a false positive by excluding `const`-qualified declarations from the "computed intermediate variable" rule (since `CLAUDE.md` allows board-constant declarations on the C/C++ side). This is a syntax-only heuristic, though — tree-sitter has no type information or compile-time constant evaluation, so slapping `const` on genuine runtime computation, like `const int cheat = raw * 2;`, slips through too. This is a known limitation, noted here as a new trade-off introduced by the fix.

## Usage

```sh
cargo run -- <file.cpp> [file2.cpp ...]
```

## Verification results

Both `prototypes/0001-hello-blink/cpp/io.cpp` and `prototypes/0002-arduino-core/cpp/sketch.cpp` are written following the boundary rule and pass clean with zero violations:

```
$ cargo run -- ../0001-hello-blink/cpp/io.cpp
../0001-hello-blink/cpp/io.cpp: OK
1 files checked, 0 violations
exit: 0

$ cargo run -- ../0002-arduino-core/cpp/sketch.cpp
../0002-arduino-core/cpp/sketch.cpp: OK
1 files checked, 0 violations
exit: 0
```

`examples/bad_sketch.cpp` deliberately violates all 7 syntax rules plus the object-like-macro hidden-logic case; all 8 violations are correctly detected (note there are two separate `if` violations — one at `4:1` from the `if` hidden behind `#define BLINK_IF_HOT ...`, and one at `17:5` from an actual `if` in the code):

> **Note:** the error messages below are the tool's actual captured output, currently in Japanese. Translating the tool's own diagnostic strings to English is tracked as a follow-up — see the note at the end of this section.

```
$ cargo run -- examples/bad_sketch.cpp
examples/bad_sketch.cpp:3:1: error: function-macro
  関数形式マクロ(#define NAME(...))はC/C++に書けません。ロジックを隠す恐れがあるため禁止しています。ロジックはRustのno_stdクレートに実装してください。

examples/bad_sketch.cpp:4:1: error: if
  if文はC/C++に書けません。この判断はRustのno_stdクレートに実装し、extern "C"関数の戻り値として結果を受け取ってください。

examples/bad_sketch.cpp:15:15: error: computed-intermediate
  計算式を含む変数初期化はC/C++に書けません。計算はRustのno_stdクレートで行い、結果だけをextern "C"関数の戻り値として受け取ってください。

examples/bad_sketch.cpp:17:5: error: if
  if文はC/C++に書けません。この判断はRustのno_stdクレートに実装し、extern "C"関数の戻り値として結果を受け取ってください。

examples/bad_sketch.cpp:21:5: error: for
  forループはC/C++に書けません。繰り返し制御はRustのno_stdクレートに実装し、extern "C"関数の戻り値として結果を受け取ってください。

examples/bad_sketch.cpp:25:5: error: while
  whileループはC/C++に書けません。繰り返し制御はRustのno_stdクレートに実装し、extern "C"関数の戻り値として結果を受け取ってください。

examples/bad_sketch.cpp:29:5: error: switch
  switch文はC/C++に書けません。この判断はRustのno_stdクレートに実装し、extern "C"関数の戻り値として結果を受け取ってください。

examples/bad_sketch.cpp:38:17: error: ternary
  三項演算子はC/C++に書けません。条件分岐はRustのno_stdクレートに実装し、結果だけをextern "C"関数の戻り値として受け取ってください。

1 files checked, 1 file(s) have violations (8 violations)
exit: 1
```

Running all three files together:

```
$ cargo run -- ../0001-hello-blink/cpp/io.cpp ../0002-arduino-core/cpp/sketch.cpp examples/bad_sketch.cpp
../0001-hello-blink/cpp/io.cpp: OK
../0002-arduino-core/cpp/sketch.cpp: OK
examples/bad_sketch.cpp:3:1: error: function-macro
  関数形式マクロ(#define NAME(...))はC/C++に書けません。ロジックを隠す恐れがあるため禁止しています。ロジックはRustのno_stdクレートに実装してください。

examples/bad_sketch.cpp:4:1: error: if
  if文はC/C++に書けません。この判断はRustのno_stdクレートに実装し、extern "C"関数の戻り値として結果を受け取ってください。

examples/bad_sketch.cpp:15:15: error: computed-intermediate
  計算式を含む変数初期化はC/C++に書けません。計算はRustのno_stdクレートで行い、結果だけをextern "C"関数の戻り値として受け取ってください。

examples/bad_sketch.cpp:17:5: error: if
  if文はC/C++に書けません。この判断はRustのno_stdクレートに実装し、extern "C"関数の戻り値として結果を受け取ってください。

examples/bad_sketch.cpp:21:5: error: for
  forループはC/C++に書けません。繰り返し制御はRustのno_stdクレートに実装し、extern "C"関数の戻り値として結果を受け取ってください。

examples/bad_sketch.cpp:25:5: error: while
  whileループはC/C++に書けません。繰り返し制御はRustのno_stdクレートに実装し、extern "C"関数の戻り値として結果を受け取ってください。

examples/bad_sketch.cpp:29:5: error: switch
  switch文はC/C++に書けません。この判断はRustのno_stdクレートに実装し、extern "C"関数の戻り値として結果を受け取ってください。

examples/bad_sketch.cpp:38:17: error: ternary
  三項演算子はC/C++に書けません。条件分岐はRustのno_stdクレートに実装し、結果だけをextern "C"関数の戻り値として受け取ってください。

3 files checked, 1 file(s) have violations (8 violations)
exit: 1
```

`prototypes/0001-hello-blink/cpp/runtime.cpp` (the one file with a `for` that hits the infinite-dispatch-loop exception) also passes clean with zero violations:

```
$ cargo run -- ../0001-hello-blink/cpp/runtime.cpp
../0001-hello-blink/cpp/runtime.cpp: OK
1 files checked, 0 violations
exit: 0
```
