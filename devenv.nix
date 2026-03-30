# devenv.nix for midi-server C++ project

{ pkgs, lib, config, ... }:

{
  # C++ toolchain
  languages.cplusplus.enable = true;

  # Build dependencies
  packages = [
    pkgs.cmake
    pkgs.pkg-config
    pkgs.git
  ];

  # Environment variables
  env = {
    BUILD_TYPE = "Release";
    BUILD_DIR = "${config.devenv.root}/build";
    MIDI_SERVER_BINARY = "${config.devenv.root}/build/MidiHttpServer_artefacts/Release/MidiHttpServer";
  };

  enterShell = ''
    echo ""
    echo "midi-server devenv environment"
    echo "==============================="
    echo ""
    echo "Build: cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build"
    echo "Binary: \$MIDI_SERVER_BINARY"
    echo ""
  '';
}
